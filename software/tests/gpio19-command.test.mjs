import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('../src/data/gpio19Command.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function mount(send = async () => {}) {
  const exports = {}, timers = new Map(), commands = [], states = [];
  let timerId = 0, requestId = 0;
  vm.runInNewContext(source, { exports,
    setTimeout(cb) { const id = ++timerId; timers.set(id, cb); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const command = new exports.Gpio19Command(async line => { commands.push(line); await send(line); },
    state => states.push(state), () => (++requestId).toString(16).padStart(16, '0'));
  return { command, commands, states, timers,
    get state() { return states.at(-1); },
    ack(line = commands.at(-1)) { command.receive(line.replace('D19_CMD:', 'D19_ACK:')); },
    timeout() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(cb => cb()); },
  };
}

test('duration is bounded on the shipped controller; only the matching remote ACK completes FIRE', async () => {
  const h = mount();
  await h.command.fire(200); assert.equal(h.commands.length, 0, 'requires local arming');
  h.command.arm();
  for (const invalid of [0, -1, 10001, 1.5, NaN, Infinity]) await h.command.fire(invalid);
  assert.equal(h.commands.length, 0);
  await h.command.fire(200);
  assert.match(h.commands[0], /^D19_CMD:[0-9a-f]{16}:200$/);
  assert.equal(h.state.state, 'firing');
  h.command.receive(h.commands[0].replace('D19_CMD:', 'D19_SENT:'));
  assert.equal(h.state.sent, true); assert.equal(h.state.state, 'firing');
  h.command.receive('D19_ACK:aaaaaaaaaaaaaaaa:200');
  h.command.receive(h.commands[0].replace('D19_CMD:', 'D19_ACK:').replace(':200', ':201'));
  assert.equal(h.state.state, 'firing');
  h.ack(); assert.equal(h.state.state, 'complete'); assert.match(h.state.message, /200 ms/);
  h.timeout(); assert.equal(h.state.state, 'complete');
});

test('Reset sends LOW, replaces a pending FIRE, and rejects its late ACK or rejected send', async () => {
  let rejectFire;
  const h = mount(line => line.endsWith(':500') ? new Promise((_, reject) => { rejectFire = reject; }) : Promise.resolve());
  h.command.arm(); const firing = h.command.fire(500);
  const old = h.commands[0];
  await h.command.reset(); assert.match(h.commands.at(-1), /:0$/);
  const count = h.commands.length; await h.command.reset(); assert.equal(h.commands.length, count);
  h.ack(old); assert.equal(h.state.state, 'firing');
  rejectFire(new Error('old failure')); await firing; assert.equal(h.state.state, 'firing');
  h.ack(); assert.equal(h.state.state, 'safe');
  h.command.arm(); h.command.disarm(); assert.equal(h.state.state, 'safe');
});

test('timeouts and radio/USB errors never fabricate success, and disposal cancels outstanding timers', async () => {
  const h = mount(); h.command.arm(); await h.command.fire(1); h.timeout();
  assert.equal(h.state.state, 'error');
  h.ack(); assert.equal(h.state.state, 'error');
  await h.command.reset();
  h.command.receive(h.commands.at(-1).replace('D19_CMD:', 'D19_ERROR:').replace(/:\d+$/, ':TIMEOUT'));
  assert.equal(h.state.state, 'error');
  await h.command.reset(); h.ack(); h.command.arm(); await h.command.fire(10000);
  h.command.dispose(); assert.equal(h.timers.size, 0);
  h.ack(); assert.equal(h.state.state, 'firing', 'disposed request cannot complete in another session');
  const failing = mount(async () => { throw new Error('USB disconnected'); });
  failing.command.arm(); await failing.command.fire(200);
  assert.equal(failing.state.state, 'error'); assert.equal(failing.timers.size, 0);
});
