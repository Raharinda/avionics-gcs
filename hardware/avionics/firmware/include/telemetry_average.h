#pragma once

#include "sensor_telemetry.h"
#include <limits>

namespace sensor_telemetry {

// Aggregate actual sensor reads, independently of radio readiness. IMU and
// pressure use separate denominators because they run at different rates.
class AverageWindow {
public:
    enum class SendResult { Empty, EncodingFailed, WriteFailed, Sent };

    bool addImu(const Sample& sample) {
        if (!std::isfinite(sample.temperatureC)) return false;
        for (std::size_t i=0;i<3;++i)
            if (!std::isfinite(sample.accel[i]) || !std::isfinite(sample.gyro[i])) return false;

        // Do not mix corrected and uncorrected measurements in one mean.
        if (imuCount_ && calibrated_!=sample.calibrated) reset();
        if (imuCount_==std::numeric_limits<uint32_t>::max()) return false;
        if (!imuCount_) firstSampleMs_=sample.timestampMs;
        calibrated_=sample.calibrated;
        temperatureSum_+=sample.temperatureC;
        for (std::size_t i=0;i<3;++i) {
            accelSum_[i]+=sample.accel[i];
            gyroSum_[i]+=sample.gyro[i];
        }
        ++imuCount_;
        return true;
    }

    bool addPressure(float pressureHpa) {
        // The window starts at its first IMU sample. Never carry pressure from
        // a period before a valid IMU stream into a later packet.
        if (!imuCount_ || !std::isfinite(pressureHpa) || pressureHpa<=0 ||
            pressureCount_==std::numeric_limits<uint32_t>::max()) return false;
        pressureSum_+=pressureHpa;
        ++pressureCount_;
        return true;
    }

    bool snapshot(uint32_t timestampMs, Sample& sample) const {
        if (!imuCount_) return false;
        Sample result;
        result.timestampMs=timestampMs; // End of the aggregation window.
        result.calibrated=calibrated_;
        result.temperatureC=static_cast<float>(temperatureSum_/imuCount_);
        result.pressureHpa=pressureCount_ ? static_cast<float>(pressureSum_/pressureCount_) :
            std::numeric_limits<float>::quiet_NaN();
        for (std::size_t i=0;i<3;++i) {
            result.accel[i]=static_cast<float>(accelSum_[i]/imuCount_);
            result.gyro[i]=static_cast<float>(gyroSum_[i]/imuCount_);
        }
        sample=result;
        return true;
    }

    // Snapshot and encoding are non-destructive. Release accumulated samples
    // only when the transport accepts the entire line; this is not a RF ACK.
    template<typename SendLine>
    SendResult send(uint32_t timestampMs, char* output, std::size_t capacity,
                    const SendLine& sendLine) {
        Sample sample;
        if (!snapshot(timestampMs,sample)) return SendResult::Empty;
        const std::size_t length=encodeLine(sample,output,capacity);
        if (!length) return SendResult::EncodingFailed;
        if (!sendLine(output,length)) return SendResult::WriteFailed;
        reset();
        return SendResult::Sent;
    }

    uint32_t imuCount() const { return imuCount_; }
    uint32_t pressureCount() const { return pressureCount_; }
    uint32_t durationMs(uint32_t now) const { return imuCount_ ? now-firstSampleMs_ : 0; }
    void reset() { *this=AverageWindow{}; }

private:
    double temperatureSum_=0, pressureSum_=0;
    std::array<double,3> accelSum_{{0,0,0}}, gyroSum_{{0,0,0}};
    uint32_t imuCount_=0, pressureCount_=0, firstSampleMs_=0;
    bool calibrated_=false;
};

} // namespace sensor_telemetry
