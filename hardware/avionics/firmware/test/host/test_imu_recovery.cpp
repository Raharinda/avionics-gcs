#include <cassert>
#include <iostream>
#include "imu_recovery.h"
#include "mpu6050_reader.h"

uint32_t fake_millis=0;

int main() {
    imu::RecoveryBackoff recovery;
    assert(!recovery.waiting() && !recovery.takeAttempt(99999));
    uint32_t now=10000;
    recovery.failed(now);
    for (uint32_t wait : {250U,500U,1000U,2000U,4000U,5000U,5000U}) {
        assert(recovery.intervalMs()==wait);
        assert(!recovery.takeAttempt(now+wait-1));
        now+=wait;
        assert(recovery.takeAttempt(now));
        assert(!recovery.takeAttempt(now));
        // Reinitialization takes time; a failed attempt schedules from its end.
        now+=200; recovery.failed(now);
    }
    assert(recovery.attempts()==7);
    recovery.recovered();
    assert(!recovery.waiting() && recovery.attempts()==0 && !recovery.takeAttempt(now+100000));
    recovery.failed(now);
    assert(recovery.intervalMs()==250 && recovery.attempts()==0);
    recovery.recovered();

    const uint32_t wrap=0xffffff80U;
    recovery.failed(wrap);
    assert(!recovery.takeAttempt(wrap+249));
    assert(recovery.takeAttempt(wrap+250));
    recovery.recovered();

    TwoWire bus;
    Mpu6050Reader reader(bus);
    assert(reader.begin(0x68)==Mpu6050Reader::Status::Ok);
    bus.registers[0x3f]=0x10; bus.registers[0x40]=0; // +Z gravity, fresh valid sample.
    Mpu6050Reader::Sample sample{};
    assert(reader.read(sample)==Mpu6050Reader::Status::Ok);
    const float previous=sample.accel[2];
    bus.nack=true;
    assert(reader.read(sample)==Mpu6050Reader::Status::ReadFailed);
    assert(sample.accel[2]==previous); // Caller must keep imuValid=false for this stale value.
    now=fake_millis; recovery.failed(now);
    assert(!recovery.takeAttempt(now+249));
    assert(recovery.takeAttempt(now+250));
    assert(reader.begin(0x68)==Mpu6050Reader::Status::ReadFailed);
    recovery.failed(now+250);
    bus.nack=false;
    assert(!recovery.takeAttempt(now+749));
    assert(recovery.takeAttempt(now+750));
    assert(reader.begin(0x68)==Mpu6050Reader::Status::Ok);
    // An ACKing address / successful begin is insufficient: wait for a real sample.
    assert(recovery.waiting());
    bus.registers[0x3f]=0x10; bus.registers[0x40]=0;
    assert(reader.read(sample)==Mpu6050Reader::Status::Ok);
    recovery.recovered();
    assert(!recovery.waiting() && recovery.attempts()==0);
    std::cout<<"PASS: MPU runtime NACK recovery, first retry 250ms, bounded backoff, reset only on valid sample, no busy wait and millis rollover\n";
}
