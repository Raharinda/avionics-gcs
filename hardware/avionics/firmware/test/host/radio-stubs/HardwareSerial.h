#pragma once
#include <Arduino.h>
#include <string>

class HardwareSerial {
public:
    explicit HardwareSerial(int number): number(number) {}
    int number, rx=-1, tx=-1, freeBytes=512;
    uint32_t baud=0, format=0;
    size_t bufferSize=0;
    bool failWrite=false;
    std::string written;

    size_t setTxBufferSize(size_t size) { bufferSize=size; return size; }
    void begin(uint32_t speed, uint32_t config, int rxPin, int txPin) {
        baud=speed; format=config; rx=rxPin; tx=txPin;
    }
    int availableForWrite() { return freeBytes; }
    size_t write(const uint8_t* data, size_t size) {
        if (failWrite) return 0;
        written.append(reinterpret_cast<const char*>(data),size);
        return size;
    }
};
