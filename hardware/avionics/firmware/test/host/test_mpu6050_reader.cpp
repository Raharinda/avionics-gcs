#include "mpu6050_reader.h"
#include <assert.h>
#include <cmath>
#include <stdio.h>

uint32_t fake_millis = 0;
using Status = Mpu6050Reader::Status;

void word(TwoWire& bus, uint8_t reg, int16_t value) {
    const auto bits = static_cast<uint16_t>(value);
    bus.registers[reg] = static_cast<uint8_t>(bits >> 8);
    bus.registers[reg + 1] = static_cast<uint8_t>(bits);
}

void close_to(float actual, float expected) { assert(std::fabs(actual - expected) < 0.0001F); }

int main() {
    {
        TwoWire bus;
        Mpu6050Reader reader(bus);
        assert(reader.begin(0x68) == Status::Ok);
        word(bus, 0x3B, 4096);
        word(bus, 0x3D, -4096);
        word(bus, 0x3F, 2048);
        word(bus, 0x41, -340);
        word(bus, 0x43, 655);
        word(bus, 0x45, -655);
        Mpu6050Reader::Sample sample{};
        assert(reader.read(sample) == Status::Ok);
        close_to(sample.accel[0], 9.80665F);
        close_to(sample.accel[1], -9.80665F);
        close_to(sample.accel[2], 4.903325F);
        close_to(sample.gyro[0], 0.174532925F);
        close_to(sample.gyro[1], -0.174532925F);
        close_to(sample.temperature_c, 35.53F);
        puts("PASS: signed axes, temperature and SI conversion");
    }
    {
        TwoWire bus;
        Mpu6050Reader reader(bus);
        assert(reader.begin(0x69) == Status::Ok);
        Mpu6050Reader::Sample sample{{99, 99, 99}, {99, 99, 99}, 99};
        assert(reader.read(sample) == Status::ZeroFrame);
        assert(sample.accel[0] == 99 && sample.temperature_c == 99);
        puts("PASS: all-zero frame rejected without publishing false readings");
        word(bus, 0x41, 100);
        assert(reader.read(sample) == Status::Ok);
        assert(sample.accel[0] == 0 && sample.gyro[0] == 0);
        puts("PASS: zero acceleration/gyro alone is allowed");
    }
    {
        TwoWire bus;
        Mpu6050Reader reader(bus);
        assert(reader.begin(0x68) == Status::Ok);
        word(bus, 0x3F, 4096);
        Mpu6050Reader::Sample sample{};
        assert(reader.read(sample) == Status::Ok);
        close_to(sample.temperature_c, 36.53F);
        puts("PASS: temperature offset alone does not reject valid gravity data");
        bus.short_read_register = 0x3B;
        sample.accel[2] = 99;
        assert(reader.read(sample) == Status::ReadFailed);
        assert(sample.accel[2] == 99);
        puts("PASS: incomplete 14-byte read rejected");
        bus.short_read_register = -1;
        bus.nack = true;
        assert(reader.read(sample) == Status::ReadFailed);
        puts("PASS: I2C NACK rejected");
    }
    {
        TwoWire bus;
        Mpu6050Reader reader(bus);
        assert(reader.begin(0x68) == Status::Ok);
        Mpu6050Reader::Sample sample{};
        bus.registers[0x6B] = 0x40;
        assert(reader.read(sample) == Status::InvalidConfiguration);
        assert(reader.begin(0x68) == Status::Ok);
        assert(bus.registers[0x6B] == 0x01);
        puts("PASS: sleeping/reset sensor detected and reinitialization wakes it");
        bus.registers[0x6C] = 0x3F;
        assert(reader.read(sample) == Status::InvalidConfiguration);
        assert(reader.begin(0x68) == Status::Ok);
        bus.registers[0x1C] = 0;
        assert(reader.read(sample) == Status::InvalidConfiguration);
        puts("PASS: standby axes and scale drift rejected");
    }
    {
        TwoWire bus;
        Mpu6050Reader reader(bus);
        bus.registers[0x75] = 0x70;
        assert(reader.begin(0x68) == Status::WrongIdentity);
        puts("PASS: wrong chip ID rejected");
    }
    {
        TwoWire bus;
        Mpu6050Reader reader(bus);
        bus.fail_write_register = 0x6B;
        assert(reader.begin(0x68) == Status::WriteFailed);
        bus.fail_write_register = -1;
        bus.ignore_write_register = 0x1C;
        assert(reader.begin(0x68) == Status::InvalidConfiguration);
        puts("PASS: failed and silently ignored configuration writes detected");
    }
    {
        TwoWire bus;
        Mpu6050Reader reader(bus);
        bus.reset_stuck = true;
        fake_millis = 0;
        assert(reader.begin(0x68) == Status::ResetTimeout);
        assert(fake_millis <= 350);
        puts("PASS: stuck reset terminates within deadline");
    }
    puts("All MPU6050 host checks passed");
}
