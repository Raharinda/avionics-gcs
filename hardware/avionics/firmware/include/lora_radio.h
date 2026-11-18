#pragma once

#include <Arduino.h>
#include <HardwareSerial.h>

namespace radio {
// Ebyte E22-400T30D: M0 and M1 must both be wired to GND (normal mode).
// The module must already use transparent transmission and 9600 baud, 8N1.
// No configuration is written: channel/address/air rate remain as stored.
constexpr uint32_t kBaud = 9600;
constexpr uint32_t kTelemetryIntervalMs = 2000;
constexpr uint32_t kAuxStableMs = 2;
constexpr uint32_t kBusyWarningMs = 5000;
constexpr int kRxPin = 16, kTxPin = 17, kAuxPin = 23;
// Application limit including newline. E22 packet size is configurable
// (32/64/128/240 bytes); module buffer is 1000 bytes. UART chunks need not
// correspond to complete application frames.
constexpr size_t kMaxFrameBytes = 240;
constexpr size_t kUartBufferBytes = 512;
static_assert(kMaxFrameBytes <= kUartBufferBytes, "Frame must fit UART/module buffer");

struct AuxState {
    bool high = false;
    uint32_t highSinceMs = 0;
};

// A short busy period after TX is normal. Warn only after continuous lack of
// readiness, and reset the warning timer every time the module becomes ready.
struct BusyWarning {
    bool waiting = false;
    uint32_t lastReportMs = 0;

    bool update(bool ready, uint32_t now) {
        if (ready) { waiting = false; return false; }
        if (!waiting) {
            waiting = true;
            lastReportMs = now;
            return false;
        }
        if (static_cast<uint32_t>(now - lastReportMs) < kBusyWarningMs)
            return false;
        lastReportMs = now;
        return true;
    }
};

inline AuxState& auxState() {
    static AuxState state;
    return state;
}

inline HardwareSerial& port() {
    static HardwareSerial uart(2);
    return uart;
}

inline void begin() {
    auxState() = AuxState{};
    pinMode(kAuxPin, INPUT);
    port().setTxBufferSize(kUartBufferBytes);
    port().begin(kBaud, SERIAL_8N1, kRxPin, kTxPin);
}

// AUX HIGH indicates local readiness, not receiver acknowledgement. Require
// a stable HIGH without blocking sampling; keep checking so LOW can recover.
inline bool readyToSend(uint32_t now) {
    auto& state = auxState();
    if (digitalRead(kAuxPin) != HIGH) {
        state.high = false;
        return false;
    }
    if (!state.high) {
        state.high = true;
        state.highSinceMs = now;
        return false;
    }
    return static_cast<uint32_t>(now - state.highSinceMs) >= kAuxStableMs;
}

// Transparent E22 UART: send the JSON line itself, without AT commands or
// addressing headers. E22 automatically divides it into RF packets; receiver
// must buffer the serial stream until newline, not until a pause in reception.
inline bool sendLine(const char* frame, size_t length, uint32_t now) {
    if (!frame || length == 0 || length > kMaxFrameBytes || frame[length-1] != '\n')
        return false;
    if (!readyToSend(now) || port().availableForWrite() < static_cast<int>(length))
        return false;
    return port().write(reinterpret_cast<const uint8_t*>(frame), length) == length;
}
} // namespace radio
