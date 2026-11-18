#pragma once
#include <cstdint>

namespace receiver {
constexpr uint32_t kUsbBaud=115200, kRadioBaud=9600;
constexpr uint32_t kStatusIntervalMs=10000;
constexpr int kRxPin=16, kTxPin=17, kAuxPin=23;
} // namespace receiver
