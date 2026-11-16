import type { TelemetryPoint } from "../types/telemetry";

export const DUMMY_SOURCE = "Dummy data";
export const DEFAULT_DATA_SOURCE = "COM4 · USB";

export const dummySeries: TelemetryPoint[] = Array.from({ length: 18 }, (_, index) => ({
  time: index,
  temperature: 24.2 + Math.sin(index / 2.4) * 1.2 + index * 0.06,
  pressure: 1012 + Math.sin(index / 2.1) * 5 + Math.cos(index / 4.5) * 2,
  acceleration: 0.96 + Math.sin(index / 1.7) * 0.08 + Math.cos(index / 3.2) * 0.03,
  gyroscope: 8 + Math.sin(index / 1.5) * 6 + Math.cos(index / 3.7) * 3,
  altitude: 420 + index * 48 + Math.sin(index) * 10,
  accelX: 0,
  accelY: 0,
  accelZ: 9.80665,
  roll: 0,
  pitch: 0,
  yaw: 0,
}));

export function createDummyTelemetryPoint(lastTime: number): TelemetryPoint {
  const seconds = Date.now() / 1000;
  return {
    time: lastTime + 1,
    temperature: 24.5 + Math.sin(seconds / 1.2) * 1.2,
    pressure: 1012 + Math.sin(seconds / 2.1) * 5 + Math.cos(seconds / 4.5) * 2,
    acceleration: 0.98 + Math.sin(seconds / 1.7) * 0.06 + Math.cos(seconds / 3.2) * 0.03,
    gyroscope: 8 + Math.sin(seconds / 1.5) * 6 + Math.cos(seconds / 3.7) * 3,
    altitude: 1248 + Math.sin(seconds / 3) * 8 + Math.cos(seconds / 6) * 4,
    accelX: 0,
    accelY: 0,
    accelZ: 9.80665,
    roll: 0,
    pitch: 0,
    yaw: 0,
  };
}
