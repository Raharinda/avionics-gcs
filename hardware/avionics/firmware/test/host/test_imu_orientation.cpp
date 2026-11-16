#include "imu_calibration.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>

void near(float a,float b,float tolerance=0.0002F) { assert(std::fabs(a-b)<tolerance); }
void same_rotation(const imu::Quaternion& a,const imu::Quaternion& b,float tolerance=0.0002F) {
    near(std::fabs(a.w*b.w+a.x*b.x+a.y*b.y+a.z*b.z),1,tolerance);
}
int main() {
    imu::SixFaceCalibration calibration;
    calibration.start();
    const imu::Vec bias{{0.21F,-0.12F,0.08F}}, scale{{1.05F,.97F,1.02F}}, gyro_bias{{.02F,-.03F,.04F}};
    for (int pose=0;pose<6;++pose) {
        assert(calibration.capture(pose));
        imu::Vec raw=bias;
        raw[pose/2]+=(pose%2==0?1:-1)*imu::gravity/scale[pose/2];
        for (uint32_t sample=0;sample<imu::samples_per_face;++sample) {
            const bool captured=calibration.add(raw,gyro_bias);
            assert(captured==(sample==imu::samples_per_face-1));
        }
    }
    imu::CalibrationProfile profile;
    assert(calibration.finish(profile));
    for (int i=0;i<3;++i) { near(profile.accel_offset[i],bias[i]); near(profile.accel_scale[i],scale[i]); near(profile.gyro_bias[i],gyro_bias[i]); }
    for (int pose=0;pose<6;++pose) {
        const auto corrected=imu::corrected_accel(profile,profile.face_accel[pose]);
        for (int axis=0;axis<3;++axis) near(corrected[axis],axis==pose/2 ? (pose%2==0?1:-1)*imu::gravity : 0);
    }
    std::array<unsigned char,sizeof(profile)> stored{};
    std::memcpy(stored.data(),&profile,sizeof(profile));
    imu::CalibrationProfile restored;
    std::memcpy(&restored,stored.data(),sizeof(restored));
    assert(imu::valid_profile(restored));
    restored.accel_scale[1]=std::numeric_limits<float>::quiet_NaN();
    assert(!imu::valid_profile(restored));
    puts("PASS: six-pose bias/scale/gyro recovery and saved-profile round trip");

    calibration.start(); assert(calibration.capture(0));
    for (int i=0;i<300;++i) calibration.add({{0,0,imu::gravity}},{{0,0,0}});
    assert(calibration.count==0);
    for (int i=0;i<80;++i) calibration.add({{imu::gravity,0,0}},{{0,0,0}});
    assert(calibration.count==80);
    calibration.add({{imu::gravity,0,0}},{{1,0,0}});
    assert(calibration.count==0);
    calibration.cancel(); assert(!calibration.active && !calibration.finish(restored));
    assert(imu::valid_profile(profile));
    puts("PASS: wrong face, motion, and incomplete/cancelled calibration cannot replace a valid profile");

    for (int nose=-3;nose<=3;++nose) for (int right=-3;right<=3;++right) {
        if (!imu::valid_mount(nose,right)) continue;
        const auto q=imu::mounting_rotation(nose,right);
        const auto n=q.rotate(imu::axis_vector(nose)), r=q.rotate(imu::axis_vector(right));
        near(n[0],0); near(n[1],1); near(n[2],0);
        near(r[0],1); near(r[1],0); near(r[2],0);
    }
    assert(!imu::valid_mount(3,-3)); assert(!imu::valid_mount(0,1));
    puts("PASS: every valid signed mounting pair maps nose/right to model Y/X");

    for (const int axis : {-3,-2,-1,1,2,3}) {
        const auto accel=imu::scaled(imu::axis_vector(axis),imu::gravity);
        const auto up=imu::Quaternion::from_gravity(accel).rotate(imu::scaled(accel,1/imu::gravity));
        near(up[0],0); near(up[1],0); near(up[2],1);
    }
    puts("PASS: gravity initialization handles vertical and fully inverted sensor poses");

    imu::AttitudeFilter filter;
    for (int i=0;i<100;++i) assert(filter.update({{0,0,imu::gravity}},{{0,0,1.57079632679F}},.01F));
    near(filter.orientation.euler_degrees()[2],90,.002F);
    const auto initial=filter.orientation;
    same_rotation(initial.conjugate()*initial,{});
    for (int i=0;i<100;++i) filter.update({{0,0,imu::gravity}},{{0,0,1.57079632679F}},.01F);
    const auto relative=initial.conjugate()*filter.orientation;
    near(relative.euler_degrees()[2],90,.003F);
    const auto mount=imu::mounting_rotation(3,1);
    const auto model=mount*relative*mount.conjugate();
    const auto modelNose=model.rotate({{0,1,0}});
    near(modelNose[0],0); near(modelNose[1],1); near(modelNose[2],0);
    puts("PASS: gyro yaw integration, captured reference, and mounting preserve nose-axis rotation");

    filter.reset();
    for (int i=0;i<400;++i) filter.update({{0,0,imu::gravity}},{{0,0,1.57079632679F}},.01F);
    same_rotation(filter.orientation,{},.0005F);
    filter.orientation=imu::Quaternion(std::cos(.26F),std::sin(.26F),0,0);
    for (int i=0;i<500;++i) filter.update({{0,0,imu::gravity}},{{0,0,0}},.01F);
    assert(std::fabs(filter.orientation.euler_degrees()[0])<.01F);
    puts("PASS: full 360-degree rotation and gravity-based tilt convergence");

    // Reproduce physical gravity measurements for independent rotations on every
    // body axis, starting from an arbitrary tilted reference pose.
    for (const int axis : {1,2,3}) {
        filter.reset();
        const auto start=imu::Quaternion::from_gravity({{3,4,8.4F}});
        const auto gravityAtStart=start.conjugate().rotate({{0,0,imu::gravity}});
        assert(filter.update(gravityAtStart,{{0,0,0}},.01F));
        const auto captured=filter.orientation;
        const auto velocity=imu::scaled(imu::axis_vector(axis),1.2F);
        imu::Quaternion actual=start;
        for (int step=0;step<200;++step) {
            const auto gravityNow=actual.conjugate().rotate({{0,0,imu::gravity}});
            assert(filter.update(gravityNow,velocity,.01F));
            const auto v=imu::scaled(imu::axis_vector(axis),std::sin(.006F));
            actual=actual*imu::Quaternion(std::cos(.006F),v[0],v[1],v[2]);
            actual.normalize();
        }
        same_rotation(filter.orientation,actual,.0005F);
        const auto qRelative=captured.conjugate()*filter.orientation;
        same_rotation(qRelative,start.conjugate()*actual,.0005F);
    }
    puts("PASS: all three gyro axes track physical gravity through a tilted operator reference");

    filter.reset(); filter.update({{0,0,imu::gravity}},{{0,0,0}},.01F);
    for (int i=0;i<100;++i) filter.update({{2*imu::gravity,0,0}},{{0,0,1.57079632679F}},.01F);
    near(filter.orientation.euler_degrees()[2],90,.003F);
    assert(!filter.update({{0,0,imu::gravity}},{{0,0,0}},1));
    assert(!filter.update({{NAN,0,0}},{{0,0,0}},.01F));
    puts("PASS: strong linear acceleration, invalid samples, and invalid timing do not corrupt attitude");
}
