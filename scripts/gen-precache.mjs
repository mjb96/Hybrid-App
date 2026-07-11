// =============================================================================
// GENERATE SERVICE-WORKER PRECACHE MANIFEST
// -----------------------------------------------------------------------------
// Rewrites the REQUIRED_ASSETS array in sw.js from the real ES-module import
// graph (scripts/module-graph.mjs) plus the fixed core/vendored assets, so the
// offline precache list can never silently drift from the code.
//
//   node scripts/gen-precache.mjs         # rewrite sw.js
//   node scripts/gen-precache.mjs --check # exit 1 if sw.js is out of date
//
// The generated list is enforced in CI by tests/precache_manifest.test.js.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reachableModules, ROOT } from './module-graph.mjs';

const CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/analytics.css',
  './css/hybrid-score.css',
  './css/programs.css',
  './css/styles.css',
  './js/vendor/leaflet/leaflet.js',
  './js/vendor/leaflet/leaflet.css',
];

export function computeRequiredAssets() {
  const js = reachableModules(['js/app.js', 'js/sw-reload.js']).map((m) => './' + m);
  return [...new Set([...CORE, ...js])].sort();
}

const SW_PATH = resolve(ROOT, 'sw.js');
const BEGIN = 'const REQUIRED_ASSETS = [';
const END = '];';

function render(assets) {
  return BEGIN + '\n' + assets.map((a) => '  ' + JSON.stringify(a) + ',').join('\n') + '\n' + END;
}

function main() {
  const check = process.argv.includes('--check');
  const src = readFileSync(SW_PATH, 'utf8');
  const start = src.indexOf(BEGIN);
  if (start < 0) throw new Error('sw.js: REQUIRED_ASSETS block not found');
  const end = src.indexOf(END, start);
  if (end < 0) throw new Error('sw.js: REQUIRED_ASSETS terminator not found');

  const next = render(computeRequiredAssets());
  const updated = src.slice(0, start) + next + src.slice(end + END.length);

  if (updated === src) {
    console.log('sw.js precache manifest is up to date.');
    return;
  }
  if (check) {
    console.error('sw.js precache manifest is STALE. Run: node scripts/gen-precache.mjs');
    process.exit(1);
  }
  writeFileSync(SW_PATH, updated);
  console.log('sw.js precache manifest regenerated.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
