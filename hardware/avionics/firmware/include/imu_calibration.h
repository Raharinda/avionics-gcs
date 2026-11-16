#pragma once
#include "imu_math.h"
#include <stdint.h>

namespace imu {
constexpr uint32_t profile_magic=0x494D5532;
constexpr uint32_t samples_per_face=200;
constexpr const char* face_names[6]={"XP","XM","YP","YM","ZP","ZM"};
struct CalibrationProfile {
    uint32_t magic=profile_magic;
    uint32_t version=2;
    Vec accel_offset{{0,0,0}}, accel_scale{{1,1,1}}, gyro_bias{{0,0,0}};
    std::array<Vec,6> face_accel{}, face_gyro{};
    std::array<uint32_t,6> samples{};
};
inline bool valid_profile(const CalibrationProfile& p) {
    if (p.magic!=profile_magic || p.version!=2 || !finite(p.accel_offset) || !finite(p.gyro_bias)) return false;
    for (int axis=0;axis<3;++axis) {
        if (!std::isfinite(p.accel_scale[axis]) || p.accel_scale[axis]<0.75F || p.accel_scale[axis]>1.25F ||
            std::fabs(p.accel_offset[axis])>0.3F*gravity || std::fabs(p.gyro_bias[axis])>0.25F) return false;
    }
    for (int face=0;face<6;++face) {
        if (p.samples[face]<samples_per_face || !finite(p.face_accel[face]) || !finite(p.face_gyro[face])) return false;
    }
    return true;
}
inline Vec corrected_accel(const CalibrationProfile& p, Vec a) {
    for (int axis=0;axis<3;++axis) a[axis]=(a[axis]-p.accel_offset[axis])*p.accel_scale[axis];
    return a;
}
inline Vec corrected_gyro(const CalibrationProfile& p, Vec g) {
    for (int axis=0;axis<3;++axis) g[axis]-=p.gyro_bias[axis];
    return g;
}

class SixFaceCalibration {
public:
    CalibrationProfile staged;
    bool active=false;
    int face=-1;
    uint32_t count=0;
    void start() { staged=CalibrationProfile{}; active=true; face=-1; reset_window(); }
    void cancel() { active=false; face=-1; reset_window(); }
    bool capture(int requested) {
        if (!active || requested<0 || requested>=6) return false;
        face=requested;
        staged.samples[face]=0;
        reset_window();
        return true;
    }
    // Returns true only after a complete, stationary face capture.
    bool add(const Vec& accel, const Vec& gyro) {
        if (!active || face<0) return false;
        const int axis=face/2;
        const float sign=face%2==0 ? 1.0F : -1.0F;
        const float magnitude=norm(accel);
        bool acceptable=finite(accel) && finite(gyro) && norm(gyro)<0.20F &&
            magnitude>0.75F*gravity && magnitude<1.25F*gravity && sign*accel[axis]>0.80F*gravity;
        for (int index=0;index<3;++index) if (index!=axis && std::fabs(accel[index])>0.35F*gravity) acceptable=false;
        if (!acceptable) { reset_window(); return false; }
        ++count;
        for (int index=0;index<3;++index) {
            const float delta=accel[index]-mean_accel_[index];
            mean_accel_[index]+=delta/count;
            variance_sum_[index]+=delta*(accel[index]-mean_accel_[index]);
            mean_gyro_[index]+=(gyro[index]-mean_gyro_[index])/count;
        }
        if (count<samples_per_face) return false;
        for (int index=0;index<3;++index) {
            if (variance_sum_[index]/(count-1)>0.0036F*gravity*gravity) { reset_window(); return false; }
        }
        staged.face_accel[face]=mean_accel_;
        staged.face_gyro[face]=mean_gyro_;
        staged.samples[face]=count;
        face=-1;
        return true;
    }
    bool complete() const {
        for (const auto samples:staged.samples) if (samples<samples_per_face) return false;
        return true;
    }
    bool finish(CalibrationProfile& result) const {
        if (!complete()) return false;
        CalibrationProfile next=staged;
        for (int axis=0;axis<3;++axis) {
            const float positive=next.face_accel[axis*2][axis];
            const float negative=next.face_accel[axis*2+1][axis];
            const float span=positive-negative;
            if (span<1.6F*gravity || span>2.4F*gravity) return false;
            next.accel_offset[axis]=(positive+negative)*0.5F;
            next.accel_scale[axis]=2*gravity/span;
            next.gyro_bias[axis]=0;
            for (int pose=0;pose<6;++pose) next.gyro_bias[axis]+=next.face_gyro[pose][axis]/6;
        }
        if (!valid_profile(next)) return false;
        result=next;
        return true;
    }
private:
    Vec mean_accel_{{0,0,0}}, mean_gyro_{{0,0,0}}, variance_sum_{{0,0,0}};
    void reset_window() {
        count=0;
        mean_accel_={{0,0,0}}; mean_gyro_={{0,0,0}}; variance_sum_={{0,0,0}};
    }
};
} // namespace imu
