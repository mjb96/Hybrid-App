// ==========================================
// SESSION COMPARISON (tests/session_compare.test.js)
// "This week's Push vs last week's Push" at the exercise level — top set +
// total tonnage, aligned by the same weekday across weeks.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeSessionLifts, compareSessionToPrevWeek } from '../js/analytics/calculations/session-compare.js';

const set = (w, r, c = true, type = '') => ({ w: String(w), r: String(r), c, type });

const weeks = {
  '1': { lifts: { mon: {
    'Bench Press': [set(60, 5, true, 'W'), set(100, 5), set(100, 5), set(95, 6)], // warmup ignored
    'Row': [set(70, 8), set(70, 8)],
  } } },
  '2': { lifts: { mon: {
    'Bench Press': [set(60, 5, true, 'W'), set(102.5, 5), set(102.5, 5), set(100, 6)],
    'Overhead Press': [set(50, 6), set(50, 6)],
  } } },
};

test('summarizeSessionLifts uses the heaviest working set and excludes warm-ups', () => {
  const s = summarizeSessionLifts(weeks['2'], 'mon');
  assert.equal(s.lifts['Bench Press'].topWeight, 102.5);
  assert.equal(s.lifts['Bench Press'].topReps, 5);
  // 102.5×5 + 102.5×5 + 100×6 = 1625 (60×5 warm-up excluded)
  assert.equal(s.lifts['Bench Press'].volume, 1625);
  assert.equal(s.totalVolume, 2225);
});

test('compareSessionToPrevWeek deltas the same lift across weeks', () => {
  const c = compareSessionToPrevWeek(weeks, '2', 'mon');
  assert.equal(c.hasPrev, true);
  assert.equal(c.prevWeek, 1);
  const bench = c.rows.find(r => r.name === 'Bench Press');
  assert.equal(bench.topWeightDelta, 2.5);   // 102.5 vs 100
  assert.equal(bench.volumeDelta, 55);        // 1625 vs 1570
});

test('added and dropped lifts surface with null deltas (no false comparison)', () => {
  const c = compareSessionToPrevWeek(weeks, '2', 'mon');
  const ohp = c.rows.find(r => r.name === 'Overhead Press');
  assert.ok(ohp.cur && ohp.prev === null);   // new this week
  assert.equal(ohp.topWeightDelta, null);
  const row = c.rows.find(r => r.name === 'Row');
  assert.ok(row.cur === null && row.prev);    // trained last week, not this week
  assert.equal(row.volumeDelta, null);
});

test('current-session lifts are ordered first, then last-week-only lifts', () => {
  const c = compareSessionToPrevWeek(weeks, '2', 'mon');
  assert.deepEqual(c.rows.map(r => r.name), ['Bench Press', 'Overhead Press', 'Row']);
});

test('week 1 has no previous week to compare against', () => {
  const c = compareSessionToPrevWeek(weeks, '1', 'mon');
  assert.equal(c.hasPrev, false);
});

test('handles a missing/empty session without throwing', () => {
  assert.deepEqual(summarizeSessionLifts(undefined, 'mon'), { lifts: {}, totalVolume: 0 });
  assert.equal(compareSessionToPrevWeek({}, '3', 'tue').hasPrev, false);
});
