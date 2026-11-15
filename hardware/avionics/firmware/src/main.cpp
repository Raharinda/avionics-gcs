#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include "mpu6050_reader.h"
#include <cmath>
#include <initializer_list>

namespace {
constexpr int kSdaPin = 21;
constexpr int kSclPin = 22;
constexpr uint32_t kI2cFrequencyHz = 100000;
constexpr uint32_t kReadIntervalMs = 500;
constexpr uint32_t kRetryIntervalMs = 5000;

Mpu6050Reader mpu(Wire);
Adafruit_BMP280 bmp(&Wire);
bool mpuReady = false;
bool bmpReady = false;
uint8_t mpuAddress = 0;
uint8_t bmpAddress = 0;
uint32_t lastReadMs = 0;
uint32_t lastRetryMs = 0;

bool isPresent(uint8_t address) {
    Wire.beginTransmission(address);
    return Wire.endTransmission() == 0;
}

void scanI2c() {
    Serial.println("Scan alamat I2C:");
    unsigned count = 0;
    for (uint8_t address = 1; address < 127; ++address) {
        if (isPresent(address)) {
            Serial.printf("  Perangkat di 0x%02X\n", address);
            ++count;
        }
    }
    if (count == 0) {
        Serial.println("  Tidak ada perangkat. Periksa kabel, daya, dan GND.");
    }
}

void printMpuDiagnostics() {
    struct Register { const char* name; uint8_t address; };
    constexpr Register registers[] = {
        {"WHO_AM_I", 0x75}, {"PWR1", 0x6B}, {"PWR2", 0x6C},
        {"CONFIG", 0x1A}, {"GYRO_CONFIG", 0x1B}, {"ACCEL_CONFIG", 0x1C}
    };
    Serial.print("MPU6050 diagnostics:");
    for (const auto& reg : registers) {
        uint8_t value = 0;
        if (mpu.read_register(reg.address, value)) Serial.printf(" %s=0x%02X", reg.name, value);
        else Serial.printf(" %s=READ_FAILED", reg.name);
    }
    Serial.println();
}

void initMissingSensors() {
    if (!mpuReady) {
        for (const uint8_t address : {0x68, 0x69}) {
            if (!isPresent(address)) continue;
            const auto result = mpu.begin(address);
            if (result == Mpu6050Reader::Status::Ok) {
                mpuAddress = address;
                mpuReady = true;
                Serial.printf("MPU6050 siap di 0x%02X\n", address);
                printMpuDiagnostics();
                break;
            }
            Serial.printf("MPU6050: init 0x%02X gagal: %s\n", address, Mpu6050Reader::message(result));
            printMpuDiagnostics();
        }
        if (!mpuReady) {
            Serial.println("MPU6050 belum terdeteksi di 0x68/0x69; coba lagi 5 detik.");
        }
    }

    if (!bmpReady) {
        for (const uint8_t address : {0x76, 0x77}) {
            if (isPresent(address) && bmp.begin(address)) {
                bmpAddress = address;
                bmpReady = true;
                // Register konfigurasi BMP280 diubah saat sensor dalam sleep.
                bmp.setSampling(Adafruit_BMP280::MODE_SLEEP);
                delay(100);
                bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                                Adafruit_BMP280::SAMPLING_X2,
                                Adafruit_BMP280::SAMPLING_X16,
                                Adafruit_BMP280::FILTER_X16,
                                Adafruit_BMP280::STANDBY_MS_250);
                Serial.printf("BMP280 siap di 0x%02X\n", address);
                break;
            }
        }
        if (!bmpReady) {
            Serial.println("BMP280 belum terdeteksi di 0x76/0x77; coba lagi 5 detik.");
            Serial.println("Pastikan modul BMP280, bukan BME280; CSB harus HIGH untuk I2C.");
        }
    }
}

void printMpu() {
    if (!mpuReady) return;
    if (!isPresent(mpuAddress)) {
        mpuReady = false;
        Serial.println("MPU6050 terputus; menunggu deteksi ulang.");
        return;
    }

    Mpu6050Reader::Sample sample{};
    const auto result = mpu.read(sample);
    if (result != Mpu6050Reader::Status::Ok) {
        Serial.printf("MPU6050: %s; inisialisasi ulang dalam 5 detik.\n", Mpu6050Reader::message(result));
        printMpuDiagnostics();
        mpuReady = false;
        lastRetryMs = millis();
        return;
    }
    Serial.printf("MPU6050 | Accel [m/s^2] X=%.3f Y=%.3f Z=%.3f\n",
                  sample.accel[0], sample.accel[1], sample.accel[2]);
    Serial.printf("        | Gyro [rad/s]  X=%.3f Y=%.3f Z=%.3f | Suhu=%.2f C\n",
                  sample.gyro[0], sample.gyro[1], sample.gyro[2], sample.temperature_c);
}

void printBmp() {
    if (!bmpReady) return;
    if (!isPresent(bmpAddress)) {
        bmpReady = false;
        Serial.println("BMP280 terputus; menunggu deteksi ulang.");
        return;
    }

    const float temperatureC = bmp.readTemperature();
    const float pressureHpa = bmp.readPressure() / 100.0F;
    if (!std::isfinite(temperatureC) || !std::isfinite(pressureHpa) || pressureHpa <= 0) {
        Serial.println("BMP280: data suhu/tekanan tidak valid.");
        return;
    }
    Serial.printf("BMP280  | Suhu=%.2f C | Tekanan=%.2f hPa\n",
                  temperatureC, pressureHpa);
}
}  // namespace

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\nESP32: MPU6050 + BMP280 pada satu bus I2C");
    Serial.println("Firmware: checked-mpu6050-v1");
    Serial.printf("SDA=GPIO%d (D21), SCL=GPIO%d (D22), bus=%lu Hz\n",
                  kSdaPin, kSclPin, static_cast<unsigned long>(kI2cFrequencyHz));
    if (!Wire.begin(kSdaPin, kSclPin, kI2cFrequencyHz)) {
        Serial.println("Gagal memulai bus I2C. Periksa konfigurasi dan reset board.");
        while (true) delay(1000);
    }
    Wire.setTimeOut(50);
    scanI2c();
    initMissingSensors();
    lastRetryMs = millis();
    lastReadMs = millis();
}

void loop() {
    const uint32_t now = millis();
    if (now - lastReadMs >= kReadIntervalMs) {
        lastReadMs = now;
        Serial.printf("\n--- Waktu: %lu ms ---\n", static_cast<unsigned long>(now));
        printMpu();
        printBmp();
    }

    // Sensor yang ada tetap dibaca saat sensor lain belum terpasang.
    if ((!mpuReady || !bmpReady) && now - lastRetryMs >= kRetryIntervalMs) {
        initMissingSensors();
        lastRetryMs = millis();
    }
    delay(1);
}
