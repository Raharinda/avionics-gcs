import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { createServer, createRunnableDevEnvironment } from 'vite';

test('dashboard markup and stylesheet match the reviewed layout', { timeout: 15000 }, async () => {
  const stylesheet = await readFile(new URL('../src/App.css', import.meta.url));
  assert.equal(createHash('sha256').update(stylesheet).digest('hex'), 'be794808878a5994e70001cee12c135b8a36def38fb338c747032b18a258702b');
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-16T07:00:00Z'])); }
    static now() { return new RealDate('2026-11-16T07:00:00Z').getTime(); }
  };
  const server = await createServer({
    configFile: false, appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    environments: { client: { dev: { createEnvironment: (name, config) => createRunnableDevEnvironment(name, config, { hot: false, disableDepsOptimizer: true }) } } },
  });
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.tsx');
    const markup = await new Promise((resolve, reject) => {
      let html = '';
      const output = new Writable({ write(chunk, _encoding, callback) { html += chunk; callback(); } });
      output.on('finish', () => resolve(html));
      output.on('error', reject);
      const rendering = renderToPipeableStream(createElement(App), {
        onAllReady() { rendering.pipe(output); }, onError: reject,
      });
    });
    const normalize = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><');
    const baseline = await readFile(new URL('./fixtures/dashboard-markup.html', import.meta.url), 'utf8');
    assert.equal(normalize(markup), normalize(baseline));
  } finally { await server.close(); globalThis.Date = RealDate; }
});
