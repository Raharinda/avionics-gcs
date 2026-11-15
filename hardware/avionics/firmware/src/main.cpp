#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_MPU6050.h>
#include <cmath>
#include <initializer_list>

namespace {
constexpr int kSdaPin = 21;
constexpr int kSclPin = 22;
constexpr uint32_t kI2cFrequencyHz = 100000;
constexpr uint32_t kReadIntervalMs = 500;
constexpr uint32_t kRetryIntervalMs = 5000;

Adafruit_MPU6050 mpu;
Adafruit_BMP280 bmp(&Wire);
bool mpuReady = false;
bool bmpReady = false;
uint8_t mpuAddress = 0;
uint8_t bmpAddress = 0;
float telemetryTemperature = 0.0F;
float telemetryPressure = 0.0F;
float telemetryAccelX = 0.0F;
float telemetryAccelY = 0.0F;
float telemetryAccelZ = 0.0F;
float telemetryGyroX = 0.0F;
float telemetryGyroY = 0.0F;
float telemetryGyroZ = 0.0F;
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

void initMissingSensors() {
    if (!mpuReady) {
        for (const uint8_t address : {0x68, 0x69}) {
            if (isPresent(address) && mpu.begin(address, &Wire)) {
                mpuAddress = address;
                mpuReady = true;
                mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
                mpu.setGyroRange(MPU6050_RANGE_500_DEG);
                mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
                Serial.printf("MPU6050 siap di 0x%02X\n", address);
                break;
            }
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

    sensors_event_t accel{}, gyro{}, temperature{};
    if (!mpu.getEvent(&accel, &gyro, &temperature)) {
        Serial.println("MPU6050: gagal membaca data.");
        return;
    }
    Serial.printf("MPU6050 | Accel [m/s^2] X=%.3f Y=%.3f Z=%.3f\n",
                  accel.acceleration.x, accel.acceleration.y, accel.acceleration.z);
    Serial.printf("        | Gyro [rad/s]  X=%.3f Y=%.3f Z=%.3f | Suhu=%.2f C\n",
                  gyro.gyro.x, gyro.gyro.y, gyro.gyro.z, temperature.temperature);
    telemetryAccelX = accel.acceleration.x;
    telemetryAccelY = accel.acceleration.y;
    telemetryAccelZ = accel.acceleration.z;
    telemetryGyroX = gyro.gyro.x;
    telemetryGyroY = gyro.gyro.y;
    telemetryGyroZ = gyro.gyro.z;
    telemetryTemperature = temperature.temperature;
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
    telemetryPressure = pressureHpa;
}

void printTelemetryJson() {
    if (!mpuReady || !bmpReady || telemetryPressure <= 0.0F) return;

    Serial.printf(
        "{\"temperature\":%.2f,\"pressure\":%.2f,\"accelX\":%.3f,\"accelY\":%.3f,\"accelZ\":%.3f,\"gyroX\":%.3f,\"gyroY\":%.3f,\"gyroZ\":%.3f}\n",
        telemetryTemperature,
        telemetryPressure,
        telemetryAccelX,
        telemetryAccelY,
        telemetryAccelZ,
        telemetryGyroX,
        telemetryGyroY,
        telemetryGyroZ
    );
}
}  // namespace

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\nESP32: MPU6050 + BMP280 pada satu bus I2C");
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
        printTelemetryJson();
    }

    // Sensor yang ada tetap dibaca saat sensor lain belum terpasang.
    if ((!mpuReady || !bmpReady) && now - lastRetryMs >= kRetryIntervalMs) {
        initMissingSensors();
        lastRetryMs = millis();
    }
    delay(1);
}
