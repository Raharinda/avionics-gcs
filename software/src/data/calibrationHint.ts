import { faceLabel, type FaceId } from "../types/imu";
import type { TelemetryPoint } from "../types/telemetry";

type Reading = Pick<TelemetryPoint, "accelX" | "accelY" | "accelZ" | "gyroscope" | "calibrated" | "imuValid" | "imuReady">;
type Hint = { tone: "info" | "warning"; message: string };
const GRAVITY = 9.80665;

// Guidance only: progress and successful capture always come from ESP32.
// Telemetry may already use an older profile; raw samples decide acceptance.
export function calibrationHint(face: FaceId, reading: Reading | null): Hint {
  if (!reading) return { tone: "info", message: "Menunggu telemetry baru dari ESP32 untuk memeriksa posisi papan." };
  const accel = [reading.accelX, reading.accelY, reading.accelZ];
  // The health indicator requires every axis to be non-zero. Calibration expects
  // stationary readings, so zero axes and zero gyro are allowed here.
  if (reading.imuReady === false || ![...accel, reading.gyroscope].every(Number.isFinite)) {
    return { tone: "warning", message: "Data IMU tidak valid. Periksa Raw Serial dan sambungan sensor." };
  }
  const magnitude = Math.hypot(...accel);
  if (magnitude <= .75 * GRAVITY || magnitude >= 1.25 * GRAVITY) {
    return { tone: "warning", message: "Besar percepatan belum mendekati gravitasi. Periksa pembacaan sensor dan tahan papan diam." };
  }
  if (reading.calibrated) {
    return { tone: "info", message: "Nilai di bawah sudah dikoreksi profil lama. Kalibrasi ulang memakai sampel mentah di ESP32; arahkan sumbu yang diminta ke atas lalu tahan diam." };
  }
  // Backend exposes the gyro magnitude in degrees/s; firmware checks rad/s.
  if (reading.gyroscope >= .20 * 180 / Math.PI) {
    return { tone: "warning", message: "Pembacaan gyro masih tinggi. Hentikan putaran dan tahan papan diam saat merekam." };
  }
  const axis = "XYZ".indexOf(face[0]);
  const sign = face[1] === "P" ? 1 : -1;
  const aligned = sign * accel[axis] > .80 * GRAVITY &&
    accel.every((value, index) => index === axis || Math.abs(value) <= .35 * GRAVITY);
  if (!aligned) {
    const dominantAxis = accel.reduce((best, value, index) => Math.abs(value) > Math.abs(accel[best]) ? index : best, 0);
    const observed = `${"XYZ"[dominantAxis]}${accel[dominantAxis] >= 0 ? "P" : "M"}` as FaceId;
    const observedAligned = Math.abs(accel[dominantAxis]) > .80 * GRAVITY &&
      accel.every((value, index) => index === dominantAxis || Math.abs(value) <= .35 * GRAVITY);
    return { tone: "warning", message: observedAligned
      ? `Terbaca ${faceLabel(observed)} ke atas, sedangkan yang direkam ${faceLabel(face)}. Putar papan sampai ${faceLabel(face)} menghadap atas, lalu tahan diam.`
      : `Papan belum sejajar untuk ${faceLabel(face)} ke atas. Posisikan sumbu tersebut tegak ke atas, lalu tahan diam.` };
  }
  return { tone: "info", message: `Posisi terukur sesuai ${faceLabel(face)} ke atas. Tahan diam sampai ESP32 mengonfirmasi 200 sampel; jangan diputar selama perekaman.` };
}
