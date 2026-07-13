// =============================================================================
// WEEKLY AGGREGATE — the calendar-attribution regression suite.
//
// Reproduces the exact production defect (a frozen program week attributing a
// PRIOR calendar week's training to "this week") and locks in the canonical
// calendar-week behaviour: an empty current week stays empty, prior work lives
// only in its own week / the comparison, and the label is the real calendar
// week — never derived from the activity records. Exact values, not snapshots.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDayKey, weekStartOf, weekKeyOf, addDaysISO,
  buildCalendarWeekStrength, indexSlotsByDate, collectCalendarWeek,
  explainWeeklyMetric,
} from '../js/analytics/weekly-aggregate.js';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w: String(w), r: String(r) });
const warm = (w, r) => ({ c: true, w: String(w), r: String(r), type: 'W' });
// `n` completed working sets at (w × r), tail-overriding one set's reps if given.
function nSets(n, w, r, lastReps) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(work(w, i === n - 1 && lastReps != null ? lastReps : r));
  return out;
}
function weekDates(mondayISO) {
  const o = {};
  DAY_KEYS.forEach((dk, i) => { o[dk] = addDaysISO(mondayISO, i); });
  return o;
}

// ---------------------------------------------------------------------------
// The screenshot scenario, made deterministic.
//   • today = Mon 13 Jul 2026 — the FIRST day of a new calendar week (13–19).
//   • last training = the previous calendar week (6–12 Jul): Mon/Tue/Thu/Fri,
//     55 working sets · 554 reps · 11,634 kg (≈ 11.6 t).
//   • the program week never advanced, so `currentWeek` still points at the slot
//     that holds that previous-week data.
// Expected: the current calendar week is a true zero everywhere.
// ---------------------------------------------------------------------------
function frozenProgramWeekState() {
  return {
    currentWeek: '3',                 // frozen — its dates are LAST calendar week
    weekStartedAt: '2026-07-06T00:00:00.000Z',
    settings: { weightUnit: 'kg' },
    weeks: {
      '3': {
        dates: weekDates('2026-07-06'), // Mon 6 … Sun 12 Jul (the PREVIOUS week)
        lifts: {
          mon: { Squat: nSets(15, 21, 10) },            // 15 sets · 150 reps · 3150 kg
          tue: { Bench: nSets(15, 21, 10) },            // 15 · 150 · 3150
          thu: { Row:   nSets(10, 21, 10, 14) },        // 10 · 104 · 2184 (last set 14 reps)
          fri: { Press: nSets(15, 21, 10) },            // 15 · 150 · 3150
        },
      },
    },
  };
}
const TODAY = '2026-07-13';          // Monday — new calendar week 13–19 Jul
const PREV_MON = '2026-07-06';
const CUR_MON  = '2026-07-13';

test('REGRESSION: previous-week training is NOT attributed to the current week', () => {
  const state = frozenProgramWeekState();

  // Previous calendar week keeps its real totals…
  const prev = buildCalendarWeekStrength(state, { weekStart: PREV_MON, today: TODAY });
  assert.equal(prev.weekKey, '2026-07-06');
  assert.equal(prev.totalWorkingSets, 55);
  assert.equal(prev.totalReps, 554);
  assert.equal(prev.totalVolumeKg, 11634);

  // …and the current calendar week is a true zero.
  const cur = buildCalendarWeekStrength(state, { today: TODAY });
  assert.equal(cur.weekKey, CUR_MON);
  assert.equal(cur.totalWorkingSets, 0);
  assert.equal(cur.totalReps, 0);
  assert.equal(cur.totalVolumeKg, 0);
  assert.deepEqual(cur.days.map(d => d.workingSets), [0, 0, 0, 0, 0, 0, 0]);
});

test('REGRESSION: In Focus chart current week is zero with a real calendar-week label', () => {
  const state = frozenProgramWeekState();
  const chart = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: TODAY });
  assert.equal(chart.isCurrentWeek, true);
  assert.equal(chart.total, 0);
  assert.deepEqual(chart.days.map(d => d.value), [0, 0, 0, 0, 0, 0, 0]);
  // Label is the ACTUAL calendar week (Mon 13 – Sun 19 Jul), not the data range.
  assert.equal(chart.startDate, '2026-07-13');
  assert.equal(chart.endDate, '2026-07-19');

  // Volume metric agrees — zero.
  const vol = buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: 0, today: TODAY });
  assert.equal(vol.total, 0);
});

test('REGRESSION: last week is still visible via previous-week navigation', () => {
  const state = frozenProgramWeekState();
  const back = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: TODAY });
  assert.equal(back.isCurrentWeek, false);
  assert.equal(back.total, 55);
  assert.deepEqual(back.days.map(d => d.value), [15, 15, 0, 10, 15, 0, 0]); // Mon,Tue,Thu,Fri
  assert.equal(back.startDate, '2026-07-06');
  assert.equal(back.endDate, '2026-07-12');
});

test('REGRESSION: At-a-Glance Weekly Volume tile source is zero this week', () => {
  const state = frozenProgramWeekState();
  const model = computeDashboardModel(state, DAY_KEYS, null, 'mon', { today: TODAY });
  assert.equal(model.calendarWeek.weekKey, CUR_MON);
  assert.equal(model.calendarWeek.sets, 0);
  assert.equal(model.calendarWeek.reps, 0);
  assert.equal(model.calendarWeek.volume.current, 0);
});

test('Home, strength-detail and At-a-Glance agree (all read one calendar aggregate)', () => {
  const state = frozenProgramWeekState();
  // In Focus (Home) + strength detail both go through buildWeekChart offset 0.
  const inFocus = buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: 0, today: TODAY });
  const model = computeDashboardModel(state, DAY_KEYS, null, 'mon', { today: TODAY });
  assert.equal(inFocus.total, model.calendarWeek.volume.current); // 0 === 0, no divergence
});

// ---------------------------------------------------------------------------
// Train once in the NEW week → only that new session shows this week.
// ---------------------------------------------------------------------------
test('a single new-week session is the ONLY thing counted this week', () => {
  const state = frozenProgramWeekState();
  // Log a Tuesday session in the CURRENT calendar week (14 Jul), stored in a new
  // program-week slot (as the app would once the week finally advances).
  state.weeks['4'] = { dates: { tue: '2026-07-14' }, lifts: { tue: { Squat: nSets(6, 100, 5) } } };
  const cur = buildCalendarWeekStrength(state, { today: TODAY });
  assert.equal(cur.totalWorkingSets, 6);
  assert.equal(cur.totalVolumeKg, 6 * 100 * 5);
  assert.deepEqual(cur.days.map(d => d.workingSets), [0, 6, 0, 0, 0, 0, 0]); // Tue only
  // Last week is untouched.
  const prev = buildCalendarWeekStrength(state, { weekStart: PREV_MON, today: TODAY });
  assert.equal(prev.totalWorkingSets, 55);
});

// ---------------------------------------------------------------------------
// Empty current week never falls back to the most recent populated week.
// ---------------------------------------------------------------------------
test('empty current week does not fall back to the last populated week', () => {
  const state = frozenProgramWeekState();
  const cur = buildCalendarWeekStrength(state, { today: TODAY });
  assert.equal(cur.totalVolumeKg, 0);
  // The current and previous week are independent objects (no shared array ref).
  const prev = buildCalendarWeekStrength(state, { weekStart: PREV_MON, today: TODAY });
  assert.notStrictEqual(cur.days, prev.days);
  cur.days[0].workingSets = 999;
  assert.equal(prev.days[0].workingSets, 15, 'mutating one week must not touch the other');
});

// ---------------------------------------------------------------------------
// Canonical date helpers.
// ---------------------------------------------------------------------------
test('localDayKey: date-only is treated as an intentional local day (no UTC shift)', () => {
  assert.equal(localDayKey('2026-07-09'), '2026-07-09');
  // A late-evening local timestamp resolves to that local day in a +tz.
  assert.equal(localDayKey('2026-07-09T23:30:00+10:00', 'Australia/Sydney'), '2026-07-09');
  // A UTC instant near midnight resolves to the LOCAL day, not the UTC day.
  assert.equal(localDayKey('2026-07-09T15:30:00Z', 'Australia/Sydney'), '2026-07-10');
});

test('localDayKey: invalid / missing values return null (never today)', () => {
  assert.equal(localDayKey(undefined), null);
  assert.equal(localDayKey(''), null);
  assert.equal(localDayKey('not-a-date'), null);
  assert.equal(localDayKey('2026-02-31'), null); // impossible calendar date
  assert.equal(localDayKey('2026-13-01'), null);
});

test('weekStartOf: Monday-based, and stable across the Sunday→Monday rollover', () => {
  assert.equal(weekStartOf('2026-07-13'), '2026-07-13'); // Monday
  assert.equal(weekStartOf('2026-07-19'), '2026-07-13'); // Sunday → same Monday
  assert.equal(weekStartOf('2026-07-20'), '2026-07-20'); // next Monday
  assert.equal(weekKeyOf('2026-07-15'), '2026-07-13');
});

test('week boundaries hold across month and year edges', () => {
  assert.equal(weekStartOf('2026-01-01'), '2025-12-29'); // Thu 1 Jan → Mon 29 Dec 2025
  assert.equal(weekStartOf('2025-12-31'), '2025-12-29');
  assert.equal(addDaysISO('2025-12-29', 6), '2026-01-04');
});

// ---------------------------------------------------------------------------
// App resumed after midnight: `today` crosses into a new week → the current
// week flips to empty on its own (no restart, pure function of today).
// ---------------------------------------------------------------------------
test('crossing midnight into a new week flips the current week to empty', () => {
  const state = frozenProgramWeekState();
  // Sun 12 Jul (still the training week) → non-empty.
  const sun = buildCalendarWeekStrength(state, { today: '2026-07-12' });
  assert.equal(sun.weekKey, '2026-07-06');
  assert.equal(sun.totalWorkingSets, 55);
  // Mon 13 Jul (next tick) → the very same state now reads an empty week.
  const mon = buildCalendarWeekStrength(state, { today: '2026-07-13' });
  assert.equal(mon.weekKey, '2026-07-13');
  assert.equal(mon.totalWorkingSets, 0);
});

// ---------------------------------------------------------------------------
// Deduplication: a cloud/local (or re-activation) duplicate of the same dated
// session is counted ONCE, not summed.
// ---------------------------------------------------------------------------
test('a duplicate slot on the same date is counted once, never doubled', () => {
  const state = {
    currentWeek: '2', settings: {},
    weeks: {
      '1': { dates: { mon: '2026-07-13' }, lifts: { mon: { Squat: nSets(5, 100, 5) } } },
      '2': { dates: { mon: '2026-07-13' }, lifts: { mon: { Squat: nSets(5, 100, 5) } } }, // same date
    },
  };
  const cur = buildCalendarWeekStrength(state, { today: TODAY });
  assert.equal(cur.totalWorkingSets, 5, 'duplicate not double-counted');
  assert.equal(cur.sourceWeekNums.length, 1);
});

// ---------------------------------------------------------------------------
// Legacy slot with no recoverable date is preserved but NOT put in any week.
// ---------------------------------------------------------------------------
test('an undated legacy slot is excluded from the week, never dated to today', () => {
  const state = {
    currentWeek: '1', settings: {},
    weeks: { '1': { dates: {}, lifts: { mon: { Squat: nSets(4, 100, 5) } } } }, // no dates map
  };
  const { byDate, undated } = indexSlotsByDate(state);
  assert.equal(byDate.size, 0, 'no dated buckets');
  assert.equal(undated.length, 1, 'the session is preserved as undated');
  const cur = buildCalendarWeekStrength(state, { today: TODAY });
  assert.equal(cur.totalWorkingSets, 0, 'undated work is never counted in the current week');
});

// ---------------------------------------------------------------------------
// Warm-ups / incompletes excluded; edits/deletes reflected (pure read).
// ---------------------------------------------------------------------------
test('warm-ups and incomplete sets are excluded from the aggregate', () => {
  const state = {
    currentWeek: '1', settings: {},
    weeks: { '1': { dates: { mon: '2026-07-13' }, lifts: { mon: { Squat: [
      warm(40, 10), work(100, 5), work(100, 5), { c: false, w: '100', r: '5' },
    ] } } } },
  };
  const cur = buildCalendarWeekStrength(state, { today: TODAY });
  assert.equal(cur.totalWorkingSets, 2);
  assert.equal(cur.totalVolumeKg, 1000);
});

// ---------------------------------------------------------------------------
// The diagnostic trace names the exact records and why each is (not) included.
// ---------------------------------------------------------------------------
test('explainWeeklyMetric names the excluded prior-week sessions with a reason', () => {
  const state = frozenProgramWeekState();
  const trace = explainWeeklyMetric(state, { today: TODAY });
  assert.equal(trace.selectedWeekKey, '2026-07-13');
  assert.equal(trace.currentWeekStart, '2026-07-13');
  assert.equal(trace.currentWeekEnd, '2026-07-19');
  assert.equal(trace.sessions.length, 4);              // Mon/Tue/Thu/Fri last week
  assert.equal(trace.sessions.every(s => s.included === false), true);
  const mon = trace.sessions.find(s => s.resolvedLocalDate === '2026-07-06');
  assert.ok(mon);
  assert.equal(mon.resolvedWeekKey, '2026-07-06');
  assert.equal(mon.workingSets, 15);
  assert.match(mon.inclusionReason, /belongs to week 2026-07-06/);
  // A no-NaN / no-raw-id guard on the trace values.
  assert.equal(Number.isFinite(mon.volumeKg), true);
});

test('no NaN / Infinity / invalid date reaches the aggregate on junk input', () => {
  const state = {
    currentWeek: '1', settings: {},
    weeks: { '1': { dates: { mon: 'garbage', tue: '2026-07-14' },
      lifts: { mon: { A: nSets(3, 100, 5) }, tue: { A: [{ c: true, w: 'x', r: 'y' }] } } } },
  };
  const cur = buildCalendarWeekStrength(state, { today: TODAY });
  for (const d of cur.days) {
    assert.equal(Number.isFinite(d.workingSets), true);
    assert.equal(Number.isFinite(d.reps), true);
    assert.equal(Number.isFinite(d.volumeKg), true);
  }
  assert.equal(Number.isFinite(cur.totalVolumeKg), true);
});
