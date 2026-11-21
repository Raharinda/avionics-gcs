#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <limits>
#include <string>
#include "telemetry_average.h"
#include "telemetry_line_buffer.h"

namespace {
using Window=sensor_telemetry::AverageWindow;
using Result=Window::SendResult;
using Sample=sensor_telemetry::Sample;

void closeTo(float actual,float expected) {
    assert(std::fabs(actual-expected)<0.0001F);
}

Sample reading(uint32_t now,float value,bool calibrated=false) {
    Sample sample;
    sample.timestampMs=now;
    sample.temperatureC=value;
    sample.accel={{value,-value,2*value}};
    sample.gyro={{0.1F*value,-0.2F*value,0.3F*value}};
    sample.calibrated=calibrated;
    return sample;
}

void expectReading(const Sample& sample,float value) {
    closeTo(sample.temperatureC,value);
    closeTo(sample.accel[0],value);
    closeTo(sample.accel[1],-value);
    closeTo(sample.accel[2],2*value);
    closeTo(sample.gyro[0],0.1F*value);
    closeTo(sample.gyro[1],-0.2F*value);
    closeTo(sample.gyro[2],0.3F*value);
}
}

int main() {
    Window window;
    Sample average;
    char payload[241];
    unsigned sends=0;
    const auto accepted=[&](const char* line,std::size_t length) {
        ++sends;
        assert(length>0 && length<=240 && line[length-1]=='\n');
        return true;
    };
    assert(!window.snapshot(0,average));
    assert(window.send(0,payload,sizeof(payload),accepted)==Result::Empty);
    assert(sends==0 && window.durationMs(100)==0);
    assert(!window.addPressure(1000)); // No window before the first IMU sample.

    // A busy radio must not determine the sampling rate. Collect 100 Hz IMU
    // and 10 Hz BMP readings for two seconds, without a send in between.
    for (uint32_t i=0;i<200;++i) {
        assert(window.addImu(reading(1000+i*10,static_cast<float>(i))));
        if (i%10==0) assert(window.addPressure(1000+static_cast<float>(i/10)));
    }
    assert(window.imuCount()==200 && window.pressureCount()==20);
    assert(window.durationMs(3000)==2000);
    assert(window.snapshot(3000,average));
    assert(average.timestampMs==3000 && !average.calibrated);
    expectReading(average,99.5F);
    closeTo(average.pressureHpa,1009.5F);
    assert(window.imuCount()==200); // Snapshots do not consume data.

    // An undersized payload cannot silently consume the accumulated samples.
    char tiny[8];
    assert(window.send(3000,tiny,sizeof(tiny),accepted)==Result::EncodingFailed);
    assert(sends==0 && window.imuCount()==200 && window.pressureCount()==20);

    // Local UART rejection preserves the window. More sensor samples join it
    // before retry, rather than replacing the existing measurements.
    const auto rejected=[&](const char* line,std::size_t length) {
        ++sends;
        assert(line[length-1]=='\n');
        return false;
    };
    assert(window.send(3000,payload,sizeof(payload),rejected)==Result::WriteFailed);
    assert(window.imuCount()==200 && window.pressureCount()==20);
    assert(window.addImu(reading(3010,200)));
    assert(window.addPressure(1020));
    assert(window.snapshot(3010,average));
    expectReading(average,100);
    closeTo(average.pressureHpa,1010);

    // Feed the actual average JSON through the receiver in RF-sized fragments.
    receiver::TelemetryLineBuffer receiver;
    const auto fragmentedReceiver=[&](const char* line,std::size_t length) {
        assert(length<=240);
        for (std::size_t offset=0;offset<length;offset+=58) {
            for (std::size_t i=offset;i<std::min(offset+58,length);++i) {
                const auto result=receiver.push(line[i]);
                assert(result==(i+1==length ? receiver::TelemetryLineBuffer::Result::Line :
                    receiver::TelemetryLineBuffer::Result::None));
            }
        }
        assert(std::strstr(receiver.line(),"\"temperature\":100.00"));
        assert(std::strstr(receiver.line(),"\"pressure\":1010.00"));
        assert(std::strstr(receiver.line(),"\"accelZ\":200.000"));
        return true;
    };
    assert(window.send(3020,payload,sizeof(payload),fragmentedReceiver)==Result::Sent);
    assert(window.imuCount()==0 && window.pressureCount()==0);
    assert(!window.snapshot(3020,average));

    // Invalid readings never poison sums or increase denominators.
    Sample invalid=reading(4000,10);
    invalid.temperatureC=std::numeric_limits<float>::quiet_NaN();
    assert(!window.addImu(invalid));
    invalid=reading(4000,10);
    invalid.accel[1]=std::numeric_limits<float>::infinity();
    assert(!window.addImu(invalid));
    invalid=reading(4000,10);
    invalid.gyro[2]=std::numeric_limits<float>::quiet_NaN();
    assert(!window.addImu(invalid));
    assert(window.imuCount()==0);
    assert(window.addImu(reading(4000,10)));
    assert(!window.addPressure(std::numeric_limits<float>::quiet_NaN()));
    assert(!window.addPressure(std::numeric_limits<float>::infinity()));
    assert(!window.addPressure(0) && !window.addPressure(-1));
    assert(window.snapshot(4500,average));
    expectReading(average,10);
    assert(std::isnan(average.pressureHpa));
    assert(window.send(4500,payload,sizeof(payload),accepted)==Result::Sent);
    assert(std::strstr(payload,"\"pressure\":null"));

    // A calibration epoch change discards the old coordinate correction and
    // barometer window, then includes the first sample of the new epoch once.
    assert(window.addImu(reading(5000,10)));
    assert(window.addPressure(1000));
    assert(window.addImu(reading(5010,30,true)));
    assert(window.imuCount()==1 && window.pressureCount()==0);
    assert(window.snapshot(5100,average) && average.calibrated);
    expectReading(average,30);
    assert(window.durationMs(5100)==90);
    assert(window.addImu(reading(5020,50,true)));
    assert(window.snapshot(5100,average));
    expectReading(average,40);
    window.reset(); // Also used for profile replacement and IMU read failure.
    assert(!window.snapshot(5100,average) && window.pressureCount()==0);

    // Unsigned timestamps work across millis() wraparound.
    assert(window.addImu(reading(UINT32_MAX-9,10,true)));
    assert(window.addImu(reading(10,20,true)));
    assert(window.durationMs(20)==30);
    assert(window.snapshot(20,average));
    expectReading(average,15);

    // A prolonged busy period uses constant memory and includes every reading.
    window.reset();
    for (uint32_t i=0;i<100000;++i) {
        assert(window.addImu(reading(i*10,i%2?30:10)));
        if (i%10==0) assert(window.addPressure(i%20?1010:990));
    }
    assert(window.imuCount()==100000 && window.pressureCount()==10000);
    assert(window.snapshot(1000000,average));
    expectReading(average,20);
    closeTo(average.pressureHpa,1000);
    std::cout<<"PASS: averaged IMU/BMP at independent rates, delayed/rejected sends preserve all valid samples, calibration reset, absent BMP, rollover and fragmented receiver\n";
}
