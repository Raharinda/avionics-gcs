#include <array>
#include <cassert>
#include <iostream>
#include <vector>
#include "e32_setup.h"

namespace {
std::array<int,40> pinModes{}, levels{};
uint32_t clockMs=0;
int auxLevel=HIGH, readCount=0, saveCount=0;
bool respond=true, persist=true, extraByte=false, badHeader=false, fragment=false, busyAfterSave=false;
std::array<uint8_t,6> stored{};
std::vector<std::pair<uint32_t,uint8_t>> pending;
constexpr std::array<uint8_t,6> expected{{0xC0,0x00,0x00,0x1A,0x17,0x44}};

void fresh() {
    clockMs=0; auxLevel=HIGH; readCount=saveCount=0;
    respond=persist=true; extraByte=badHeader=fragment=busyAfterSave=false;
    stored={{0xC0,0x12,0x34,0x1B,0x05,0xC4}};
    pinModes.fill(-1); levels.fill(-1); pending.clear();
    Serial.output.clear();
    auto& uart=radio::port();
    uart.incoming.clear(); uart.written.clear(); uart.failWrite=false; uart.maxWriteBytes=512;
    uart.onWrite=[](const uint8_t* bytes,size_t count) {
        // Every config command must be sent with both mode outputs HIGH.
        assert(levels[25]==HIGH && levels[26]==HIGH);
        if (count==3 && bytes[0]==0xC1 && bytes[1]==0xC1 && bytes[2]==0xC1) {
            ++readCount;
            if (!respond) return;
            for (size_t i=0;i<stored.size();++i) {
                const uint8_t value=(i==0 && badHeader)?0xC1:stored[i];
                if (fragment) pending.emplace_back(clockMs+static_cast<uint32_t>((i+1)*7),value);
                else radio::port().incoming+=static_cast<char>(value);
            }
            if (extraByte) radio::port().incoming+='x';
        } else if (count==6 && bytes[0]==0xC0) {
            ++saveCount;
            assert(std::memcmp(bytes,expected.data(),count)==0);
            if (persist) std::memcpy(stored.data(),bytes,count);
            if (busyAfterSave) auxLevel=LOW;
            // Simulate a plausible write ACK even when storage fails. A fresh
            // C1 response must determine success, not this ACK.
            radio::port().incoming.append(reinterpret_cast<const char*>(bytes),count);
        }
    };
    board::beginControls(); radio::begin();
}
void assertNormal() {
    assert(radio::state().mode==radio::Mode::Normal);
    assert(radio::state().phase==radio::Phase::Idle);
    assert(levels[25]==LOW && levels[26]==LOW && levels[19]==LOW);
}
void assertNoSuccess() { assert(Serial.output.find("E32_SETUP SUCCESS")==std::string::npos); }
}
TestSerial Serial;
void pinMode(int pin,int mode) { assert(pin>=0 && pin<40); pinModes[pin]=mode; }
void digitalWrite(int pin,int level) {
    assert(pin==25 || pin==26 || pin==19);
    assert(pinModes[pin]==OUTPUT);
    if (pin==19) assert(level==LOW);
    levels[pin]=level;
}
int digitalRead(int pin) { assert(radio::kUseAux && pin==radio::kAuxPin); return auxLevel; }
uint32_t millis() { return clockMs; }
void delay(uint32_t ms) {
    clockMs+=ms;
    auto it=pending.begin();
    while (it!=pending.end()) {
        if (static_cast<int32_t>(clockMs-it->first)>=0) {
            radio::port().incoming+=static_cast<char>(it->second);
            it=pending.erase(it);
        } else ++it;
    }
}

int main() {
    fresh();
    assert(e32_setup::configure());
    assert(stored==expected && readCount==2 && saveCount==1);
    assert(Serial.output.find("READ C0 00 00 1A 17 44")!=std::string::npos);
    assert(Serial.output.find("E32_SETUP SUCCESS")!=std::string::npos);
    assertNormal();
    std::cout<<"PASS: E32 mode 3, exact persistent C0 profile, fresh C1 verification, NORMAL recovery\n";

    fresh(); stored=expected;
    assert(e32_setup::configure());
    assert(readCount==1 && saveCount==0);
    assertNormal();
    std::cout<<"PASS: matching stored profile avoids repeated persistent writes\n";

    fresh(); fragment=true; clockMs=UINT32_MAX-2000;
    radio::begin();
    assert(e32_setup::configure());
    assert(stored==expected && readCount==2 && saveCount==1);
    assertNormal();
    std::cout<<"PASS: fragmented binary replies and millis rollover\n";

    fresh(); respond=false;
    assert(!e32_setup::configure());
    assert(readCount==1 && saveCount==0 && clockMs<12000);
    assertNoSuccess(); assertNormal();
    fresh(); badHeader=true;
    assert(!e32_setup::configure());
    assert(saveCount==0); assertNoSuccess(); assertNormal();
    fresh(); extraByte=true;
    assert(!e32_setup::configure());
    assert(saveCount==0); assertNoSuccess(); assertNormal();
    std::cout<<"PASS: absent, invalid and oversized responses never trigger a blind config write\n";

    fresh(); persist=false;
    assert(!e32_setup::configure());
    assert(readCount==2 && saveCount==1 && stored!=expected);
    assertNoSuccess(); assertNormal();
    fresh(); radio::port().maxWriteBytes=4;
    assert(!e32_setup::configure());
    assert(readCount==1 && saveCount==0);
    assertNoSuccess(); assertNormal();
    fresh(); radio::port().failWrite=true;
    assert(!e32_setup::configure());
    assert(readCount==0 && saveCount==0);
    assertNoSuccess(); assertNormal();
    std::cout<<"PASS: misleading ACK, readback mismatch and partial/failed UART writes cannot report success\n";

    if (radio::kUseAux) {
        fresh(); auxLevel=LOW;
        assert(!e32_setup::configure());
        assert(readCount==0 && saveCount==0 && clockMs<=e32_setup::kReadyTimeoutMs);
        assert(levels[25]==LOW && levels[26]==LOW);
        assertNoSuccess();
        std::cout<<"PASS: stuck AUX startup times out without writing configuration\n";
        fresh(); busyAfterSave=true;
        assert(!e32_setup::configure());
        assert(readCount==1 && saveCount==1 && clockMs<24000);
        assertNoSuccess();
        std::cout<<"PASS: AUX stuck after save cannot report verified success or trigger repeated writes\n";
    }
}
