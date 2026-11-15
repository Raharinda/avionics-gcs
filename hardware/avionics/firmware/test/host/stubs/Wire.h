#pragma once
#include <array>
#include <stddef.h>
#include <stdint.h>
#include <vector>

class TwoWire {
public:
    std::array<uint8_t, 128> registers{};
    bool nack = false;
    bool reset_stuck = false;
    int short_read_register = -1;
    int fail_write_register = -1;
    int ignore_write_register = -1;

    TwoWire() { registers[0x75] = 0x68; registers[0x6B] = 0x40; }
    void beginTransmission(uint8_t) { tx_.clear(); }
    size_t write(uint8_t value) { tx_.push_back(value); return 1; }
    uint8_t endTransmission(bool = true) {
        if (nack) return 2;
        pointer_ = tx_[0];
        if (tx_.size() == 2) {
            if (pointer_ == fail_write_register) return 3;
            if (pointer_ == ignore_write_register) return 0;
            if (pointer_ == 0x6B && tx_[1] == 0x80) {
                registers.fill(0);
                registers[0x75] = 0x68;
                registers[0x6B] = reset_stuck ? 0x80 : 0x40;
            } else {
                registers[pointer_] = tx_[1];
            }
        }
        return 0;
    }
    size_t requestFrom(uint8_t, size_t count, bool) {
        rx_.clear();
        rx_index_ = 0;
        if (pointer_ == short_read_register && count > 0) --count;
        for (size_t index = 0; index < count; ++index) rx_.push_back(registers[pointer_ + index]);
        return count;
    }
    int available() { return static_cast<int>(rx_.size() - rx_index_); }
    int read() { return rx_index_ < rx_.size() ? rx_[rx_index_++] : -1; }

private:
    uint8_t pointer_ = 0;
    size_t rx_index_ = 0;
    std::vector<uint8_t> tx_, rx_;
};
