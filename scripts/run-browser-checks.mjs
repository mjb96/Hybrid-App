import { spawnSync } from 'node:child_process';

const checks = [
  'scripts/home-attribution-check.mjs',
  'scripts/running-analytics-check.mjs',
  'scripts/gym-performance-browser-check.mjs',
  'scripts/run-performance-browser-check.mjs',
  'scripts/recovery-performance-browser-check.mjs',
  'scripts/preview-viewport-check.mjs',
  'scripts/program-detail-viewport-check.mjs',
  'scripts/program-editor-browser-check.mjs',
  'scripts/active-program-edit-browser-check.mjs',
  'scripts/program-preview-consistency-browser-check.mjs',
  'scripts/jt-shed-simplified-browser-check.mjs',
  'scripts/exercise-picker-browser-check.mjs',
  'scripts/copy-program-browser-check.mjs',
  'scripts/modal-accessibility-check.mjs',
  'scripts/core-ergonomics-check.mjs',
];

for (const check of checks) {
  console.log(`\n=== ${check} ===`);
  const result = spawnSync(process.execPath, [check, '--required'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, HELYX_BROWSER_REQUIRED: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\nAll required browser checks passed.');
