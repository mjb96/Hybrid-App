// =============================================================================
// GENERATE SERVICE-WORKER PRECACHE MANIFEST
// -----------------------------------------------------------------------------
// Rewrites the REQUIRED_ASSETS array in sw.js from the real ES-module import
// graph (scripts/module-graph.mjs) plus the fixed core/vendored assets, so the
// offline precache list can never silently drift from the code.
//
// ALSO rewrites CACHE_NAME's content-hash suffix. This is a correctness fix,
// not bookkeeping: non-JS assets are served cache-first, and the browser only
// reinstalls a service worker whose BYTES changed. A commit that edited only
// CSS or index.html therefore left sw.js identical, triggered no reinstall, and
// served the old CSS/HTML from cache indefinitely while network-first JS moved
// on — a mixed-version app. Ten of the last twenty-three CSS/HTML commits
// shipped that way, including both Android status-bar fixes, which is why the
// APK looked more reliable than the PWA. Hashing asset CONTENT into CACHE_NAME
// makes any asset edit change sw.js, so the upgrade path fires on its own.
//
// The manual `helyx-vNN` prefix is preserved and still hand-bumpable; it is no
// longer load-bearing.
//
//   node scripts/gen-precache.mjs         # rewrite sw.js
//   node scripts/gen-precache.mjs --check # exit 1 if sw.js is out of date
//
// The generated list is enforced in CI by tests/precache_manifest.test.js.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { reachableModules, ROOT } from './module-graph.mjs';

const CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/analytics.css',
  './css/brand-consistency.css',
  './css/hybrid-score.css',
  './css/programs.css',
  './css/styles.css',
  './js/vendor/leaflet/leaflet.js',
  './js/vendor/leaflet/leaflet.css',
  // Vendored runtime libraries loaded via <script src> in index.html (not part of
  // the ES-module graph). Precached so an offline launch has them locally.
  './js/vendor/supabase-js-2.45.4.umd.js',
  './js/vendor/sentry-browser-8.55.0.min.js',
];

export function computeRequiredAssets() {
  // Every ROOT of the script graph, not just the module app. The classic
  // <script> tags in index.html are entry points too and nothing imports them,
  // so a graph walk from js/app.js alone cannot see them. Missing one is silent
  // and only shows up offline: js/font-css.js flips the webfont stylesheet from
  // its non-blocking media="print" to "all", so a 404 here would leave the
  // brand font permanently unapplied on exactly the offline start the precache
  // exists to serve.
  const js = reachableModules(['js/app.js', 'js/sw-reload.js', 'js/font-css.js']).map((m) => './' + m);
  return [...new Set([...CORE, ...js])].sort();
}

const SW_PATH = resolve(ROOT, 'sw.js');
const BEGIN = 'const REQUIRED_ASSETS = [';
const END = '];';

/** Marker for the generated content-hash suffix: `-h` + 12 lowercase hex. */
const HASH_SUFFIX = /-h[0-9a-f]{12}$/;
const CACHE_NAME_RE = /(const CACHE_NAME = ')([^']+)(';)/;

/**
 * Content hash over the precache set. Both the LIST and the BYTES contribute,
 * so adding, removing or editing any precached asset changes the name.
 * `./` is the navigation alias for index.html, which is hashed under its own
 * entry, so it contributes its path only.
 */
export function computeAssetHash(assets = computeRequiredAssets()) {
  const digest = createHash('sha256');
  for (const asset of assets) {
    digest.update(asset);
    digest.update('\0');
    if (asset === './') continue;
    // Read as bytes: hashing text would let a CRLF/LF normalisation change the
    // hash without changing what is actually served.
    digest.update(readFileSync(resolve(ROOT, asset.replace(/^\.\//, ''))));
    digest.update('\0');
  }
  return digest.digest('hex').slice(0, 12);
}

/** Replace (or append) the hash suffix while keeping the human `helyx-vNN` prefix. */
export function cacheNameFor(current, hash) {
  return `${current.replace(HASH_SUFFIX, '')}-h${hash}`;
}

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

  const assets = computeRequiredAssets();
  const next = render(assets);
  const withList = src.slice(0, start) + next + src.slice(end + END.length);

  // CACHE_NAME is rewritten AFTER the list, so the hash covers the same asset
  // set the file declares. sw.js is not itself precached, so this never chases
  // its own tail.
  const nameMatch = withList.match(CACHE_NAME_RE);
  if (!nameMatch) throw new Error('sw.js: CACHE_NAME declaration not found');
  const updated = withList.replace(
    CACHE_NAME_RE,
    (_all, lead, current, tail) => lead + cacheNameFor(current, computeAssetHash(assets)) + tail,
  );

  if (updated === src) {
    console.log('sw.js precache manifest is up to date.');
    return;
  }
  if (check) {
    const staleList = withList !== src;
    console.error(
      staleList
        ? 'sw.js precache manifest is STALE. Run: node scripts/gen-precache.mjs'
        : 'sw.js CACHE_NAME does not match the current asset contents — a precached\n'
          + 'asset changed without busting the offline cache, so installed clients would\n'
          + 'keep serving the old copy. Run: node scripts/gen-precache.mjs',
    );
    process.exit(1);
  }
  writeFileSync(SW_PATH, updated);
  console.log('sw.js precache manifest regenerated.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
