// ==========================================
// SERVICE-WORKER PRECACHE MANIFEST TEST (tests/precache_manifest.test.js)
// ------------------------------------------
// Guards the offline experience: every production module that is reachable from
// the app's ES-module import graph MUST be in the service worker's
// REQUIRED_ASSETS list, or it would 404 offline (the exact class of bug that
// left program-compare, substitutions, coaching and plate tools uncached).
//
// Also asserts the SW keeps a working cache during a failed/partial upgrade.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { reachableModules, ROOT } from '../scripts/module-graph.mjs';
import { computeRequiredAssets } from '../scripts/gen-precache.mjs';

const SW_SRC = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');

// Pull the entries out of the REQUIRED_ASSETS array literal in sw.js.
function requiredAssetsInSw() {
  const start = SW_SRC.indexOf('const REQUIRED_ASSETS = [');
  const end = SW_SRC.indexOf('];', start);
  const block = SW_SRC.slice(start, end);
  return [...block.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
}

test('every reachable production module is in the SW precache', () => {
  const cached = new Set(requiredAssetsInSw());
  const reachable = reachableModules(['js/app.js', 'js/sw-reload.js']).map((m) => './' + m);
  const missing = reachable.filter((m) => !cached.has(m));
  assert.deepEqual(missing, [], `Modules reachable at runtime but NOT precached (offline break):\n${missing.join('\n')}`);
});

test('previously-uncached feature modules are now covered', () => {
  const cached = new Set(requiredAssetsInSw());
  // Regression list — the concrete modules the audit found missing.
  for (const m of [
    './js/programs/compare.js',
    './js/programs/compare-ui.js',
    './js/workout/substitutions.js',
    './js/workout/plates.js',
    './js/brain/coach-qa.js',
    './js/programs/timeline.js',
    './js/onboarding/starter-programs.js',
  ]) {
    assert.ok(cached.has(m), `${m} must be precached for offline use`);
  }
});

test('SW precache matches the generator (not hand-drifted)', () => {
  const expected = computeRequiredAssets();
  const actual = requiredAssetsInSw();
  assert.deepEqual(actual, expected, 'sw.js REQUIRED_ASSETS is stale — run: node scripts/gen-precache.mjs');
});

test('no precached asset points at a missing file', () => {
  for (const asset of requiredAssetsInSw()) {
    if (asset === './') continue;
    const p = resolve(ROOT, asset.replace(/^\.\//, ''));
    assert.ok(existsSync(p), `Precached asset does not exist on disk: ${asset}`);
  }
});

test('SW install is atomic and activate validates before purging old caches', () => {
  // These invariants are what keep a failed upgrade from stranding the user on a
  // half-cached app. Assert the guarding code is present rather than silently
  // regressing to fire-and-forget caching.
  assert.match(SW_SRC, /cache\.addAll\(REQUIRED_ASSETS\)/, 'required assets must be cached atomically via addAll');
  assert.match(SW_SRC, /cacheIsComplete/, 'activate must validate cache completeness before purging');
  assert.match(SW_SRC, /keeping previous cache/, 'must keep previous cache when the new one is incomplete');
});
