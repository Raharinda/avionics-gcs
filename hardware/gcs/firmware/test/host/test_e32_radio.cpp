#include <array>
#include <cassert>
#include <iostream>
#include "receiver_config.h"
#include "e32_commands.h"

namespace {
std::array<int,40> pinModes{}, levels{};
uint32_t clockMs=0;
int auxLevel=HIGH, auxReads=0;
void tick(uint32_t now) { clockMs=now; radio::service(now); }
void fresh(uint32_t start=0) {
    clockMs=start;
    pinModes.fill(-1); levels.fill(-1);
    auxLevel=HIGH; auxReads=0;
    Serial.output.clear(); radio::port().written.clear();
    board::beginControls(); radio::begin();
    assert(!radio::canReceive(start));
    tick(start+radio::kStartupGuardMs);
    assert(radio::canReceive(start+radio::kStartupGuardMs));
}
void settle(uint32_t now) {
    tick(now+radio::kModeDrainMs);
    tick(now+radio::kModeDrainMs+1);
    tick(now+radio::kModeDrainMs+radio::kModeSettleMs);
    assert(radio::state().phase==radio::Phase::Idle);
}
}
TestSerial Serial;
void pinMode(int pin,int mode) { assert(pin>=0 && pin<40); pinModes[pin]=mode; }
void digitalWrite(int pin,int level) {
    assert(pin==25 || pin==26 || pin==19);
    assert(pinModes[pin]==OUTPUT);
    if (pin==19) assert(level==LOW);
    levels[pin]=level;
}
int digitalRead(int pin) { assert(radio::kUseAux && pin==radio::kAuxPin); ++auxReads; return auxLevel; }
uint32_t millis() { return clockMs; }

int main() {
    fresh();
    const auto& uart=radio::port();
    assert(uart.number==2 && uart.rx==16 && uart.tx==17);
    assert(uart.baud==9600 && uart.format==SERIAL_8N1);
    assert(receiver::kUsbBaud==115200 && receiver::kRadioBaud==uart.baud);
    assert(uart.rxBufferSize==2048 && uart.bufferSize==512);
    assert(levels[25]==LOW && levels[26]==LOW && levels[19]==LOW);
    assert(pinModes[13]==INPUT_PULLUP && pinModes[14]==INPUT_PULLUP);
    assert(pinModes[23]==-1);
    assert(pinModes[27]==(radio::kUseAux?INPUT:-1));

    const struct { const char* command; radio::Mode mode; int m0,m1; bool rx; } cases[]={
        {"LORA_MODE:NORMAL",radio::Mode::Normal,LOW,LOW,true},
        {"LORA_MODE:WAKEUP",radio::Mode::Wakeup,HIGH,LOW,true},
        {"LORA_MODE:POWER_SAVING",radio::Mode::PowerSaving,LOW,HIGH,true},
        {"LORA_MODE:WOR",radio::Mode::PowerSaving,LOW,HIGH,true},
        {"LORA_MODE:SLEEP",radio::Mode::Sleep,HIGH,HIGH,false},
        {"LORA_MODE:CONFIG",radio::Mode::Sleep,HIGH,HIGH,false},
        {"LORA_PINS:0,0",radio::Mode::Normal,LOW,LOW,true},
        {"LORA_PINS:1,0",radio::Mode::Wakeup,HIGH,LOW,true},
        {"LORA_PINS:0,1",radio::Mode::PowerSaving,LOW,HIGH,true},
        {"LORA_PINS:1,1",radio::Mode::Sleep,HIGH,HIGH,false},
    };
    for (const auto& test:cases) {
        fresh();
        assert(radio::handleUsbCommand(test.command,1000));
        if (test.mode!=radio::Mode::Normal) {
            assert(!radio::canReceive(1000));
            assert(!radio::requestMode(radio::Mode::Normal,1001));
        }
        settle(1000);
        assert(radio::state().mode==test.mode);
        assert(levels[25]==test.m0 && levels[26]==test.m1);
        assert(radio::canReceive(4000)==test.rx);
        if (radio::kUseAux) {
            auxLevel=LOW;
            assert(radio::canReceive(4001)==test.rx);
            auxLevel=HIGH;
        }
        assert(uart.written.empty()); // USB mode commands never write radio registers.
        assert(radio::requestMode(radio::Mode::Normal,5000));
        settle(5000);
        assert(radio::canReceive(8000));
    }
    std::cout<<"PASS: E32 modes, CONFIG=1,1, WOR=0,1, RX during AUX LOW, resume NORMAL\n";

    fresh();
    for (const char* input:{"LORA_STATUS  ","\t LORA_STATUS\r\n"}) {
        Serial.output.clear();
        assert(radio::handleUsbCommand(input,1000));
        assert(Serial.output.find("# LORA_STATUS mode=NORMAL")!=std::string::npos);
        assert(radio::state().phase==radio::Phase::Idle && uart.written.empty());
    }
    for (const char* bad:{"LORA_MODE:UNKNOWN","LORA_PINS:2,0","LORA_PINS:0,1junk","LORA_PINS:0, 1"}) {
        assert(radio::handleUsbCommand(bad,1000));
        assert(radio::state().phase==radio::Phase::Idle);
        assert(levels[25]==LOW && levels[26]==LOW);
    }
    assert(!radio::handleUsbCommand("CALIBRATE_RESET",1000));
    assert(!radio::requestMode(static_cast<radio::Mode>(4),1000));
    if (radio::kUseAux) {
        auxLevel=LOW;
        assert(radio::handleUsbCommand("LORA_MODE:CONFIG",1001));
        tick(4000);
        assert(radio::state().phase==radio::Phase::Draining);
        assert(levels[25]==LOW && levels[26]==LOW);
        auxLevel=HIGH;
        tick(4001); tick(4002);
        assert(radio::state().phase==radio::Phase::Draining);
        tick(4003);
        assert(levels[25]==HIGH && levels[26]==HIGH);
        radio::printStatus(4003);
        assert(Serial.output.find("M0_SET=1 M1_SET=1")!=std::string::npos);
        tick(4004); tick(5003);
        assert(!radio::canReceive(5003));
    } else assert(auxReads==0);
    radio::printHelp();
    assert(Serial.output.find("POWER_SAVING")!=std::string::npos);
    assert(uart.written.empty() && levels[19]==LOW);

    fresh(UINT32_MAX-5000);
    assert(radio::requestMode(radio::Mode::Sleep,UINT32_MAX-1000));
    tick(999); tick(1000); tick(1999);
    assert(radio::state().phase==radio::Phase::Idle);
    assert(radio::state().mode==radio::Mode::Sleep);
    std::cout<<"PASS: AUX transition guards, invalid commands, local status, millis rollover\n";
}
