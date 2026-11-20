#pragma once
#include <cstdint>
using esp_err_t=int;
constexpr int ESP_OK=0, ESP_FAIL=-1, ESP_ERR_INVALID_STATE=1;
using esp_timer_cb_t=void(*)(void*);
struct TestTimer;
using esp_timer_handle_t=TestTimer*;
enum esp_timer_dispatch_t { ESP_TIMER_TASK };
struct esp_timer_create_args_t {
    esp_timer_cb_t callback=nullptr;
    void* arg=nullptr;
    esp_timer_dispatch_t dispatch_method=ESP_TIMER_TASK;
    const char* name=nullptr;
};
esp_err_t esp_timer_create(const esp_timer_create_args_t*,esp_timer_handle_t*);
esp_err_t esp_timer_stop(esp_timer_handle_t);
esp_err_t esp_timer_start_once(esp_timer_handle_t,uint64_t);
int64_t esp_timer_get_time();

struct portMUX_TYPE { int nesting=0; };
#define portMUX_INITIALIZER_UNLOCKED {}
inline void portENTER_CRITICAL(portMUX_TYPE* lock) { ++lock->nesting; }
inline void portEXIT_CRITICAL(portMUX_TYPE* lock) { --lock->nesting; }
