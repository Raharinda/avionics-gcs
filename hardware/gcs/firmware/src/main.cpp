#include <Arduino.h>
#include <HardwareSerial.h>
#include "receiver_config.h"
#include "telemetry_line_buffer.h"

namespace {
HardwareSerial loRa(2);
receiver::TelemetryLineBuffer frames;
uint32_t receivedBytes=0, receivedLines=0, discardedLines=0, lastStatusMs=0;
String usbCommand;
bool discardCommand=false;

void readRadio() {
    // E32 drives AUX LOW while outputting received bytes. Read UART regardless
    // of AUX; waiting for HIGH here could overflow the serial receive buffer.
    while (loRa.available()) {
        ++receivedBytes;
        const auto result=frames.push(static_cast<char>(loRa.read()));
        if (result==receiver::TelemetryLineBuffer::Result::Line) {
            ++receivedLines;
            Serial.println(frames.line()); // JSON must start at column 1 for Tauri.
            Serial.printf("# E32 RX frame=%lu bytes=%u AUX=%d\n",
                static_cast<unsigned long>(receivedLines),
                static_cast<unsigned int>(frames.size()),digitalRead(receiver::kAuxPin));
        } else if (result!=receiver::TelemetryLineBuffer::Result::None) {
            ++discardedLines;
            Serial.println(result==receiver::TelemetryLineBuffer::Result::Oversized ?
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
    Serial.setTxBufferSize(4096);
    Serial.begin(receiver::kUsbBaud);
    usbCommand.reserve(80);
    pinMode(receiver::kAuxPin,INPUT);
    loRa.setRxBufferSize(2048);
    loRa.begin(receiver::kRadioBaud,SERIAL_8N1,receiver::kRxPin,receiver::kTxPin);
    delay(500);
    Serial.println("# E32 receiver siap | UART=9600 USB=115200 RX=16 TX=17 AUX=23 | M0=M1=GND");
    Serial.println("# E32 konfigurasi modul tersimpan harus cocok dengan transmitter; menunggu JSON melalui radio");
    lastStatusMs=millis();
}

void loop() {
    readRadio();
    readUsbCommands();
    const uint32_t now=millis();
    if (now-lastStatusMs>=receiver::kStatusIntervalMs) {
        lastStatusMs=now;
        Serial.printf("# E32 RX status UART_bytes=%lu frames=%lu discarded=%lu AUX=%d\n",
            static_cast<unsigned long>(receivedBytes),static_cast<unsigned long>(receivedLines),
            static_cast<unsigned long>(discardedLines),digitalRead(receiver::kAuxPin));
    }
    delay(1);
}
