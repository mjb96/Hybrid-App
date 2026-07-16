// =============================================================================
// STAGE PRODUCTION WEB ROOT
// -----------------------------------------------------------------------------
// The ONLY things that belong in the shipped PWA / Android APK assets. Both the
// GitHub Pages deploy and the Android release copy from this allowlist so the
// build can never again ship internal audits, progress notes, SQL admin
// scripts, repo docs, test fixtures, or dev config.
//
//   node scripts/stage-web-root.mjs <destDir>
//
// Enforced by tests/web_root_allowlist.test.js.
// =============================================================================
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

// Explicit production allowlist. Files first, then directories (copied whole).
export const WEB_ROOT_ALLOWLIST = [
  'index.html',
  'manifest.json',
  'sw.js',
  'icon-512.png',
  '.nojekyll',
  'css',
  'js',
];

// Things that must NEVER be present in the staged root even if a stray copy
// tried to include them (assertion targets for the test).
export const WEB_ROOT_FORBIDDEN = [
  'docs', 'supabase', 'scripts', 'tests', 'android', '.git', '.github',
  'node_modules', 'package.json', 'package-lock.json', 'jsconfig.json',
  'PROGRESS.md', 'PRODUCT_PROGRESS.md', 'CLAUDE.md',
];

export function stageWebRoot(destDir) {
  const dest = resolve(destDir);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const entry of WEB_ROOT_ALLOWLIST) {
    const src = join(ROOT, entry);
    if (!existsSync(src)) continue; // .nojekyll may be absent locally
    const target = join(dest, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(src, target, { recursive: true });
  }
  return dest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dest = process.argv[2];
  if (!dest) { console.error('usage: node scripts/stage-web-root.mjs <destDir>'); process.exit(1); }
  stageWebRoot(dest);
  console.log(`Staged production web root → ${dest}`);
}
