// =============================================================================
// REALISTIC USER PROFILES — end-to-end analytics → recommendation assertions.
//
// Deterministic synthetic histories exercised through the SAME modules Home uses:
// buildWeekChart (In Focus), computeDashboardModel (Hybrid Brain inputs),
// generateRecommendation, buildCoachEvidence, assessOvertrainingRisk. Exact
// assertions on totals, comparison labels, recommendation, evidence, escalation.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { generateRecommendation } from '../js/brain/recommendations.js';
import { buildCoachEvidence } from '../js/brain/coach-evidence.js';
import { assessOvertrainingRisk } from '../js/brain/risk.js';
import { buildMorningBriefing } from '../js/brain/morning-briefing.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w, r });
const warm = (w, r) => ({ c: true, w, r, type: 'W' });
const incomplete = (w, r) => ({ c: false, w, r });
function weekDates(mondayISO) {
  const base = new Date(mondayISO + 'T00:00:00Z');
  const out = {};
  DAYS.forEach((dk, i) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + i); out[dk] = d.toISOString().slice(0, 10); });
  return out;
}
// Monday ISO for program week N given week 1's Monday.
function monOf(week1Mon, n) {
  const d = new Date(week1Mon + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (n - 1) * 7);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Profile A — consistent strength trainee, 12 weeks, stable + gradual progress.
// ---------------------------------------------------------------------------
test('Profile A: consistent strength — stable graph, no escalation, on-track coaching', () => {
  const weeks = {};
  for (let w = 1; w <= 12; w++) {
    const load = 100 + w; // gentle progression
    weeks[String(w)] = {
      dates: weekDates(monOf('2026-01-05', w)),
      lifts: {
        mon: { 'Bench Press': [work(load, 5), work(load, 5), work(load, 5)] },
        tue: { 'Back Squat': [work(load + 30, 5), work(load + 30, 5), work(load + 30, 5)] },
        thu: { 'Deadlift': [work(load + 60, 3), work(load + 60, 3)] },
        fri: { 'Standing OHP': [work(60, 5), work(60, 5), work(60, 5)] },
      },
    };
  }
  // Balanced EWMA load → ACWR ~1.0
  const state = { currentWeek: '12', settings: {}, loadMetrics: { atl: 100, ctl: 100 }, weeks };
  const chart = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: '2026-04-10' });
  assert.equal(chart.total, 11); // 3+3+2+3 working sets
  assert.equal(chart.comparison.comparisonLabel, 'vs previous week');

  const model = computeDashboardModel(state, DAYS, null, 'mon');
  const risk = assessOvertrainingRisk(model, state, DAYS);
  assert.equal(risk.level, 'none', 'stable training must not escalate');
  assert.notEqual(model.rec.severity, 'warning');
});

// ---------------------------------------------------------------------------
// Profile B — hybrid trainee: strength + running both correct, no double-count.
// ---------------------------------------------------------------------------
test('Profile B: hybrid — strength and running charts are independent and correct', () => {
  const state = {
    currentWeek: '8', settings: { distanceUnit: 'km' }, loadMetrics: { atl: 90, ctl: 95 },
    weeks: {
      '7': { dates: weekDates(monOf('2026-01-05', 7)),
        lifts: { mon: { Squat: [work(140, 5), work(140, 5)] } },
        runs: { tue: { dist: '6', time: '30:00' }, thu: { dist: '5', time: '25:00' }, sat: { dist: '14', time: '75:00' } } },
      '8': { dates: weekDates(monOf('2026-01-05', 8)),
        lifts: { mon: { Squat: [work(142, 5), work(142, 5), work(142, 5)] }, wed: { Bench: [work(100, 5), work(100, 5)] } },
        runs: { tue: { dist: '6', time: '30:00' }, sat: { dist: '16', time: '85:00' } } },
    },
  };
  const s = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: '2026-03-20' });
  const r = buildWeekChart(state, { type: 'running', metric: 'distance', weekOffset: 0, today: '2026-03-20' });
  assert.equal(s.total, 5);           // week 8 strength sets only (Mon 3 + Wed 2)
  assert.equal(r.total, 22);          // week 8 running km only (Tue 6 + Sat 16) — no cross-counting
  assert.equal(s.days.reduce((a, d) => a + d.activityCount, 0), 2); // Mon + Wed
  assert.equal(r.days.reduce((a, d) => a + d.activityCount, 0), 2); // Tue + Sat
});

// ---------------------------------------------------------------------------
// Profile C — rapid load increase: one escalation, coach deferred, clear evidence.
// ---------------------------------------------------------------------------
test('Profile C: rapid load spike — escalation high, briefing defers, evidence + clears', () => {
  const state = {
    currentWeek: '2', settings: {},
    loadMetrics: { atl: 160, ctl: 100 }, // ACWR 1.6 → spike
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { Squat: [work(140, 5), work(140, 5)] } }, gymRpe: { mon: 8 } },
      '2': { dates: weekDates('2026-06-08'),
        lifts: { mon: { Squat: [work(150, 5), work(150, 5), work(150, 5), work(150, 5)] }, wed: { Squat: [work(150, 5), work(150, 5), work(150, 5)] } },
        gymRpe: { mon: 9, wed: 9 },
        runs: { tue: { dist: '10', time: '45:00', rpe: 9 } } },
    },
  };
  // Friday is a planned-but-unlogged gym day, so the coach prescribes (rather than
  // acknowledging an already-complete session) — that's the warning path we test.
  const program = { days: { mon: { title: 'Lower', badge: '' }, fri: { title: 'Upper' } }, totalWeeks: 12 };
  const model = computeDashboardModel(state, DAYS, program, 'fri');
  const risk = assessOvertrainingRisk(model, state, DAYS);
  assert.equal(risk.level, 'high');

  const rec = generateRecommendation(state, DAYS, program, 'fri');
  assert.equal(rec.severity, 'warning');

  // Briefing defers its load line when the escalation card is active.
  const bDefer = buildMorningBriefing({ state, model, score: { score: 55 }, program, selectedDay: 'mon', now: new Date('2026-06-10T09:00:00Z'), overtrainingActive: true, days: DAYS });
  assert.equal(bDefer.coach.headline, '');
  assert.equal(bDefer.coach.deferred, true);

  // Evidence (when not deferring) is concrete and states what clears it.
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec, today: '2026-06-10' });
  assert.ok(ev.bullets.length > 0);
  assert.match(ev.clears, /settles back toward your baseline/);
});

// ---------------------------------------------------------------------------
// Profile D — incomplete recovery data: limited-data wording, no false certainty.
// ---------------------------------------------------------------------------
test('Profile D: sparse recovery data → limited confidence, load-based advice', () => {
  const state = {
    currentWeek: '2', settings: {},
    loadMetrics: { atl: 150, ctl: 100 },
    healthConnect: { connected: true, sleep: [ { date: '2026-06-18', totalHours: 7 }, { date: '2026-06-16', totalHours: 6 } ] },
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { Squat: [work(140, 5), work(140, 5)] } } },
      '2': { dates: weekDates('2026-06-08'), lifts: { mon: { Squat: [work(150, 5), work(150, 5), work(150, 5)] } } },
    },
  };
  const model = computeDashboardModel(state, DAYS, null, 'mon');
  const rec = generateRecommendation(state, DAYS, null, 'mon');
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec, today: '2026-06-19' });
  assert.equal(ev.confidence, 'limited');
  assert.ok(ev.bullets.some(b => /Sleep logged 2 of the last 7 nights/.test(b)));
});

// ---------------------------------------------------------------------------
// Profile E — returning user: 3-week gap, one new session; no false plateau/spike.
// ---------------------------------------------------------------------------
test('Profile E: returning user — current week does not compare against a peak week', () => {
  const state = {
    currentWeek: '6', settings: {}, loadMetrics: { atl: 20, ctl: 60 }, // detrained, not spiking
    weeks: {
      '2': { dates: weekDates(monOf('2026-01-05', 2)), lifts: { mon: { Squat: [work(150, 5), work(150, 5), work(150, 5), work(150, 5)] } } }, // peak, long ago
      // weeks 3,4,5 missing entirely (the gap)
      '6': { dates: weekDates(monOf('2026-01-05', 6)), lifts: { mon: { Squat: [work(120, 5), work(120, 5)] } } }, // one modest new session
    },
  };
  // In Focus current week compares to week 5 (which doesn't exist) → not comparable, honest.
  const chart = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: monOf('2026-01-05', 6) });
  assert.equal(chart.total, 2);
  assert.equal(chart.comparison.isComparable, false);
  assert.match(chart.comparison.message, /Not enough previous data to compare/);

  const model = computeDashboardModel(state, DAYS, null, 'mon');
  const risk = assessOvertrainingRisk(model, state, DAYS);
  assert.notEqual(risk.level, 'high', 'a light return week must not read as overtraining');
});

// ---------------------------------------------------------------------------
// Profile F — beginner: <2 weeks, no HC → provisional, restrained advice.
// ---------------------------------------------------------------------------
test('Profile F: beginner — no load data yet → getting-started, no trend claims', () => {
  const state = {
    currentWeek: '1', settings: {}, // no loadMetrics
    weeks: { '1': { dates: weekDates('2026-06-08'), lifts: {
      mon: { Squat: [work(60, 5), work(60, 5)] }, wed: { Bench: [work(40, 5)] },
    } } },
  };
  // Friday is planned but not yet logged, so we exercise the pre-data coaching
  // path (no load history, <2 RPEs) rather than an acknowledgement.
  const rec = generateRecommendation(state, DAYS, { days: { mon: { title: 'Full Body' }, fri: { title: 'Full Body' } }, totalWeeks: 12 }, 'fri');
  assert.equal(rec.badge, 'Getting Started');
  const chart = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: '2026-06-10' });
  assert.equal(chart.comparison.isComparable, false); // no prior week to trend
});

// ---------------------------------------------------------------------------
// Profile G — missed program week: adherence correct; prescriptions ≠ activity.
// ---------------------------------------------------------------------------
test('Profile G: missed week — only logged work counts; incomplete sets are not activity', () => {
  const program = { days: {
    mon: { title: 'Push' }, tue: { title: 'Pull' }, wed: { title: 'Legs' },
    thu: { title: 'Rest', badge: 'rest' }, fri: { title: 'Full', runs: '5k easy' },
  }, totalWeeks: 12 };
  const state = {
    currentWeek: '1', settings: {}, loadMetrics: { atl: 40, ctl: 45 },
    weeks: { '1': { dates: weekDates('2026-06-08'), lifts: {
      mon: { Push: [work(60, 5), work(60, 5)] },          // completed
      tue: { Pull: [work(50, 5), incomplete(50, 5)] },    // partially completed
      // wed Legs never logged (prescription only — must not count as activity)
      sat: { Extra: [work(40, 8), work(40, 8)] },         // a manually added workout
    } } },
  };
  const chart = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: '2026-06-14' });
  // 2 (Mon) + 1 (Tue completed) + 2 (Sat) = 5 — the prescribed-but-unlogged Legs adds nothing.
  assert.equal(chart.total, 5);
  assert.equal(chart.days.find(d => d.dayKey === 'wed').hasData, false);
  assert.equal(chart.days.find(d => d.dayKey === 'sat').hasData, true); // manual workout counts
});

// ---------------------------------------------------------------------------
// Profile H — edited/imported/deleted/mixed-unit history: correctness under change.
// ---------------------------------------------------------------------------
test('Profile H: edits, deletes and one-run-per-day imports update analytics immediately', () => {
  const state = {
    currentWeek: '1', settings: { weightUnit: 'kg' },
    weeks: { '1': { dates: weekDates('2026-06-08'),
      lifts: { mon: { Squat: [work(100, 5), work(100, 5)] } },
      runs: { tue: { dist: '5', time: '25:00' } } } }, // a single imported run object per day (no dup possible)
  };
  let s = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-10' });
  assert.equal(s.total, 1000);

  // edit a logged set (pure read → immediate)
  state.weeks['1'].lifts.mon.Squat[0].w = 110;
  s = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-10' });
  assert.equal(s.total, 110 * 5 + 100 * 5);

  // delete the exercise → gone everywhere
  delete state.weeks['1'].lifts.mon.Squat;
  s = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-10' });
  assert.equal(s.total, 0);

  // running stays a single record per day — no double count
  const r = buildWeekChart(state, { type: 'running', metric: 'distance', today: '2026-06-10' });
  assert.equal(r.total, 5);
  assert.equal(r.days.reduce((a, d) => a + d.activityCount, 0), 1);
});
