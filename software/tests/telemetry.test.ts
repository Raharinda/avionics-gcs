import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTelemetry } from "../src/data/normalizeTelemetry.ts";
import type { SerialSample } from "../src/types/telemetry.ts";

const sample: SerialSample = {
  kind: "sample", elapsed_ms: 2000,
  accel_mps2: [0, 0, 9.80665], gyro_rads: [0, 0, Math.PI],
  mpu_temperature_c: 29.1, temperature_c: 28.4, pressure_hpa: 1008.25,
};

test("firmware SI units convert to the units displayed on the dashboard", () => {
  const { point } = normalizeTelemetry(sample, null, null);
  assert.equal(point.time, 2);
  assert.equal(point.acceleration, 1);
  assert.equal(point.gyroscope, 180);
  assert.equal(point.pressure, 100.825);
  assert.equal(point.mpuTemperature, 29.1);
  assert.equal(point.temperature, 28.4);
  assert.equal(point.altitude, 0);
  assert.equal(point.descentRate, null);
});

test("barometric reference is session-relative and falling pressure means ascent", () => {
  const first = normalizeTelemetry(sample, null, null);
  const next = normalizeTelemetry({ ...sample, elapsed_ms: 2500, pressure_hpa: 998.25 }, first.referencePressureHpa, first.point);
  assert.equal(next.referencePressureHpa, 1008.25);
  assert.ok(next.point.altitude! > 80 && next.point.altitude! < 90);
  assert.ok(next.point.descentRate! < 0);
});

test("missing MPU readings do not become fabricated zero values", () => {
  const { point } = normalizeTelemetry({ ...sample, accel_mps2: null, gyro_rads: null, mpu_temperature_c: null }, null, null);
  assert.equal(point.acceleration, null);
  assert.equal(point.gyroscope, null);
  assert.equal(point.roll, null);
  assert.equal(point.mpuTemperature, null);
  assert.equal(point.temperature, 28.4);
});

test("missing BMP readings keep pressure, altitude, and descent unavailable", () => {
  const { point } = normalizeTelemetry({ ...sample, temperature_c: null, pressure_hpa: null }, 1008.25, null);
  assert.equal(point.temperature, null);
  assert.equal(point.pressure, null);
  assert.equal(point.altitude, null);
  assert.equal(point.descentRate, null);
  assert.equal(point.acceleration, 1);
});

test("invalid sensor values cannot enter charts or the altitude reference", () => {
  const result = normalizeTelemetry({ ...sample, accel_mps2: [NaN, 0, 0], gyro_rads: [Infinity, 0, 0], temperature_c: NaN, pressure_hpa: -1 }, null, null);
  assert.equal(result.point.acceleration, null);
  assert.equal(result.point.gyroscope, null);
  assert.equal(result.point.temperature, null);
  assert.equal(result.point.altitude, null);
  assert.equal(result.referencePressureHpa, null);
});

test("gravity tilt respects signed axes and is unavailable in free fall", () => {
  const side = normalizeTelemetry({ ...sample, accel_mps2: [0, 9.80665, 0] }, null, null);
  assert.equal(side.point.roll, 90);
  const fall = normalizeTelemetry({ ...sample, accel_mps2: [0, 0, 0] }, null, null);
  assert.equal(fall.point.acceleration, 0);
  assert.equal(fall.point.roll, null);
  assert.equal(fall.point.pitch, null);
});
