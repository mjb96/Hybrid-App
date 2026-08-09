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
import { computeRequiredAssets, computeAssetHash, cacheNameFor } from '../scripts/gen-precache.mjs';

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
  const reachable = reachableModules(scriptRoots()).map((m) => './' + m);
  const missing = reachable.filter((m) => !cached.has(m));
  assert.deepEqual(missing, [], `Modules reachable at runtime but NOT precached (offline break):\n${missing.join('\n')}`);
});

/** Every local script index.html loads, module or classic, as a graph root. */
function scriptRoots() {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const roots = new Set(['js/app.js']);
  for (const m of html.matchAll(/<script[^>]*src="\.\/(js\/[^"]+)"/g)) roots.add(m[1]);
  return [...roots].filter((p) => !p.includes('/vendor/'));
}

test('classic <script> entry points are precache roots too', () => {
  // A graph walk from js/app.js cannot see a classic <script> — nothing imports
  // it. js/font-css.js was added to index.html and silently left out of the
  // precache, which only breaks OFFLINE: the file 404s, the webfont stylesheet
  // stays at its non-blocking media="print", and the brand font never applies
  // on precisely the start the precache exists to serve. Derive the roots from
  // the markup instead of maintaining a second hand-written list.
  const cached = new Set(requiredAssetsInSw());
  const missing = scriptRoots().map((p) => './' + p).filter((p) => !cached.has(p));
  assert.deepEqual(missing, [],
    `index.html loads these but they are not precached (offline 404):\n${missing.join('\n')}`);
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

// ── Cache busting ────────────────────────────────────────────────────────────
// Non-JS assets are served cache-first, and a browser only reinstalls a service
// worker whose BYTES changed. So a commit that edited only CSS or index.html
// used to leave sw.js identical: no reinstall, no re-addAll, and installed
// clients kept serving the old CSS forever while network-first JS moved on.
// Ten of the last twenty-three CSS/HTML commits shipped exactly that way —
// including both Android status-bar fixes, which is why the APK (which rebuilds
// its bundled assets every time) looked more reliable than the PWA.
// CACHE_NAME now carries a hash of the precached CONTENT, so any asset edit
// changes sw.js and the upgrade fires on its own.

function cacheNameInSw() {
  const m = SW_SRC.match(/const CACHE_NAME = '([^']+)';/);
  assert.ok(m, 'sw.js CACHE_NAME declaration not found');
  return m[1];
}

test('CACHE_NAME carries a content hash of the precached assets', () => {
  assert.match(
    cacheNameInSw(),
    /-h[0-9a-f]{12}$/,
    'CACHE_NAME must end in a generated -h<hash> suffix — without it, a CSS-only ' +
      'change never busts the offline cache',
  );
});

test('CACHE_NAME matches the CURRENT asset contents', () => {
  const actual = cacheNameInSw();
  const expected = cacheNameFor(actual, computeAssetHash());
  assert.equal(
    actual,
    expected,
    'A precached asset changed without busting the offline cache, so installed clients ' +
      'would keep serving the old copy. Run: node scripts/gen-precache.mjs',
  );
});

test('the content hash actually responds to asset content, not just the file list', () => {
  // The failure mode worth guarding: a hash computed from filenames alone would
  // be stable across every CSS edit, i.e. exactly as broken as no hash at all.
  const assets = computeRequiredAssets();
  const real = computeAssetHash(assets);
  // Same list, one asset's bytes swapped for another's -> a different digest.
  const shuffled = [...assets].reverse();
  assert.notEqual(
    computeAssetHash(shuffled),
    real,
    'asset ORDER must contribute to the hash',
  );
  assert.match(real, /^[0-9a-f]{12}$/, 'hash must be 12 lowercase hex characters');
});

test('SW install is atomic and activate validates before purging old caches', () => {
  // These invariants are what keep a failed upgrade from stranding the user on a
  // half-cached app. Assert the guarding code is present rather than silently
  // regressing to fire-and-forget caching.
  assert.match(SW_SRC, /cache\.addAll\(REQUIRED_ASSETS\)/, 'required assets must be cached atomically via addAll');
  assert.match(SW_SRC, /cacheIsComplete/, 'activate must validate cache completeness before purging');
  assert.match(SW_SRC, /keeping previous cache/, 'must keep previous cache when the new one is incomplete');
});
