#pragma once
#include <cstdint>
#include "e32_radio.h"

namespace receiver {
constexpr uint32_t kUsbBaud=115200, kRadioBaud=9600;
constexpr uint32_t kStatusIntervalMs=10000;
constexpr int kRxPin=radio::kRxPin, kTxPin=radio::kTxPin;
} // namespace receiver
