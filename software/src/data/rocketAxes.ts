import type { Vector3 } from "../types/imu";

export type SensorMount = { noseAxis: number; rightAxis: number };
export type RocketAxis = {
  direction: Vector3;
  label: string;
  angleLabel: string;
  color: string;
};

export const sensorAxisLabel = (axis: number) => `${axis > 0 ? "+" : "−"}${"XYZ"[Math.abs(axis) - 1]}`;
const validAxis = (axis: number) => Number.isInteger(axis) && Math.abs(axis) >= 1 && Math.abs(axis) <= 3;
export function validSensorMount(mount?: SensorMount): mount is SensorMount {
  return !!mount && validAxis(mount.noseAxis) && validAxis(mount.rightAxis) && Math.abs(mount.noseAxis) !== Math.abs(mount.rightAxis);
}

// Firmware already sends a quaternion in model coordinates (X right, Y nose).
// Only label that basis here; applying the mounting rotation again would be wrong.
export function rocketAxes(mount?: SensorMount): RocketAxis[] {
  const directions: Vector3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (!validSensorMount(mount)) return [
    { direction: directions[0], label: "+X model · kanan", angleLabel: "X MODEL", color: "#dd483a" },
    { direction: directions[1], label: "+Y model · hidung", angleLabel: "Y MODEL", color: "#228c53" },
    { direction: directions[2], label: "+Z model", angleLabel: "Z MODEL", color: "#356ce0" },
  ];
  const unit = (axis: number): Vector3 => [1, 2, 3].map((index) => index === Math.abs(axis) ? Math.sign(axis) : 0) as Vector3;
  const right = unit(mount.rightAxis), nose = unit(mount.noseAxis);
  const third = [right[1] * nose[2] - right[2] * nose[1], right[2] * nose[0] - right[0] * nose[2], right[0] * nose[1] - right[1] * nose[0]];
  const index = third.findIndex((value) => value !== 0);
  const signedThird = (index + 1) * third[index];
  const roles = ["kanan", "hidung", "sumbu ketiga"];
  return [mount.rightAxis, mount.noseAxis, signedThird].map((axis, i) => ({
    direction: directions[i],
    label: `${sensorAxisLabel(axis)} sensor${i < 2 ? ` · ${roles[i]}` : ""}`,
    angleLabel: `${roles[i].toUpperCase()} · ${sensorAxisLabel(axis)}`,
    color: ["#dd483a", "#228c53", "#356ce0"][Math.abs(axis) - 1],
  }));
}
