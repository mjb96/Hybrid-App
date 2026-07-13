// =============================================================================
// HOME / DETAIL / BRAIN CONSISTENCY + briefing de-duplication
//
// 1. The In Focus week-chart model, the dashboard-model week roll-up and the
//    load-model series must agree on the same weekly aggregates (one source of
//    truth). 2. The morning briefing suppresses its own load coach line when the
//    overtraining escalation card is on screen (no duplicate red messages) and
//    otherwise attaches concrete evidence.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';
import { strengthLoadSeries, enduranceLoadSeries } from '../js/brain/load_models.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { buildMorningBriefing } from '../js/brain/morning-briefing.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w, r });
const warm = (w, r) => ({ c: true, w, r, type: 'W' });
function weekDates(mondayISO) {
  const base = new Date(mondayISO + 'T00:00:00Z');
  const out = {};
  DAY_KEYS.forEach((dk, i) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + i); out[dk] = d.toISOString().slice(0, 10); });
  return out;
}

function state3wk() {
  return {
    currentWeek: '3',
    settings: { weightUnit: 'kg', distanceUnit: 'km' },
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [warm(40, 10), work(100, 5), work(100, 5)] } }, runs: { tue: { dist: '5', time: '25:00' } } },
      '2': { dates: weekDates('2026-06-08'), lifts: { wed: { A: [work(120, 5), work(120, 5), work(120, 5)] } }, runs: { sat: { dist: '10', time: '52:00' } } },
      '3': { dates: weekDates('2026-06-15'), lifts: { mon: { A: [work(110, 5), work(110, 5)] } }, runs: { tue: { dist: '7', time: '34:00' } } },
    },
  };
}

test('In Focus volume total equals the load-model strength series for the same week', () => {
  const state = state3wk();
  const maxWeek = 3;
  const strengthSeries = strengthLoadSeries(state, DAY_KEYS, maxWeek);
  for (let wk = 1; wk <= 3; wk++) {
    const offset = wk - 3; // week wk relative to currentWeek 3
    const chart = buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: offset, today: '2026-06-17' });
    assert.equal(chart.total, strengthSeries[wk - 1], `week ${wk} volume mismatch`);
  }
});

test('In Focus distance total equals the load-model endurance series for the same week', () => {
  const state = state3wk();
  const distSeries = enduranceLoadSeries(state, DAY_KEYS, 3);
  for (let wk = 1; wk <= 3; wk++) {
    const chart = buildWeekChart(state, { type: 'running', metric: 'distance', weekOffset: wk - 3, today: '2026-06-17' });
    assert.equal(Math.round(chart.total * 100) / 100, Math.round(distSeries[wk - 1] * 100) / 100, `week ${wk} distance mismatch`);
  }
});

test('In Focus current-week volume equals the dashboard model week.volume.current', () => {
  const state = state3wk();
  const model = computeDashboardModel(state, DAY_KEYS, null, 'mon');
  const chart = buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: 0, today: '2026-06-17' });
  // Dashboard model's current volume = strengthLoadSeries[wkNum-1]; both exclude warm-ups.
  assert.equal(chart.total, model.week.volume.current);
});

test('warm-ups are excluded identically in the graph and the shared series', () => {
  const state = {
    currentWeek: '1', settings: {},
    weeks: { '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [warm(60, 10), work(100, 5)] } } } },
  };
  const chart = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-03' });
  const series = strengthLoadSeries(state, DAY_KEYS, 1);
  assert.equal(chart.total, 500);       // 100×5, warm-up excluded
  assert.equal(series[0], 500);
});

// ---- briefing de-duplication + evidence ------------------------------------

const baseModel = (over = {}) => ({
  ready: { hasData: true, score: 50, status: 'Fair', available: [] },
  load:  { hasData: true, acwr: 1.6, tsb: -20 },
  rec:   { severity: 'warning', badge: 'Reduce load today', headline: 'Reduce load today', advice: 'Ease off today.', sessionLabel: 'Gym Session' },
  fasting: { active: false },
  ...over,
});

test('briefing suppresses its load coach line when the overtraining card is active', () => {
  const state = state3wk();
  const model = baseModel();
  const b = buildMorningBriefing({
    state, model, score: { score: 60 }, program: null, selectedDay: 'mon',
    now: new Date('2026-06-30T09:00:00Z'), overtrainingActive: true, days: DAY_KEYS,
  });
  assert.equal(b.coach.headline, '', 'no duplicate load headline while escalation card shows');
  assert.equal(b.coach.deferred, true);
  assert.equal(b.coach.evidence, null);
  // The mission still stands — only the redundant coach line is dropped.
  assert.ok(b.mission && b.mission.text);
});

test('briefing attaches concrete evidence to the coach line when not deferring', () => {
  const state = state3wk();
  const model = baseModel();
  const b = buildMorningBriefing({
    state, model, score: { score: 60 }, program: null, selectedDay: 'mon',
    now: new Date('2026-06-30T09:00:00Z'), overtrainingActive: false, days: DAY_KEYS,
  });
  assert.equal(b.coach.headline, 'Reduce load today');
  assert.ok(b.coach.evidence, 'evidence attached');
  assert.ok(b.coach.evidence.bullets.length > 0);
  assert.match(b.coach.evidence.clears, /settles back toward your baseline/);
});
