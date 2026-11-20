#pragma once
#include <Arduino.h>
#include <esp_timer.h>
#include "../../../shared/board_pins.h"
#include "../../../shared/gpio19_protocol.h"

namespace gpio19 {
// A local ESP timer ends the pulse independently of the main sensor/radio loop.
// Its task callback can be late; this is not a hard real-time waveform generator.
class PulseOutput {
public:
    bool begin() {
        esp_timer_create_args_t args{};
        args.callback=expired;
        args.arg=this;
        args.dispatch_method=ESP_TIMER_TASK;
        args.name="gpio19-low";
        return esp_timer_create(&args,&timer_)==ESP_OK;
    }
    bool apply(uint32_t durationMs) {
        if (durationMs>kMaxPulseMs) return false;
        if (timer_) esp_timer_stop(timer_);
        portENTER_CRITICAL(&lock_);
        deadlineUs_=0;
        digitalWrite(board::kPopTestOutputPin,LOW);
        // Reset must work even if timer creation failed.
        if (!durationMs || !timer_) {
            portEXIT_CRITICAL(&lock_);
            return durationMs==0;
        }
        deadlineUs_=esp_timer_get_time()+static_cast<int64_t>(durationMs)*1000;
        // Arm the one-shot before asserting HIGH, so scheduling failure never
        // creates even a short unintended HIGH edge. The callback takes lock_.
        const bool scheduled=esp_timer_start_once(timer_,static_cast<uint64_t>(durationMs)*1000)==ESP_OK;
        if (scheduled) digitalWrite(board::kPopTestOutputPin,HIGH);
        else deadlineUs_=0;
        portEXIT_CRITICAL(&lock_);
        return scheduled;
    }
private:
    static void expired(void* context) {
        auto& output=*static_cast<PulseOutput*>(context);
        portENTER_CRITICAL(&output.lock_);
        // esp_timer_stop does not cancel an already-dispatched callback. A
        // callback from an older pulse must not truncate a newly started one.
        if (output.deadlineUs_ && esp_timer_get_time()>=output.deadlineUs_) {
            output.deadlineUs_=0;
            digitalWrite(board::kPopTestOutputPin,LOW);
        }
        portEXIT_CRITICAL(&output.lock_);
    }
    esp_timer_handle_t timer_=nullptr;
    portMUX_TYPE lock_=portMUX_INITIALIZER_UNLOCKED;
    int64_t deadlineUs_=0;
};
} // namespace gpio19
