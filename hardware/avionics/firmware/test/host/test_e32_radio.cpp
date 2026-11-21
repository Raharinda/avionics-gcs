#include <array>
#include <cassert>
#include <iostream>
#include <string>
#include "lora_radio.h"
#include "e32_commands.h"

namespace {
std::array<int,40> pinModes{};
std::array<int,40> levels{};
uint32_t clockMs=0;
int auxLevel=HIGH, auxReads=0;
void tick(uint32_t now) { clockMs=now; radio::service(now); }
void fresh(uint32_t start=0) {
    clockMs=start;
    pinModes.fill(-1);
    levels.fill(-1);
    auxLevel=HIGH;
    auxReads=0;
    auto& uart=radio::port();
    uart.written.clear(); uart.freeBytes=512; uart.failWrite=false; uart.maxWriteBytes=512;
    board::beginControls();
    radio::begin();
    tick(start); // Start optional AUX stability timing.
    tick(start+radio::kStartupGuardMs);
}
void changeMode(radio::Mode mode, uint32_t now) {
    assert(radio::requestMode(mode,now));
    assert(!radio::readyToSend(now));
    assert(!radio::canReceive(now));
    tick(now+radio::kModeDrainMs);
    tick(now+radio::kModeDrainMs+1); // Observe optional AUX after driving M0/M1.
    tick(now+radio::kModeDrainMs+radio::kModeSettleMs);
    assert(radio::state().mode==mode && radio::state().phase==radio::Phase::Idle);
    const auto bits=static_cast<uint8_t>(mode);
    assert(levels[radio::kM0Pin]==(bits&1U?HIGH:LOW));
    assert(levels[radio::kM1Pin]==(bits&2U?HIGH:LOW));
}
}
TestSerial Serial;
void pinMode(int pin,int mode) {
    assert(pin>=0 && pin<40);
    assert(pin!=14); // TX POP_TEST_IN stays disabled; AUX uses GPIO27.
    if (pin==27) assert(mode==INPUT);
    pinModes[pin]=mode;
}
void digitalWrite(int pin,int level) {
    assert(pin==radio::kM0Pin || pin==radio::kM1Pin || pin==board::kPopTestOutputPin);
    if (pin==board::kPopTestOutputPin) assert(level==LOW);
    assert(pinModes[pin]==OUTPUT);
    levels[pin]=level;
}
int digitalRead(int pin) { assert(radio::kUseAux && pin==radio::kAuxPin); ++auxReads; return auxLevel; }
uint32_t millis() { return clockMs; }

int main() {
    fresh();
    auto& uart=radio::port();
    assert(radio::kM0Pin==25 && radio::kM1Pin==26);
    assert(pinModes[25]==OUTPUT && pinModes[26]==OUTPUT);
    assert(board::kPopTestInputPin==-1);
    assert(pinModes[13]==INPUT_PULLUP);
    assert(pinModes[14]==-1);
    assert(pinModes[27]==(radio::kUseAux?INPUT:-1));
    assert(pinModes[19]==OUTPUT && levels[19]==LOW);
    assert(pinModes[12]==-1 && pinModes[23]==-1);
    assert(levels[25]==LOW && levels[26]==LOW);
    assert(uart.number==2 && uart.baud==9600 && uart.format==SERIAL_8N1);
    assert(uart.rx==16 && uart.tx==17 && uart.bufferSize==512 && uart.rxBufferSize==2048);
    assert(uart.written.empty()); // Mode pins never write E32 configuration.
    assert(radio::readyToSend(1000));
    if (!radio::kUseAux) assert(auxReads==0);
    std::cout<<"PASS: GPIO25/26 normal boot, button 13 reserved, POP_IN disabled, POP_OUT 19 LOW, UART2 9600; AUX="
             <<(radio::kUseAux?"GPIO27":"disconnected")<<'\n';

    const std::string line="{\"pressure\":1008.25,\"accelZ\":9.81}\n";
    assert(radio::sendLine(line.data(),line.size(),1000));
    assert(uart.written==line);
    assert(!radio::sendLine(line.data(),line.size(),2999));
    assert(radio::readyToSend(3000));
    uart.written.clear();
    uart.freeBytes=static_cast<int>(line.size())-1;
    assert(!radio::sendLine(line.data(),line.size(),3000));
    uart.freeBytes=512;
    uart.failWrite=true;
    assert(!radio::sendLine(line.data(),line.size(),3000));
    assert(radio::readyToSend(3000));
    uart.failWrite=false;
    uart.maxWriteBytes=4;
    assert(!radio::sendLine(line.data(),line.size(),3000));
    assert(uart.written==line.substr(0,4));
    assert(!radio::readyToSend(4999));
    assert(radio::readyToSend(5000));
    uart.maxWriteBytes=512;
    uart.written.clear();
    std::string limit(radio::kMaxFrameBytes,'x'); limit.back()='\n';
    assert(radio::sendLine(limit.data(),limit.size(),5000));
    assert(uart.written==limit);
    assert(!radio::sendLine(nullptr,1,7000));
    assert(!radio::sendLine("",0,7000));
    assert(!radio::sendLine("{}",2,7000));
    const std::string oversized=limit+'\n';
    assert(!radio::sendLine(oversized.data(),oversized.size(),7000));
    std::cout<<"PASS: bounded exact JSON, TX spacing, UART backpressure, failed/partial writes\n";

    // A request immediately after TX pauses new frames and leaves pins alone
    // until the old frame has had time to leave UART and radio buffers.
    fresh();
    assert(radio::sendLine(line.data(),line.size(),1000));
    assert(radio::requestMode(radio::Mode::Sleep,1001));
    assert(!radio::requestMode(radio::Mode::PowerSaving,1002));
    assert(!radio::sendLine(line.data(),line.size(),1002));
    tick(3000);
    assert(levels[25]==LOW && levels[26]==LOW);
    tick(3001);
    assert(levels[25]==HIGH && levels[26]==HIGH);
    assert(radio::state().phase==radio::Phase::Settling);
    tick(3002);
    assert(!radio::canReceive(4000));
    tick(4001);
    assert(radio::state().mode==radio::Mode::Sleep);
    assert(!radio::readyToSend(4001) && !radio::canReceive(4001));
    assert(!radio::requestMode(static_cast<radio::Mode>(4),4001));
    changeMode(radio::Mode::Wakeup,5000);
    assert(radio::canReceive(8000) && !radio::readyToSend(8000));
    changeMode(radio::Mode::PowerSaving,9000);
    assert(radio::canReceive(12000) && !radio::readyToSend(12000));
    changeMode(radio::Mode::Normal,13000);
    assert(radio::canReceive(16000) && radio::readyToSend(16000));
    std::cout<<"PASS: all four pin combinations; drain/settle pause telemetry and resume NORMAL\n";

    fresh(UINT32_MAX-500);
    assert(radio::readyToSend(499));
    fresh(UINT32_MAX-3000);
    assert(radio::sendLine(line.data(),line.size(),UINT32_MAX-200));
    assert(!radio::readyToSend(1798));
    assert(radio::readyToSend(1799));
    fresh(UINT32_MAX-5000);
    assert(radio::requestMode(radio::Mode::Sleep,UINT32_MAX-1000));
    tick(999); tick(1000); tick(1999);
    assert(radio::state().mode==radio::Mode::Sleep);
    std::cout<<"PASS: startup, TX spacing and mode changes survive millis rollover\n";

    fresh();
    Serial.output.clear();
    for (const char* input:{"LORA_STATUS  ","\t LORA_STATUS\r\n"}) {
        Serial.output.clear();
        assert(radio::handleUsbCommand(input,1000));
        assert(Serial.output.find("# LORA_STATUS mode=NORMAL")!=std::string::npos);
        assert(radio::state().phase==radio::Phase::Idle && uart.written.empty());
    }
    assert(!radio::handleUsbCommand("IMU_STATUS",1000));
    assert(radio::handleUsbCommand("LORA_MODE:UNKNOWN",1000));
    assert(radio::state().phase==radio::Phase::Idle);
    assert(radio::handleUsbCommand("LORA_MODE:SLEEP",1000));
    tick(3000); tick(3001); tick(4000);
    assert(radio::state().mode==radio::Mode::Sleep);
    assert(radio::handleUsbCommand("LORA_STATUS",4000));
    assert(Serial.output.find("mode=SLEEP")!=std::string::npos);
    assert(uart.written.empty()); // Local commands never travel over radio.
    std::cout<<"PASS: local USB mode commands; invalid commands do not change pins\n";

    const struct { const char* command; radio::Mode mode; int m0,m1; } pinCommands[]={
        {"LORA_PINS:0,0",radio::Mode::Normal,LOW,LOW},
        {"LORA_PINS:1,0",radio::Mode::Wakeup,HIGH,LOW},
        {"LORA_PINS:0,1",radio::Mode::PowerSaving,LOW,HIGH},
        {"LORA_PINS:1,1",radio::Mode::Sleep,HIGH,HIGH},
    };
    for (const auto& request:pinCommands) {
        fresh();
        assert(radio::handleUsbCommand(request.command,1000));
        tick(3000); tick(3001); tick(4000);
        assert(radio::state().mode==request.mode);
        assert(levels[25]==request.m0 && levels[26]==request.m1);
        assert(levels[19]==LOW && uart.written.empty());
    }
    for (const char* bad:{"LORA_PINS:","LORA_PINS:00","LORA_PINS:2,0", "LORA_PINS:0,-1",
         "LORA_PINS:0, 1","LORA_PINS:0,1,0","LORA_PINS:0,1junk"}) {
        fresh();
        assert(radio::handleUsbCommand(bad,1000));
        assert(radio::state().phase==radio::Phase::Idle && radio::state().mode==radio::Mode::Normal);
        assert(levels[25]==LOW && levels[26]==LOW);
    }
    Serial.output.clear();
    assert(radio::handleUsbCommand("LORA_HELP",1000));
    assert(Serial.output.find("LORA_PINS:0,1")!=std::string::npos);
    std::cout<<"PASS: terminal M0,M1 combinations select the correct modes; malformed commands are rejected\n";

    if (radio::kUseAux) {
        fresh();
        auxLevel=LOW;
        assert(!radio::readyToSend(1001));
        assert(radio::canReceive(1001)); // AUX LOW must not block incoming UART.
        auxLevel=HIGH;
        assert(!radio::readyToSend(1002));
        assert(!radio::readyToSend(1003));
        assert(radio::readyToSend(1004));
        std::cout<<"PASS: AUX GPIO27 gates TX while RX remains readable during AUX LOW\n";
        auxLevel=LOW;
        assert(radio::handleUsbCommand("LORA_PINS:0,1",1100));
        tick(4000);
        assert(radio::state().phase==radio::Phase::Draining);
        assert(levels[25]==LOW && levels[26]==LOW);
        auxLevel=HIGH;
        tick(4001); tick(4003);
        assert(radio::state().phase==radio::Phase::Settling && levels[26]==HIGH);
        Serial.output.clear();
        assert(radio::handleUsbCommand("LORA_STATUS",4003));
        assert(Serial.output.find("M0_SET=0 M1_SET=1")!=std::string::npos);
        tick(4004); tick(5003);
        assert(radio::state().phase==radio::Phase::Idle && radio::state().mode==radio::Mode::PowerSaving);
        std::cout<<"PASS: terminal pin requests wait for AUX before driving mode pins\n";
    } else assert(auxReads==0);
    // Closing the reserved calibration button never fires the output.
    levels[13]=LOW;
    tick(20000);
    assert(levels[19]==LOW);
    std::cout<<"PASS: physical buttons remain passive and POP_TEST_OUT never goes HIGH\n";
}
