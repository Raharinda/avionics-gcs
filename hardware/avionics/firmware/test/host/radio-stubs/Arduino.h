#pragma once
#include <cstddef>
#include <cstdint>

constexpr int HIGH=1, LOW=0, INPUT=1;
constexpr uint32_t SERIAL_8N1=0x800001C;
void pinMode(int pin, int mode);
int digitalRead(int pin);
