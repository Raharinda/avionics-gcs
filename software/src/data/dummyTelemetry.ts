import type { TelemetryPoint } from "../types/telemetry";

export const DUMMY_SOURCE = "Dummy data";
export const DEFAULT_DATA_SOURCE = "COM4 · USB";

function buildDummyPoint(time: number, phase: number, baseAltitude: number): TelemetryPoint {
  return {
    time,
    timestampMs: Math.round(time * 1000),
    temperature: 24.5 + Math.sin(phase / 1.8) * 1.2,
    pressure: 1012 + Math.sin(phase / 2.1) * 5 + Math.cos(phase / 4.5) * 2,
    acceleration: 0.98 + Math.sin(phase / 1.7) * 0.06 + Math.cos(phase / 3.2) * 0.03,
    gyroscope: 8 + Math.sin(phase / 1.5) * 6 + Math.cos(phase / 3.7) * 3,
    altitude: baseAltitude + Math.sin(phase / 3) * 8 + Math.cos(phase / 6) * 4,
    accelX: Math.sin(phase / 1.8) * 0.65,
    accelY: Math.cos(phase / 2.2) * 0.55,
    accelZ: 9.80665 + Math.sin(phase / 1.7) * 0.45,
    roll: Math.sin(phase / 2.3) * 8.5,
    pitch: Math.cos(phase / 2.7) * 6.2,
    yaw: Math.sin(phase / 4.1) * 18.0,
    rssi: Math.round(-64 + Math.sin(phase / 2.5) * 6),
    imuValid: true,
    barometerValid: true,
    calibrated: true,
    referenceSet: true,
  };
}

export const dummySeries: TelemetryPoint[] = Array.from({ length: 18 }, (_, index) =>
  buildDummyPoint(index, index, 420 + index * 48),
);

export function createDummyTelemetryPoint(lastTime: number): TelemetryPoint {
  return buildDummyPoint(lastTime + 1, Date.now() / 1000, 1248);
}
