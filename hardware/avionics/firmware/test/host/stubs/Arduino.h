#pragma once
#include <stdint.h>
extern uint32_t fake_millis;
inline uint32_t millis() { return fake_millis; }
inline void delay(uint32_t duration) { fake_millis += duration; }
