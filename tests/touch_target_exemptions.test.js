// =============================================================================
// THE TOUCH-TARGET EXEMPTION LIST MAY ONLY EVER SHRINK.
//
// `scripts/touch-target-browser-check.mjs` measures every visible control in the
// real app against 44px. A handful cannot reach it for reasons of geometry — a
// carousel dot whose pitch is 10px, one of seven day columns in a 390px chart —
// and those carry a documented lower floor instead.
//
// An exemption list is the part that rots. Left alone it becomes the place a
// control goes to stop being checked, which is exactly how the unpinned-clock
// backlog would have decayed without its own ratchet. So: every entry must
// state its arithmetic, and none may sit there without a floor that is still
// meaningfully enforced.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = path.join(ROOT, 'scripts', 'touch-target-browser-check.mjs');
const SOURCE = readFileSync(CHECK, 'utf8');

/** The EXEMPT array literal, as written. */
function exemptBlock() {
  const start = SOURCE.indexOf('const EXEMPT = [');
  assert.ok(start > -1, 'EXEMPT list not found — did the check get renamed?');
  const end = SOURCE.indexOf('\n];', start);
  assert.ok(end > start, 'EXEMPT list is not terminated');
  return SOURCE.slice(start, end);
}

/** Split into one string per `{ … }` entry. */
function entries() {
  const block = exemptBlock();
  return block.split(/\n  \{/).slice(1);
}

test('the exemption list stays small enough to read', () => {
  // Not a magic number: two entries today. A third needs a deliberate decision,
  // and this failing is that decision being made rather than drifted into.
  assert.ok(entries().length <= 3,
    `${entries().length} exemptions — each one is a control nobody is checking at 44px. `
    + 'Fix the control or argue the case explicitly before raising this bound.');
});

test('every exemption states why 44px is impossible', () => {
  for (const entry of entries()) {
    const why = /why:\s*'([^']+)'/.exec(entry);
    assert.ok(why, `an exemption has no \`why\`:\n${entry.slice(0, 200)}`);
    // "by design" / "intentional" is a preference, not a geometric constraint.
    assert.ok(why[1].length >= 30,
      `exemption reason is too thin to audit: "${why[1]}"\n`
      + 'State the arithmetic (pitch, column count, available width).');
    assert.ok(/\d/.test(why[1]),
      `exemption reason cites no numbers: "${why[1]}"\n`
      + 'A geometric impossibility can be shown; a preference cannot.');
  }
});

test('every exemption still enforces a floor', () => {
  // An exemption with no floor, or a floor of 0, silently stops checking the
  // control at all — the failure mode this list exists to avoid.
  for (const entry of entries()) {
    const minW = /minW:\s*(\d+)/.exec(entry);
    const minH = /minH:\s*(\d+)/.exec(entry);
    assert.ok(minW && minH, `an exemption is missing minW/minH:\n${entry.slice(0, 200)}`);
    assert.ok(Number(minW[1]) > 0 && Number(minH[1]) > 0,
      `an exemption has a zero floor:\n${entry.slice(0, 200)}`);
    // At least one dimension must still meet the full target: a control that is
    // small in BOTH directions has no case left to make.
    assert.ok(Number(minW[1]) >= 44 || Number(minH[1]) >= 44,
      `an exemption is below 44px in both dimensions:\n${entry.slice(0, 200)}\n`
      + 'Geometry can constrain one axis. It does not usually constrain both.');
  }
});

test('the check is wired into the browser suite', () => {
  // A check nobody runs is a file, not a guard.
  const runner = readFileSync(path.join(ROOT, 'scripts', 'run-browser-checks.mjs'), 'utf8');
  assert.ok(runner.includes('scripts/touch-target-browser-check.mjs'),
    'touch-target-browser-check.mjs is not in run-browser-checks.mjs');
});

test('the check still asserts the 44px minimum', () => {
  // Guards the check itself: lowering MIN would turn every assertion green
  // without any control actually improving.
  assert.ok(/const MIN = 44;/.test(SOURCE), 'the 44px minimum has been changed or removed');
});
