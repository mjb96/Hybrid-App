#!/usr/bin/env node
// =============================================================================
// scripts/vendor-runtime.mjs — regenerate the vendored production runtime JS
// (Supabase + Sentry) that ships inside the signed bundle, from EXACT pinned
// npm versions. Run: `node scripts/vendor-runtime.mjs`
//
// Why vendored (R16): the app HTML is loaded from the privileged WebView origin
// (appassets/androidplatform.net) which has native-bridge access. Loading
// runtime JS from a CDN there means remote code runs with that privilege. We
// therefore ship the exact pinned code in the bundle and set CSP `script-src
// 'self'`, so an offline launch makes zero remote-JS requests and no mutable
// remote code can reach the privileged origin.
//
// Reproducible: Supabase is copied byte-for-byte from the npm tarball's UMD
// build (its SHA-384 is asserted against the historical SRI pin). Sentry has no
// standalone bundle in its npm tarball, so we build one with esbuild from the
// pinned @sentry/browser, exporting only the two entry points the app uses
// (init, captureException) as a `window.Sentry` global.
// =============================================================================
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'js', 'vendor');

const SUPABASE = { pkg: '@supabase/supabase-js', version: '2.45.4' };
const SENTRY = { pkg: '@sentry/browser', version: '8.55.0' };

// Historical SRI pin for the Supabase UMD (was the CDN integrity= value). The
// vendored bytes MUST still match it, proving we shipped the reviewed code.
const SUPABASE_SRI = 'sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o';

function sriSha384(buf) {
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}

const work = mkdtempSync(join(tmpdir(), 'helyx-vendor-'));
try {
  writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'helyx-vendor-build', private: true }));
  console.log(`Installing ${SUPABASE.pkg}@${SUPABASE.version} and ${SENTRY.pkg}@${SENTRY.version} …`);
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent',
    `${SUPABASE.pkg}@${SUPABASE.version}`, `${SENTRY.pkg}@${SENTRY.version}`],
    { cwd: work, stdio: 'inherit' });

  mkdirSync(VENDOR, { recursive: true });

  // ── Supabase: copy the exact UMD build, assert its hash ──────────────────
  const supSrc = join(work, 'node_modules', SUPABASE.pkg, 'dist', 'umd', 'supabase.js');
  const supBytes = readFileSync(supSrc);
  const supHash = sriSha384(supBytes);
  if (supHash !== SUPABASE_SRI) {
    throw new Error(`Supabase SRI mismatch!\n  got:      ${supHash}\n  expected: ${SUPABASE_SRI}`);
  }
  const supOut = join(VENDOR, `supabase-js-${SUPABASE.version}.umd.js`);
  copyFileSync(supSrc, supOut);
  console.log(`Supabase → ${supOut}  (${supBytes.length} bytes, ${supHash} ✓)`);

  // ── Sentry: build a minimal window.Sentry IIFE from the pinned package ───
  const entry = join(work, 'sentry-entry.js');
  writeFileSync(entry, "export { init, captureException } from '@sentry/browser';\n");
  const sentryOut = join(VENDOR, `sentry-browser-${SENTRY.version}.min.js`);
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName: 'Sentry',
    minify: true,
    platform: 'browser',
    legalComments: 'none',
    outfile: sentryOut,
    absWorkingDir: work,
  });
  const sentryBytes = readFileSync(sentryOut);
  console.log(`Sentry   → ${sentryOut}  (${sentryBytes.length} bytes, ${sriSha384(sentryBytes)})`);

  console.log('\nDone. Commit js/vendor/*.js and re-run `node scripts/gen-precache.mjs`.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
