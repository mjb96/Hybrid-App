// ==========================================
// VENDORED RUNTIME JS + CSP CONTRACT (tests/csp_vendored_runtime.test.js)
// R16: all production runtime JS is vendored into the signed bundle and served
// from 'self', so no mutable remote executable code can reach the privileged
// WebView origin and an offline launch makes zero remote-JS requests.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

function cspDirective(name) {
  const meta = html.match(/http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"/);
  assert.ok(meta, 'CSP meta tag present');
  const m = meta[1].match(new RegExp(name + '\\s+([^;]*)'));
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

test('no <script> loads from a remote origin (offline = no remote JS)', () => {
  const remote = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  const offenders = remote.filter((src) => /^(https?:)?\/\//i.test(src));
  assert.deepEqual(offenders, [], `remote <script src> found: ${offenders.join(', ')}`);
  // And every script src is a local vendored/app path.
  for (const src of remote) assert.ok(src.startsWith('./'), `non-local script src: ${src}`);
});

test('CSP script-src is exactly \'self\' (no CDN)', () => {
  assert.equal(cspDirective('script-src'), "'self'");
  // jsdelivr must be gone from connect-src too (no CDN dependency remains).
  assert.ok(!/cdn\.jsdelivr\.net/.test(html), 'jsdelivr must not appear anywhere in index.html');
});

test('vendored runtime libraries are referenced and present on disk', () => {
  for (const rel of ['js/vendor/supabase-js-2.45.4.umd.js', 'js/vendor/sentry-browser-8.55.0.min.js']) {
    assert.ok(html.includes('./' + rel), `index.html references ${rel}`);
    const p = join(ROOT, rel);
    assert.ok(existsSync(p), `${rel} exists`);
    assert.ok(statSync(p).size > 1000, `${rel} is non-trivial`);
  }
});

test('vendored Supabase matches the reviewed SRI pin (reproducible bytes)', async () => {
  const { createHash } = await import('node:crypto');
  const bytes = readFileSync(join(ROOT, 'js/vendor/supabase-js-2.45.4.umd.js'));
  const sri = 'sha384-' + createHash('sha384').update(bytes).digest('base64');
  assert.equal(sri, 'sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o');
});

test('vendored Sentry exposes Sentry.init and captureException', () => {
  const code = readFileSync(join(ROOT, 'js/vendor/sentry-browser-8.55.0.min.js'), 'utf8');
  const g = {};
  // The IIFE bundle declares a top-level `var Sentry`; return it explicitly.
  // eslint-disable-next-line no-new-func
  const Sentry = new Function('window', 'self', 'globalThis', code + '\nreturn Sentry;')(g, g, g);
  assert.equal(typeof Sentry.init, 'function');
  assert.equal(typeof Sentry.captureException, 'function');
});
