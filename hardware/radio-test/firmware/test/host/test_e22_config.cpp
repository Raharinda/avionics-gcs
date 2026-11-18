#include <cassert>
#include <iostream>
#include "e22_config.h"

int main() {
    assert(sizeof(e22::kReadCommand)==3 && e22::kReadCommand[0]==0xc1 &&
        e22::kReadCommand[1]==0 && e22::kReadCommand[2]==9);
    e22::Config config;
    uint8_t bytes[]={0xc1,0,9,0x12,0x34,5,0x62,0x03,0x17,0x03,0,0};
    assert(e22::decodeConfig(bytes,sizeof(bytes),config));
    assert(config.address==0x1234 && config.netId==5 && config.baud==9600 && config.parity==0);
    assert(config.channel==0x17 && config.airRateBits==2 && config.packetBytes==240);
    assert(!config.fixed && !config.packetRssi && !config.repeater && !config.lbt && config.powerDbm==21);
    assert(!e22::matchesSetup(bytes,sizeof(bytes)));
    std::cout<<"PASS: E22 C1 00 09 response decodes NETID, UART and registers at their correct offsets\n";

    bytes[6]=0xf7; bytes[7]=0x41; bytes[8]=83; bytes[9]=0xf3;
    assert(e22::decodeConfig(bytes,sizeof(bytes),config));
    assert(config.baud==115200 && config.parity==2 && config.airRateBits==7);
    assert(config.packetBytes==128 && config.powerDbm==27 && config.channel==83);
    assert(config.fixed && config.packetRssi && config.repeater && config.lbt);
    std::cout<<"PASS: E22 UART/parity, packet size, power, fixed mode and RSSI bits cannot be confused with E32 layout\n";

    const auto previous=config;
    assert(!e22::decodeConfig(bytes,3,config));
    assert(!e22::decodeConfig(bytes,11,config));
    assert(!e22::decodeConfig(bytes,13,config));
    assert(!e22::decodeConfig(nullptr,12,config));
    bytes[0]=0xc0;
    assert(!e22::decodeConfig(bytes,12,config));
    bytes[0]=0xc1; bytes[1]=1;
    assert(!e22::decodeConfig(bytes,12,config));
    bytes[1]=0; bytes[2]=8;
    assert(!e22::decodeConfig(bytes,12,config));
    bytes[2]=9; bytes[8]=84;
    assert(!e22::decodeConfig(bytes,12,config));
    assert(config.address==previous.address && config.channel==previous.channel);
    const uint8_t oldReply[]={0xc0,0,0,0x1a,0x17,0x44};
    const uint8_t loopback[]={0xc1,0,9};
    assert(!e22::decodeConfig(oldReply,sizeof(oldReply),config));
    assert(!e22::decodeConfig(loopback,sizeof(loopback),config));
    std::cout<<"PASS: old E32, loopback, truncated, wrong-offset and out-of-range replies are rejected\n";

    uint8_t setupReply[12];
    for (std::size_t i=0;i<12;++i) setupReply[i]=e22::kSetupCommand[i];
    assert(!e22::matchesSetup(setupReply,sizeof(setupReply))); // TX echo is not an ACK.
    setupReply[0]=0xc1;
    assert(e22::matchesSetup(setupReply,sizeof(setupReply)));
    setupReply[10]=0xff; setupReply[11]=0xff;
    assert(e22::matchesSetup(setupReply,sizeof(setupReply))); // Never verify write-only key by reading it.
    setupReply[5]=1;
    assert(!e22::matchesSetup(setupReply,sizeof(setupReply)));
    setupReply[5]=0; setupReply[9]|=0x80;
    assert(!e22::matchesSetup(setupReply,sizeof(setupReply)));
    std::cout<<"PASS: setup requires matching public registers; echo and changed NETID/RSSI cannot verify it; write-only key is excluded\n";
}
