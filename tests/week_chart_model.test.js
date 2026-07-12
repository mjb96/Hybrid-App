// =============================================================================
// WEEK CHART MODEL — analytics verification suite
//
// Deterministic fixtures with INDEPENDENTLY hand-calculated expected results.
// We assert exact values, day buckets, labels, percentages and comparison
// direction — never snapshots — per the analytics-verification brief.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeekChart, parseDurationSecs, DAY_KEYS,
  STRENGTH_METRICS, RUNNING_METRICS,
} from '../js/analytics/week-chart-model.js';

// ---- fixture helpers --------------------------------------------------------
const work = (w, r) => ({ c: true, w, r });            // completed working set
const warm = (w, r) => ({ c: true, w, r, type: 'W' }); // warm-up
const incomplete = (w, r) => ({ c: false, w, r });     // logged but not done

// Build a week's `dates` map from a Monday ISO date (contiguous mon..sun).
function weekDates(mondayISO) {
  const base = new Date(mondayISO + 'T00:00:00Z');
  const out = {};
  DAY_KEYS.forEach((dk, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    out[dk] = d.toISOString().slice(0, 10);
  });
  return out;
}

// -----------------------------------------------------------------------------
test('parseDurationSecs handles MM:SS, HH:MM:SS, bare seconds and junk', () => {
  assert.equal(parseDurationSecs('45:30'), 45 * 60 + 30);
  assert.equal(parseDurationSecs('1:05:00'), 3600 + 5 * 60);
  assert.equal(parseDurationSecs('90'), 90);
  assert.equal(parseDurationSecs(''), 0);
  assert.equal(parseDurationSecs(null), 0);
  assert.equal(parseDurationSecs('abc'), 0);
});

// Fixture 1 — a normal complete week: 7 correct daily buckets, Mon–Sun order.
test('Fixture 1: normal complete week — seven correct daily buckets in Mon–Sun order', () => {
  const state = {
    currentWeek: '2', // week 1 is a completed past week
    weeks: {
      '1': {
        dates: weekDates('2026-06-01'), // Mon 1 Jun … Sun 7 Jun
        lifts: {
          mon: { 'Bench Press': [work(100, 5), work(100, 5), work(100, 5)] }, // 3 sets, vol 1500
          wed: { 'Back Squat': [work(140, 5), work(140, 3)] },                 // 2 sets, vol 700+420=1120
          fri: { 'Deadlift': [work(180, 3)] },                                 // 1 set, vol 540
        },
      },
    },
  };
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: '2026-06-15' });

  assert.equal(m.weekNum, 1);
  assert.equal(m.isCurrentWeek, false);
  assert.deepEqual(m.days.map(d => d.dayKey), DAY_KEYS); // Mon..Sun ordering
  assert.deepEqual(m.days.map(d => d.value), [3, 0, 2, 0, 1, 0, 0]); // working-set buckets
  assert.equal(m.total, 6);
  assert.equal(m.days[0].dayFull, 'Monday');
  assert.equal(m.startDate, '2026-06-01');
  assert.equal(m.endDate, '2026-06-07');

  // volume metric on the same fixture
  const v = buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: -1, today: '2026-06-15' });
  assert.deepEqual(v.days.map(d => d.value), [1500, 0, 1120, 0, 540, 0, 0]);
  assert.equal(v.total, 3160);
});

// Fixture 7 — warm-up + incomplete sets mixed with working sets.
test('Fixture 7: warm-ups and incomplete sets are excluded from sets & volume', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        dates: weekDates('2026-06-01'),
        lifts: {
          mon: {
            'Bench Press': [
              warm(40, 10),   // excluded
              warm(60, 8),    // excluded
              work(100, 5),   // counted: vol 500
              work(100, 5),   // counted: vol 500
              incomplete(100, 5), // excluded (not completed)
            ],
          },
        },
      },
    },
  };
  const sets = buildWeekChart(state, { type: 'strength', metric: 'sets', today: '2026-06-01' });
  assert.equal(sets.days[0].value, 2, 'only the 2 completed working sets count');
  assert.equal(sets.total, 2);

  const vol = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-01' });
  assert.equal(vol.days[0].value, 1000, 'volume excludes warm-ups and incompletes');
});

// Fixture 3 — two complete consecutive weeks: completed-week comparison.
test('Fixture 3: completed-week comparison uses full week vs full prior week', () => {
  const state = {
    currentWeek: '3', // weeks 1 & 2 are both fully in the past
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { Bench: [work(100, 5), work(100, 5)] } } }, // 2 sets
      '2': { dates: weekDates('2026-06-08'), lifts: { mon: { Bench: [work(100, 5), work(100, 5), work(100, 5)] } } }, // 3 sets
    },
  };
  // View week 2 (a completed week) → compare full week 2 vs full week 1.
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: '2026-06-20' });
  assert.equal(m.weekNum, 2);
  assert.equal(m.isCurrentWeek, false);
  assert.equal(m.total, 3);
  assert.equal(m.comparison.type, 'completed');
  assert.equal(m.comparison.comparisonLabel, 'vs previous week');
  assert.equal(m.comparison.previousTotal, 2);
  assert.equal(m.comparison.absoluteChange, 1);
  assert.equal(m.comparison.percentageChange, 50);
  assert.equal(m.comparison.direction, 'up');
  assert.equal(m.comparison.isComparable, true);
});

// Fixture 2 — a partial current week: LIVE comparison vs same elapsed point.
test('Fixture 2: live comparison compares elapsed days only, not a full prior week', () => {
  const state = {
    currentWeek: '2',
    weeks: {
      // previous full week: Mon 3, Wed 2, Fri 4  (sets)
      '1': {
        dates: weekDates('2026-06-01'),
        lifts: {
          mon: { A: [work(50, 5), work(50, 5), work(50, 5)] },
          wed: { A: [work(50, 5), work(50, 5)] },
          fri: { A: [work(50, 5), work(50, 5), work(50, 5), work(50, 5)] },
        },
      },
      // current week: Mon 4, Wed 3 (today is Wed → Fri not yet reached)
      '2': {
        dates: weekDates('2026-06-08'),
        lifts: {
          mon: { A: [work(50, 5), work(50, 5), work(50, 5), work(50, 5)] },
          wed: { A: [work(50, 5), work(50, 5), work(50, 5)] },
        },
      },
    },
  };
  // Today = Wed 10 Jun → elapsed = Mon,Tue,Wed. Compare current Mon+Wed (4+3=7)
  // vs previous Mon+Wed (3+2=5) — NOT vs previous full week (3+2+4=9).
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today: '2026-06-10' });
  assert.equal(m.isCurrentWeek, true);
  assert.equal(m.total, 7, 'full-week bar total is Mon+Wed so far');
  assert.equal(m.elapsedTotal, 7);
  assert.equal(m.comparison.type, 'live');
  assert.equal(m.comparison.comparisonLabel, 'vs same point last week');
  assert.equal(m.comparison.previousTotal, 5, 'elapsed Mon+Wed of previous week');
  assert.equal(m.comparison.absoluteChange, 2);
  assert.equal(m.comparison.percentageChange, 40);
  assert.equal(m.comparison.direction, 'up');

  // today highlight lands on Wednesday only
  assert.deepEqual(m.days.map(d => d.isToday), [false, false, true, false, false, false, false]);
});

// Fixture 13 — zero previous-week activity: no Infinity%, honest message.
test('Fixture 13: zero previous-week total yields no percentage, not Infinity', () => {
  const state = {
    currentWeek: '2',
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: {} },                 // nothing last week
      '2': { dates: weekDates('2026-06-08'), lifts: { mon: { A: [work(50, 5), work(50, 5)] } } },
    },
  };
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', today: '2026-06-08' });
  assert.equal(m.comparison.previousTotal, 0);
  assert.equal(m.comparison.percentageChange, null, 'never Infinity');
  assert.equal(m.comparison.isComparable, false);
  assert.equal(m.comparison.direction, 'up');
  assert.equal(m.comparison.message, 'None at this point last week');
});

// Zero-to-zero → "no change / insufficient", never NaN.
test('zero current and zero previous → flat, no percentage', () => {
  const state = {
    currentWeek: '2',
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: {} },
      '2': { dates: weekDates('2026-06-08'), lifts: {} },
    },
  };
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', today: '2026-06-08' });
  assert.equal(m.total, 0);
  assert.equal(m.comparison.percentageChange, null);
  assert.equal(m.comparison.direction, 'flat');
  assert.equal(m.comparison.isComparable, false);
  assert.equal(m.comparison.message, 'No activity to compare');
});

// No previous week at all → "Not enough previous data".
test('week 1 with no prior week → not comparable', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(50, 5)] } } } },
  };
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', today: '2026-06-01' });
  assert.equal(m.comparison.isComparable, false);
  assert.equal(m.comparison.message, 'Not enough previous data to compare');
  assert.equal(m.comparison.previousTotal, null);
});

// Fixture 8/9 — edited & deleted workouts are reflected (model is a pure read).
test('Fixture 8 & 9: editing / deleting logged sets changes the model output', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(100, 5), work(100, 5)] } } } },
  };
  let m = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-01' });
  assert.equal(m.total, 1000);

  // edit a set's weight
  state.weeks['1'].lifts.mon.A[0].w = 120;
  m = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-01' });
  assert.equal(m.total, 120 * 5 + 100 * 5); // 1100

  // delete the whole exercise
  delete state.weeks['1'].lifts.mon.A;
  m = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-01' });
  assert.equal(m.total, 0);
  assert.equal(m.days[0].hasData, false);
});

// Fixture 19 — an active, unfinished workout: incomplete sets don't count.
test('Fixture 19: active unfinished workout (incomplete sets) counts as no activity', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [incomplete(100, 5), incomplete(100, 5)] } } } },
  };
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', today: '2026-06-01' });
  assert.equal(m.total, 0);
  assert.equal(m.days[0].hasData, false);
});

// Fixture 20 — future-dated records within the current week: shown in bars/total
// but EXCLUDED from the "same point last week" elapsed comparison.
test('Fixture 20: future-dated day in current week is excluded from live comparison denominator', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      // there is no week 0, so give a prior week by viewing week 2 as current
      '1': {
        dates: weekDates('2026-06-01'),
        runs: { mon: { dist: '5', time: '25:00' }, fri: { dist: '10', time: '50:00' } },
      },
      '2': {
        dates: weekDates('2026-06-08'),
        runs: {
          mon: { dist: '6', time: '30:00' },
          fri: { dist: '99', time: '99:00' }, // FUTURE relative to today (Wed)
        },
      },
    },
  };
  const m = buildWeekChart(state, { type: 'running', metric: 'distance', weekOffset: 0, today: '2026-06-10' });
  // currentWeek is '1' by state.currentWeek, so make week 2 current explicitly:
  const state2 = { ...state, currentWeek: '2' };
  const mm = buildWeekChart(state2, { type: 'running', metric: 'distance', weekOffset: 0, today: '2026-06-10' });
  assert.equal(mm.total, 105, 'bars show all logged distance incl. the future Fri');
  // elapsed = Mon..Wed → only Mon (6). previous elapsed Mon..Wed → only Mon (5).
  assert.equal(mm.elapsedTotal, 6);
  assert.equal(mm.comparison.previousTotal, 5);
  assert.equal(mm.comparison.absoluteChange, 1);
  assert.equal(mm.days[4].isFuture, true, 'Friday is flagged future');
});

// Fixture 11 — kg vs lb histories: the model stays unit-agnostic (raw numbers).
test('Fixture 11: volume is the raw weight×reps regardless of unit label', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(225, 5)] } } } },
  };
  const m = buildWeekChart(state, { type: 'strength', metric: 'volume', today: '2026-06-01' });
  assert.equal(m.total, 1125); // 225 × 5 — unit is applied at display time, not here
});

// Running distance + duration buckets and aggregate.
test('running: distance & duration buckets and totals', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        dates: weekDates('2026-06-01'),
        runs: {
          tue: { dist: '5.0', time: '25:00' },
          thu: { dist: '8.0', time: '44:00' },
          sun: { dist: '12.0', time: '1:06:00' },
        },
      },
    },
  };
  const dist = buildWeekChart(state, { type: 'running', metric: 'distance', today: '2026-06-01' });
  assert.deepEqual(dist.days.map(d => d.value), [0, 5, 0, 8, 0, 0, 12]);
  assert.equal(dist.total, 25);

  const dur = buildWeekChart(state, { type: 'running', metric: 'duration', today: '2026-06-01' });
  assert.deepEqual(dur.days.map(d => d.value), [0, 1500, 0, 2640, 0, 0, 3960]);
  assert.equal(dur.total, 1500 + 2640 + 3960);
});

// Fixture 4/5 — month & year boundary weeks bucket correctly by real date.
test('Fixture 4 & 5: weeks crossing month and year boundaries bucket by real date', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      // Mon 29 Dec 2025 … Sun 4 Jan 2026 (crosses month AND year)
      '1': {
        dates: weekDates('2025-12-29'),
        lifts: { wed: { A: [work(50, 5)] }, thu: { A: [work(50, 5)] } }, // Wed=31 Dec, Thu=1 Jan
      },
    },
  };
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', today: '2026-01-10' });
  assert.equal(m.startDate, '2025-12-29');
  assert.equal(m.endDate, '2026-01-04');
  assert.equal(m.days[2].date, '2025-12-31'); // Wed
  assert.equal(m.days[3].date, '2026-01-01'); // Thu
  assert.equal(m.total, 2);
});

// Metric catalogues expose the expected defaults/order.
test('metric catalogues: strength defaults to working sets; running to distance', () => {
  assert.equal(Object.keys(STRENGTH_METRICS)[0], 'sets');
  assert.equal(Object.keys(RUNNING_METRICS)[0], 'distance');
  const s = buildWeekChart({ currentWeek: '1', weeks: {} }, { type: 'strength' });
  assert.equal(s.metric, 'sets');
  const r = buildWeekChart({ currentWeek: '1', weeks: {} }, { type: 'running' });
  assert.equal(r.metric, 'distance');
});

// Fixture 16/17/18 — empty / missing weeks degrade gracefully (local-only, synced,
// migrated data all read through the same path).
test('Fixture 16-18: missing or empty week data degrades to an all-zero week', () => {
  const m = buildWeekChart({ currentWeek: '5', weeks: {} }, { type: 'strength', metric: 'sets', today: '2026-06-10' });
  assert.equal(m.total, 0);
  assert.deepEqual(m.days.map(d => d.value), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(m.days.every(d => d.date === null), true);
  assert.equal(m.comparison.isComparable, false);
});
