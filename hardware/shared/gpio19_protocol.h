#pragma once
#include <cstdint>
#include <cstddef>
#include <cstdio>
#include <cstring>

namespace gpio19 {
constexpr uint32_t kDefaultPulseMs=200, kMaxPulseMs=10000;
struct Message {
    char id[17]{};
    uint32_t durationMs=0; // Zero explicitly cancels a pulse and drives LOW.
};
inline bool parse(const char* line, const char* prefix, Message& message) {
    const size_t offset=std::strlen(prefix);
    if (!line || std::strncmp(line,prefix,offset)!=0 || std::strlen(line)<offset+18) return false;
    for (size_t i=0;i<16;++i) {
        const char c=line[offset+i];
        if (!((c>='0' && c<='9') || (c>='a' && c<='f'))) return false;
    }
    if (line[offset+16]!=':') return false;
    const char* number=line+offset+17;
    if (!*number || (number[0]=='0' && number[1])) return false;
    uint32_t duration=0;
    for (const char* p=number;*p;++p) {
        if (*p<'0' || *p>'9') return false;
        duration=duration*10+static_cast<uint32_t>(*p-'0');
        if (duration>kMaxPulseMs) return false;
    }
    std::memcpy(message.id,line+offset,16); message.id[16]='\0';
    message.durationMs=duration;
    return true;
}
inline bool same(const Message& a, const Message& b) {
    return a.durationMs==b.durationMs && std::strcmp(a.id,b.id)==0;
}
inline size_t format(char* buffer, size_t size, const char* prefix, const Message& message) {
    const int length=std::snprintf(buffer,size,"%s%s:%lu\n",prefix,message.id,
        static_cast<unsigned long>(message.durationMs));
    return length>0 && static_cast<size_t>(length)<size ? static_cast<size_t>(length) : 0;
}
// A damaged or oversized command is discarded through its newline.
class CommandBuffer {
public:
    bool push(char c) {
        if (c=='\r') return false;
        if (c=='\n') {
            data_[length_]='\0';
            const bool complete=!discard_ && length_>0;
            length_=0; discard_=false;
            return complete;
        }
        if (discard_) return false;
        if (c<0x20 || c>0x7e || length_==sizeof(data_)-1) { discard_=true; return false; }
        data_[length_++]=c;
        return false;
    }
    const char* line() const { return data_; }
    void reset() { length_=0; discard_=false; }
private:
    char data_[81]{};
    size_t length_=0;
    bool discard_=false;
};
} // namespace gpio19
