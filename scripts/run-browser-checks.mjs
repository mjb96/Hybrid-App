import { spawnSync } from 'node:child_process';

const checks = [
  // First: it is the only check that publishes a non-zero safe-area inset, so a
  // regression that hides controls under the status bar surfaces before the
  // slower feature checks run.
  'scripts/safe-area-browser-check.mjs',
  'scripts/home-today-browser-check.mjs',
  'scripts/home-attribution-check.mjs',
  'scripts/progress-hub-browser-check.mjs',
  'scripts/volume-guide-browser-check.mjs',
  'scripts/strength-volume-browser-check.mjs',
  'scripts/train-landing-browser-check.mjs',
  'scripts/session-outline-browser-check.mjs',
  'scripts/set-row-browser-check.mjs',
  'scripts/rest-timer-browser-check.mjs',
  'scripts/finish-review-browser-check.mjs',
  'scripts/active-run-browser-check.mjs',
  'scripts/recovery-metric-browser-check.mjs',
  'scripts/running-analytics-check.mjs',
  'scripts/gym-performance-browser-check.mjs',
  'scripts/run-performance-browser-check.mjs',
  'scripts/recovery-performance-browser-check.mjs',
  'scripts/preview-viewport-check.mjs',
  'scripts/program-detail-viewport-check.mjs',
  'scripts/program-editor-browser-check.mjs',
  'scripts/active-program-edit-browser-check.mjs',
  'scripts/plan-recommendations-browser-check.mjs',
  'scripts/plans-active-banner-browser-check.mjs',
  'scripts/program-preview-consistency-browser-check.mjs',
  'scripts/jt-shed-simplified-browser-check.mjs',
  'scripts/workout-history-browser-check.mjs',
  'scripts/exercise-picker-browser-check.mjs',
  'scripts/copy-program-browser-check.mjs',
  'scripts/modal-accessibility-check.mjs',
  'scripts/core-ergonomics-check.mjs',
  // Last: walks all four destinations, so it is the slowest of the a11y checks
  // and the most useful to read after the feature checks have had their say.
  'scripts/touch-target-browser-check.mjs',
];

// Run EVERY check, then fail at the end.
//
// This used to exit on the first non-zero status. One environment-sensitive
// check — running-analytics-check, whose performance threshold takes ~15s on a
// slow machine against ~2s in CI — therefore hid the ~14 checks queued behind
// it, so a developer could not see the rest of the suite locally at all and had
// to rediscover each check by hand. A failure still fails the run; it just no
// longer suppresses the remaining evidence.
//
// `--bail` restores the old stop-on-first-failure behaviour for a fast local
// loop when you already know what you are looking for.
const bail = process.argv.includes('--bail');
const failed = [];
let ran = 0;

for (const check of checks) {
  console.log(`\n=== ${check} ===`);
  const result = spawnSync(process.execPath, [check, '--required'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, HELYX_BROWSER_REQUIRED: '1' },
  });
  if (result.error) throw result.error;
  ran++;
  if (result.status !== 0) {
    failed.push({ check, status: result.status || 1 });
    if (bail) break;
  }
}

if (failed.length) {
  // Counts describe what actually RAN. Reporting "N passed" for checks that were
  // never executed (the --bail case) would be the same kind of false reassurance
  // the stop-on-first-failure behaviour was hiding.
  const skipped = checks.length - ran;
  console.error(`\n${failed.length} of ${ran} browser checks run FAILED:`);
  for (const { check, status } of failed) console.error(`  ✗ ${check} (exit ${status})`);
  console.error(`${ran - failed.length} passed${skipped ? `, ${skipped} not run (--bail)` : ''}.`);
  process.exit(failed[0].status);
}

console.log(`\nAll ${checks.length} required browser checks passed.`);
