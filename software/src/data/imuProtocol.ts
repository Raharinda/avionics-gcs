import { FACES, type FaceId, type ImuState, type CalibrationProgress } from "../types/imu";

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const vector = (v: unknown, size = 3): v is number[] => Array.isArray(v) && v.length === size && v.every((n) => typeof n === "number" && Number.isFinite(n));
const axis = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && Math.abs(v) >= 1 && Math.abs(v) <= 3;
const face = (v: unknown): v is FaceId => typeof v === "string" && FACES.includes(v as FaceId);

export function parseImuState(text: string): ImuState | null {
  try {
    const v: unknown = JSON.parse(text);
    if (!object(v) || v.firmware !== "imu3d-v2" || typeof v.calibrated !== "boolean" ||
        typeof v.referenceSet !== "boolean" || typeof v.imuReady !== "boolean" ||
        !axis(v.noseAxis) || !axis(v.rightAxis) || Math.abs(v.noseAxis) === Math.abs(v.rightAxis)) return null;
    if (v.referenceSet && (!v.calibrated || !v.imuReady)) return null;
    if (v.orientationFrame !== undefined && v.orientationFrame !== "RFU") return null;
    if (v.profile !== null) {
      const p = v.profile;
      if (!object(p) || !vector(p.offset) || !vector(p.scale) || !vector(p.gyroBias) ||
          !v.calibrated || p.scale.some((n) => n < .75 || n > 1.25) ||
          p.offset.some((n) => Math.abs(n) > .3 * 9.80665) || p.gyroBias.some((n) => Math.abs(n) > .25) ||
          !Array.isArray(p.poses) || p.poses.length !== 6 ||
          !p.poses.every((pose) => object(pose) && face(pose.face) && vector(pose.accel) && typeof pose.samples === "number" && Number.isInteger(pose.samples) && pose.samples >= 200) ||
          new Set(p.poses.map((pose) => pose.face)).size !== 6) return null;
    } else if (v.calibrated) return null;
    if (v.lastReference !== null) {
      const r = v.lastReference;
      if (!object(r) || !vector(r.accel) || !vector(r.orientation, 4) || !axis(r.noseAxis) || !axis(r.rightAxis) ||
          Math.abs(r.noseAxis) === Math.abs(r.rightAxis) || Math.abs(Math.hypot(...r.orientation) - 1) > .001) return null;
    } else if (v.referenceSet) return null;
    return v as unknown as ImuState;
  } catch { return null; }
}

export function parseCalibrationProgress(text: string): CalibrationProgress | null {
  try {
    const v: unknown = JSON.parse(text);
    if (!object(v) || typeof v.active !== "boolean" || (v.face !== null && !face(v.face)) ||
        typeof v.samples !== "number" || !Number.isInteger(v.samples) || v.samples < 0 ||
        typeof v.target !== "number" || !Number.isInteger(v.target) || v.target < 1 || v.target > 10000 || v.samples > v.target ||
        !Array.isArray(v.completed) || v.completed.length > 6 || !v.completed.every(face) || new Set(v.completed).size !== v.completed.length) return null;
    return v as unknown as CalibrationProgress;
  } catch { return null; }
}
