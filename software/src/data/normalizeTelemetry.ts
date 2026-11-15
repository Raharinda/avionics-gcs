import type { SerialSample, TelemetryPoint } from "../types/telemetry.ts";

const GRAVITY = 9.80665;
const DEGREES = 180 / Math.PI;
const valid = (value: number | null): value is number => value !== null && Number.isFinite(value);
const validAxes = (value: [number, number, number] | null) =>
  value !== null && value.length === 3 && value.every(Number.isFinite) ? value : null;

export function normalizeTelemetry(
  sample: SerialSample,
  referencePressureHpa: number | null,
  previous: TelemetryPoint | null,
): { point: TelemetryPoint; referencePressureHpa: number | null } {
  const accel = validAxes(sample.accel_mps2);
  const gyro = validAxes(sample.gyro_rads);
  const pressure = valid(sample.pressure_hpa) && sample.pressure_hpa > 0 ? sample.pressure_hpa : null;
  const reference = referencePressureHpa ?? pressure;
  const altitude = pressure !== null && reference !== null
    ? 44330 * (1 - (pressure / reference) ** 0.1903) : null;
  const time = sample.elapsed_ms / 1000;
  const deltaTime = previous ? time - previous.time : 0;
  const hasGravity = accel !== null && Math.hypot(...accel) > 0.001;
  return {
    referencePressureHpa: reference,
    point: {
      time,
      temperature: valid(sample.temperature_c) ? sample.temperature_c : null,
      pressure: pressure === null ? null : pressure / 10, // hPa -> kPa
      acceleration: accel ? Math.hypot(...accel) / GRAVITY : null,
      gyroscope: gyro ? Math.hypot(...gyro) * DEGREES : null,
      mpuTemperature: valid(sample.mpu_temperature_c) ? sample.mpu_temperature_c : null,
      accelZ: accel ? accel[2] / GRAVITY : null,
      gyroZ: gyro ? gyro[2] * DEGREES : null,
      accel,
      gyro,
      altitude,
      roll: hasGravity ? Math.atan2(accel[1], accel[2]) * DEGREES : null,
      pitch: hasGravity ? Math.atan2(-accel[0], Math.hypot(accel[1], accel[2])) * DEGREES : null,
      descentRate: altitude !== null && previous?.altitude != null && deltaTime > 0
        ? (previous.altitude - altitude) / deltaTime : null,
    },
  };
}
