import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';

async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const [sampledSource, gridSource, telemetrySource, packetLossSource] = await Promise.all([
  compile('../src/features/telemetry/hooks/useSampledValue.ts'),
  compile('../src/features/telemetry/components/TelemetrySensorGrid.tsx'),
  compile('../src/features/telemetry/hooks/useTelemetry.ts'),
  compile('../src/data/packetLoss.ts'),
]);
function load(source, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => dependencies[name], ...globals });
  return exports;
}
function runtime() {
  let cursor = 0, now = 0, nextId = 0;
  const slots = [], effects = [], timers = new Map();
  return {
    react: {
      memo: component => component,
      useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
      useState(value) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = value;
        return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
      },
      useCallback(callback) { return callback; },
      useEffect(callback, deps) {
        const index = cursor++;
        const previous = slots[index];
        if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
          effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
        }
      },
    },
    window: {
      setInterval(callback, interval) { const id = ++nextId; timers.set(id, { callback, interval, due: now + interval }); return id; },
      clearInterval(id) { timers.delete(id); },
    },
    render(callback) { cursor = 0; const result = callback(); effects.splice(0).forEach(effect => effect()); return result; },
    advance(duration) {
      const target = now + duration;
      while (true) {
        const timer = [...timers.values()].sort((a, b) => a.due - b.due)[0];
        if (!timer || timer.due > target) break;
        now = timer.due;
        timer.due += timer.interval;
        timer.callback();
      }
      now = target;
    },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); assert.equal(timers.size, 0); },
  };
}

const point = (value, sourcePort = 'COM4') => ({
  time: value, timestampMs: value * 100, sourcePort, temperature: value, pressure: 1000 + value,
  acceleration: value / 10, gyroscope: value, altitude: value,
  accelX: value, accelY: 0, accelZ: 9.8, roll: value, pitch: value, yaw: value,
});

test('barometer follows incoming packets while gyro/accelerometer numbers and charts wait one second', t => {
  const r = runtime();
  t.after(() => r.dispose());
  const sampled = load(sampledSource, { react: r.react }, { window: r.window });
  const { TelemetrySensorGrid } = load(gridSource, {
    react: r.react, 'react/jsx-runtime': jsxRuntime,
    './SensorCard': { SensorCard: () => null }, '../hooks/useSampledValue': sampled,
    './AttitudeCard': { AttitudeCard: props => ({ props: { title: 'Attitude', ...props } }) },
    '../../../data/dummyTelemetry': { DUMMY_SOURCE: 'Dummy data' },
  });
  let latest = point(1), series = [latest];
  const render = () => Object.fromEntries(r.render(() => TelemetrySensorGrid({ latestTelemetry: latest, series, dataSource: 'COM4 · USB', darkMode: false, hasTelemetry: true }))
    .props.children.map(card => [card.props.title, card.props]));
  render();
  for (let index = 2; index <= 10; index++) {
    r.advance(100);
    latest = point(index); series = [...series, latest];
    const cards = render();
    assert.equal(cards.Pressure.value, String(1000 + index) + '.00');
    assert.equal(cards.Gyroscope.value, '1.00');
    assert.equal(cards.Accelerometer.value, '0.100');
    assert.equal(cards.Gyroscope.data.at(-1).gyroscope, 1);
  }
  r.advance(100);
  const cards = render();
  assert.equal(cards.Gyroscope.value, '10.00');
  assert.equal(cards.Accelerometer.value, '1.000');
  assert.equal(cards.Gyroscope.data.at(-1).gyroscope, 10);
  latest = point(20, 'COM5'); series = [latest];
  assert.equal(render().Gyroscope.value, '20.00', 'source switch must not show the previous sensor');
  latest = null; series = [];
  assert.equal(render().Gyroscope.value, '—');
  assert.equal(render().Accelerometer.data.length, 0);
});

test('raw telemetry, rocket orientation, timestamps and packet counts update without waiting for a UI timer', async t => {
  const r = runtime();
  t.after(() => r.dispose());
  let listener;
  const packetLoss = load(packetLossSource, {});
  const { useTelemetry } = load(telemetrySource, {
    react: r.react,
    '@tauri-apps/api/event': { listen: async (_name, callback) => { listener = callback; return () => { listener = null; }; } },
    '../../../data/dummyTelemetry': { DUMMY_SOURCE: 'Dummy data' },
    '../../../data/packetLoss': packetLoss,
  }, { window: r.window, Date });
  let connected = true;
  const render = () => r.render(() => useTelemetry({ connected, dataSource: 'COM4 · USB' }));
  render();
  await Promise.resolve();
  for (let index = 1; index <= 10; index++) {
    listener({ payload: point(index) });
    const state = render();
    assert.equal(state.packetCount, index);
    assert.equal(state.series.at(-1).yaw, index);
    assert.equal(state.series.at(-1).pressure, 1000 + index);
    assert.equal(state.series.at(-1).time, index / 10);
    assert.ok(state.receivedAt !== null);
  }
  listener({ payload: point(100, 'OTHER_PORT') });
  assert.equal(render().packetCount, 10);
  connected = false;
  render();
  listener({ payload: point(20) });
  assert.equal(render().packetCount, 10);
});
