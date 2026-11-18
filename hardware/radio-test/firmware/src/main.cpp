#include <Arduino.h>
#include <cstdio>
#include "lora_radio.h"

#ifndef E22_TEST_TRANSMITTER
#error "Select the tx or rx PlatformIO environment"
#endif

namespace {
constexpr bool kTransmitter=E22_TEST_TRANSMITTER!=0;
uint32_t sequence=0, lastSendMs=0, receivedBytes=0, receivedLines=0, lastStatusMs=0;
radio::BusyWarning busyWarning;
char received[96];
size_t receivedLength=0;
bool discardLine=false;

void readRadio() {
    // Read even while AUX is LOW: E22 drives it LOW during UART output.
    while (radio::port().available()) {
        const char c=static_cast<char>(radio::port().read());
        ++receivedBytes;
        if (c=='\r') continue;
        if (c=='\n') {
            if (discardLine) Serial.println("# RX RADIO baris rusak/terlalu panjang");
            else if (receivedLength) {
                received[receivedLength]='\0';
                ++receivedLines;
                Serial.print("RX RADIO: ");
                Serial.println(received);
            }
            receivedLength=0;
            discardLine=false;
        } else if (!discardLine) {
            const auto byte=static_cast<unsigned char>(c);
            if (byte<0x20 || byte>0x7e || receivedLength>=sizeof(received)-1)
                discardLine=true;
            else received[receivedLength++]=c;
        }
    }
}

void sendPing(uint32_t now) {
    const bool ready=radio::readyToSend(now);
    if (busyWarning.update(ready,now))
        Serial.println("# TX AUX belum siap >=5 detik; periksa AUX23, M0/M1 GND, catu");
    if (!ready || now-lastSendMs<2000) return;
    char message[32];
    const int length=std::snprintf(message,sizeof(message),"PING %lu\n",
        static_cast<unsigned long>(sequence+1));
    if (length<=0 || static_cast<size_t>(length)>=sizeof(message)) return;
    if (radio::sendLine(message,static_cast<size_t>(length),now)) {
        ++sequence;
        lastSendMs=now;
        Serial.printf("TX UART: PING %lu | tunggu bukti RX RADIO pada receiver\n",
            static_cast<unsigned long>(sequence));
    }
}
} // namespace

void setup() {
    Serial.setTxBufferSize(2048);
    Serial.begin(115200);
    radio::begin();
    delay(500);
    Serial.println(kTransmitter ?
        "# E22 RADIO TEST ROLE=TX | kirim PING setiap 2 detik, tanpa sensor" :
        "# E22 RADIO TEST ROLE=RX | menunggu PING melalui radio, tanpa sensor");
    Serial.println("# UART LoRa=9600 USB=115200 RX2=16 TX2=17 AUX=23 M0=M1=GND");
    Serial.println("# E22-400T30D memakai konfigurasi tersimpan; alamat/NETID/channel/air rate/key harus cocok; RSSI byte OFF");
}

void loop() {
    readRadio();
    const uint32_t now=millis();
    if (kTransmitter) sendPing(now);
    if (now-lastStatusMs>=10000) {
        lastStatusMs=now;
        Serial.printf("# ROLE=%s UART_RX_bytes=%lu RX_lines=%lu AUX=%d\n",
            kTransmitter?"TX":"RX",static_cast<unsigned long>(receivedBytes),
            static_cast<unsigned long>(receivedLines),digitalRead(radio::kAuxPin));
    }
    // USB input is deliberately not forwarded; RX RADIO only comes from UART2.
    while (Serial.available()) Serial.read();
    delay(1);
}
