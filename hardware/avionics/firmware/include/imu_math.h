#pragma once
#include <array>
#include <cmath>

namespace imu {
constexpr float gravity = 9.80665F;
constexpr float radians_to_degrees = 57.295779513F;
using Vec = std::array<float, 3>;
inline float dot(const Vec& a, const Vec& b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
inline float norm(const Vec& a) { return std::sqrt(dot(a,a)); }
inline Vec cross(const Vec& a, const Vec& b) {
    return {{a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]}};
}
inline Vec scaled(Vec v, float scale) { for (auto& x : v) x *= scale; return v; }
inline bool finite(const Vec& v) {
    return std::isfinite(v[0]) && std::isfinite(v[1]) && std::isfinite(v[2]);
}

struct Quaternion {
    float w, x, y, z;
    Quaternion(float w_=1, float x_=0, float y_=0, float z_=0) : w(w_), x(x_), y(y_), z(z_) {}
    Quaternion conjugate() const { return {w,-x,-y,-z}; }
    Quaternion operator*(const Quaternion& b) const {
        return {w*b.w-x*b.x-y*b.y-z*b.z, w*b.x+x*b.w+y*b.z-z*b.y,
                w*b.y-x*b.z+y*b.w+z*b.x, w*b.z+x*b.y-y*b.x+z*b.w};
    }
    bool normalize() {
        const float length=std::sqrt(w*w+x*x+y*y+z*z);
        if (!std::isfinite(length) || length<1e-6F) return false;
        w/=length; x/=length; y/=length; z/=length;
        return true;
    }
    Vec rotate(const Vec& v) const {
        const Quaternion rotated=(*this)*Quaternion(0,v[0],v[1],v[2])*conjugate();
        return {{rotated.x,rotated.y,rotated.z}};
    }
    static Quaternion from_gravity(const Vec& accel) {
        const float length=norm(accel);
        if (!finite(accel) || length<0.1F) return {};
        const Vec a=scaled(accel,1/length);
        if (a[2]<-0.9999F) return {0,1,0,0};
        Quaternion q(1+a[2],a[1],-a[0],0);
        q.normalize();
        return q;
    }
    Vec euler_degrees() const {
        float sine=2*(w*y-z*x);
        if (sine>1) sine=1;
        if (sine<-1) sine=-1;
        return {{std::atan2(2*(w*x+y*z),1-2*(x*x+y*y))*radians_to_degrees,
                 std::asin(sine)*radians_to_degrees,
                 std::atan2(2*(w*z+x*y),1-2*(y*y+z*z))*radians_to_degrees}};
    }
};

inline Vec axis_vector(int axis) {
    Vec value{{0,0,0}};
    const int index=std::abs(axis)-1;
    if (index>=0 && index<3) value[index]=axis>0 ? 1.0F : -1.0F;
    return value;
}
inline bool valid_mount(int nose_axis, int right_axis) {
    return std::abs(nose_axis)>=1 && std::abs(nose_axis)<=3 &&
           std::abs(right_axis)>=1 && std::abs(right_axis)<=3 &&
           std::abs(nose_axis)!=std::abs(right_axis);
}
// Maps sensor coordinates to model coordinates: X right, Y nose, Z right-cross-nose.
inline Quaternion mounting_rotation(int nose_axis, int right_axis) {
    if (!valid_mount(nose_axis,right_axis)) return {};
    const Vec right=axis_vector(right_axis), nose=axis_vector(nose_axis), back=cross(right,nose);
    const float m[3][3]={{right[0],right[1],right[2]}, {nose[0],nose[1],nose[2]}, {back[0],back[1],back[2]}};
    Quaternion q;
    const float trace=m[0][0]+m[1][1]+m[2][2];
    if (trace>0) {
        const float s=2*std::sqrt(trace+1);
        q={s/4,(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s};
    } else if (m[0][0]>m[1][1] && m[0][0]>m[2][2]) {
        const float s=2*std::sqrt(1+m[0][0]-m[1][1]-m[2][2]);
        q={(m[2][1]-m[1][2])/s,s/4,(m[0][1]+m[1][0])/s,(m[0][2]+m[2][0])/s};
    } else if (m[1][1]>m[2][2]) {
        const float s=2*std::sqrt(1+m[1][1]-m[0][0]-m[2][2]);
        q={(m[0][2]-m[2][0])/s,(m[0][1]+m[1][0])/s,s/4,(m[1][2]+m[2][1])/s};
    } else {
        const float s=2*std::sqrt(1+m[2][2]-m[0][0]-m[1][1]);
        q={(m[1][0]-m[0][1])/s,(m[0][2]+m[2][0])/s,(m[1][2]+m[2][1])/s,s/4};
    }
    q.normalize();
    return q;
}

class AttitudeFilter {
public:
    Quaternion orientation;
    bool initialized=false;
    void reset() { orientation={}; initialized=false; }
    bool update(const Vec& accel, const Vec& gyro, float dt) {
        if (!finite(accel) || !finite(gyro) || !std::isfinite(dt) || dt<=0 || dt>0.1F) return false;
        const float length=norm(accel);
        if (!initialized) {
            if (length<0.5F*gravity || length>1.5F*gravity) return false;
            orientation=Quaternion::from_gravity(accel);
            initialized=true;
        }
        Vec omega=gyro;
        // Gravity constrains tilt; yaw remains relative. Reject strong linear acceleration.
        if (std::fabs(length-gravity)<0.2F*gravity) {
            const Vec predicted=orientation.conjugate().rotate({{0,0,1}});
            const Vec error=cross(scaled(accel,1/length),predicted);
            for (int i=0;i<3;++i) omega[i]+=2.0F*error[i];
        }
        const float speed=norm(omega);
        if (speed>1e-7F) {
            const float half_angle=speed*dt*0.5F;
            const float factor=std::sin(half_angle)/speed;
            orientation=orientation*Quaternion(std::cos(half_angle),omega[0]*factor,omega[1]*factor,omega[2]*factor);
        }
        if (!orientation.normalize()) { reset(); return false; }
        return true;
    }
};
} // namespace imu
