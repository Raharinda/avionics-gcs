#pragma once
#include <Arduino.h>

#ifndef BOARD_POP_TEST_INPUT_PIN
#define BOARD_POP_TEST_INPUT_PIN 14
#endif

// Authoritative ESP32 mapping: docs/gpioesp32.jpeg. The larger schematic
// contains an older GPIO assignment and is used for component connections.
// TX explicitly selects AUX GPIO27 and disables POP_TEST_IN via its build flags.
namespace board {
constexpr int kSdaPin=21, kSclPin=22;
constexpr int kLoRaRxPin=16, kLoRaTxPin=17;
constexpr int kLoRaM0Pin=25, kLoRaM1Pin=26, kLoRaAuxPin=27;
constexpr int kCalibrationPin=13, kPopTestInputPin=BOARD_POP_TEST_INPUT_PIN, kPopTestOutputPin=19;

constexpr bool isControlPin(int pin) {
    return pin==kCalibrationPin || pin==kPopTestInputPin || pin==kPopTestOutputPin;
}

inline void beginControls() {
    // Start LOW; only avionics accepts timed GPIO19 commands from the radio.
    // The schematic's gate pull-down holds LOW while ESP32 is resetting.
    pinMode(kPopTestOutputPin,OUTPUT);
    digitalWrite(kPopTestOutputPin,LOW);
    pinMode(kCalibrationPin,INPUT_PULLUP);
    if (kPopTestInputPin>=0) pinMode(kPopTestInputPin,INPUT_PULLUP);
    // Buttons are reserved only; existing USB calibration remains unchanged.
}
} // namespace board
