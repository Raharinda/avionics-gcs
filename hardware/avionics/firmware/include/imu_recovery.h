#pragma once
#include <cstdint>

namespace imu {
// Retry transient runtime faults quickly, then back off when a sensor stays
// absent. No delay()/busy wait here; radio, USB and BMP work continue between attempts.
class RecoveryBackoff {
public:
    static constexpr uint32_t kInitialMs=250, kMaximumMs=5000;
    void failed(uint32_t now) {
        if (!waiting_) { intervalMs_=kInitialMs; attempts_=0; }
        waiting_=true;
        sinceMs_=now;
    }
    bool takeAttempt(uint32_t now) {
        if (!waiting_ || static_cast<uint32_t>(now-sinceMs_)<intervalMs_) return false;
        sinceMs_=now;
        ++attempts_;
        intervalMs_=intervalMs_<kMaximumMs/2 ? intervalMs_*2 : kMaximumMs;
        return true;
    }
    // Call only on a fresh valid measurement, not merely an ACKing I2C address.
    void recovered() { waiting_=false; attempts_=0; intervalMs_=kInitialMs; }
    uint32_t attempts() const { return attempts_; }
    uint32_t intervalMs() const { return intervalMs_; }
    bool waiting() const { return waiting_; }
private:
    uint32_t sinceMs_=0, intervalMs_=kInitialMs, attempts_=0;
    bool waiting_=false;
};
} // namespace imu
