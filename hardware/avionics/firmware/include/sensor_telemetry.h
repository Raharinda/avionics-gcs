#pragma once

#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace sensor_telemetry {
struct Sample {
    uint32_t timestampMs=0;
    float temperatureC=0, pressureHpa=0;
    std::array<float,3> accel{{0,0,0}}, gyro{{0,0,0}};
    bool calibrated=false;
};

// Serialize actual sensor readings with the existing Tauri field names/units.
// Return zero and clear the buffer on invalid IMU data or insufficient space;
// never send a truncated JSON object. A missing barometer remains JSON null.
inline std::size_t encodeLine(const Sample& sample, char* output, std::size_t capacity) {
    if (!output || capacity==0) return 0;
    output[0]='\0';
    if (!std::isfinite(sample.temperatureC)) return 0;
    for (std::size_t i=0;i<3;++i)
        if (!std::isfinite(sample.accel[i]) || !std::isfinite(sample.gyro[i])) return 0;

    char pressureText[48];
    if (std::isfinite(sample.pressureHpa) && sample.pressureHpa>0)
        std::snprintf(pressureText,sizeof(pressureText),"%.2f",sample.pressureHpa);
    else std::strcpy(pressureText,"null");

    const int length=std::snprintf(output,capacity,
        "{\"timestampMs\":%lu,\"temperature\":%.2f,\"pressure\":%s,"
        "\"accelX\":%.3f,\"accelY\":%.3f,\"accelZ\":%.3f,"
        "\"gyroX\":%.4f,\"gyroY\":%.4f,\"gyroZ\":%.4f,"
        "\"imuValid\":true,\"calibrated\":%s}\n",
        static_cast<unsigned long>(sample.timestampMs),sample.temperatureC,pressureText,
        sample.accel[0],sample.accel[1],sample.accel[2],sample.gyro[0],sample.gyro[1],sample.gyro[2],
        sample.calibrated?"true":"false");
    if (length<=0 || static_cast<std::size_t>(length)>=capacity) {
        output[0]='\0';
        return 0;
    }
    return static_cast<std::size_t>(length);
}
} // namespace sensor_telemetry
