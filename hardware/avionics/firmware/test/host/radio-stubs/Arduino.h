#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdarg>
#include <cstdio>
#include <string>

constexpr int HIGH=1, LOW=0, INPUT=1, OUTPUT=2, INPUT_PULLUP=3;
constexpr uint32_t SERIAL_8N1=0x800001C;
void pinMode(int pin, int mode);
int digitalRead(int pin);
void digitalWrite(int pin, int level);
uint32_t millis();
void delay(uint32_t ms);

struct TestSerial {
    std::string output;
    uint32_t baud=0;
    void begin(uint32_t speed) { baud=speed; }
    size_t setTxBufferSize(size_t size) { return size; }
    void println(const char* text) { output+=text; output+='\n'; }
    void printf(const char* format, ...) {
        char buffer[512];
        va_list args;
        va_start(args,format);
        std::vsnprintf(buffer,sizeof(buffer),format,args);
        va_end(args);
        output+=buffer;
    }
};
extern TestSerial Serial;
