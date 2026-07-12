// =============================================================================
// PERFORMANCE GUARD — large synthetic history (2 years).
//
// Not a benchmark; a regression tripwire. Bounds are ~20× the measured cost so
// only a gross regression (e.g. an accidental full-history rescan per bar/tap)
// trips it, without flaking on a shared CI runner.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w, r });
function weekDates(m) {
  const b = new Date(m + 'T00:00:00Z'); const o = {};
  DAYS.forEach((dk, i) => { const d = new Date(b); d.setUTCDate(d.getUTCDate() + i); o[dk] = d.toISOString().slice(0, 10); });
  return o;
}
function bigState() {
  const weeks = {};
  const start = new Date('2024-01-01T00:00:00Z');
  for (let w = 1; w <= 104; w++) {
    const mon = new Date(start); mon.setUTCDate(mon.getUTCDate() + (w - 1) * 7);
    const lifts = {}, runs = {};
    DAYS.forEach((dk, i) => {
      if (i % 2 === 0) lifts[dk] = { Bench: [work(80, 5), work(80, 5), work(80, 5)], Squat: [work(120, 5), work(120, 5)] };
      else runs[dk] = { dist: String(6 + (i % 3)), time: '30:00' };
    });
    weeks[String(w)] = { dates: weekDates(mon.toISOString().slice(0, 10)), lifts, runs };
  }
  return { currentWeek: '104', settings: {}, loadMetrics: { atl: 100, ctl: 100 }, weeks };
}

test('home aggregation stays bounded on a 2-year history', () => {
  const state = bigState();
  // warm up
  computeDashboardModel(state, DAYS, null, 'mon');
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) computeDashboardModel(state, DAYS, null, 'mon');
  const perCall = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(perCall < 60, `computeDashboardModel too slow: ${perCall.toFixed(2)} ms/call`);
});

test('In Focus week switching is bounded (one week + predecessor, not full history)', () => {
  const state = bigState();
  buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: 0 });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: -(i % 50) });
  const perCall = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  assert.ok(perCall < 10, `buildWeekChart too slow: ${perCall.toFixed(3)} ms/call`);
});
