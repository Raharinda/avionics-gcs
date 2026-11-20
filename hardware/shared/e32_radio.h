#pragma once

#include <Arduino.h>
#include <HardwareSerial.h>
#include <cstring>
#include "board_pins.h"

#ifndef E32_M0_PIN
#define E32_M0_PIN ::board::kLoRaM0Pin
#endif
#ifndef E32_M1_PIN
#define E32_M1_PIN ::board::kLoRaM1Pin
#endif
// The updated GPIO drawing connects AUX to GPIO27. Set -1 only when unused.
#ifndef E32_AUX_PIN
#define E32_AUX_PIN ::board::kLoRaAuxPin
#endif

// E32-433T30D transmitter/receiver. Mode 2 receives wake-up packets; configuration is mode 3.
namespace radio {
constexpr int kRxPin=board::kLoRaRxPin, kTxPin=board::kLoRaTxPin, kM0Pin=E32_M0_PIN, kM1Pin=E32_M1_PIN;
constexpr int kAuxPin=E32_AUX_PIN;
constexpr bool kUseAux=kAuxPin>=0;
constexpr uint32_t kBaud=9600, kTelemetryIntervalMs=2000;
constexpr uint32_t kStartupGuardMs=1000, kTxGuardMs=2000;
constexpr uint32_t kModeDrainMs=2000, kModeSettleMs=1000, kAuxStableMs=2;
constexpr size_t kMaxFrameBytes=240, kUartBufferBytes=512;
static_assert(kMaxFrameBytes<=kUartBufferBytes, "Frame must fit UART buffer");
static_assert(kM0Pin!=kM1Pin && kM0Pin!=kRxPin && kM0Pin!=kTxPin &&
    kM1Pin!=kRxPin && kM1Pin!=kTxPin, "E32 mode and UART pins must differ");
static_assert(!kUseAux || (kAuxPin!=kM0Pin && kAuxPin!=kM1Pin &&
    kAuxPin!=kRxPin && kAuxPin!=kTxPin), "AUX must use a separate input");
static_assert(!board::isControlPin(kM0Pin) && !board::isControlPin(kM1Pin) &&
    (!kUseAux || !board::isControlPin(kAuxPin)), "LoRa must not reuse button or POP_TEST pins");

enum class Mode : uint8_t { Normal=0, Wakeup=1, PowerSaving=2, Sleep=3 };
enum class Phase : uint8_t { Starting, Idle, Draining, Settling };

struct State {
    Mode mode=Mode::Normal, target=Mode::Normal;
    Phase phase=Phase::Starting;
    uint32_t phaseSinceMs=0, lastTxMs=0, auxHighSinceMs=0;
    bool txGuard=false, auxHigh=false;
};

inline State& state() { static State value; return value; }
inline HardwareSerial& port() { static HardwareSerial uart(2); return uart; }

inline const char* modeName(Mode mode) {
    switch (mode) {
        case Mode::Normal: return "NORMAL";
        case Mode::Wakeup: return "WAKEUP";
        case Mode::PowerSaving: return "POWER_SAVING";
        case Mode::Sleep: return "SLEEP";
    }
    return "INVALID";
}

inline const char* phaseName(Phase phase) {
    switch (phase) {
        case Phase::Starting: return "STARTING";
        case Phase::Idle: return "IDLE";
        case Phase::Draining: return "DRAINING";
        case Phase::Settling: return "SETTLING";
    }
    return "INVALID";
}

inline bool parseMode(const char* text, Mode& mode) {
    if (!text) return false;
    if (std::strcmp(text,"NORMAL")==0) mode=Mode::Normal;
    else if (std::strcmp(text,"WAKEUP")==0) mode=Mode::Wakeup;
    else if (std::strcmp(text,"POWER_SAVING")==0 || std::strcmp(text,"WOR")==0) mode=Mode::PowerSaving;
    else if (std::strcmp(text,"CONFIG")==0) mode=Mode::Sleep;
    else if (std::strcmp(text,"SLEEP")==0) mode=Mode::Sleep;
    else return false;
    return true;
}

// Pin order is explicitly M0,M1; never bypass requestMode/AUX by writing
// GPIOs directly from a terminal command.
inline bool parsePinLevels(const char* text, Mode& mode) {
    if (!text || std::strlen(text)!=3 || text[1]!=',' ||
        (text[0]!='0' && text[0]!='1') || (text[2]!='0' && text[2]!='1')) return false;
    mode=static_cast<Mode>((text[0]-'0') | ((text[2]-'0')<<1));
    return true;
}

inline void driveMode(Mode mode) {
    const auto bits=static_cast<uint8_t>(mode);
    digitalWrite(kM0Pin,(bits&1U)?HIGH:LOW);
    digitalWrite(kM1Pin,(bits&2U)?HIGH:LOW);
}

inline void begin() {
    pinMode(kM0Pin,OUTPUT);
    digitalWrite(kM0Pin,LOW);
    pinMode(kM1Pin,OUTPUT);
    digitalWrite(kM1Pin,LOW);
    if (kUseAux) pinMode(kAuxPin,INPUT);
    port().setRxBufferSize(2048);
    port().setTxBufferSize(kUartBufferBytes);
    port().begin(kBaud,SERIAL_8N1,kRxPin,kTxPin);
    state()=State{};
    state().phaseSinceMs=millis();
}

inline bool auxReady(uint32_t now) {
    if (!kUseAux) return true;
    auto& value=state();
    if (digitalRead(kAuxPin)!=HIGH) { value.auxHigh=false; return false; }
    if (!value.auxHigh) {
        value.auxHigh=true;
        value.auxHighSinceMs=now;
        return false;
    }
    return static_cast<uint32_t>(now-value.auxHighSinceMs)>=kAuxStableMs;
}

// Guards without AUX assume the stored 2.4 kbps profile and <=240-byte frames.
// They cannot verify actual module readiness or remote reception.
inline void service(uint32_t now) {
    auto& value=state();
    const bool aux=auxReady(now);
    if (value.txGuard && static_cast<uint32_t>(now-value.lastTxMs)>=kTxGuardMs)
        value.txGuard=false;
    if (value.phase==Phase::Starting) {
        if (aux && static_cast<uint32_t>(now-value.phaseSinceMs)>=kStartupGuardMs)
            value.phase=Phase::Idle;
    } else if (value.phase==Phase::Draining) {
        if (aux && !value.txGuard && static_cast<uint32_t>(now-value.phaseSinceMs)>=kModeDrainMs) {
            driveMode(value.target);
            value.phase=Phase::Settling;
            value.phaseSinceMs=now;
            value.auxHigh=false;
        }
    } else if (value.phase==Phase::Settling && aux &&
        static_cast<uint32_t>(now-value.phaseSinceMs)>=kModeSettleMs) {
        value.mode=value.target;
        value.phase=Phase::Idle;
    }
}

inline bool requestMode(Mode mode, uint32_t now) {
    service(now);
    if (static_cast<uint8_t>(mode)>3U) return false;
    auto& value=state();
    if (value.phase!=Phase::Idle) return value.target==mode;
    if (value.mode==mode) return true;
    value.target=mode;
    value.phase=Phase::Draining;
    value.phaseSinceMs=now;
    return true;
}

inline bool canReceive(uint32_t now) {
    service(now);
    // Do not gate received UART bytes on AUX: it can be LOW during delivery.
    return state().phase==Phase::Idle &&
        state().mode!=Mode::Sleep;
}

inline bool readyToSend(uint32_t now) {
    service(now);
    // Automatic sensor transmission uses NORMAL on both E32 nodes.
    return state().phase==Phase::Idle && state().mode==Mode::Normal &&
        !state().txGuard && auxReady(now);
}

inline bool sendLine(const char* frame, size_t length, uint32_t now) {
    if (!frame || length==0 || length>kMaxFrameBytes || frame[length-1]!='\n') return false;
    if (!readyToSend(now) || port().availableForWrite()<static_cast<int>(length)) return false;
    const size_t written=port().write(reinterpret_cast<const uint8_t*>(frame),length);
    if (written>0) { state().txGuard=true; state().lastTxMs=now; }
    return written==length;
}
} // namespace radio
