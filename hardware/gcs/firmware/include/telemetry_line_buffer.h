#pragma once
#include <cstddef>
#include "../../../shared/gpio19_protocol.h"

namespace receiver {
// UART chunks and E32 RF packets are not application frames. Keep collecting
// across gaps until newline. Drop a damaged/oversized line in its entirety.
class TelemetryLineBuffer {
public:
    static constexpr std::size_t kCapacity=512;
    enum class Result { None, Line, Control, Invalid, Oversized };

    Result push(char c) {
        if (c=='\r') return Result::None;
        if (c=='\n') {
            Result result=discard_;
            data_[length_]='\0';
            if (result==Result::None && length_>0) {
                gpio19::Message ack;
                result=(data_[0]=='{' && data_[length_-1]=='}') ? Result::Line :
                    (gpio19::parse(data_,"D19_ACK:",ack) ? Result::Control : Result::Invalid);
            }
            data_[length_]='\0';
            completedLength_=length_;
            length_=0;
            discard_=Result::None;
            return result;
        }
        if (discard_!=Result::None) return Result::None;
        const auto byte=static_cast<unsigned char>(c);
        if (byte<0x20 || byte>0x7e) {
            discard_=Result::Invalid;
            return Result::None;
        }
        if (length_==kCapacity) {
            discard_=Result::Oversized;
            return Result::None;
        }
        data_[length_++]=c;
        return Result::None;
    }

    // Only consume these when push() returns Line, before pushing more bytes.
    // JSON syntax, required fields and sensor values are validated by Tauri.
    const char* line() const { return data_; }
    std::size_t size() const { return completedLength_; }
    void reset() {
        length_=0;
        completedLength_=0;
        discard_=Result::None;
        data_[0]='\0';
    }

private:
    char data_[kCapacity+1]{};
    std::size_t length_=0, completedLength_=0;
    Result discard_=Result::None;
};
} // namespace receiver
