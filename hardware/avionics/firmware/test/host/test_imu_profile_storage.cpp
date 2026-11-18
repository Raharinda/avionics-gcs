#include "imu_profile_storage.h"
#include <cassert>
#include <cstdio>
#include <set>
#include <string>

struct Storage {
    std::set<std::string> keys{"profile","reference","mount","other"};
    bool open_ok=true, ended=false;
    std::string fail_remove;
    bool begin(const char* name,bool read_only) {
        assert(std::string(name)=="imu-cal-v2" && !read_only);
        ended=false;
        return open_ok;
    }
    bool isKey(const char* key) { return keys.count(key)>0; }
    bool remove(const char* key) {
        if (key==fail_remove) return false;
        return keys.erase(key)>0;
    }
    void end() { ended=true; }
};

int main() {
    using Result=imu::EraseCalibrationResult;
    Storage storage;
    assert(imu::erase_calibration(storage)==Result::Done);
    assert(!storage.isKey("profile") && !storage.isKey("reference"));
    assert(storage.isKey("mount") && storage.isKey("other") && storage.ended);
    assert(imu::erase_calibration(storage)==Result::Done);
    puts("PASS: persistent reset removes profile/reference only, including repeated reset");

    storage=Storage{}; storage.open_ok=false;
    assert(imu::erase_calibration(storage)==Result::OpenFailed);
    assert(storage.isKey("profile") && storage.isKey("reference"));
    storage.open_ok=true; storage.fail_remove="reference";
    assert(imu::erase_calibration(storage)==Result::ReferenceFailed);
    assert(storage.isKey("profile") && storage.isKey("reference") && storage.ended);
    storage.fail_remove="profile";
    assert(imu::erase_calibration(storage)==Result::ProfileFailed);
    assert(storage.isKey("profile") && !storage.isKey("reference") && storage.ended);
    storage.fail_remove="";
    assert(imu::erase_calibration(storage)==Result::Done);
    assert(!storage.isKey("profile") && !storage.isKey("reference"));
    puts("PASS: storage errors report failure and a retry completes partial deletion");
}
