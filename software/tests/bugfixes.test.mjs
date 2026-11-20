import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

function load(source, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => dependencies[name], ...globals });
  return exports;
}

function createHookRuntime() {
  let cursor = 0;
  let timerId = 0;
  const slots = [];
  const setters = [];
  const effects = [];
  const timeouts = new Map();
  const intervals = new Map();
  const react = {
    memo: (c) => c,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], setters[index] ??= (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useMemo(factory, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { deps, value: factory() };
      }
      return slots[index].value;
    },
    useCallback(callback, deps) {
      return react.useMemo(() => callback, deps);
    },
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
  const win = {
    setTimeout(cb) { const id = ++timerId; timeouts.set(id, cb); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(cb) { const id = ++timerId; intervals.set(id, cb); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  return {
    react,
    window: win,
    timeouts,
    intervals,
    render(fn) {
      cursor = 0;
      const result = fn();
      while (effects.length) {
        const pending = effects.splice(0);
        for (const eff of pending) eff();
      }
      return result;
    },
    flushTimeouts() {
      const cbs = [...timeouts.values()];
      timeouts.clear();
      for (const cb of cbs) cb();
    },
    dispose() {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}

const [
  packetLossSource,
  telemetrySource,
  serialConnSource,
  gridSource,
  attitudeCardSource,
  commandPanelSource,
  dashboardControllerSource,
] = await Promise.all([
  compile('../src/data/packetLoss.ts'),
  compile('../src/features/telemetry/hooks/useTelemetry.ts'),
  compile('../src/features/connection/hooks/useSerialConnection.ts'),
  compile('../src/features/telemetry/components/TelemetrySensorGrid.tsx'),
  compile('../src/features/telemetry/components/AttitudeCard.tsx'),
  compile('../src/features/command/components/CommandPanel.tsx'),
  compile('../src/features/dashboard/hooks/useDashboardController.ts'),
]);

const packetLoss = load(packetLossSource, {});

test('packetLoss accurately tracks 10 Hz USB, 0.5 Hz LoRa, rollover, and reboot without losing count', () => {
  // 10 Hz USB: 100 ms interval with a 1-packet drop and a 24-packet drop
  const usbTracker = new packetLoss.PacketLossTracker();
  for (const tsMs of [1000, 1100, 1200, 1400, 1500, 4000, 4100]) {
    usbTracker.record(tsMs);
  }
  assert.equal(usbTracker.totalLost, 1 + 24);

  // 0.5 Hz LoRa: 2000 ms interval with realistic jitter + 1 drop + 2 drops + reboot
  const loraTracker = new packetLoss.PacketLossTracker();
  for (const tsMs of [2000, 4200, 6100, 10100, 16100, 500, 2500]) {
    loraTracker.record(tsMs);
  }
  assert.equal(loraTracker.totalLost, 1 + 2);

  // 32-bit millis() wraparound (0xFFFFFFFF -> 0) does not produce false loss
  const rolloverTracker = new packetLoss.PacketLossTracker();
  for (const tsMs of [0xffffea00, 0xfffff200, 0xfffffa00, 0x00000200, 0x00000a00]) {
    rolloverTracker.record(tsMs);
  }
  assert.equal(rolloverTracker.totalLost, 0);

  // Static helper catches loss on both USB and LoRa
  const usbPoints = [1000, 1100, 1200, 3700].map((timestampMs) => ({ timestampMs }));
  assert.equal(packetLoss.calculateLostPackets(usbPoints), 24);
  const loraPoints = [2000, 6000, 8000, 10000].map((timestampMs) => ({ timestampMs }));
  assert.equal(packetLoss.calculateLostPackets(loraPoints), 1);
});

test('useTelemetry preserves cumulative lostPacketCount and full export history beyond 120 points', async (t) => {
  const r = createHookRuntime();
  t.after(() => r.dispose());
  let telemetryListener;
  const { useTelemetry } = load(telemetrySource, {
    react: r.react,
    '@tauri-apps/api/event': {
      listen: async (_name, cb) => { telemetryListener = cb; return () => { telemetryListener = null; }; },
    },
    '../../../data/dummyTelemetry': { DUMMY_SOURCE: 'Dummy data', dummySeries: [], createDummyTelemetryPoint: () => ({}) },
    '../../../data/packetLoss': packetLoss,
  }, { window: r.window, Date });

  const render = () => r.render(() => useTelemetry({ connected: true, dataSource: '/dev/ttyUSB0 · CP2102' }));
  render();
  await Promise.resolve();

  let timestampMs = 1000;
  for (let i = 0; i < 150; i++) {
    // Inject a 5-packet loss at packet index 5
    timestampMs += i === 5 ? 600 : 100;
    telemetryListener({
      payload: {
        sourcePort: '/dev/ttyUSB0',
        timestampMs,
        temperature: 30.5,
        pressure: 930,
        acceleration: 1.0,
        gyroscope: 0.5,
        altitude: 12.3,
        accelX: 0, accelY: 0, accelZ: 9.81,
        roll: 1, pitch: 2, yaw: 3,
      },
    });
  }

  const state = render();
  assert.equal(state.packetCount, 150);
  assert.equal(state.series.length, 120, 'chart series stays bounded at 120 points');
  assert.equal(state.getExportSeries().length, 150, 'export history retains all 150 points');
  assert.equal(state.lostPacketCount, 5, 'cumulative lost count does not decay after 120 points');
});

test('useSerialConnection supports Linux/macOS ports, serial_error, serial_disconnected, and resilient stop', async (t) => {
  const r = createHookRuntime();
  t.after(() => r.dispose());
  const listeners = new Map();
  let availablePorts = [{ name: '/dev/ttyUSB0', description: 'CP2102', is_usb: true }];
  let stopShouldFail = false;
  let stopCalls = 0;
  const logs = [];

  const serialMod = load(serialConnSource, {
    react: r.react,
    '@tauri-apps/api/event': {
      listen: async (name, cb) => { listeners.set(name, cb); return () => { listeners.delete(name); }; },
    },
    '../../../data/dummyTelemetry': { DEFAULT_DATA_SOURCE: '/dev/ttyUSB0 · CP2102', DUMMY_SOURCE: 'Dummy data' },
    '../../../services/serialConnection': {
      listSerialPorts: async () => availablePorts,
      startSerialListener: async (port) => `Listening on ${port}`,
      stopSerialListener: async () => {
        stopCalls++;
        if (stopShouldFail) throw new Error('port already closed');
      },
    },
  }, { window: r.window, Date });

  assert.equal(serialMod.isConnectionReady('/dev/ttyUSB0 · CP2102', true), true);
  assert.equal(serialMod.isConnectionReady('/dev/cu.usbserial-1 · USB', true), true);
  assert.equal(serialMod.isConnectionReady('COM4 · USB', true), true);
  assert.equal(serialMod.isConnectionReady('/dev/ttyUSB0 · CP2102', false), false);

  const setLog = (msg) => logs.push(msg);
  const render = () => r.render(() => serialMod.useSerialConnection(setLog));
  render();
  await Promise.resolve();
  await Promise.resolve();

  let state = render();
  await state.startTelemetry();
  state = render();
  assert.equal(state.connected, true);
  assert.equal(state.connectionReady, true, 'Linux serial port is marked connectionReady');

  // serial_error reaches the status log
  listeners.get('serial_error')({ payload: 'Invalid telemetry JSON: EOF' });
  assert.match(logs.at(-1), /Invalid telemetry JSON/);

  // serial_disconnected resets connected & connectionReady
  listeners.get('serial_disconnected')({ payload: { sourcePort: '/dev/ttyUSB0', reason: 'Broken pipe' } });
  state = render();
  assert.equal(state.connected, false);
  assert.equal(state.connectionReady, false);
  assert.equal(state.streamingSource, null);
  assert.match(logs.at(-1), /Serial disconnected \(\/dev\/ttyUSB0\): Broken pipe/);

  // Reconnect and test port vanishing during refreshSerialPorts
  await state.startTelemetry();
  state = render();
  assert.equal(state.connected, true);
  availablePorts = [];
  await state.refreshSerialPorts();
  state = render();
  assert.equal(state.connected, false);
  assert.equal(state.connectionReady, false);
  assert.ok(stopCalls >= 1);

  // stopTelemetry cleans up state even if backend throws
  availablePorts = [{ name: '/dev/ttyUSB0', description: 'CP2102', is_usb: true }];
  await state.refreshSerialPorts();
  state = render();
  await state.startTelemetry();
  state = render();
  assert.equal(state.connected, true);
  stopShouldFail = true;
  await state.stopTelemetry();
  state = render();
  assert.equal(state.connected, false);
  assert.equal(state.connectionReady, false);
  assert.match(logs.at(-1), /Serial stop error:.*port already closed/);
});

test('TelemetrySensorGrid dynamic domain prevents clipping high temperature, low pressure, and high-g accel', () => {
  const { computePaddedDomain } = load(gridSource, {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    './SensorCard': { SensorCard: () => null },
    './AttitudeCard': { AttitudeCard: () => null },
    '../hooks/useSampledValue': { useSampledValue: (v) => v },
    '../../../data/dummyTelemetry': { DUMMY_SOURCE: 'Dummy data' },
  });

  const points = [
    { temperature: 30.6, pressure: 930.5, acceleration: 6.5, gyroscope: 10 },
    { temperature: 31.2, pressure: 928.0, acceleration: 0.2, gyroscope: 20 },
  ];
  const tempDomain = computePaddedDomain(points, 'temperature', 2, [21, 28]);
  assert.ok(tempDomain[0] < 30.6 && tempDomain[1] > 31.2);
  const pressDomain = computePaddedDomain(points, 'pressure', 2, [980, 1030]);
  assert.ok(pressDomain[0] < 928.0 && pressDomain[1] > 930.5);
  const accelDomain = computePaddedDomain(points, 'acceleration', 0.2, [0.8, 1.2]);
  assert.ok(accelDomain[0] < 0.2 && accelDomain[1] > 6.5);
});

test('AttitudeCard follows the local RFU calibration X roll, Y pitch, Z yaw', () => {
  const { AttitudeCard } = load(attitudeCardSource, {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    '../../../components/ui/Card': { Card: ({ children }) => React.createElement('div', null, children) },
  });
  const html = renderToStaticMarkup(React.createElement(AttitudeCard, {
    hasData: true,
    telemetry: { roll: 30.0, pitch: 45.0, yaw: 12.0 },
  }));
  assert.match(html, /<span>YAW<\/span><b>12\.0°<\/b>/);
  assert.match(html, /<span>PITCH<\/span><b>45\.0°<\/b>/);
  assert.match(html, /<span>ROLL<\/span><b>30\.0°<\/b>/);
});

test('CommandPanel timeline does not mark Sending FIRE done while merely armed', () => {
  const { CommandPanel } = load(commandPanelSource, {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    '../../../components/ui/Icon': { Icon: () => null },
  });
  const baseProps = {
    connectionReady: true,
    connected: true,
    isDarkMode: false,
    commandSent: false, pulseDuration: "200", onPulseDurationChange() {},
    hasTelemetry: true,
    latestTelemetry: { imuValid: true, calibrated: true },
    onArm() {}, onDisarm() {}, onFire() {}, onStart() {}, onStop() {}, onRefreshClock() {}, onReset() {}, onToggleTheme() {},
  };
  const armedHtml = renderToStaticMarkup(React.createElement(CommandPanel, { ...baseProps, commandState: 'armed' }));
  assert.match(armedHtml, /<div class=""><i><\/i>Sending FIRE<\/div>/);
  const firingHtml = renderToStaticMarkup(React.createElement(CommandPanel, { ...baseProps, commandState: 'firing' }));
  assert.match(firingHtml, /<div class="done"><i><\/i>Sending FIRE<\/div>/);
});

test('CommandPanel reports MPU and barometer health independently and requires fresh readings', () => {
  const { CommandPanel } = load(commandPanelSource, {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    '../../../components/ui/Icon': { Icon: () => null },
  });
  for (const hasTelemetry of [false, true]) {
    for (const imuValid of [false, true]) {
      for (const barometerValid of [false, true]) {
        const html = renderToStaticMarkup(React.createElement(CommandPanel, {
          commandState: 'safe', connectionReady: true, connected: true, hasTelemetry,
          latestTelemetry: { imuValid, barometerValid }, pulseDuration: '200',
        }));
        const health = html.match(/<button class="health-row"[^>]*>(.*?)<\/button>/)[1];
        assert.ok(health.includes(`<span class="${hasTelemetry && imuValid ? 'healthy' : 'unhealthy'}">4</span>`));
        assert.ok(health.includes(`<span class="${hasTelemetry && barometerValid ? 'healthy' : 'unhealthy'}">5</span>`));
      }
    }
  }
});

test('dashboard uses remote D19 ACK, reset supersedes FIRE, source state is isolated, and dev CSV export is retained', async (t) => {
  const r = createHookRuntime();
  t.after(() => r.dispose());

  let mockConnection = {
    connected: true,
    connectionReady: true,
    dataSource: 'COM4 · USB',
    streamingSource: 'COM4 · USB',
    hardwareStreaming: true,
    setConnected() { throw new Error('fireCharge must not force setConnected(true)'); },
    startTelemetry: async () => {},
    stopTelemetry: async () => { mockConnection = { ...mockConnection, connected: false, hardwareStreaming: false, streamingSource: null }; },
  };
  let mockImu = {
    error: 'Receiver E22 hanya telemetri. Hubungkan USB langsung ke transmitter untuk kalibrasi dan acuan 3D.',
    message: 'Menunggu status dan profil dari ESP32.',
    progress: { active: false },
    cancelling: false,
  };
  const mockTelemetry = {
    series: [],
    packetCount: 0,
    lostPacketCount: 0,
    receivedAt: null,
    loadDummyData() {},
    clearTelemetry() {},
    getExportSeries: () => [
      { time: 1, timestampMs: 1000, temperature: 30, pressure: null, acceleration: 1, gyroscope: 0, altitude: null, accelX: 0, accelY: 0, accelZ: 9.81, roll: 1, pitch: 2, yaw: 3, calibrated: true, referenceSet: false },
    ],
  };

  const commands = [];
  let listener, sequence = 0;
  const gpioProtocol = load(await compile('../src/data/gpio19Command.ts'), {}, {
    setTimeout: r.window.setTimeout, clearTimeout: r.window.clearTimeout,
    crypto: { getRandomValues(array) { array[0] = 1; array[1] = ++sequence; return array; } },
  });
  const gpioHook = load(await compile('../src/features/command/hooks/useGpio19Command.ts'), {
    react: r.react,
    '@tauri-apps/api/event': { listen: async (_name, cb) => { listener = cb; return () => { listener = null; }; } },
    '../../../data/gpio19Command': gpioProtocol,
    '../../../services/serialConnection': { sendSerialCommand: async line => { commands.push(line); } },
  });
  const ack = command => listener?.({ payload: { sourcePort: 'COM4', line: command.replace('D19_CMD:', 'D19_ACK:') } });
  const controllerMod = load(dashboardControllerSource, {
    react: r.react,
    '@tauri-apps/api/core': { invoke: async () => '' },
    '../../../data/dummyTelemetry': { DUMMY_SOURCE: 'Dummy data' },
    '../../../services/serialConnection': { sendSerialCommand: async () => {} },
    '../../command/hooks/useGpio19Command': gpioHook,
    '../../../data/gpio19Command': gpioProtocol,
    '../../connection/hooks/useSerialConnection': { useSerialConnection: () => mockConnection },
    '../../telemetry/hooks/useTelemetry': { useTelemetry: () => mockTelemetry },
    '../../calibration/hooks/useImuCalibration': { useImuCalibration: () => mockImu },
  }, { window: r.window, Date });

  const render = () => r.render(() => controllerMod.useDashboardController());
  let state = render();
  await Promise.resolve();
  state = render();

  // E22 receiver probe error must not pollute the main dashboard status log
  assert.equal(state.log, 'No telemetry data received');

  // Reset supersedes FIRE; only the LOW ACK can complete it.
  state.armSystem();
  state = render();
  assert.equal(state.commandState, 'armed');
  state.fireCharge();
  state = render();
  assert.equal(state.commandState, 'firing');
  const fireRequest = commands.at(-1);
  state.resetCommands();
  state = render();
  assert.equal(state.commandState, 'firing');
  ack(fireRequest);
  assert.equal(render().commandState, 'firing');
  ack(commands.at(-1));
  state = render();
  assert.equal(state.commandState, 'safe');
  assert.equal(state.phase, 'Initialization');
  r.flushTimeouts();
  state = render();
  assert.equal(state.commandState, 'safe', 'late timer cannot complete the old FIRE');
  assert.equal(state.phase, 'Initialization');

  // Arm & fire to complete, then switch to an unseen source -> state must reset cleanly
  state.armSystem();
  state = render();
  state.fireCharge();
  state = render();
  ack(commands.at(-1));
  render();
  state = render();
  assert.equal(state.commandState, 'complete');
  assert.equal(state.phase, 'Flight');

  mockConnection = { ...mockConnection, dataSource: 'COM9 · USB', streamingSource: null, connected: false, hardwareStreaming: false };
  render();
  state = render();
  assert.equal(state.commandState, 'safe', 'unseen data source starts in safe state');
  assert.equal(state.phase, 'Initialization', 'unseen data source starts in Initialization phase');
  assert.equal(state.log, 'No telemetry data received');

  // buildTelemetryCsv exports Excel-friendly UTF-8 CSV with rounded numbers, units, and blank cells for null values
  const csv = controllerMod.buildTelemetryCsv(mockTelemetry.getExportSeries());
  assert.ok(csv.startsWith('\uFEFFsep=,\r\n'), 'CSV starts with UTF-8 BOM and Excel separator directive');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'sep=,');
  assert.match(lines[1], /^No,Time \(s\),Timestamp \(ms\),Altitude \(m\),Pressure \(hPa\),Temperature \(°C\),Acceleration \(g\),.*Yaw \(°\),Pitch \(°\),Roll \(°\),RSSI \(dBm\),Calibrated,Reference Set$/);
  assert.equal(lines[2], '1,1,1000,,,30,1,0,0,9.81,0,3,2,1,,true,false');
});
