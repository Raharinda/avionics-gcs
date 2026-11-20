#include <Arduino.h>
#include <HardwareSerial.h>
#include <cstring>
#include "receiver_config.h"
#include "telemetry_line_buffer.h"
#include "e32_commands.h"
#include "../../../shared/gpio19_link.h"

namespace {
HardwareSerial& loRa=radio::port();
receiver::TelemetryLineBuffer frames;
uint32_t receivedBytes=0, receivedLines=0, discardedLines=0, lastStatusMs=0;
String usbCommand;
bool discardCommand=false;
gpio19::Relay gpioRelay;

void readRadio() {
    // Do not join a fragment from before a mode switch to later telemetry.
    const bool receiving=radio::canReceive(millis());
    if (!receiving) frames.reset();
    while (loRa.available()) {
        ++receivedBytes;
        const char byte=static_cast<char>(loRa.read());
        if (!receiving) continue;
        const auto result=frames.push(byte);
        if (result==receiver::TelemetryLineBuffer::Result::Line) {
            ++receivedLines;
            Serial.println(frames.line()); // JSON must start at column 1 for Tauri.
            Serial.printf("# E32 RX frame=%lu bytes=%u mode=%s AUX=%s\n",
                static_cast<unsigned long>(receivedLines),
                static_cast<unsigned int>(frames.size()),radio::modeName(radio::state().mode),radio::kUseAux?"enabled":"unused");
        } else if (result==receiver::TelemetryLineBuffer::Result::Control) {
            gpioRelay.acknowledge(frames.line());
        } else if (result!=receiver::TelemetryLineBuffer::Result::None) {
            ++discardedLines;
            if (result==receiver::TelemetryLineBuffer::Result::Invalid &&
                std::strncmp(frames.line(),"PING ",5)==0)
                Serial.println("# E32 SENSOR RX menerima PING; flash firmware sensor pada transmitter");
            else Serial.println(result==receiver::TelemetryLineBuffer::Result::Oversized ?
                "# E32 RX buang baris melebihi 512 byte" :
                "# E32 RX buang baris rusak/tidak berformat objek JSON; periksa baud dan link");
        }
    }
}

void readUsbCommands() {
    while (Serial.available()) {
        const char c=static_cast<char>(Serial.read());
        if (c=='\r') continue;
        if (c=='\n') {
            if (discardCommand) { usbCommand=""; discardCommand=false; continue; }
            if (gpioRelay.submit(usbCommand.c_str(),millis())) { usbCommand=""; continue; }
            if (!discardCommand && radio::handleUsbCommand(usbCommand.c_str(),millis())) {
                usbCommand="";
                continue;
            }
            if (usbCommand=="CALIBRATE_RESET")
                Serial.println("CALIBRATION_RESET_ERROR:Receiver E32 hanya telemetri. Hubungkan USB langsung ke transmitter untuk kalibrasi.");
            else if (usbCommand.startsWith("IMU_") || usbCommand.startsWith("CALIBRATE_"))
                Serial.println("CALIBRATION_ERROR:Receiver E32 hanya telemetri. Hubungkan USB langsung ke transmitter untuk kalibrasi dan acuan 3D.");
            else if (usbCommand.length() || discardCommand)
                Serial.println("# E32 receiver tidak meneruskan command USB ke radio");
            usbCommand="";
            discardCommand=false;
        } else if (!discardCommand) {
            if (usbCommand.length()<80) usbCommand+=c;
            else { usbCommand=""; discardCommand=true; }
        }
    }
}
} // namespace

void setup() {
    board::beginControls();
    radio::begin();
    Serial.setTxBufferSize(4096);
    Serial.begin(receiver::kUsbBaud);
    usbCommand.reserve(80);
    delay(500);
#ifdef UART_DIRECT_TEST
    static_assert(!radio::kUseAux, "Direct UART test must not depend on AUX");
    Serial.println("# UART_DIRECT_TEST ROLE=RX | AUX=unused | GPIO17 TX -> GPIO16 RX + GND");
#endif
    Serial.println("# E32-433T30D SENSOR TELEMETRY ROLE=RX | bidirectional D19 commands + ACK | JSON sensor radio -> USB -> Tauri");
    Serial.println("# GPIO map: docs/gpioesp32.jpeg | CALIBRATION=13 POP_TEST_IN=14 reserved | POP_TEST_OUT=19 LOW");
    Serial.printf("# E32-433T30D receiver siap | UART=9600 USB=115200 RX=16 TX=17 M0=%d M1=%d AUX=%s\n",radio::kM0Pin,radio::kM1Pin,radio::kUseAux?"enabled":"unused");
    Serial.println("# LORA mode lewat LORA_MODE:NORMAL|WAKEUP|POWER_SAVING|CONFIG|SLEEP; cek LORA_STATUS; tanpa AUX memakai guard waktu");
    Serial.println("# Terminal M0/M1: LORA_PINS:0,0 | ketik LORA_HELP untuk daftar perintah");
    Serial.println("# E32 konfigurasi modul tersimpan harus cocok dengan transmitter; menunggu JSON melalui radio");
    lastStatusMs=millis();
}

void loop() {
    readRadio();
    readUsbCommands();
    const uint32_t now=millis();
    gpioRelay.service(now);
    if (now-lastStatusMs>=receiver::kStatusIntervalMs) {
        lastStatusMs=now;
        Serial.printf("# E32 RX status UART_bytes=%lu frames=%lu discarded=%lu mode=%s phase=%s AUX=%s\n",
            static_cast<unsigned long>(receivedBytes),static_cast<unsigned long>(receivedLines),
            static_cast<unsigned long>(discardedLines),radio::modeName(radio::state().mode),radio::phaseName(radio::state().phase),radio::kUseAux?"enabled":"unused");
    }
    delay(1);
}
