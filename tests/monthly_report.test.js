import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyReport, reportToText } from '../js/brain/monthly-report.js';
import { addDaysISO, dateKey } from '../js/dates.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NOW = new Date('2026-07-02T12:00:00+10:00');
const TODAY = dateKey(NOW);

// Build a state with dated sessions spread across the last ~50 days.
function makeState(todayISO = TODAY) {
  const weeks = {};
  // Put logged days at known offsets using stored dates.
  const mk = (offset, vol, dist) => ({ offset, vol, dist });
  const entries = [
    mk(2, 4000, 5), mk(5, 4200, 0), mk(9, 0, 8), mk(14, 4400, 6), mk(20, 4600, 0), // current 28d
    mk(32, 3000, 4), mk(40, 3200, 5), mk(48, 0, 6),                                  // prior 28d
  ];
  entries.forEach((e, i) => {
    const wk = String(i + 1);
    const slot = DAYS[i % 7];
    const lifts = e.vol > 0 ? { [slot]: { ['L' + i]: [{ w: String(e.vol / 10), r: 10, c: true }] } } : {};
    const runs = e.dist > 0 ? { [slot]: { dist: String(e.dist), time: '30:00', rpe: '6' } } : {};
    weeks[wk] = { lifts, runs, dates: { [slot]: addDaysISO(todayISO, -e.offset) } };
  });
  const hist = [];
  for (let i = 0; i < 40; i++) hist.push({ date: addDaysISO(todayISO, -i), score: i < 28 ? 82 : 74, level: 3 });
  return {
    currentWeek: '1', weekStartedAt: todayISO,
    weeks, loadMetrics: { atl: 8, ctl: 12 },
    hybridScore: { history: hist, xp: 1500, lastRecordedDate: todayISO },
    settings: { distanceUnit: 'km' },
  };
}

test('buildMonthlyReport: 28-day totals, deltas, score avg + trend', () => {
  const r = buildMonthlyReport(makeState(), DAYS, null, NOW);
  assert.equal(r.hasData, true);
  // Current window sessions: offsets 2,5,9,14,20 = 5 distinct days.
  assert.equal(r.totals.sessions, 5);
  assert.ok(r.totals.volume > 0);
  assert.ok(r.totals.distanceKm > 0);
  // Score avg current (82) vs prior (74) → +8.
  assert.equal(r.hybridScore.avg, 82);
  assert.equal(r.hybridScore.delta, 8);
  // Volume up vs prior month → positive delta.
  assert.ok(r.deltas.volumePct > 0);
  assert.ok(['rising', 'easing', 'steady', 'building'].includes(r.fitness.trend));
});

test('reportToText: numbers-first monthly copy', () => {
  const r = buildMonthlyReport(makeState(), DAYS, null, NOW);
  const txt = reportToText(r, 'km');
  assert.match(txt, /Last 30 days on Helyx: 5 sessions/);
  assert.match(txt, /Avg Hybrid Score 82 \(\+8 vs prior month\)/);
  assert.match(reportToText({ hasData: false }), /will build as you train/);
});
