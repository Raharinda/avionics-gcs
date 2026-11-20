#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <limits>
#include "sensor_telemetry.h"
#include "telemetry_line_buffer.h"

namespace {
void roundTrip(const sensor_telemetry::Sample& sample) {
    char output[241];
    const std::size_t length=sensor_telemetry::encodeLine(sample,output,sizeof(output));
    assert(length>0 && length<=240 && output[length-1]=='\n');
    assert(std::strlen(output)==length);
    receiver::TelemetryLineBuffer receiver;
    const std::size_t chunks[]={1,7,32,58};
    std::size_t offset=0, chunk=0;
    while (offset<length) {
        const std::size_t end=std::min(length,offset+chunks[chunk++%4]);
        while (offset<end) {
            const auto result=receiver.push(output[offset]);
            ++offset;
            assert(result==(offset==length ? receiver::TelemetryLineBuffer::Result::Line :
                receiver::TelemetryLineBuffer::Result::None));
        }
    }
    assert(receiver.size()==length-1);
    assert(std::memcmp(output,receiver.line(),length-1)==0);
    // Feed the actual receiver output to the independent JSON/schema check.
    std::cout<<receiver.line()<<'\n';
}
} // namespace

int main() {
    sensor_telemetry::Sample sample;
    sample.timestampMs=190047;
    sample.temperatureC=30.6F;
    sample.pressureHpa=998.64F;
    sample.accel={{-0.47405F,-0.02155F,9.18176F}};
    sample.gyro={{-0.055691F,0.028778F,-0.016787F}};
    roundTrip(sample);

    sample.timestampMs=UINT32_MAX;
    sample.temperatureC=-40;
    sample.pressureHpa=1100;
    sample.accel={{-78.453F,-78.453F,-78.453F}};
    sample.gyro={{-8.7266F,-8.7266F,-8.7266F}};
    roundTrip(sample);

    sample.timestampMs=2;
    sample.pressureHpa=std::numeric_limits<float>::quiet_NaN();
    sample.calibrated=true;
    roundTrip(sample);
    sample.timestampMs=3;
    sample.pressureHpa=-1;
    roundTrip(sample);

    sample.timestampMs=4;
    sample.pressureHpa=1000;
    sample.accel={{0,0,9.80665F}};
    sample.gyro={{0,0,0}};
    roundTrip(sample); // A stationary sample remains a successful hardware read.

    char output[241];
    sample.temperatureC=std::numeric_limits<float>::quiet_NaN();
    assert(sensor_telemetry::encodeLine(sample,output,sizeof(output))==0 && output[0]=='\0');
    sample.temperatureC=30;
    sample.accel[1]=std::numeric_limits<float>::infinity();
    assert(sensor_telemetry::encodeLine(sample,output,sizeof(output))==0 && output[0]=='\0');
    sample.accel[1]=0;
    sample.gyro[2]=std::numeric_limits<float>::quiet_NaN();
    assert(sensor_telemetry::encodeLine(sample,output,sizeof(output))==0 && output[0]=='\0');
    sample.gyro[2]=0;
    char small[10];
    std::memset(small,'!',sizeof(small));
    assert(sensor_telemetry::encodeLine(sample,small,8)==0 && small[0]=='\0');
    assert(small[8]=='!' && small[9]=='!');
    assert(sensor_telemetry::encodeLine(sample,nullptr,0)==0);
    assert(sensor_telemetry::encodeLine(sample,output,0)==0);
    sample.accel.fill(std::numeric_limits<float>::max());
    assert(sensor_telemetry::encodeLine(sample,output,sizeof(output))==0 && output[0]=='\0');
    std::cerr<<"PASS: sensor TX -> fragmented E32 stream -> receiver preserves complete frames; invalid IMU/truncated output rejected\n";
}
