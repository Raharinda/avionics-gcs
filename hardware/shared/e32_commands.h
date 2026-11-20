#pragma once
#include "e32_radio.h"

namespace radio {
inline void printStatus(uint32_t now) {
    service(now);
    const Mode driven=state().phase==Phase::Settling?state().target:state().mode;
    const auto bits=static_cast<uint8_t>(driven);
    const char* aux=kUseAux?(auxReady(now)?"1":"0"):"NA";
    Serial.printf("# LORA_STATUS mode=%s target=%s phase=%s M0=GPIO%d M1=GPIO%d M0_SET=%u M1_SET=%u AUX=%s AUX_GPIO=%d AUX_READY=%s UART=%lu\n",
        modeName(state().mode),modeName(state().target),phaseName(state().phase),
        kM0Pin,kM1Pin,static_cast<unsigned int>(bits&1U),static_cast<unsigned int>((bits>>1)&1U),
        kUseAux?"enabled":"unused",kAuxPin,aux,static_cast<unsigned long>(kBaud));
}

inline void printHelp() {
    Serial.println("# E32 terminal: perintah lokal melalui USB, akhiri dengan Enter");
    Serial.println("# LORA_STATUS                  cek mode, pin dan gate AUX");
    Serial.println("# LORA_PINS:0,0 / LORA_MODE:NORMAL  M0=0 M1=0, telemetri");
    Serial.println("# LORA_PINS:1,0 / LORA_MODE:WAKEUP  M0=1 M1=0, wake-up");
    Serial.println("# LORA_PINS:0,1 / LORA_MODE:POWER_SAVING  M0=0 M1=1, RX hemat daya (alias WOR)");
    Serial.println("# LORA_PINS:1,1 / LORA_MODE:SLEEP   M0=1 M1=1, tidur/konfigurasi (alias CONFIG)");
    Serial.println("# Tunggu phase=IDLE sebelum mengganti mode lagi; AUX LOW menahan transisi");
    Serial.println("# Mode CONFIG tidak menulis register; mode kembali NORMAL setelah restart");
}

// These USB commands affect this ESP32 only, not the remote node.
inline bool handleUsbCommand(const char* input, uint32_t now) {
    if (!input) return false;
    // Monitor paste/typing can leave spaces or a line ending around a command.
    // Match the bounded command text instead of silently ignoring LORA_STATUS.
    const auto whitespace=[](char c) { return c==' ' || c=='\t' || c=='\r' || c=='\n'; };
    while (whitespace(*input)) ++input;
    size_t length=std::strlen(input);
    while (length && whitespace(input[length-1])) --length;
    if (length>80) return false;
    char command[81];
    std::memcpy(command,input,length);
    command[length]='\0';
    input=command;
    if (std::strcmp(input,"LORA_HELP")==0) { printHelp(); return true; }
    if (std::strcmp(input,"LORA_STATUS")==0) { printStatus(now); return true; }
    constexpr const char* prefix="LORA_MODE:";
    constexpr const char* pinsPrefix="LORA_PINS:";
    const bool named=std::strncmp(input,prefix,std::strlen(prefix))==0;
    const bool pins=std::strncmp(input,pinsPrefix,std::strlen(pinsPrefix))==0;
    if (!named && !pins) return false;
    Mode mode=Mode::Normal;
    const bool valid=named?parseMode(input+std::strlen(prefix),mode):parsePinLevels(input+std::strlen(pinsPrefix),mode);
    if (!valid)
        Serial.println("# LORA_ERROR gunakan LORA_PINS:<M0>,<M1> (0/1) atau LORA_MODE:NORMAL|WAKEUP|POWER_SAVING|WOR|CONFIG|SLEEP");
    else if (!requestMode(mode,now))
        Serial.println("# LORA_ERROR pergantian mode sedang berjalan; cek LORA_STATUS lalu coba lagi");
    else printStatus(now);
    return true;
}
} // namespace radio
