// ==========================================
// PRODUCTION WEB-ROOT ALLOWLIST TEST (tests/web_root_allowlist.test.js)
// ------------------------------------------
// Proves the staged production web root (what ships in the PWA + Android APK)
// contains the required runtime assets and NONE of the internal/dev files
// (audits, progress notes, SQL admin scripts, tests, docs, package/config).
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { existsSync, rmSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stageWebRoot, WEB_ROOT_FORBIDDEN } from '../scripts/stage-web-root.mjs';

const dest = mkdtempSync(join(tmpdir(), 'helyx-webroot-'));
stageWebRoot(dest);
after(() => { try { rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ } });

test('required runtime assets are staged', () => {
  for (const f of ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'js/app.js', 'js/vendor/leaflet/leaflet.js']) {
    assert.ok(existsSync(join(dest, f)), `missing required asset in web root: ${f}`);
  }
});

test('no internal / dev / sensitive files leak into the shipped root', () => {
  for (const f of WEB_ROOT_FORBIDDEN) {
    assert.ok(!existsSync(join(dest, f)), `forbidden file present in shipped web root: ${f}`);
  }
});

test('no markdown or SQL files anywhere in the staged root', () => {
  // Walk the staged tree and assert nothing sensitive slipped in via a subdir.
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else assert.ok(!/\.(md|sql)$/i.test(name), `sensitive file in shipped root: ${p}`);
    }
  };
  walk(dest);
});
