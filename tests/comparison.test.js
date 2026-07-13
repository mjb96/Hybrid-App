// =============================================================================
// COMPARISON DESCRIPTIONS — value + label always describe the same periods.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonLabel, statComparisonFrom, COMPARISON_LABELS } from '../js/analytics/comparison.js';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w, r });
function weekDates(mondayISO) {
  const base = new Date(mondayISO + 'T00:00:00Z');
  const out = {};
  DAY_KEYS.forEach((dk, i) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + i); out[dk] = d.toISOString().slice(0, 10); });
  return out;
}

test('labels: current week is live, completed week is previous', () => {
  assert.equal(comparisonLabel(true), 'vs same point last week');
  assert.equal(comparisonLabel(false), 'vs previous week');
  assert.equal(COMPARISON_LABELS.live, 'vs same point last week');
  assert.equal(COMPARISON_LABELS.completed, 'vs previous week');
});

test('current partial week: stat card gets the live label and an elapsed-matched pct', () => {
  const state = {
    currentWeek: '2', settings: {},
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(50, 5), work(50, 5)] }, wed: { A: [work(50, 5), work(50, 5)] }, fri: { A: [work(50, 5), work(50, 5)] } } }, // Mon2 Wed2 Fri2
      '2': { dates: weekDates('2026-06-08'), lifts: { mon: { A: [work(50, 5), work(50, 5), work(50, 5)] } } }, // Mon 3
    },
  };
  // today = Wed → elapsed Mon..Wed. current sets = Mon 3. prev elapsed Mon+Wed = 2+2 = 4.
  const chart = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: '2026-06-10' });
  const cmp = statComparisonFrom(chart);
  assert.equal(cmp.sub, 'vs same point last week');
  assert.equal(cmp.isComparable, true);
  // (3 - 4)/4 = -25%
  assert.equal(cmp.deltaPct, -25);
});

test('completed week: stat card gets the previous-week label and full-vs-full pct', () => {
  const state = {
    currentWeek: '3', settings: {},
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(50, 5), work(50, 5)] } } }, // 2
      '2': { dates: weekDates('2026-06-08'), lifts: { mon: { A: [work(50, 5), work(50, 5), work(50, 5)] } } }, // 3
    },
  };
  // today in the week after week 2 → weekOffset -1 lands on week 2 (Jun 8–14).
  const chart = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: '2026-06-18' });
  const cmp = statComparisonFrom(chart);
  assert.equal(cmp.sub, 'vs previous week');
  assert.equal(cmp.deltaPct, 50); // (3-2)/2
});

test('non-comparable (no prior / zero denominator) → null delta, honest label, never NaN', () => {
  const noPrior = buildWeekChart({ currentWeek: '1', weeks: { '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(50, 5)] } } } } },
    { type: 'strength', metric: 'sets', today: '2026-06-01' });
  const c1 = statComparisonFrom(noPrior);
  assert.equal(c1.deltaPct, null);
  assert.equal(c1.isComparable, false);
  assert.equal(c1.sub, 'vs same point last week');

  const zeroPrev = buildWeekChart({ currentWeek: '2', weeks: {
    '1': { dates: weekDates('2026-06-01'), lifts: {} },
    '2': { dates: weekDates('2026-06-08'), lifts: { mon: { A: [work(50, 5)] } } },
  } }, { type: 'strength', metric: 'sets', today: '2026-06-08' });
  const c2 = statComparisonFrom(zeroPrev);
  assert.equal(c2.deltaPct, null); // never Infinity
});
