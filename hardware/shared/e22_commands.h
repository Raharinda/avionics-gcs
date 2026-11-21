#pragma once
#include "e22_radio.h"

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
    Serial.println("# E22 terminal: perintah lokal melalui USB, akhiri dengan Enter");
    Serial.println("# LORA_STATUS                  cek mode, pin dan gate AUX");
    Serial.println("# LORA_PINS:0,0 / LORA_MODE:NORMAL  M0=0 M1=0, telemetri");
    Serial.println("# LORA_PINS:1,0 / LORA_MODE:WOR     M0=1 M1=0, wake-on-radio");
    Serial.println("# LORA_PINS:0,1 / LORA_MODE:CONFIG  M0=0 M1=1, konfigurasi");
    Serial.println("# LORA_PINS:1,1 / LORA_MODE:SLEEP   M0=1 M1=1, tidur");
    Serial.println("# Tunggu phase=IDLE sebelum mengganti mode lagi; AUX LOW menahan transisi");
    Serial.println("# Mode CONFIG tidak menulis register; mode kembali NORMAL setelah restart");
}

// These USB commands affect this ESP32 only, not the remote node.
inline bool handleUsbCommand(const char* input, uint32_t now) {
    if (!input) return false;
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
        Serial.println("# LORA_ERROR gunakan LORA_PINS:<M0>,<M1> (0/1) atau LORA_MODE:NORMAL|WOR|CONFIG|SLEEP");
    else if (!requestMode(mode,now))
        Serial.println("# LORA_ERROR pergantian mode sedang berjalan; cek LORA_STATUS lalu coba lagi");
    else printStatus(now);
    return true;
}
} // namespace radio
