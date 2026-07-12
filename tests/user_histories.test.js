// =============================================================================
// COMPARISON-PERIOD CONSISTENCY + load-progression correctness
// (release-verification pass — Priorities 1 & 2)
//
// Realistic-history profiles A–H already live in user_profiles.test.js. This
// file targets the parts that pass left unverified: that the DISPLAYED value and
// its comparison LABEL always describe the SAME period across current (partial)
// and completed weeks, that statComparisonFrom maps them together, that the
// non-comparable edge cases never fabricate a percentage, and that the
// load-progression metric (previously dead mid-program) now compares two
// completed weeks and stays supporting-context severity.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';
import { statComparisonFrom, COMPARISON_LABELS, comparisonLabel } from '../js/analytics/comparison.js';
import { computeLoadAnalytics, loadProgressionPct } from '../js/analytics/calculations/load-calcs.js';
import { generateLoadInsights } from '../js/analytics/insights/insight-engine.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { computeStrengthAnalytics } from '../js/analytics/calculations/strength-calcs.js';

const D = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w, r });
const warm = (w, r) => ({ c: true, w, r, type: 'W' });
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekDates = (m) => { const o = {}; D.forEach((dk, i) => { o[dk] = addDays(m, i); }); return o; };

// n working sets of `Lift` at (w,r) on the given day, plus a warm-up.
const liftDay = (w = 100, r = 5, n = 3) => {
  const sets = [warm(Math.round(w * 0.5), 8)];
  for (let i = 0; i < n; i++) sets.push(work(w, r));
  return { Lift: sets };
};
const CUR_MON = '2026-06-15';
const TODAY = '2026-06-18'; // Thursday → elapsed = mon,tue,wed,thu

// ---------------------------------------------------------------------------
// CURRENT partial week → live, elapsed-matched comparison
// ---------------------------------------------------------------------------
test('current partial week: value is elapsed-matched and label is the live phrasing', () => {
  const state = {
    currentWeek: '2', settings: {},
    weeks: {
      // last week: 3 sets each Mon..Fri
      '1': { dates: weekDates(addDays(CUR_MON, -7)),
        lifts: { mon: liftDay(100, 5, 3), tue: liftDay(100, 5, 3), wed: liftDay(100, 5, 3), thu: liftDay(100, 5, 3), fri: liftDay(100, 5, 3) } },
      // this week so far: Mon 4, Tue 4, Wed 4 (Thu not yet logged), Fri would be future
      '2': { dates: weekDates(CUR_MON),
        lifts: { mon: liftDay(100, 5, 4), tue: liftDay(100, 5, 4), wed: liftDay(100, 5, 4) } },
    },
  };
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: TODAY });
  assert.equal(c.isCurrentWeek, true);
  // Value compared = elapsed (Mon..Thu). Logged so far = 4+4+4 = 12.
  assert.equal(c.elapsedTotal, 12);
  // Previous week over the SAME elapsed days (Mon..Thu) = 3+3+3+3 = 12.
  assert.equal(c.comparison.previousTotal, 12);
  assert.equal(c.comparison.isComparable, true);
  assert.equal(c.comparison.percentageChange, 0); // 12 vs 12, elapsed-matched
  // Label matches the period actually used.
  assert.equal(c.comparison.comparisonLabel, COMPARISON_LABELS.live);
  assert.equal(comparisonLabel(true), 'vs same point last week');
  // statComparisonFrom hands the card a value + sub that agree.
  const s = statComparisonFrom(c);
  assert.equal(s.deltaPct, 0);
  assert.equal(s.sub, COMPARISON_LABELS.live);
  assert.equal(s.isComparable, true);
});

test('current partial week never compares a partial total against a full previous week', () => {
  const state = {
    currentWeek: '2', settings: {},
    weeks: {
      '1': { dates: weekDates(addDays(CUR_MON, -7)),
        lifts: { mon: liftDay(100, 5, 3), tue: liftDay(100, 5, 3), wed: liftDay(100, 5, 3), thu: liftDay(100, 5, 3), fri: liftDay(100, 5, 3), sat: liftDay(100, 5, 3) } },
      '2': { dates: weekDates(CUR_MON), lifts: { mon: liftDay(100, 5, 3) } }, // one day in
    },
  };
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: CUR_MON }); // "today" = Monday
  // Only Monday is elapsed → compares Mon(3) vs last-Monday(3), NOT 3 vs the full 18.
  assert.equal(c.elapsedTotal, 3);
  assert.equal(c.comparison.previousTotal, 3);
  assert.equal(c.comparison.percentageChange, 0);
});

// ---------------------------------------------------------------------------
// COMPLETED historical week → full-vs-full, completed phrasing
// ---------------------------------------------------------------------------
test('completed historical week: full week vs the full week before, completed phrasing', () => {
  const state = {
    currentWeek: '3', settings: {},
    weeks: {
      '1': { dates: weekDates(addDays(CUR_MON, -14)), lifts: { mon: liftDay(100, 5, 3), wed: liftDay(100, 5, 3) } },        // 6
      '2': { dates: weekDates(addDays(CUR_MON, -7)),  lifts: { mon: liftDay(100, 5, 4), wed: liftDay(100, 5, 4), fri: liftDay(100, 5, 2) } }, // 10
      '3': { dates: weekDates(CUR_MON), lifts: { mon: liftDay(100, 5, 3) } },
    },
  };
  // View week 2 (completed): full 10 vs full week-1 (6) → +67%, completed label.
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: TODAY });
  assert.equal(c.isCurrentWeek, false);
  assert.equal(c.total, 10);
  assert.equal(c.comparison.previousTotal, 6);
  assert.equal(c.comparison.percentageChange, 67);
  assert.equal(c.comparison.comparisonLabel, COMPARISON_LABELS.completed);
  assert.equal(comparisonLabel(false), 'vs previous week');
  const s = statComparisonFrom(c);
  assert.equal(s.deltaPct, 67);
  assert.equal(s.sub, COMPARISON_LABELS.completed);
});

// ---------------------------------------------------------------------------
// Non-comparable edge cases → never NaN/Infinity/false percentage
// ---------------------------------------------------------------------------
test('no previous week → not comparable, no percentage, honest live/completed label kept', () => {
  const state = { currentWeek: '1', settings: {},
    weeks: { '1': { dates: weekDates(CUR_MON), lifts: { mon: liftDay(100, 5, 3) } } } };
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: TODAY });
  assert.equal(c.comparison.isComparable, false);
  assert.equal(c.comparison.percentageChange, null);
  assert.equal(c.comparison.previousTotal, null);
  assert.equal(statComparisonFrom(c).deltaPct, null);
});

test('previous value zero but current positive → not a percentage, honest message', () => {
  const state = { currentWeek: '2', settings: {},
    weeks: {
      '1': { dates: weekDates(addDays(CUR_MON, -7)), lifts: {} },              // empty prior
      '2': { dates: weekDates(CUR_MON), lifts: { mon: liftDay(100, 5, 3) } },
    } };
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: TODAY });
  assert.equal(c.comparison.isComparable, false);
  assert.equal(c.comparison.percentageChange, null); // never Infinity
  assert.match(c.comparison.message, /None/);
});

test('both weeks zero → not comparable, no percentage, "no activity" message', () => {
  const state = { currentWeek: '2', settings: {},
    weeks: {
      '1': { dates: weekDates(addDays(CUR_MON, -7)), lifts: {} },
      '2': { dates: weekDates(CUR_MON), lifts: {} },
    } };
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: TODAY });
  assert.equal(c.comparison.isComparable, false);
  assert.equal(c.comparison.percentageChange, null);
  assert.match(c.comparison.message, /No activity/);
});

test('future weeks past the program end never invent a comparison', () => {
  const state = { currentWeek: '1', settings: {},
    weeks: { '1': { dates: weekDates(CUR_MON), lifts: { mon: liftDay(100, 5, 3) } } } };
  // Asking for a week beyond data clamps to week 1; still no fabricated percentage.
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 5, today: TODAY });
  assert.equal(c.comparison.isComparable, false);
  assert.equal(c.comparison.percentageChange, null);
});

// ---------------------------------------------------------------------------
// loadProgressionPct — the dead-slot + partial-vs-full fix (Priority 1)
// ---------------------------------------------------------------------------
test('loadProgressionPct is meaningful mid-program (not the padded end-of-program slot)', () => {
  // A 12-week program, athlete on week 4, real load only in weeks 1-4.
  const wk = (rpe) => ({ dates: {}, lifts: {},
    gymStats: { mon: { time: '60' }, tue: { time: '60' }, wed: { time: '60' } },
    gymRpe: { mon: String(rpe), tue: String(rpe), wed: String(rpe) }, runs: {} });
  const state = { currentWeek: '4', settings: {},
    weeks: { '1': wk(6), '2': wk(7), '3': wk(8), '4': wk(8) } };
  const la = computeLoadAnalytics(state, D, 12); // maxWeek = totalWeeks (padded)
  // OLD behaviour read slot 11 vs 10 (both 0) → null. Now anchored at week 4:
  // compares the two most recent COMPLETED weeks (wk3 vs wk2): 1440 vs 1260 = +14%.
  assert.notEqual(la.loadProgPct, null);
  assert.equal(Math.round(la.loadProgPct), 14);
});

test('loadProgressionPct excludes the in-progress current week (full-vs-full only)', () => {
  // series index 3 is the "current" partial week with a big spike; the metric must
  // compare weeks 2 vs 1 (completed), not the partial current week vs week 2.
  const series = [1000, 1100, 1210, 99999];
  const pct = loadProgressionPct(series, 3 /* ci = current week idx */);
  assert.equal(Math.round(pct), 10); // 1100 vs 1210 → +10, spike ignored
});

test('loadProgressionPct returns null (never NaN/Infinity) without two completed weeks', () => {
  assert.equal(loadProgressionPct([500], 0), null);
  assert.equal(loadProgressionPct([0, 0, 0], 2), null);   // prior is zero → null, not Infinity
  assert.equal(loadProgressionPct([], 0), null);
});

// ---------------------------------------------------------------------------
// Load-insight severity — supporting context, not a competing red alert (Pri 2)
// ---------------------------------------------------------------------------
test('a single week-over-week load rise is info, not an alert (escalation owns red)', () => {
  const ins = generateLoadInsights({
    atl: 320, ctl: 300, ratio: 1.06,
    loadProgPct: 22,                       // a >15% rise
    fatigue: 'stable',
    loadStatus: { zone: 'productive', status: 'Productive' },
  });
  const prog = ins.find(i => /vs the previous week/.test(i.text));
  assert.ok(prog, 'the progression insight is present');
  assert.equal(prog.priority, 'info', 'week-over-week rise is supporting context, not an alarm');
  assert.match(prog.text, /vs the previous week/); // label matches the periods compared
  // The red "load" voice is reserved for a genuinely dangerous zone.
  assert.ok(!ins.some(i => i.priority === 'alert'), 'productive zone raises no alert');
});

// ---------------------------------------------------------------------------
// DAILY-USE TRANSITIONS — add / edit / delete flow updates every surface at once
// (Priority 4). The model layer is purely functional (recomputed from state), so
// there is no memoised value to go stale; this locks that guarantee in.
// ---------------------------------------------------------------------------
test('add → edit → delete a workout updates Home, In Focus and detail analytics in lockstep', () => {
  const SUN = addDays(CUR_MON, 6); // whole current week elapsed → full-week totals
  const state = {
    currentWeek: '2', settings: { weightUnit: 'kg', distanceUnit: 'km' },
    weeks: {
      '1': { dates: weekDates(addDays(CUR_MON, -7)), lifts: { mon: liftDay(100, 5, 3) },
        gymStats: { mon: { time: '60' } }, gymRpe: { mon: '7' } },
      '2': { dates: weekDates(CUR_MON), lifts: { mon: liftDay(100, 5, 3) },
        gymStats: { mon: { time: '60' } }, gymRpe: { mon: '7' } },
    },
  };
  // Three helpers reading the SAME state — Home roll-up, In Focus, detail analytics.
  const homeVol   = () => computeDashboardModel(state, D, null, 'mon').week.volume.current;
  const focusVol  = () => buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: 0, today: SUN }).total;
  const detailVol = () => computeStrengthAnalytics(state, D, 2).volSeries[1]; // week 2 index

  // Baseline: 3 working sets @ 100×5 = 1500, agreed across all three surfaces.
  assert.equal(homeVol(), 1500);
  assert.equal(focusVol(), 1500);
  assert.equal(detailVol(), 1500);

  // ADD a second session (Wed, 4 sets) → all three rise together, no reload.
  state.weeks['2'].lifts.wed = liftDay(100, 5, 4);
  assert.equal(homeVol(), 1500 + 2000);
  assert.equal(focusVol(), 3500);
  assert.equal(detailVol(), 3500);

  // EDIT Monday's top set weight → all three reflect it immediately.
  state.weeks['2'].lifts.mon.Lift[1].w = 120; // one working set 100→120 (+20×5=+100)
  assert.equal(focusVol(), 3600);
  assert.equal(homeVol(), 3600);
  assert.equal(detailVol(), 3600);

  // DELETE the added Wednesday session → it disappears from every surface.
  delete state.weeks['2'].lifts.wed;
  assert.equal(homeVol(), 1600);
  assert.equal(focusVol(), 1600);
  assert.equal(detailVol(), 1600);
});

test('genuinely dangerous load still raises exactly the zone alert', () => {
  const ins = generateLoadInsights({
    atl: 500, ctl: 300, ratio: 1.66,
    loadProgPct: 5, fatigue: 'rising',
    loadStatus: { zone: 'danger', status: 'Danger Zone' },
  });
  assert.ok(ins.some(i => i.priority === 'alert' && i.category === 'load'));
});
