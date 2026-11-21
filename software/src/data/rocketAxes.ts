import type { Vector3 } from "../types/imu";

export type SensorMount = { noseAxis: number; rightAxis: number };
export type RocketAxis = {
  direction: Vector3;
  label: string;
  angleLabel: string;
  color: string;
};

// A fixed parent rotation maps RFU to Three.js: X right, Y forward (-scene Z), Z up.
export const RFU_TO_SCENE: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
export const sensorAxisLabel = (axis: number) => `${axis > 0 ? "+" : "−"}${"XYZ"[Math.abs(axis) - 1]}`;
const validAxis = (axis: number) => Number.isInteger(axis) && Math.abs(axis) >= 1 && Math.abs(axis) <= 3;
export function validSensorMount(mount?: SensorMount): mount is SensorMount {
  return !!mount && validAxis(mount.noseAxis) && validAxis(mount.rightAxis) && Math.abs(mount.noseAxis) !== Math.abs(mount.rightAxis);
}

// Columns of the RFU body-to-sensor rotation, inverse of firmware mounting_rotation.
export function sensorMountBasis(mount?: SensorMount): { right: Vector3; forward: Vector3; up: Vector3 } | null {
  if (!validSensorMount(mount)) return null;
  const unit = (axis: number): Vector3 => [1, 2, 3].map((index) => index === Math.abs(axis) ? Math.sign(axis) : 0) as Vector3;
  const right = unit(mount.rightAxis), up = unit(mount.noseAxis);
  const forward: Vector3 = [up[1] * right[2] - up[2] * right[1], up[2] * right[0] - up[0] * right[2], up[0] * right[1] - up[1] * right[0]];
  return { right, forward, up };
}

// Telemetry has already been expressed in the RFU body frame. Sensor mounting
// must not be applied again to either the live quaternion or the axis arrows.
export function rocketAxes(_mount?: SensorMount): RocketAxis[] {
  return [
    { direction: [1, 0, 0], label: "+X · kanan", angleLabel: "X · KANAN", color: "#dd483a" },
    { direction: [0, 1, 0], label: "+Y · depan", angleLabel: "Y · DEPAN", color: "#228c53" },
    { direction: [0, 0, 1], label: "+Z · atas", angleLabel: "Z · ATAS", color: "#356ce0" },
  ];
}
