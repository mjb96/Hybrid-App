// ==========================================
// PLATE MATH TEST (tests/plates.test.js)
// C4b — per-side plate breakdown. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computePlateBreakdown, formatPlates, plateHint } from '../js/workout/plates.js';

test('breaks a standard kg load into plates per side', () => {
  // 100kg on a 20kg bar → 40 per side → 25 + 15
  const bd = computePlateBreakdown(100, 20);
  assert.equal(bd.exact, true);
  assert.deepEqual(bd.perSide, [{ plate: 25, count: 1 }, { plate: 15, count: 1 }]);
  assert.equal(formatPlates(bd), '25 + 15');
});

test('handles a 2.5kg-increment load', () => {
  // 65kg → 22.5 per side → 20 + 2.5
  assert.equal(plateHint(65, 'kg'), '20 + 2.5 / side');
});

test('bar-only and below-bar are stated, not mis-plated', () => {
  assert.equal(computePlateBreakdown(20, 20).barOnly, true);
  assert.equal(formatPlates(computePlateBreakdown(20, 20)), 'bar only');
  assert.equal(plateHint(15, 'kg'), ''); // below the bar → no hint
});

test('flags a load the standard plates cannot hit exactly', () => {
  // 21kg → 0.5 per side, no plate that small → not exact, leftover reported
  const bd = computePlateBreakdown(21, 20);
  assert.equal(bd.exact, false);
  assert.ok(bd.leftover > 0);
});

test('lb bar and plates', () => {
  // 135lb on a 45lb bar → 45 per side → one 45
  assert.equal(plateHint(135, 'lb'), '45 / side');
});
