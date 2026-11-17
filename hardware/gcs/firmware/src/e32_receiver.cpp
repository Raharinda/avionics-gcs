#include <Arduino.h>
#include <HardwareSerial.h>

namespace {
constexpr uint8_t kLoRaRxPin = 16;   // ESP32 RX2 <- E32 TX
constexpr uint8_t kLoRaTxPin = 17;   // ESP32 TX2 -> E32 RX
constexpr uint8_t kLoRaAuxPin = 23;  // E32 AUX -> ESP32 GPIO23
constexpr uint32_t kUsbBaudRate = 115200;
constexpr uint32_t kLoRaBaudRate = 9600;

HardwareSerial lora_serial(2);

void wait_for_lora_ready() {
    const uint32_t started = millis();
    while (digitalRead(kLoRaAuxPin) == LOW) {
        if (static_cast<uint32_t>(millis() - started) >= 3000) {
            Serial.println("PERINGATAN: AUX belum HIGH.");
            return;
        }
        delay(10);
    }
}

void forward_lora_to_usb() {
    uint8_t buffer[256];
    while (lora_serial.available() > 0) {
        const size_t available = static_cast<size_t>(lora_serial.available());
        const size_t count = lora_serial.readBytes(
            reinterpret_cast<char*>(buffer),
            min(available, sizeof(buffer)));
        if (count > 0) Serial.write(buffer, count);
    }
}

void forward_usb_to_lora() {
    uint8_t buffer[256];
    while (Serial.available() > 0) {
        const size_t available = static_cast<size_t>(Serial.available());
        const size_t count = Serial.readBytes(
            reinterpret_cast<char*>(buffer),
            min(available, sizeof(buffer)));
        if (count > 0) lora_serial.write(buffer, count);
    }
}
}  // namespace

void setup() {
    Serial.begin(kUsbBaudRate);
    delay(500);

    // M0 dan M1 terhubung ke GND: mode normal/transparan.
    pinMode(kLoRaAuxPin, INPUT);
    lora_serial.begin(kLoRaBaudRate, SERIAL_8N1, kLoRaRxPin, kLoRaTxPin);

    delay(100);
    wait_for_lora_ready();

    Serial.println("E32-433T30D GCS bridge ready");
    Serial.println("LoRa UART: 9600 baud, USB UART: 115200 baud");
}

void loop() {
    // Keep telemetry and dashboard commands byte-for-byte transparent.
    forward_lora_to_usb();
    forward_usb_to_lora();
}
