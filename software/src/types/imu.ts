export type FaceId = "XP" | "XM" | "YP" | "YM" | "ZP" | "ZM";
export type Vector3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export type CalibrationProfile = {
  offset: Vector3; scale: Vector3; gyroBias: Vector3;
  poses: { face: FaceId; samples: number; accel: Vector3 }[];
};
export type ImuState = {
  firmware: string; calibrated: boolean; referenceSet: boolean; imuReady: boolean;
  orientationFrame?: "RFU";
  noseAxis: number; rightAxis: number; profile: CalibrationProfile | null;
  lastReference: { accel: Vector3; orientation: Quaternion; noseAxis: number; rightAxis: number } | null;
};
export type CalibrationProgress = {
  active: boolean; face: FaceId | null; samples: number; target: number; completed: FaceId[];
};
export const FACES: FaceId[] = ["ZP", "ZM", "YP", "YM", "XP", "XM"];
export const faceLabel = (face: FaceId) => `${face[1] === "P" ? "+" : "−"}${face[0]}`;
export const faceDirection = (face: FaceId) => ({
  XP: "kanan", XM: "kiri", YP: "depan", YM: "belakang", ZP: "atas", ZM: "bawah",
})[face];
