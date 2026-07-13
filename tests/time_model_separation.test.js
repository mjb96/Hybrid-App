// =============================================================================
// TIME-MODEL SEPARATION — program week vs calendar week must never re-merge.
//
// Proves the two clocks are independent: calendar analytics attribute work by
// real dates (ignoring state.currentWeek), program adherence stays keyed to the
// program week, and rolling-window load stays rolling. Exact values only.
// =============================================================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarWeekStrength, collectCalendarWeek, explainWeeklyMetric, addDaysISO,
} from '../js/analytics/weekly-aggregate.js';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { recomputeLoadMetrics } from '../js/brain/load_models.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w: String(w), r: String(r) });
const nSets = (n, w, r) => Array.from({ length: n }, () => work(w, r));
const TODAY = '2026-07-13'; // Monday, calendar week 13–19 Jul

// ---------------------------------------------------------------------------
// 1. Program week and calendar week are independent.
// ---------------------------------------------------------------------------
test('calendar analytics ignore state.currentWeek entirely', () => {
  const weeks = { '3': { dates: { mon: '2026-07-13' }, lifts: { mon: { A: nSets(4, 100, 5) } } } };
  const a = buildCalendarWeekStrength({ currentWeek: '3', weeks }, { today: TODAY });
  const b = buildCalendarWeekStrength({ currentWeek: '99', weeks }, { today: TODAY });
  assert.equal(a.totalWorkingSets, 4);
  assert.deepEqual(a.days.map(d => d.workingSets), b.days.map(d => d.workingSets));
  // The In Focus chart is equally indifferent to the program counter.
  const c1 = buildWeekChart({ currentWeek: '1', weeks }, { today: TODAY, metric: 'sets' });
  const c2 = buildWeekChart({ currentWeek: '50', weeks }, { today: TODAY, metric: 'sets' });
  assert.equal(c1.total, c2.total);
  assert.equal(c1.total, 4);
});

test('calendar rollover advances analytics without touching the program week', () => {
  const state = { currentWeek: '3', weeks: { '3': { dates: { mon: '2026-07-06' }, lifts: { mon: { A: nSets(5, 100, 5) } } } } };
  // Sun 12 Jul → the session is "this week".
  assert.equal(buildCalendarWeekStrength(state, { today: '2026-07-12' }).totalWorkingSets, 5);
  // Mon 13 Jul → same state, now "this week" is empty. currentWeek never changed.
  assert.equal(buildCalendarWeekStrength(state, { today: '2026-07-13' }).totalWorkingSets, 0);
  assert.equal(state.currentWeek, '3', 'analytics never mutate the program week');
});

// ---------------------------------------------------------------------------
// 2. One program week can span two calendar weeks; two program weeks can land
//    in one calendar week. Attribution follows the DATE, not the slot.
// ---------------------------------------------------------------------------
test('a single program week spanning two calendar weeks splits by real date', () => {
  const state = { currentWeek: '1', weeks: { '1': {
    // Program week 1, but the two sessions were logged a week apart.
    dates: { mon: '2026-07-06', tue: '2026-07-14' },
    lifts: { mon: { A: nSets(3, 100, 5) }, tue: { A: nSets(7, 100, 5) } },
  } } };
  const wkA = buildCalendarWeekStrength(state, { weekStart: '2026-07-06', today: TODAY });
  const wkB = buildCalendarWeekStrength(state, { weekStart: '2026-07-13', today: TODAY });
  assert.equal(wkA.totalWorkingSets, 3, 'Mon session in calendar week A');
  assert.equal(wkB.totalWorkingSets, 7, 'Tue session in calendar week B — same program week');
});

test('two program weeks completed in one calendar week both count', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { dates: { fri: '2026-07-08' }, lifts: { fri: { A: nSets(4, 100, 5) } } },
    '2': { dates: { mon: '2026-07-06' }, lifts: { mon: { A: nSets(6, 100, 5) } } },
  } };
  const wk = buildCalendarWeekStrength(state, { weekStart: '2026-07-06', today: TODAY });
  assert.equal(wk.totalWorkingSets, 10);
  assert.deepEqual(wk.sourceWeekNums.sort(), [1, 2]);
});

test('workouts from an old and a new program coexist in one calendar week', () => {
  const state = { currentWeek: '5', weeks: {
    '2': { dates: { thu: '2026-07-09' }, lifts: { thu: { OldSquat: nSets(4, 100, 5) } } }, // old program slot
    '5': { dates: { mon: '2026-07-06' }, lifts: { mon: { NewBench: nSets(3, 80, 5) } } },  // new program slot
  } };
  const wk = buildCalendarWeekStrength(state, { weekStart: '2026-07-06', today: TODAY });
  assert.equal(wk.totalWorkingSets, 7);
  assert.deepEqual(wk.sourceWeekNums.sort(), [2, 5]);
  // A calendar-week collection surfaces both source slots by their real day.
  const collected = collectCalendarWeek(state, '2026-07-06');
  assert.ok(collected.lifts.mon.NewBench && collected.lifts.thu.OldSquat);
});

// ---------------------------------------------------------------------------
// 3. Home / detail agreement (both consume the same calendar aggregate).
// ---------------------------------------------------------------------------
test('In Focus, At-a-Glance and the calendar aggregate agree', () => {
  const state = { currentWeek: '3', settings: {}, weeks: {
    '3': { dates: { mon: '2026-07-13', wed: '2026-07-15' },
      lifts: { mon: { A: nSets(4, 100, 5) }, wed: { A: nSets(6, 100, 5) } } },
  } };
  const chart = buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: 0, today: TODAY });
  const model = computeDashboardModel(state, DAY_KEYS, null, 'mon', { today: TODAY });
  const agg = buildCalendarWeekStrength(state, { today: TODAY });
  assert.equal(chart.total, agg.totalVolumeKg);
  assert.equal(model.calendarWeek.volume.current, agg.totalVolumeKg);
  assert.equal(model.calendarWeek.sets, agg.totalWorkingSets);
});

// The detail views pass getCalendarWeekOffset() straight into buildWeekChart, so
// navigating N calendar weeks back is exactly buildWeekChart(weekOffset: -N).
test('detail week navigation is calendar-offset based (offset -1 = last calendar week)', () => {
  const state = { currentWeek: '9', weeks: {
    '9': { dates: { mon: '2026-07-06' }, lifts: { mon: { A: nSets(8, 100, 5) } } }, // last calendar week
  } };
  const thisWk = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: TODAY });
  const lastWk = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: TODAY });
  assert.equal(thisWk.total, 0);
  assert.equal(thisWk.startDate, '2026-07-13');
  assert.equal(lastWk.total, 8);
  assert.equal(lastWk.startDate, '2026-07-06');
});

// ---------------------------------------------------------------------------
// 4. Program adherence STAYS program-week based.
// ---------------------------------------------------------------------------
test('adherence (model.week) tracks the program week, not the calendar', () => {
  // Program week 2 fully in the past calendar-wise, but it is the ACTIVE plan week.
  const program = { days: { mon: { title: 'Push' } }, totalWeeks: 8 };
  const state = { currentWeek: '2', settings: {}, weeks: {
    '2': { dates: { mon: '2026-07-06' }, lifts: { mon: { A: nSets(3, 100, 5) } } },
  } };
  const model = computeDashboardModel(state, DAY_KEYS, program, 'mon', { today: TODAY });
  // Adherence counts the PLAN week's logged sets even though that week is not the
  // current calendar week (calendarWeek, by contrast, is empty this week).
  assert.equal(model.week.sets, 3, 'program-week adherence still sees week 2 work');
  assert.equal(model.calendarWeek.sets, 0, 'calendar this-week is honestly empty');
});

// ---------------------------------------------------------------------------
// 5. Rolling-window load stays rolling (contributes across program weeks).
// ---------------------------------------------------------------------------
test('EWMA load (rolling) counts work from any week, not just the program week', () => {
  const state = {
    currentWeek: '4', weekStartedAt: '2026-07-06T00:00:00Z',
    weeks: {
      '1': { dates: {}, lifts: {}, runs: {}, gymRpe: { mon: '8' }, gymStats: { mon: { time: '60' } } },
    },
  };
  const { atl, ctl } = recomputeLoadMetrics(state);
  // Load logged in program week 1 (not the current week 4) still builds CTL/ATL —
  // proof this is a rolling EWMA over the whole timeline, not a currentWeek bucket.
  assert.ok(ctl > 0 && atl > 0, 'past-week training contributes to chronic/acute load');
});

// ---------------------------------------------------------------------------
// 6. Diagnostic trace exposes program week AS METADATA and the date as authority.
// ---------------------------------------------------------------------------
test('explainWeeklyMetric marks program week as metadata and date as authority', () => {
  const state = { currentWeek: '3', weeks: {
    '3': { dates: { mon: '2026-07-06' }, lifts: { mon: { A: nSets(5, 100, 5) } } },
    // a duplicate of the same date in another slot → suppressed
    '4': { dates: { mon: '2026-07-06' }, lifts: { mon: { A: nSets(5, 100, 5) } } },
  } };
  const trace = explainWeeklyMetric(state, { today: TODAY }); // current week (empty)
  assert.match(trace.note, /Program week is metadata/i);
  assert.equal(trace.duplicateSuppressedCount, 1);
  const s = trace.sessions.find(x => x.disposition === 'counted');
  assert.equal(s.programWeek, 3);            // metadata present
  assert.equal(s.resolvedLocalDate, '2026-07-06');
  assert.equal(s.included, false);           // belongs to a prior calendar week
  assert.equal(s.contribution.workingSets, 0);
  // The prior calendar week counts it once (duplicate suppressed).
  const prev = explainWeeklyMetric(state, { weekStart: '2026-07-06', today: TODAY });
  assert.equal(prev.totals.workingSets, 5);
});
