// Phase 8.1 / 2.5 — FIT parser is vendored locally (no remote esm.sh code in the
// privileged WebView) and works offline. See docs/archive/HARDENING_PLAN-legacy-2026-07-13.md §8.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

test('vendored FIT bundle exposes a usable FitParser + Buffer offline', async () => {
  const mod = await import('../js/vendor/fit-parser.js');
  assert.equal(typeof mod.FitParser, 'function');
  assert.equal(typeof mod.Buffer, 'function');

  const parser = new mod.FitParser({ force: true, mode: 'list' });
  assert.equal(typeof parser.parse, 'function');

  const buf = mod.Buffer.from(new Uint8Array([1, 2, 3, 4]).buffer);
  assert.equal(buf.length, 4);
});

test('invalid FIT bytes surface an error via callback (no throw)', async () => {
  const { FitParser, Buffer } = await import('../js/vendor/fit-parser.js');
  const parser = new FitParser({ force: true, mode: 'list' });
  await new Promise((resolvePromise) => {
    let calls = 0;
    parser.parse(Buffer.from(new Uint8Array([0, 0, 0]).buffer), (err) => {
      // A malformed file must report an error, never crash the import flow.
      if (++calls === 1) { assert.ok(err); resolvePromise(); }
    });
  });
});

test('garmin.js imports the local vendor bundle, not a remote CDN', () => {
  const src = readFileSync(resolve(HERE, '../js/garmin.js'), 'utf8');
  assert.match(src, /import\(['"]\.\/vendor\/fit-parser\.js['"]\)/);
  assert.doesNotMatch(src, /esm\.sh/);
  assert.doesNotMatch(src, /import\(['"]https?:/);
});
