#include <cassert>
#include <iostream>
#include <string>
#include "lora_radio.h"

namespace {
int auxLevel=LOW, configuredPin=-1, configuredMode=-1;
}
void pinMode(int pin,int mode) { configuredPin=pin; configuredMode=mode; }
int digitalRead(int pin) { assert(pin==23); return auxLevel; }

int main() {
    radio::begin();
    auto& uart=radio::port();
    assert(configuredPin==23 && configuredMode==INPUT);
    assert(uart.number==2 && uart.baud==9600 && uart.format==SERIAL_8N1);
    assert(uart.rx==16 && uart.tx==17 && uart.bufferSize==512);
    assert(uart.written.empty()); // No REYAX AT or binary config on startup.
    assert(!radio::readyToSend(0));

    auxLevel=HIGH;
    assert(!radio::readyToSend(100));
    assert(!radio::readyToSend(101));
    assert(radio::readyToSend(102));
    auxLevel=LOW;
    assert(!radio::readyToSend(103));
    auxLevel=HIGH;
    assert(!radio::readyToSend(104));
    assert(!radio::readyToSend(105));
    assert(radio::readyToSend(106));
    std::cout<<"PASS: E22 9600 8N1 and AUX GPIO23 gate, including busy recovery\n";

    const std::string line="{\"pressure\":1008.25,\"accelZ\":9.81}\n";
    assert(radio::sendLine(line.data(),line.size(),106));
    assert(uart.written==line); // Exact raw JSON+newline, no AT/address wrapper.
    uart.written.clear();
    auxLevel=LOW;
    assert(!radio::sendLine(line.data(),line.size(),107));
    assert(uart.written.empty());
    auxLevel=HIGH;
    assert(!radio::sendLine(line.data(),line.size(),108));
    uart.freeBytes=static_cast<int>(line.size())-1;
    assert(!radio::sendLine(line.data(),line.size(),110));
    assert(uart.written.empty());
    uart.freeBytes=512;
    uart.failWrite=true;
    assert(!radio::sendLine(line.data(),line.size(),110));
    uart.failWrite=false;
    assert(radio::sendLine(line.data(),line.size(),110));
    assert(uart.written==line);
    std::cout<<"PASS: exact JSON framing; busy AUX, full UART and failed writes are not reported sent\n";

    uart.written.clear();
    std::string limit(radio::kMaxFrameBytes,'x'); limit.back()='\n';
    assert(radio::sendLine(limit.data(),limit.size(),112));
    assert(uart.written==limit);
    uart.written.clear();
    assert(!radio::sendLine(nullptr,1,112));
    assert(!radio::sendLine("",0,112));
    assert(!radio::sendLine("{}",2,112));
    std::string oversized=limit+'\n';
    assert(!radio::sendLine(oversized.data(),oversized.size(),112));
    assert(uart.written.empty());
    std::cout<<"PASS: bounded complete lines; no partial/oversized frames queued\n";

    radio::begin();
    assert(!radio::readyToSend(UINT32_MAX-1));
    assert(!radio::readyToSend(UINT32_MAX));
    assert(radio::readyToSend(0));
    auxLevel=LOW;
    assert(!radio::readyToSend(1));
    std::cout<<"PASS: AUX stability timing survives millis rollover\n";

    radio::BusyWarning warning;
    assert(!warning.update(true,190000));
    assert(!warning.update(false,190047)); // Busy immediately after TX.
    assert(!warning.update(true,190250));
    assert(!warning.update(false,196000)); // A later brief busy period.
    assert(!warning.update(false,196001));
    assert(!warning.update(true,196002));
    assert(!warning.update(false,200000));
    assert(!warning.update(false,204999));
    assert(warning.update(false,205000));
    assert(!warning.update(false,205001));
    assert(warning.update(false,210000));
    assert(!warning.update(true,210001));
    assert(!warning.update(false,300000)); // Recovery resets elapsed wait.
    assert(!warning.update(false,304999));
    assert(warning.update(false,305000));
    radio::BusyWarning rolloverWarning;
    assert(!rolloverWarning.update(false,UINT32_MAX-1000));
    assert(!rolloverWarning.update(false,3998));
    assert(rolloverWarning.update(false,3999));
    std::cout<<"PASS: brief TX busy periods do not warn; sustained busy warns after 5s, resets on recovery, and survives rollover\n";
}
