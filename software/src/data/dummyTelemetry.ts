import type { TelemetryPoint } from "../types/telemetry";

export const DUMMY_SOURCE = "Dummy data";
export const DEFAULT_DATA_SOURCE = "COM4 · USB";

export const dummySeries: TelemetryPoint[] = Array.from({ length: 18 }, (_, index) => ({
  time: index,
  temperature: 24.2 + Math.sin(index / 2.4) * 1.2 + index * 0.06,
  pressure: 100.9 - Math.sin(index / 2.8) * 0.8 - index * 0.04,
  acceleration: 0.96 + Math.sin(index / 2.2) * 0.08,
  altitude: 420 + index * 48 + Math.sin(index) * 10,
}));

export function createDummyTelemetryPoint(lastTime: number): TelemetryPoint {
  return {
    time: lastTime + 1,
    temperature: 24.5 + Math.sin(Date.now() / 1200) * 1.2,
    pressure: 100.4 + Math.sin(Date.now() / 1700) * 0.6,
    acceleration: 0.98 + Math.sin(Date.now() / 900) * 0.06,
    altitude: 1248 + Math.sin(Date.now() / 3000) * 8,
  };
}
