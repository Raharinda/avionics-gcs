#include <cassert>
#include <iostream>
#include "gpio19_output.h"

struct TestTimer {
    esp_timer_create_args_t args{};
    uint64_t timeoutUs=0;
    bool active=false;
} timer;
int64_t nowUs=0;
int level=LOW, highEdges=0;
bool failCreate=false, failStart=false;
void pinMode(int,int) {}
void digitalWrite(int pin,int value) {
    assert(pin==19);
    if (level==LOW && value==HIGH) ++highEdges;
    level=value;
}
int64_t esp_timer_get_time() { return nowUs; }
esp_err_t esp_timer_create(const esp_timer_create_args_t* args,esp_timer_handle_t* handle) {
    if (failCreate) return ESP_FAIL;
    timer=TestTimer{}; timer.args=*args; *handle=&timer; return ESP_OK;
}
esp_err_t esp_timer_stop(esp_timer_handle_t handle) {
    const bool wasActive=handle->active; handle->active=false;
    return wasActive ? ESP_OK : ESP_ERR_INVALID_STATE;
}
esp_err_t esp_timer_start_once(esp_timer_handle_t handle,uint64_t timeoutUs) {
    if (failStart) return ESP_FAIL;
    handle->active=true; handle->timeoutUs=timeoutUs; return ESP_OK;
}
void callback() { timer.active=false; timer.args.callback(timer.args.arg); }

int main() {
    gpio19::PulseOutput output;
    assert(output.begin());
    for (uint32_t duration: {1U,100U,200U,1000U,10000U}) {
        nowUs=10000000000LL;
        assert(output.apply(duration));
        assert(level==HIGH && timer.active && timer.timeoutUs==static_cast<uint64_t>(duration)*1000);
        nowUs+=static_cast<int64_t>(duration)*1000-1;
        timer.args.callback(timer.args.arg); assert(level==HIGH);
        ++nowUs; callback(); assert(level==LOW);
    }
    assert(output.apply(200));
    const auto oldCallback=timer.args;
    nowUs+=100000;
    assert(output.apply(1000));
    oldCallback.callback(oldCallback.arg); assert(level==HIGH); // Already-dispatched old callback.
    assert(output.apply(0)); assert(level==LOW && !timer.active);
    oldCallback.callback(oldCallback.arg); assert(level==LOW);
    const int edges=highEdges;
    assert(!output.apply(10001)); assert(level==LOW && edges==highEdges);
    failStart=true;
    assert(!output.apply(200)); assert(level==LOW && highEdges==edges);
    assert(output.apply(0)); assert(level==LOW);
    failStart=false; failCreate=true;
    gpio19::PulseOutput unavailable;
    assert(!unavailable.begin());
    assert(!unavailable.apply(200)); assert(level==LOW);
    level=HIGH;
    assert(unavailable.apply(0)); assert(level==LOW);
    std::cout<<"PASS: shipped D19 timer controller, 1/100/200/1000/10000ms, LOW on expiry/reset/start failure, missing timer and stale callback\n";
}
