#pragma once

namespace imu {
enum class EraseCalibrationResult { Done, OpenFailed, ReferenceFailed, ProfileFailed };

// Remove only calibration data; keep mounting and unrelated settings intact.
// Missing keys count as success so a repeated reset is harmless.
template <typename Storage>
EraseCalibrationResult erase_calibration(Storage& storage) {
    if (!storage.begin("imu-cal-v2",false)) return EraseCalibrationResult::OpenFailed;
    if (storage.isKey("reference") && !storage.remove("reference")) {
        storage.end();
        return EraseCalibrationResult::ReferenceFailed;
    }
    const bool erased=!storage.isKey("profile") || storage.remove("profile");
    storage.end();
    return erased ? EraseCalibrationResult::Done : EraseCalibrationResult::ProfileFailed;
}
} // namespace imu
