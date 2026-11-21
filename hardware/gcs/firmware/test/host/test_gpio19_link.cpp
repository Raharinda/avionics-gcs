#include <cassert>
#include <iostream>
#include <string>
#include "gpio19_link.h"
#include "telemetry_line_buffer.h"

TestSerial Serial;
uint32_t clockMs=0;
int auxLevel=HIGH;
void pinMode(int,int) {}
void digitalWrite(int,int) {}
int digitalRead(int) { return auxLevel; }
uint32_t millis() { return clockMs; }
void delay(uint32_t ms) { clockMs+=ms; }
void fresh(uint32_t start=0) {
    clockMs=start; auxLevel=HIGH;
    radio::begin(); radio::service(start); radio::service(start+1000);
    radio::port().written.clear(); radio::port().incoming.clear();
    radio::port().failWrite=false;
    Serial.output.clear();
}
const char* pulse="D19_CMD:0123456789abcdef:200";
const char* ack="D19_ACK:0123456789abcdef:200";
const char* reset="D19_CMD:fedcba9876543210:0";

int main() {
    gpio19::Message message;
    for (const char* bad : {"D19_CMD:0123456789abcdef:10001", "D19_CMD:0123456789abcdef:-1",
        "D19_CMD:0123456789abcdef:0200", "D19_CMD:0123456789abcdef:1.5",
        "D19_CMD:0123456789abcdef:200x", "D19_CMD:0123456789abcdeg:200",
        "D19_CMD:0123456789abcdef:99999999999999999999", "FIRE", "D19_CMD:"})
        assert(!gpio19::parse(bad,"D19_CMD:",message));
    assert(gpio19::parse(pulse,"D19_CMD:",message) && message.durationMs==200);
    assert(gpio19::parse(reset,"D19_CMD:",message) && message.durationMs==0);
    assert(gpio19::parse("D19_CMD:0123456789abcdef:1","D19_CMD:",message));
    assert(gpio19::parse("D19_CMD:0123456789abcdef:10000","D19_CMD:",message));

    gpio19::CommandBuffer buffer;
    const std::string oversized=std::string(81,'x')+pulse+"\n";
    for (char c:oversized) assert(!buffer.push(c));
    int completed=0;
    for (char c:std::string(pulse)+"\r\n") if (buffer.push(c)) { ++completed; assert(std::string(buffer.line())==pulse); }
    assert(completed==1);
    receiver::TelemetryLineBuffer frames;
    receiver::TelemetryLineBuffer::Result result{};
    for (char c:std::string(ack)+"\n") result=frames.push(c);
    assert(result==receiver::TelemetryLineBuffer::Result::Control);
    for (char c:std::string(ack)+char(1)+"\n") result=frames.push(c);
    assert(result==receiver::TelemetryLineBuffer::Result::Invalid);

    fresh();
    gpio19::Relay relay;
    assert(relay.submit(pulse,1000)); relay.service(1000);
    assert(relay.pending() && radio::port().written==std::string(pulse)+"\n");
    assert(Serial.output.find("D19_ACK:")==std::string::npos);
    relay.acknowledge("D19_ACK:aaaaaaaaaaaaaaaa:200"); assert(relay.pending());
    relay.acknowledge("D19_ACK:0123456789abcdef:300"); assert(relay.pending());
    relay.acknowledge(ack); assert(!relay.pending());
    assert(Serial.output.find(ack)!=std::string::npos);

    gpio19::OutputLink output;
    int applications=0;
    uint32_t duration=999;
    auto apply=[&](uint32_t ms) { ++applications; duration=ms; return true; };
    assert(output.receive(pulse,apply) && duration==200 && applications==1);
    output.receive(pulse,apply); assert(applications==1);
    output.receive("D19_CMD:0123456789abcdef:300",apply); assert(applications==1);
    output.receive(reset,apply); assert(duration==0 && applications==2);
    output.receive(pulse,apply); assert(duration==0 && applications==2);
    fresh(); output.service(1000);
    assert(!output.pending() && radio::port().written==std::string(ack)+"\n");
    gpio19::OutputLink failed;
    failed.receive(pulse,[](uint32_t) { return false; }); assert(!failed.pending());

    fresh(); gpio19::Relay retry;
    retry.submit(pulse,1000);
    radio::port().failWrite=true; retry.service(1000);
    assert(radio::port().written.empty() && retry.pending());
    radio::port().failWrite=false; retry.service(1001);
    retry.service(4000); assert(radio::port().written==std::string(pulse)+"\n");
    retry.service(4101); retry.service(7201); retry.service(10301);
    assert(radio::port().written==std::string(pulse)+"\n"+pulse+"\n"+pulse+"\n");
    retry.service(16000); assert(!retry.pending());
    assert(Serial.output.find("D19_ERROR:0123456789abcdef:TIMEOUT")!=std::string::npos);

    fresh(); gpio19::Relay cancel;
    cancel.submit(pulse,1000); cancel.service(1000);
    cancel.submit(reset,1001);
    cancel.acknowledge(ack); assert(cancel.pending());
    cancel.service(3000);
    assert(radio::port().written==std::string(pulse)+"\n"+reset+"\n");
    cancel.acknowledge("D19_ACK:fedcba9876543210:0"); assert(!cancel.pending());

    fresh(0xfffff000U); gpio19::Relay rollover;
    const uint32_t start=0xfffff000U+1000;
    rollover.submit(pulse,start); rollover.service(start);
    rollover.service(start+15000); assert(!rollover.pending());

    // Exercise both shipped protocol endpoints with fragmented transport. Each
    // fresh() below selects a separate simulated radio; this is not an RF test.
    fresh(); gpio19::Relay ground; gpio19::OutputLink avionics;
    gpio19::CommandBuffer uplink;
    receiver::TelemetryLineBuffer downlink;
    int remoteLevel=LOW, pulses=0;
    auto drive=[&](uint32_t ms) { remoteLevel=ms ? HIGH : LOW; if (ms) ++pulses; return true; };
    auto deliverCommand=[&](const std::string& bytes) {
        for (char c:bytes) if (uplink.push(c)) avionics.receive(uplink.line(),drive);
    };
    auto deliverAck=[&](const std::string& bytes) {
        for (char c:bytes) if (downlink.push(c)==receiver::TelemetryLineBuffer::Result::Control)
            ground.acknowledge(downlink.line());
    };
    ground.submit(pulse,1000); ground.service(1000);
    const std::string wireCommand=radio::port().written;
    deliverCommand(wireCommand.substr(0,12)); assert(remoteLevel==LOW);
    deliverCommand(wireCommand.substr(12)); assert(remoteLevel==HIGH && pulses==1);
    assert(ground.pending()); // UART delivery alone cannot complete the request.
    fresh(); avionics.service(1000);
    const std::string lostAck=radio::port().written; // Simulate losing the first return packet.
    assert(lostAck==std::string(ack)+"\n" && ground.pending());
    deliverCommand(wireCommand); assert(pulses==1); // Retry cannot restart a pulse.
    avionics.service(3000);
    deliverAck(radio::port().written.substr(lostAck.size())); assert(!ground.pending());
    remoteLevel=LOW; // The local timer expires, tested by test_gpio19_output.cpp.
    ground.submit(reset,4000);
    fresh(); ground.service(4000);
    deliverCommand(radio::port().written); assert(remoteLevel==LOW);
    fresh(); avionics.service(1000);
    deliverAck(radio::port().written); assert(!ground.pending());
    deliverCommand(wireCommand); assert(remoteLevel==LOW && pulses==1);
    std::cout<<"PASS: GCS -> fragmented command -> avionics D19 HIGH -> return ACK -> GCS; lost ACK retry gives one pulse, Reset LOW, stale FIRE stays LOW\n";

    fresh(); gpio19::Relay gated;
    gated.submit(pulse,1000);
    if (radio::kUseAux) {
        auxLevel=LOW; gated.service(1000);
        assert(radio::port().written.empty() && gated.pending());
        auxLevel=HIGH; gated.service(2000); gated.service(2002);
        assert(radio::port().written==std::string(pulse)+"\n");
    }
    fresh(); radio::state().mode=radio::Mode::Sleep;
    gpio19::Relay sleeping; sleeping.submit(pulse,1000); sleeping.service(1000);
    assert(radio::port().written.empty() && sleeping.pending());
    sleeping.service(16000); assert(!sleeping.pending());
    std::cout<<"PASS: D19 strict framing, duration limits, remote-only ACK, retry/timeout, duplicate suppression, LOW override and rollover; AUX="<<radio::kUseAux<<'\n';
}
