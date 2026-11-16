#pragma once

#include <Wire.h>
#include <stddef.h>
#include <stdint.h>

// MPU6050 register map: +/-8 g, +/-500 deg/s, DLPF 21 Hz.
class Mpu6050Reader {
public:
    enum class Status {
        Ok, ReadFailed, WriteFailed, WrongIdentity, ResetTimeout,
        InvalidConfiguration, ZeroFrame
    };

    struct Sample {
        float accel[3]; // m/s^2
        float gyro[3];  // rad/s
        float temperature_c;
    };

    explicit Mpu6050Reader(TwoWire& bus) : bus_(bus) {}
    Status begin(uint8_t address);
    Status read(Sample& sample);
    bool read_register(uint8_t reg, uint8_t& value);
    static const char* message(Status status);

private:
    bool read_registers(uint8_t reg, uint8_t* buffer, size_t count);
    bool write_register(uint8_t reg, uint8_t value);
    Status verify_configuration();
    TwoWire& bus_;
    uint8_t address_ = 0x68;
};
