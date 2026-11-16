#include "mpu6050_reader.h"
#include <Arduino.h>

namespace {
constexpr uint8_t kWhoAmI = 0x75;
constexpr uint8_t kPower1 = 0x6B;
constexpr uint8_t kConfig = 0x1A;
constexpr uint8_t kData = 0x3B;
constexpr float kAccelScale = 9.80665F / 4096.0F;
constexpr float kGyroScale = 0.017453292519943295F / 65.5F;

int16_t signed_word(const uint8_t* bytes) {
    const uint16_t word = (static_cast<uint16_t>(bytes[0]) << 8) | bytes[1];
    const int32_t value = word < 0x8000 ? word : static_cast<int32_t>(word) - 0x10000;
    return static_cast<int16_t>(value);
}
} // namespace

bool Mpu6050Reader::read_registers(uint8_t reg, uint8_t* buffer, size_t count) {
    bus_.beginTransmission(address_);
    if (bus_.write(reg) != 1 || bus_.endTransmission(false) != 0) return false;
    const size_t received = bus_.requestFrom(address_, count, true);
    if (received != count) {
        while (bus_.available()) bus_.read();
        return false;
    }
    for (size_t index = 0; index < count; ++index) {
        const int value = bus_.read();
        if (value < 0) return false;
        buffer[index] = static_cast<uint8_t>(value);
    }
    return true;
}

bool Mpu6050Reader::read_register(uint8_t reg, uint8_t& value) {
    return read_registers(reg, &value, 1);
}

bool Mpu6050Reader::write_register(uint8_t reg, uint8_t value) {
    bus_.beginTransmission(address_);
    if (bus_.write(reg) != 1 || bus_.write(value) != 1) return false;
    return bus_.endTransmission(true) == 0;
}

Mpu6050Reader::Status Mpu6050Reader::verify_configuration() {
    uint8_t identity = 0;
    uint8_t power[2] = {};
    uint8_t config[3] = {};
    if (!read_register(kWhoAmI, identity) ||
        !read_registers(kPower1, power, sizeof(power)) ||
        !read_registers(kConfig, config, sizeof(config))) return Status::ReadFailed;
    if (identity != 0x68) return Status::WrongIdentity;
    if ((power[0] & 0xEF) != 0x01 || (power[1] & 0x3F) != 0 ||
        (config[0] & 0x07) != 0x04 || (config[1] & 0xF8) != 0x08 ||
        (config[2] & 0xF8) != 0x10) return Status::InvalidConfiguration;
    return Status::Ok;
}

Mpu6050Reader::Status Mpu6050Reader::begin(uint8_t address) {
    address_ = address;
    uint8_t identity = 0;
    if (!read_register(kWhoAmI, identity)) return Status::ReadFailed;
    if (identity != 0x68) return Status::WrongIdentity;
    if (!write_register(kPower1, 0x80)) return Status::WriteFailed;
    delay(100);
    const uint32_t started = millis();
    while (true) {
        uint8_t power = 0;
        if (!read_register(kPower1, power)) return Status::ReadFailed;
        if ((power & 0x80) == 0) break;
        if (static_cast<uint32_t>(millis() - started) >= 200) return Status::ResetTimeout;
        delay(1);
    }
    // Wake all axes and temperature sensor; use gyro X PLL as clock source.
    if (!write_register(kPower1, 0x01) || !write_register(0x6C, 0x00) ||
        !write_register(0x19, 0x00) || !write_register(kConfig, 0x04) ||
        !write_register(0x1B, 0x08) || !write_register(0x1C, 0x10)) return Status::WriteFailed;
    delay(100);
    return verify_configuration();
}

Mpu6050Reader::Status Mpu6050Reader::read(Sample& sample) {
    // A reset/brownout can leave an ACKing device asleep with cleared output registers.
    const Status configuration = verify_configuration();
    if (configuration != Status::Ok) return configuration;
    uint8_t data[14] = {};
    if (!read_registers(kData, data, sizeof(data))) return Status::ReadFailed;
    bool all_zero = true;
    for (const uint8_t byte : data) all_zero = all_zero && byte == 0;
    if (all_zero) return Status::ZeroFrame;

    Sample next{};
    for (size_t axis = 0; axis < 3; ++axis) {
        next.accel[axis] = signed_word(data + axis * 2) * kAccelScale;
        next.gyro[axis] = signed_word(data + 8 + axis * 2) * kGyroScale;
    }
    next.temperature_c = signed_word(data + 6) / 340.0F + 36.53F;
    sample = next;
    return Status::Ok;
}

const char* Mpu6050Reader::message(Status status) {
    switch (status) {
        case Status::Ok: return "OK";
        case Status::ReadFailed: return "transaksi baca I2C gagal/byte tidak lengkap";
        case Status::WriteFailed: return "transaksi tulis konfigurasi I2C gagal";
        case Status::WrongIdentity: return "WHO_AM_I tidak sesuai MPU6050 (harus 0x68)";
        case Status::ResetTimeout: return "reset sensor melewati batas waktu";
        case Status::InvalidConfiguration: return "sensor sleep/standby atau konfigurasi berubah";
        case Status::ZeroFrame: return "seluruh 14 byte data nol; sampel tidak valid";
    }
    return "error tidak dikenal";
}
