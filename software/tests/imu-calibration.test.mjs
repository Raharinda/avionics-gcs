import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const sources = await Promise.all([
  compile('../src/types/imu.ts'), compile('../src/data/imuProtocol.ts'),
  compile('../src/features/calibration/hooks/useImuCalibration.ts'),
  compile('../src/features/calibration/components/ImuCalibrationWizard.tsx'),
  compile('../src/data/calibrationHint.ts'),
]);
function load(source, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => dependencies[name], ...globals });
  return exports;
}
const types = load(sources[0], {});
const protocol = load(sources[1], { '../types/imu': types });
const idle = { active: false, face: null, samples: 0, target: 200, completed: [] };
const imuState = {
  firmware: 'imu3d-v2', calibrated: false, referenceSet: false, imuReady: true,
  noseAxis: 3, rightAxis: 1, profile: null, lastReference: null,
};

// Drive the shipped hook with deterministic React slots and serial/timer boundaries.
// Each value read renders again; effects retain dependency and cleanup semantics.
async function mount(t, send = async () => {}) {
  let cursor = 0, listener, props = { connected: true, source: 'COM4 · USB' };
  const slots = [], effects = [], timers = new Map(), commands = [];
  const memo = (factory, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      slots[index] = { deps, value: factory() };
    }
    return slots[index].value;
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  let timerId = 0;
  const { useImuCalibration } = load(sources[2], {
    react,
    '@tauri-apps/api/event': { listen: async (_event, callback) => {
      listener = callback;
      return () => { listener = undefined; };
    } },
    '../../../data/imuProtocol': protocol,
    '../../../types/imu': types,
  }, { window: {
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  } });
  const sendCommand = command => { commands.push(command); return send(command); };
  const harness = {
    commands,
    get value() {
      cursor = 0;
      const value = useImuCalibration(props.connected, props.source, sendCommand);
      effects.splice(0).forEach(effect => effect());
      return value;
    },
    emit(line, sourcePort = 'COM4') { listener?.({ payload: { sourcePort, line } }); },
    status(progress) { this.emit(`CALIBRATION_STATUS:${JSON.stringify(progress)}`); },
    state(next = imuState) { this.emit(`IMU_STATE:${JSON.stringify(next)}`); },
    update(next) { props = { ...props, ...next }; void this.value; },
    timeout() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
  };
  void harness.value;
  await Promise.resolve();
  t.after(() => slots.forEach(slot => slot?.cleanup?.()));
  return harness;
}

test('reset interrupts status/start/capture waits and only its own acknowledgement completes it', async t => {
  const h = await mount(t);
  assert.equal(h.commands[0], 'IMU_STATUS');
  await h.value.cancel();
  assert.equal(h.commands.at(-1), 'CALIBRATE_RESET');
  h.state();
  h.status({ ...idle, active: true, face: 'XP', samples: 50 });
  h.emit('CALIBRATION_STARTED');
  h.emit('CALIBRATION_ERROR:Late capture rejection');
  assert.equal(h.value.cancelling, true);
  assert.equal(h.value.pending, true);
  assert.equal(h.value.error, null);
  assert.match(h.value.message, /menghentikan/);
  await h.value.cancel();
  assert.equal(h.commands.filter(command => command === 'CALIBRATE_RESET').length, 1);
  h.emit('CALIBRATION_RESET');
  assert.equal(h.value.progress.active, false);
  assert.equal(h.value.progress.face, null);
  assert.equal(h.value.progress.samples, 0);
  assert.equal(h.value.pending, false);
  h.status(idle);
  h.state();
  assert.match(h.value.message, /Profil kalibrasi dan acuan di ESP32 dihapus/);
  await h.value.start();
  await h.value.cancel();
  h.emit('CALIBRATION_RESET');
  await h.value.start();
  h.emit('CALIBRATION_STARTED');
  await h.value.capture('XP');
  assert.equal(h.value.pending, true);
  await h.value.cancel();
  assert.equal(h.commands.at(-1), 'CALIBRATE_RESET');
});

test('profile status cannot overwrite an active calibration or acknowledge capture', async t => {
  const h = await mount(t);
  h.state();
  assert.equal(h.value.pending, true, 'status request needs progress as well as profile');
  h.status(idle);
  await h.value.start();
  h.emit('CALIBRATION_STARTED');
  h.state();
  assert.equal(h.value.progress.active, true);
  assert.match(h.value.message, /Sesi kalibrasi aktif/);
  await h.value.capture('XP');
  h.state();
  assert.equal(h.value.pending, true);
  h.status({ ...idle, active: true, face: 'XP', samples: 20 });
  assert.equal(h.value.pending, false);
  h.state();
  assert.match(h.value.message, /Sedang merekam \+X/);
});

test('start supersedes a status request and waits for the transmitter confirmation', async t => {
  const h = await mount(t);
  assert.equal(h.value.checkingStatus, true);
  assert.equal(h.value.state, null);
  await h.value.start();
  assert.equal(h.commands.at(-1), 'CALIBRATE_START');
  assert.equal(h.value.checkingStatus, false);
  assert.equal(h.value.pending, true);
  assert.equal(h.value.progress.active, false);
  // A late boot/status response cannot complete the start request.
  h.state({ ...imuState, imuReady: false });
  h.status(idle);
  assert.equal(h.value.pending, true);
  assert.equal(h.value.progress.active, false);
  h.emit('CALIBRATION_ERROR:MPU6050 belum memberikan data valid');
  assert.equal(h.value.pending, false);
  assert.equal(h.value.progress.active, false);
  assert.match(h.value.error, /MPU6050/);
  await h.value.start();
  h.emit('CALIBRATION_STARTED');
  assert.equal(h.value.pending, false);
  assert.equal(h.value.progress.active, true);
});

test('start button allows missing or earlier unready status while preserving command and connection locks', async t => {
  const h = await mount(t);
  const { ImuCalibrationWizard } = load(sources[3], {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    '../../../types/imu': types,
    '../../flight/components/RocketViewport': { RocketViewport: () => null },
    '../../../data/calibrationHint': load(sources[4], { '../types/imu': types }),
    '../../telemetry/hooks/useTelemetryFreshness': { useTelemetryFreshness: () => false },
  });
  const button = (connected = true) => {
    const html = renderToStaticMarkup(React.createElement(ImuCalibrationWizard, {
      controller: h.value, connected, telemetry: null, receivedAt: null, onClose() {},
    }));
    return html.match(/<button\b([^>]*)>Mulai enam posisi<\/button>/)[1];
  };
  assert.doesNotMatch(button(), /disabled/, 'start can interrupt the initial status request');
  h.state({ ...imuState, imuReady: false });
  h.status(idle);
  assert.doesNotMatch(button(), /disabled/, 'earlier imuReady=false must not lock out retries');
  assert.match(button(false), /disabled/);
  await h.value.start();
  assert.match(button(), /disabled/, 'do not send duplicate start commands');
  h.emit('CALIBRATION_STARTED');
  assert.match(button(), /disabled/, 'an active session must not restart');
});

test('calibration guidance permits stationary zero axes despite strict health validity', () => {
  const { calibrationHint } = load(sources[4], { '../types/imu': types });
  for (const [axis, positive, negative] of [[0, 'XP', 'XM'], [1, 'YP', 'YM'], [2, 'ZP', 'ZM']]) {
    for (const [face, sign] of [[positive, 1], [negative, -1]]) {
      const axes = [0, 0, 0]; axes[axis] = sign * 9.80665;
      const reading = { accelX: axes[0], accelY: axes[1], accelZ: axes[2], gyroscope: 0,
        imuValid: false, calibrated: false };
      const hint = calibrationHint(face, reading);
      assert.equal(hint.tone, 'info');
      assert.match(hint.message, /Posisi terukur sesuai/);
      assert.equal(calibrationHint(face, { ...reading, accelX: NaN }).tone, 'warning');
      assert.equal(calibrationHint(face, { ...reading, imuReady: false }).tone, 'warning');
    }
  }
  assert.equal(calibrationHint('ZP', { accelX: 0, accelY: 0, accelZ: 0,
    gyroscope: 0, imuValid: false, calibrated: false }).tone, 'warning');
});

test('GCS telemetry-only calibration capability is informational and resets when switching to avionics', async t => {
  const h = await mount(t);
  h.emit('CALIBRATION_UNSUPPORTED:Telemetry melalui GCS tetap diterima. Hubungkan USB langsung ke avionics untuk kalibrasi.');
  assert.equal(h.value.supported, false);
  assert.equal(h.value.pending, false);
  assert.equal(h.value.error, null);
  assert.match(h.value.message, /Telemetry melalui GCS tetap diterima/);
  h.update({ source: 'COM5 · USB' });
  assert.equal(h.value.supported, null);
  await Promise.resolve();
  h.emit(`IMU_STATE:${JSON.stringify(imuState)}`, 'COM5');
  h.emit(`CALIBRATION_STATUS:${JSON.stringify(idle)}`, 'COM5');
  assert.equal(h.value.supported, true);
  assert.equal(h.value.state.imuReady, true);
});

test('older GCS firmware limitations do not report a failed telemetry connection', async t => {
  const h = await mount(t);
  h.emit('CALIBRATION_ERROR:Receiver E32 hanya telemetri. Hubungkan USB langsung ke transmitter untuk kalibrasi dan acuan 3D.');
  assert.equal(h.value.supported, false);
  assert.equal(h.value.error, null);
  assert.equal(h.value.pending, false);
  assert.match(h.value.message, /Telemetry melalui GCS tetap diterima/);
});

test('reset timeout preserves device progress and allows retry', async t => {
  const h = await mount(t);
  h.status({ ...idle, active: true, face: 'YP', samples: 100 });
  await h.value.cancel();
  h.timeout();
  assert.equal(h.value.pending, false);
  assert.equal(h.value.cancelling, false);
  assert.equal(h.value.progress.active, true);
  assert.match(h.value.error, /Penghapusan kalibrasi belum dikonfirmasi/);
  await h.value.cancel();
  h.emit('CALIBRATION_RESET');
  assert.equal(h.value.error, null);
  assert.equal(h.value.progress.active, false);
});

test('late send failure cannot clear a newer cancellation; disconnect clears the session', async t => {
  let rejectStart;
  const h = await mount(t, command => command === 'CALIBRATE_START'
    ? new Promise((_resolve, reject) => { rejectStart = reject; }) : Promise.resolve());
  h.status(idle);
  const starting = h.value.start();
  await h.value.cancel();
  rejectStart(new Error('Old send failed'));
  await starting;
  assert.equal(h.value.cancelling, true);
  assert.equal(h.value.error, null);
  h.emit('CALIBRATION_RESET', 'OTHER_PORT');
  assert.equal(h.value.cancelling, true);
  h.update({ connected: false });
  assert.equal(h.value.pending, false);
  assert.equal(h.value.cancelling, false);
  assert.equal(h.value.state, null);
  assert.equal(h.value.progress.active, false);
  h.timeout();
  assert.equal(h.value.error, null);
});


test('cancel stays visible and enabled while awaiting device status, with mounting controls removed', async t => {
  const h = await mount(t);
  const { ImuCalibrationWizard } = load(sources[3], {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    '../../../types/imu': types,
    '../../flight/components/RocketViewport': { RocketViewport: () => null },
    '../../../data/calibrationHint': load(sources[4], { '../types/imu': types }),
    '../../telemetry/hooks/useTelemetryFreshness': { useTelemetryFreshness: () => false },
  });
  const render = connected => renderToStaticMarkup(React.createElement(ImuCalibrationWizard, {
    controller: h.value, connected, telemetry: null, receivedAt: null, onClose() {},
  }));
  const cancelButton = html => html.match(/<button\b([^>]*)>(?:Batalkan &amp; hapus kalibrasi|Menghapus kalibrasi…)<\/button>/)[1];
  const html = render(true);
  assert.doesNotMatch(cancelButton(html), /disabled/);
  assert.doesNotMatch(html, /Pemasangan|Sumbu sensor ke hidung|Sumbu sensor ke kanan/);
  assert.match(html, /2\. Tetapkan pose nol/);
  assert.match(html, /\+X kanan, \+Y depan, \+Z atas/);
  assert.match(html, /arah depan papan diputar menghadap langit/);
  assert.match(html, /\+Y · depan/);
  assert.match(html, /Hadapkan sisi bawah ke atas/);
  assert.match(html, /class="selected[^"]*"[^>]*><b>\+Z · atas/);
  await h.value.cancel();
  assert.match(cancelButton(render(true)), /disabled/);
  assert.match(render(true), /Menghapus kalibrasi…/);
  h.emit('CALIBRATION_RESET');
  assert.doesNotMatch(cancelButton(render(true)), /disabled/);
  assert.match(cancelButton(render(false)), /disabled/);
});


test('reset confirmation clears stored calibration and reference while preserving sensor readiness', async t => {
  const h = await mount(t);
  const faces = ['XP', 'XM', 'YP', 'YM', 'ZP', 'ZM'];
  const saved = {
    ...imuState, calibrated: true, referenceSet: true,
    profile: { offset: [0, 0, 0], scale: [1, 1, 1], gyroBias: [0, 0, 0],
      poses: faces.map(face => ({ face, samples: 200, accel: [0, 0, 9.8] })) },
    lastReference: { accel: [0, 0, 9.8], orientation: [1, 0, 0, 0], noseAxis: 3, rightAxis: 1 },
  };
  h.state(saved);
  h.status({ ...idle, completed: faces });
  await h.value.cancel();
  h.emit('CALIBRATION_CANCELLED');
  assert.equal(h.value.cancelling, true, 'ordinary cancel must not confirm persistent deletion');
  assert.equal(h.value.state.calibrated, true);
  assert.notEqual(h.value.state.profile, null);
  h.emit('CALIBRATION_RESET');
  assert.equal(h.value.state.calibrated, false);
  assert.equal(h.value.state.referenceSet, false);
  assert.equal(h.value.state.profile, null);
  assert.equal(h.value.state.lastReference, null);
  assert.equal(h.value.state.imuReady, true);
  assert.equal(h.value.state.noseAxis, saved.noseAxis);
  assert.equal(h.value.progress.completed.length, 0);
  assert.equal(h.value.pending, false);
  assert.match(h.value.message, /Data IMU dan gyro tetap tersedia/);
  h.state();
  h.status(idle);
  assert.match(h.value.message, /di ESP32 dihapus/);
});

test('storage deletion error is shown immediately without claiming successful reset', async t => {
  const h = await mount(t);
  h.state();
  h.status({ ...idle, active: true, face: 'XP', samples: 30 });
  await h.value.cancel();
  h.emit('CALIBRATION_RESET_ERROR:Penghapusan gagal. Coba lagi.');
  assert.equal(h.value.pending, false);
  assert.equal(h.value.cancelling, false);
  assert.match(h.value.error, /Penghapusan gagal/);
  assert.doesNotMatch(h.value.message, /di ESP32 dihapus/);
  await h.value.cancel();
  assert.equal(h.value.error, null);
  h.emit('CALIBRATION_RESET');
  assert.equal(h.value.pending, false);
});
