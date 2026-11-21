import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Quaternion, Vector3 } from 'three';

async function loadSource(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { SerialLogBuffer } = await loadSource('../src/data/serialLogBuffer.ts');
const { createRenderScheduler } = await loadSource('../src/visualization/renderScheduler.ts');

function frameQueue() {
  const callbacks = new Map();
  let nextId = 0;
  return {
    request(callback) { const id = ++nextId; callbacks.set(id, callback); return id; },
    cancel(id) { callbacks.delete(id); },
    get size() { return callbacks.size; },
    tick(time = 16) { const current = [...callbacks.values()]; callbacks.clear(); current.forEach(callback => callback(time)); },
  };
}

test('thousands of serial lines retain only the latest 200 entries', () => {
  const buffer = new SerialLogBuffer();
  for (let index = 0; index < 10000; index++) buffer.append(`line ${index}`);
  const history = buffer.readHistory();
  assert.equal(history.lines.length, 200);
  assert.equal(history.lines[0], 'line 9800');
  assert.equal(history.lines.at(-1), 'line 9999');
  assert.equal(buffer.readHistory(history.version), null);
  buffer.append('{"temperature":30}');
  assert.ok(buffer.readFrame().split('\n').length <= 200);
});

test('clearing history preserves the current raw frame, stopping clears both', () => {
  const buffer = new SerialLogBuffer();
  buffer.append('MPU ready'); buffer.append('{"temperature":30}');
  buffer.clearHistory();
  assert.deepEqual(buffer.readHistory().lines, []);
  assert.equal(buffer.readFrame(), 'MPU ready\n{"temperature":30}');
  buffer.clear();
  assert.equal(buffer.readFrame(), '');
  assert.deepEqual(buffer.readHistory().lines, []);
});

test('a stationary scene draws once and coalesces an input burst into one frame', () => {
  const frames = frameQueue(); let draws = 0;
  const scheduler = createRenderScheduler(() => { draws++; return false; }, frames);
  for (let i = 0; i < 100; i++) scheduler.invalidate();
  assert.equal(frames.size, 1);
  frames.tick();
  assert.equal(draws, 1);
  assert.equal(frames.size, 0);
  for (let second = 0; second < 10; second++) frames.tick(second * 1000);
  assert.equal(draws, 1);
});

test('hidden scenes stop work, resume on demand, and dispose pending frames', () => {
  const frames = frameQueue(); let draws = 0;
  const scheduler = createRenderScheduler(() => { draws++; return true; }, frames);
  scheduler.invalidate(); scheduler.setPaused(true);
  frames.tick(); assert.equal(draws, 0);
  scheduler.invalidate(); assert.equal(frames.size, 0);
  scheduler.setPaused(false); frames.tick();
  assert.equal(draws, 1); assert.equal(frames.size, 1);
  scheduler.dispose(); frames.tick(); scheduler.invalidate();
  assert.equal(draws, 1); assert.equal(frames.size, 0);
});

test('quaternion smoothing completes a turn then returns to idle', () => {
  const frames = frameQueue();
  const orientation = new Quaternion();
  const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  let draws = 0;
  const scheduler = createRenderScheduler(() => {
    draws++; orientation.slerp(target, .3);
    if (orientation.angleTo(target) < 1e-5) orientation.copy(target);
    return orientation.angleTo(target) > 1e-5;
  }, frames);
  scheduler.invalidate();
  for (let i = 0; i < 100 && frames.size; i++) frames.tick(i * 16);
  assert.ok(orientation.angleTo(target) < 1e-5);
  assert.ok(draws > 1 && draws < 100);
  assert.equal(frames.size, 0);
});
