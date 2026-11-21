#pragma once

#include "e32_radio.h"

// E32-433T30D manual, sections 6.5 and 7. UART config commands are binary,
// 9600 8N1 in mode 3 (M0=M1=HIGH). C0 saves parameters across power cycles.
namespace e32_setup {
constexpr uint8_t kProfile[]={0xC0,0x00,0x00,0x1A,0x17,0x44};
constexpr uint8_t kReadCommand[]={0xC1,0xC1,0xC1};
constexpr uint32_t kReadyTimeoutMs=8000, kReplyTimeoutMs=1500;
using Profile=uint8_t[6];

inline void printHex(const char* label, const uint8_t* bytes, size_t count) {
    Serial.printf("# E32_SETUP %s",label);
    for (size_t i=0;i<count;++i) Serial.printf(" %02X",static_cast<unsigned int>(bytes[i]));
    Serial.println("");
}

inline bool waitIdle() {
    const uint32_t start=millis();
    do {
        radio::service(millis());
        if (radio::state().phase==radio::Phase::Idle) return true;
        delay(1);
    } while (static_cast<uint32_t>(millis()-start)<kReadyTimeoutMs);
    return false;
}

inline bool changeMode(radio::Mode mode) {
    return radio::requestMode(mode,millis()) && waitIdle() && radio::state().mode==mode;
}

inline bool waitReady() {
    const uint32_t start=millis();
    do {
        if (radio::auxReady(millis())) return true;
        delay(1);
    } while (static_cast<uint32_t>(millis()-start)<kReadyTimeoutMs);
    return false;
}

inline void drainUart() {
    // Bounded even if a faulty/wrong-mode module keeps outputting bytes.
    const uint32_t start=millis();
    do {
        for (int i=0;i<32 && radio::port().available();++i) radio::port().read();
        delay(1);
    } while (static_cast<uint32_t>(millis()-start)<20);
}

inline bool readProfile(Profile& result) {
    if (!waitReady()) {
        Serial.println("# E32_SETUP ERROR AUX belum siap sebelum membaca parameter");
        return false;
    }
    drainUart(); // Discard stale bytes/write ACK; require a fresh read response.
    if (radio::port().write(kReadCommand,sizeof(kReadCommand))!=sizeof(kReadCommand)) {
        Serial.println("# E32_SETUP ERROR gagal menulis perintah baca ke UART");
        return false;
    }
    uint8_t reply[16]={};
    size_t count=0;
    bool overflow=false;
    const uint32_t start=millis();
    uint32_t lastByte=start;
    do {
        for (int i=0;i<32 && radio::port().available();++i) {
            const int value=radio::port().read();
            if (value<0) break;
            if (count<sizeof(reply)) reply[count++]=static_cast<uint8_t>(value);
            else overflow=true;
            lastByte=millis();
        }
        if (count>=sizeof(Profile) && static_cast<uint32_t>(millis()-lastByte)>=20) break;
        delay(1);
    } while (static_cast<uint32_t>(millis()-start)<kReplyTimeoutMs);
    printHex("READ",reply,count);
    if (overflow || count!=sizeof(Profile) || reply[0]!=0xC0) {
        Serial.println("# E32_SETUP ERROR balasan bukan 6 byte C0; cek M0/M1, UART, model modul dan catu");
        return false;
    }
    std::memcpy(result,reply,sizeof(Profile));
    return true;
}

inline bool applyProfile() {
    Profile current={};
    if (!readProfile(current)) return false; // Never write blindly on no response.
    if (std::memcmp(current,kProfile,sizeof(kProfile))==0) {
        Serial.println("# E32_SETUP profil tersimpan sudah cocok; tidak ditulis ulang");
        return true;
    }
    if (!waitReady()) {
        Serial.println("# E32_SETUP ERROR AUX belum siap sebelum menyimpan parameter");
        return false;
    }
    drainUart();
    printHex("SAVE",kProfile,sizeof(kProfile));
    if (radio::port().write(kProfile,sizeof(kProfile))!=sizeof(kProfile)) {
        Serial.println("# E32_SETUP ERROR penulisan konfigurasi UART tidak lengkap");
        return false;
    }
    delay(500); // Allow persistent write; readProfile also waits for AUX.
    Profile verified={};
    if (!readProfile(verified)) return false;
    if (std::memcmp(verified,kProfile,sizeof(kProfile))!=0) {
        Serial.println("# E32_SETUP ERROR readback berbeda dari profil tujuan; belum berhasil");
        return false;
    }
    return true;
}

inline bool configure() {
    if (!waitIdle()) {
        Serial.println("# E32_SETUP ERROR startup timeout; periksa AUX GPIO27 dan catu modul");
        return false;
    }
    if (!changeMode(radio::Mode::Sleep)) {
        Serial.println("# E32_SETUP ERROR tidak bisa masuk CONFIG (M0=1 M1=1)");
        // Attempt a bounded recovery; no parameter write has been attempted.
        changeMode(radio::Mode::Normal);
        return false;
    }
    Serial.println("# E32_SETUP CONFIG M0=1 M1=1 | UART=9600 8N1");
    const bool applied=applyProfile();
    if (!changeMode(radio::Mode::Normal)) {
        Serial.println("# E32_SETUP ERROR gagal kembali NORMAL; stabilkan catu lalu restart");
        return false;
    }
    if (!applied) return false;
    Serial.println("# E32_SETUP SUCCESS | READBACK cocok | NORMAL M0=0 M1=0");
    return true;
}

inline void begin(const char* role) {
    board::beginControls();
    radio::begin();
    Serial.setTxBufferSize(2048);
    Serial.begin(115200);
    delay(500);
    Serial.printf("# E32_SETUP ROLE=%s | E32-433T30D | RX=%d TX=%d M0=%d M1=%d AUX=%d\n",
        role,radio::kRxPin,radio::kTxPin,radio::kM0Pin,radio::kM1Pin,radio::kAuxPin);
    Serial.println("# E32_SETUP M0/M1 harus ke GPIO25/26, lepaskan sambungan langsung GND");
    Serial.println("# E32_SETUP profil: address=0000 channel=17 433MHz UART=9600 8N1 air=2.4kbps transparent FEC=ON power=30dBm");
    printHex("TARGET",kProfile,sizeof(kProfile));
    if (configure())
        Serial.println("# E32_SETUP selesai; flash firmware telemetri biasa untuk menjalankan TX/RX");
    else
        Serial.println("# E32_SETUP FAILED | perbaiki sambungan/catu lalu reset untuk mencoba lagi");
}
} // namespace e32_setup
