#include <Arduino.h>
#include "lora_radio.h"
#include "e22_config.h"

#ifndef E22_WRITE_SETUP
#define E22_WRITE_SETUP 0
#endif

namespace {
constexpr uint32_t kQueryIntervalMs=5000, kReplyTimeoutMs=2000, kQuietMs=50;
constexpr bool kWriteSetup=E22_WRITE_SETUP!=0;
uint8_t response[16];
size_t count=0;
bool pending=false, queried=false, overflow=false;
bool writeIssued=false, writing=false, setupAck=false;
uint32_t queryMs=0, lastByteMs=0;
radio::BusyWarning busyWarning;

void report() {
    Serial.print(writing?"SETUP ACK HEX:":"CONFIG HEX:");
    for (size_t i=0;i<count;++i) Serial.printf(" %02X",response[i]);
    if (!count) Serial.print(" (tidak ada balasan)");
    if (overflow) Serial.print(" [dipotong]");
    Serial.println();
    e22::Config config;
    if (!overflow && e22::decodeConfig(response,count,config)) {
        const char* parity[]={"8N1","8O1","8E1","8N1"};
        Serial.printf("CONFIG ADDR=0x%04X NETID=%u UART=%lu %s CHAN=0x%02X RF_MHz=%.3f AIR_BITS=%u PACKET=%u MODE=%s POWER=%udBm RSSI_BYTE=%s REPEATER=%s LBT=%s\n",
            static_cast<unsigned int>(config.address),static_cast<unsigned int>(config.netId),static_cast<unsigned long>(config.baud),
            parity[config.parity],static_cast<unsigned int>(config.channel),
            410.125+config.channel,static_cast<unsigned int>(config.airRateBits),
            static_cast<unsigned int>(config.packetBytes),config.fixed?"FIXED":"TRANSPARENT",
            static_cast<unsigned int>(config.powerDbm),config.packetRssi?"ON":"OFF",
            config.repeater?"ON":"OFF",config.lbt?"ON":"OFF");
        Serial.println("# CRYPT_H/L hanya bisa ditulis; angka 00 pada hasil baca bukan bukti key tersimpan nol");
        if (writing) {
            setupAck=e22::matchesSetup(response,count);
            Serial.println(setupAck?"# SETUP ACK diterima; menunggu pembacaan ulang register":"# SETUP ACK tidak cocok; belum terverifikasi");
        } else if (kWriteSetup) {
            Serial.println(setupAck && e22::matchesSetup(response,count)?
                "# SETUP VERIFIED | register publik cocok; key=0 diminta pada perintah tulis, tidak dapat dibaca ulang":
                "# SETUP belum terverifikasi; periksa ACK dan register hasil baca");
        }
        if (config.baud!=9600 || (config.parity!=0 && config.parity!=3) ||
            config.fixed || config.packetRssi || config.repeater)
            Serial.println("# Konfigurasi ini belum cocok untuk firmware PING/JSON; gunakan mode setup pada kedua modul");
    } else {
        Serial.println("# CONFIG belum valid: perlu 12 byte C1 00 09 + 9 register E22; M0=GND M1=3V3, UART 9600 8N1");
    }
    pending=false;
}
} // namespace

void setup() {
    Serial.setTxBufferSize(2048);
    Serial.begin(115200);
    radio::begin();
    delay(500);
    Serial.println(kWriteSetup?
        "# E22 SETUP | menulis profil tes permanen sekali per boot, lalu membaca ulang":
        "# E22 READ CONFIG | hanya baca C1 00 09, tidak menulis pengaturan modul");
    Serial.println("# M0=GND M1=3V3 (mode 2); AUX=23 RX=16 TX=17 UART=9600 USB=115200");
    Serial.println("# Mode pin tidak dikendalikan firmware; matikan daya sebelum memindahkan jumper");
}

void loop() {
    const uint32_t now=millis();
    if (pending) {
        while (radio::port().available()) {
            const auto byte=static_cast<uint8_t>(radio::port().read());
            if (count<sizeof(response)) response[count++]=byte;
            else overflow=true;
            lastByteMs=now;
        }
        if (count>=e22::kReplySize || (count>0 && now-lastByteMs>=kQuietMs) || now-queryMs>=kReplyTimeoutMs)
            report();
    } else {
        const bool ready=radio::readyToSend(now);
        if (busyWarning.update(ready,now))
            Serial.println("# CONFIG AUX belum siap >=5 detik; periksa GPIO23 dan catu");
        const bool shouldWrite=kWriteSetup && !writeIssued;
        const size_t commandSize=shouldWrite?sizeof(e22::kSetupCommand):sizeof(e22::kReadCommand);
        if (ready && (!queried || now-queryMs>=kQueryIntervalMs) && radio::port().availableForWrite()>=static_cast<int>(commandSize)) {
            while (radio::port().available()) radio::port().read();
            writing=shouldWrite;
            if (writing) writeIssued=true;
            const uint8_t* command=writing?e22::kSetupCommand:e22::kReadCommand;
            const size_t written=radio::port().write(command,commandSize);
            queryMs=now;
            queried=true;
            count=0;
            overflow=false;
            pending=written==commandSize;
            if (pending) Serial.println(writing?
                "# SETUP WRITE -> C0 00 09 00 00 00 62 03 17 03 00 00":
                "# CONFIG READ -> C1 00 09");
            else Serial.println("# CONFIG gagal memasukkan command ke UART");
        }
    }
    while (Serial.available()) Serial.read();
    delay(1);
}
