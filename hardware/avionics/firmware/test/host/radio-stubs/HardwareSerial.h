#pragma once
#include <Arduino.h>
#include <string>
#include <functional>

class HardwareSerial {
public:
    explicit HardwareSerial(int number): number(number) {}
    int number, rx=-1, tx=-1, freeBytes=512;
    uint32_t baud=0, format=0;
    size_t bufferSize=0, rxBufferSize=0, maxWriteBytes=512;
    bool failWrite=false;
    std::string written;
    std::string incoming;
    std::function<void(const uint8_t*,size_t)> onWrite;

    size_t setTxBufferSize(size_t size) { bufferSize=size; return size; }
    size_t setRxBufferSize(size_t size) { rxBufferSize=size; return size; }
    void begin(uint32_t speed, uint32_t config, int rxPin, int txPin) {
        baud=speed; format=config; rx=rxPin; tx=txPin;
    }
    int availableForWrite() { return freeBytes; }
    int available() { return static_cast<int>(incoming.size()); }
    int read() {
        if (incoming.empty()) return -1;
        const int value=static_cast<unsigned char>(incoming.front());
        incoming.erase(0,1);
        return value;
    }
    size_t write(const uint8_t* data, size_t size) {
        if (failWrite) return 0;
        if (size>maxWriteBytes) size=maxWriteBytes;
        written.append(reinterpret_cast<const char*>(data),size);
        if (onWrite) onWrite(data,size);
        return size;
    }
};
