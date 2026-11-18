#pragma once
#include <cstddef>
#include <cstdint>

namespace e22 {
// E22-400T30D, registers 00H..08H (ADDH through CRYPT_L).
// Config mode is M0=LOW, M1=HIGH, UART 9600 8N1.
constexpr uint8_t kReadCommand[]={0xc1,0x00,0x09};
// Explicit setup build only: persistent common TEST profile for both nodes.
// 9600 8N1, air 2.4k, address/NETID=0, 240-byte packets, 21dBm,
// CHAN=23 (433.125MHz), transparent, RSSI/repeater/LBT off, key=0.
constexpr uint8_t kSetupCommand[]={0xc0,0x00,0x09,0,0,0,0x62,0x03,0x17,0x03,0,0};
constexpr std::size_t kReplySize=12;

struct Config {
    uint16_t address=0;
    uint32_t baud=0;
    uint8_t netId=0, parity=0, channel=0, airRateBits=0, powerDbm=0;
    uint16_t packetBytes=0;
    bool fixed=false, packetRssi=false, repeater=false, lbt=false;
};

inline bool decodeConfig(const uint8_t* bytes, std::size_t length, Config& output) {
    if (!bytes || length!=kReplySize || bytes[0]!=0xc1 || bytes[1]!=0x00 ||
        bytes[2]!=0x09 || bytes[8]>83)
        return false;
    const uint32_t baudRates[]={1200,2400,4800,9600,19200,38400,57600,115200};
    const uint8_t powers[]={30,27,24,21};
    const uint16_t packetSizes[]={240,128,64,32};
    Config value;
    value.address=static_cast<uint16_t>((static_cast<uint16_t>(bytes[3])<<8)|bytes[4]);
    value.netId=bytes[5];
    value.baud=baudRates[(bytes[6]>>5)&7];
    value.parity=(bytes[6]>>3)&3;
    value.airRateBits=bytes[6]&7;
    value.packetBytes=packetSizes[(bytes[7]>>6)&3];
    value.powerDbm=powers[bytes[7]&3];
    value.channel=bytes[8];
    value.fixed=(bytes[9]&0x40)!=0;
    value.packetRssi=(bytes[9]&0x80)!=0;
    value.repeater=(bytes[9]&0x20)!=0;
    value.lbt=(bytes[9]&0x10)!=0;
    output=value;
    return true;
}

inline bool matchesSetup(const uint8_t* bytes, std::size_t length) {
    Config ignored;
    if (!decodeConfig(bytes,length,ignored)) return false;
    // CRYPT_H/L are write-only: reading zero does NOT verify the stored key.
    for (std::size_t i=3;i<10;++i) if (bytes[i]!=kSetupCommand[i]) return false;
    return true;
}
} // namespace e22
