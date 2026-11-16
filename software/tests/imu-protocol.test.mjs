import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the shipped TypeScript parser with the project's existing compiler.
// No browser, ESP32, generated fixture copy, or extra test dependency is needed.
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const typesUrl = moduleUrl(compile(await readFile(new URL('../src/types/imu.ts', import.meta.url), 'utf8')));
const parserJs = compile(await readFile(new URL('../src/data/imuProtocol.ts', import.meta.url), 'utf8'))
  .replace('"../types/imu"', JSON.stringify(typesUrl));
const { parseImuState, parseCalibrationProgress } = await import(moduleUrl(parserJs));
const hintJs = compile(await readFile(new URL('../src/data/calibrationHint.ts', import.meta.url), 'utf8'))
  .replace('"../types/imu"', JSON.stringify(typesUrl));
const { calibrationHint } = await import(moduleUrl(hintJs));
const axesJs = compile(await readFile(new URL('../src/data/rocketAxes.ts', import.meta.url), 'utf8'));
const { rocketAxes, validSensorMount } = await import(moduleUrl(axesJs));
const faces = ['XP', 'XM', 'YP', 'YM', 'ZP', 'ZM'];
const state = () => ({
  firmware: 'imu3d-v2', calibrated: true, referenceSet: false, imuReady: true,
  noseAxis: 3, rightAxis: 1,
  profile: { offset: [.03, -.01, .02], scale: [1, 1.01, .99], gyroBias: [.001, -.002, .003],
    poses: faces.map((face, i) => ({ face, samples: 200,
      accel: [0, 1, 2].map((axis) => axis === Math.floor(i / 2) ? (i % 2 ? -1 : 1) * 9.80665 : 0) })) },
  lastReference: { accel: [0, 0, 9.80665], orientation: [1, 0, 0, 0], noseAxis: 3, rightAxis: 1 },
});
const parse = (value) => parseImuState(JSON.stringify(value));

test('stored poses survive reboot while the saved reference stays inactive', () => {
  const rebooted = state();
  assert.deepEqual(parse(rebooted), rebooted);
  assert.equal(parse(rebooted).referenceSet, false);
  rebooted.referenceSet = true;
  assert.equal(parse(rebooted).referenceSet, true);
});

test('a new device can report no profile; firmware without the new protocol is rejected', () => {
  const fresh = { ...state(), calibrated: false, profile: null, lastReference: null };
  assert.deepEqual(parse(fresh), fresh);
  assert.equal(parse({ ...fresh, firmware: 'old' }), null);
  assert.equal(parseImuState('CALIBRATION_COMPLETE'), null);
  assert.equal(parse({ calibrated: true }), null);
});

test('a live reference needs a valid profile, ready sensor, and saved pose', () => {
  for (const change of [{ profile: null }, { imuReady: false }, { calibrated: false }, { lastReference: null }]) {
    assert.equal(parse({ ...state(), referenceSet: true, ...change }), null);
  }
});

test('duplicate or incomplete faces and invalid calibration coefficients are rejected', () => {
  for (const mutate of [
    (v) => v.profile.poses.pop(),
    (v) => v.profile.poses[1].face = 'XP',
    (v) => v.profile.poses[0].samples = 199,
    (v) => v.profile.poses[0].samples = 200.5,
    (v) => v.profile.scale[0] = 0,
    (v) => v.profile.offset[0] = 50,
    (v) => v.profile.gyroBias[0] = null,
  ]) { const v = state(); mutate(v); assert.equal(parse(v), null); }
});

test('parallel mounting axes and invalid reference quaternions cannot drive the model', () => {
  for (const mutate of [
    (v) => v.noseAxis = -1,
    (v) => v.rightAxis = 4,
    (v) => v.lastReference.rightAxis = -3,
    (v) => v.lastReference.orientation = [0, 0, 0, 0],
    (v) => v.lastReference.orientation = [1, 2, 3],
  ]) { const v = state(); mutate(v); assert.equal(parse(v), null); }
});

test('capture progress is accepted only within the declared sample window', () => {
  const valid = { active: true, face: 'YM', samples: 80, target: 200, completed: ['XP', 'XM'] };
  const parseProgress = (v) => parseCalibrationProgress(JSON.stringify(v));
  assert.deepEqual(parseProgress(valid), valid);
  for (const change of [{ samples: -1 }, { samples: 201 }, { samples: 1.1 }, { target: 0 },
    { face: 'YX' }, { completed: ['XP', 'XP'] }]) {
    assert.equal(parseProgress({ ...valid, ...change }), null);
  }
});

test('reported stationary breadboard trace explains why +X stays at zero', () => {
  const raw = { accelX: .66319, accelY: -.25857, accelZ: 9.22965,
    gyroX: -.057289, gyroY: .030110, gyroZ: -.016254 };
  const reading = { ...raw, calibrated: false, imuValid: true,
    gyroscope: Math.hypot(raw.gyroX, raw.gyroY, raw.gyroZ) * 180 / Math.PI };
  const wrongPose = calibrationHint('XP', reading);
  assert.equal(wrongPose.tone, 'warning');
  assert.match(wrongPose.message, /Terbaca \+Z ke atas/);
  assert.match(wrongPose.message, /yang direkam \+X/);
  assert.equal(calibrationHint('ZP', reading).tone, 'info');
  // Positioning X upwards changes the guidance, never the ESP32 sample count.
  assert.match(calibrationHint('XP', { ...reading, accelX: 9.23, accelZ: .66 }).message, /Posisi terukur sesuai \+X/);
});

test('pose guidance distinguishes wrong sign, rotation, missing data, and old profiles', () => {
  const reading = { accelX: -9.8, accelY: 0, accelZ: 0, gyroscope: 0, calibrated: false };
  assert.match(calibrationHint('XP', reading).message, /Terbaca −X/);
  assert.match(calibrationHint('XM', { ...reading, gyroscope: 12 }).message, /gyro masih tinggi/);
  assert.match(calibrationHint('XP', null).message, /Menunggu telemetry baru/);
  assert.match(calibrationHint('XP', { ...reading, calibrated: true }).message, /dikoreksi profil lama/);
  assert.equal(calibrationHint('XP', { ...reading, imuValid: false }).tone, 'warning');
});

test('nose +Z and right +X show sensor axes on the confirmed model basis', () => {
  const axes = rocketAxes({ noseAxis: 3, rightAxis: 1 });
  assert.equal(axes[1].label, '+Z sensor · hidung');
  assert.deepEqual(axes[1].direction, [0, 1, 0]);
  assert.equal(axes[1].color, '#356ce0');
  assert.equal(axes[0].label, '+X sensor · kanan');
  assert.equal(axes[2].label, '−Y sensor');
  assert.equal(axes[1].angleLabel, 'HIDUNG · +Z');
  const changed = rocketAxes({ noseAxis: -1, rightAxis: 3 });
  assert.equal(changed[1].label, '−X sensor · hidung');
  assert.equal(changed[0].label, '+Z sensor · kanan');
  // Selecting another mounting changes labels, not the telemetry quaternion basis.
  assert.deepEqual(changed.map((axis) => axis.direction), axes.map((axis) => axis.direction));
});

test('all 24 valid signed mounting pairs label the same basis used by firmware', () => {
  const vector = (axis) => [1, 2, 3].map((index) => Math.abs(axis) === index ? Math.sign(axis) : 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  let combinations = 0;
  for (const noseAxis of [-3,-2,-1,1,2,3]) for (const rightAxis of [-3,-2,-1,1,2,3]) {
    if (Math.abs(noseAxis) === Math.abs(rightAxis)) continue;
    ++combinations;
    const right = vector(rightAxis), nose = vector(noseAxis);
    const rows = [right, nose, cross(right, nose)];
    const axes = rocketAxes({ noseAxis, rightAxis });
    for (const axis of axes) {
      const [, sign, name] = axis.label.match(/^([+−])([XYZ]) sensor/);
      const sensorVector = vector(('XYZ'.indexOf(name) + 1) * (sign === '+' ? 1 : -1));
      const modelVector = rows.map((row) => row.reduce((sum, n, i) => sum + n * sensorVector[i], 0));
      assert.deepEqual(modelVector, axis.direction);
    }
  }
  assert.equal(combinations, 24);
  for (const mount of [undefined, { noseAxis: 3, rightAxis: -3 }, { noseAxis: 0, rightAxis: 1 }, { noseAxis: Infinity, rightAxis: 1 }]) {
    assert.equal(validSensorMount(mount), false);
    assert.match(rocketAxes(mount)[1].label, /model/);
  }
});
