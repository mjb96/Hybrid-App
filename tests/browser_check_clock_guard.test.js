// =============================================================================
// BROWSER CHECKS MUST NOT DEPEND ON THE DAY OF THE WEEK
//
// This defect class has now bitten three times, each time as a red `main` that
// looked like a code regression and was not:
//
//   • finish-review    — threw "no prescribed lift for sat" on a Saturday;
//   • jt-shed-simplified — silently SKIPPED its assertion on Wed/Sun;
//   • train-landing + active-run — failed on a Sunday, because the default
//     programme rests on Sunday and the landing offers a wellness check-in
//     rather than a workout.
//
// The cause is always the same: a check derives the weekday from the wall clock
// and then assumes the programme has a session on it. The fix is always the same
// too — pin the clock with `pinClock` (scripts/browser-runtime.mjs).
//
// Fixing them one at a time did not stop it happening, so this guards the class
// instead. A check that reads a weekday from the clock must pin the clock.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

/** Deriving a weekday index — `…getDay()` / `…getUTCDay()` — from a Date. */
const WEEKDAY_READ = /\.get(?:UTC)?Day\s*\(\s*\)/;
/** A Date built from the real clock rather than from a fixed string. */
const WALL_CLOCK = /new Date\(\s*\)|Date\.now\s*\(\s*\)|format\(new Date\(\s*\)\)/;

/** Source with `//` comments stripped — a comment ABOUT the pattern is not the
 *  pattern, and describing a bug you removed must not re-flag it. */
function stripComments(source) {
  return source.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
}

function checkScripts() {
  return readdirSync(SCRIPTS)
    .filter((name) => name.endsWith('-check.mjs'))
    .map((name) => ({ name, source: stripComments(readFileSync(path.join(SCRIPTS, name), 'utf8')) }));
}

// Checks that read a weekday from the clock and have NOT yet been pinned. This
// list may only ever shrink: it exists so the class stops GROWING while the
// backlog is worked off, not to bless it. Each of these is a latent red `main`
// on whichever weekday its fixture programme happens to rest.
const UNPINNED_BACKLOG = [
  'gym-performance-browser-check.mjs',
  'home-attribution-check.mjs',
  'progress-hub-browser-check.mjs',
  'run-performance-browser-check.mjs',
  'running-analytics-check.mjs',
  'strength-volume-browser-check.mjs',
  'volume-guide-browser-check.mjs',
];

test('a browser check that reads a weekday from the clock must pin the clock', () => {
  const offenders = [];
  for (const { name, source } of checkScripts()) {
    if (!WEEKDAY_READ.test(source)) continue;
    // Reading a weekday is fine when the date it reads is fixed. The failure is
    // reading it from the real clock without pinning the page's clock too.
    if (!WALL_CLOCK.test(source)) continue;
    if (source.includes('pinClock')) continue;
    if (UNPINNED_BACKLOG.includes(name)) continue;
    offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    'These derive a weekday from the wall clock without pinning it, so they pass '
    + 'or fail depending on the day CI happens to run:\n  '
    + offenders.join('\n  ')
    + '\nImport `pinClock` from ./browser-runtime.mjs and add '
    + '`await context.addInitScript(pinClock, CLOCK)` before the first navigation.');
});

test('the unpinned backlog only ever shrinks', () => {
  // A name left here after its check was pinned would quietly re-open the hole.
  const stale = UNPINNED_BACKLOG.filter((name) => {
    const found = checkScripts().find((s) => s.name === name);
    return !found || found.source.includes('pinClock') || !WEEKDAY_READ.test(found.source);
  });
  assert.deepEqual(stale, [], `${stale.join(', ')}: pinned or gone — remove from UNPINNED_BACKLOG`);
});

test('a check must not quietly skip its assertion on some days', () => {
  // The jt-shed-simplified failure mode: guarding the main assertion with a
  // lookup keyed by today's weekday, so on a rest day it asserted nothing and
  // still reported success. Silence is the worst outcome — worse than a crash,
  // which at least gets fixed.
  const offenders = [];
  for (const { name, source } of checkScripts()) {
    if (/if\s*\(\s*expected\w*\[\s*today\w*\s*\]\s*\)/.test(source)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `${offenders.join(', ')}: assertion is gated on today's weekday. Pin the clock `
    + 'and assert unconditionally — a check that stops asserting still reports a pass.');
});

test('the guard can actually see the scripts it is guarding', () => {
  // Cheap sanity: a typo in the directory or suffix would make both tests above
  // pass by examining nothing at all.
  const names = checkScripts().map((s) => s.name);
  assert.ok(names.length >= 20, `expected the browser-check suite, found ${names.length}`);
  assert.ok(names.includes('train-landing-browser-check.mjs'));
  assert.ok(names.includes('jt-shed-simplified-browser-check.mjs'));
});
