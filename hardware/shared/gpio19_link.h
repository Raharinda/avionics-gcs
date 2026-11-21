#pragma once
#include "gpio19_protocol.h"
#include "e32_radio.h"

namespace gpio19 {
// Retry on a cadence different from the two-second telemetry interval.
constexpr uint32_t kRetryMs=3100, kTimeoutMs=15000;
class Relay {
public:
    bool pending() const { return pending_; }
    bool submit(const char* line, uint32_t now) {
        Message next;
        if (!parse(line,"D19_CMD:",next)) return false;
        if (pending_ && next.durationMs!=0) {
            Serial.printf("D19_ERROR:%s:BUSY\n",next.id); return true;
        }
        if (pending_) Serial.printf("D19_ERROR:%s:CANCELLED\n",message_.id);
        message_=next; pending_=true; attempts_=0; since_=now;
        Serial.printf("D19_QUEUED:%s:%lu\n",message_.id,static_cast<unsigned long>(message_.durationMs));
        return true;
    }
    bool acknowledge(const char* line) {
        Message ack;
        if (!parse(line,"D19_ACK:",ack)) return false;
        if (pending_ && same(ack,message_)) { pending_=false; Serial.println(line); }
        return true; // Never publish stale/unmatched ACKs as a completed request.
    }
    void service(uint32_t now) {
        if (!pending_) return;
        if (static_cast<uint32_t>(now-since_)>=kTimeoutMs) {
            Serial.printf("D19_ERROR:%s:TIMEOUT\n",message_.id); pending_=false; return;
        }
        if (attempts_>=3 || (attempts_ && static_cast<uint32_t>(now-lastSend_)<kRetryMs)) return;
        // Avoid inserting a command while a telemetry frame is still arriving.
        if (radio::port().available()) return;
        char frame[64];
        const size_t length=format(frame,sizeof(frame),"D19_CMD:",message_);
        if (radio::sendLine(frame,length,now)) {
            lastSend_=now; ++attempts_;
            Serial.printf("D19_SENT:%s:%lu\n",message_.id,static_cast<unsigned long>(message_.durationMs));
        }
    }
private:
    Message message_;
    bool pending_=false;
    uint8_t attempts_=0;
    uint32_t since_=0, lastSend_=0;
};

class OutputLink {
public:
    // apply(ms) must start a local hardware timer; apply(0) immediately drives LOW.
    template<class Apply> bool receive(const char* line, Apply apply) {
        Message next;
        if (!parse(line,"D19_CMD:",next)) return false;
        for (size_t i=0;i<count_;++i) if (std::strcmp(history_[i].id,next.id)==0) {
            if (same(history_[i],next)) { ack_=next; pending_=true; }
            return true; // Retries never extend/restart pulses or undo a reset.
        }
        if (!apply(next.durationMs)) return true; // No success ACK on timer failure.
        history_[position_]=next; position_=(position_+1)%16;
        if (count_<16) ++count_;
        ack_=next; pending_=true;
        return true;
    }
    bool pending() const { return pending_; }
    void service(uint32_t now) {
        if (!pending_) return;
        char frame[64];
        const size_t length=format(frame,sizeof(frame),"D19_ACK:",ack_);
        if (radio::sendLine(frame,length,now)) pending_=false;
    }
private:
    Message ack_, history_[16]{};
    size_t count_=0, position_=0;
    bool pending_=false;
};
} // namespace gpio19
