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
  // today is in the week AFTER the data week (Mon 8 Jun), so weekOffset -1 lands
  // on the calendar week that actually holds the Jun 1–7 sessions.
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -1, today: '2026-06-10' });

  assert.equal(m.weekKey, '2026-06-01');
  assert.equal(m.isCurrentWeek, false);
  assert.deepEqual(m.days.map(d => d.dayKey), DAY_KEYS); // Mon..Sun ordering
  assert.deepEqual(m.days.map(d => d.value), [3, 0, 2, 0, 1, 0, 0]); // working-set buckets
  assert.equal(m.total, 6);
  assert.equal(m.days[0].dayFull, 'Monday');
  assert.equal(m.startDate, '2026-06-01');
  assert.equal(m.endDate, '2026-06-07');

  // volume metric on the same fixture
  const v = buildWeekChart(state, { type: 'strength', metric: 'volume', weekOffset: -1, today: '2026-06-10' });
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
  assert.equal(m.weekKey, '2026-06-08');
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
    currentWeek: '3',
    weeks: {
      // real history two weeks back (so this isn't the athlete's very first week)…
      '1': { dates: weekDates('2026-05-25'), lifts: { mon: { A: [work(50, 5)] } } },
      '2': { dates: weekDates('2026-06-01'), lifts: {} },                 // …but nothing last week
      '3': { dates: weekDates('2026-06-08'), lifts: { mon: { A: [work(50, 5), work(50, 5)] } } },
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
    currentWeek: '3',
    weeks: {
      // prior history exists, but both last week and this week are empty
      '1': { dates: weekDates('2026-05-25'), lifts: { mon: { A: [work(50, 5)] } } },
      '2': { dates: weekDates('2026-06-01'), lifts: {} },
      '3': { dates: weekDates('2026-06-08'), lifts: {} },
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

// Fixture 20 — future-dated completed records are invalid live-period evidence:
// flag the date but exclude it from bars, totals and comparison.
test('Fixture 20: future-dated day in current week is excluded from live analytics', () => {
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
  assert.equal(mm.total, 6, 'future Friday is excluded from the live total');
  // elapsed = Mon..Wed → only Mon (6). previous elapsed Mon..Wed → only Mon (5).
  assert.equal(mm.elapsedTotal, 6);
  assert.equal(mm.comparison.previousTotal, 5);
  assert.equal(mm.comparison.absoluteChange, 1);
  assert.equal(mm.days[4].isFuture, true, 'Friday is flagged future');
  assert.equal(mm.days[4].hasData, false, 'future record is not treated as completed evidence');
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
  const dist = buildWeekChart(state, { type: 'running', metric: 'distance', today: '2026-06-07' });
  assert.deepEqual(dist.days.map(d => d.value), [0, 5, 0, 8, 0, 0, 12]);
  assert.equal(dist.total, 25);

  const dur = buildWeekChart(state, { type: 'running', metric: 'duration', today: '2026-06-07' });
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
  // today sits inside the boundary-crossing week itself (Thu 1 Jan).
  const m = buildWeekChart(state, { type: 'strength', metric: 'sets', today: '2026-01-01' });
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
  // With no stored activity the week still resolves to the real calendar week of
  // `today` (Mon 8–Sun 14 Jun) — the label is never derived from the (absent) data.
  assert.equal(m.startDate, '2026-06-08');
  assert.equal(m.endDate, '2026-06-14');
  assert.equal(m.comparison.isComparable, false);
});

// =============================================================================
// TWO SESSIONS ON ONE CALENDAR DAY
//
// Reported from real use: "the In Focus tiles do not handle 2 workouts in one
// day properly". They did not. `collectCalendarWeek` merged a day's `lifts`
// across stored slots but ASSIGNED `runs[day]` and `gymStats[day]`, so the last
// slot won and the earlier session's distance/time was discarded. Sets and
// volume were correct, which is what made it look like a display quirk instead
// of lost data.
//
// The two sessions live in different week keys on purpose: that is how the app
// stores a one-off session, or an imported run alongside a tracked one. Two runs
// inside ONE slot already worked, so the fixture below covers the case that did
// not.
// =============================================================================
const done = (w, r) => ({ c: true, w: String(w), r: String(r) });
const TWO_SESSION_OPTS = { today: '2026-08-05', tz: 'UTC', weekOffset: 0 };

const twoStrengthOneDay = {
  currentWeek: '3',
  weeks: {
    '3': {
      dates: { mon: '2026-08-03' },
      lifts: { mon: { 'Bench Press': [done(80, 5), done(80, 5)] } },
      gymStats: { mon: { time: '45:00', avgHR: '120', maxHR: '150', cals: '300' } },
    },
    'oneoff:s1': {
      sessionId: 's1', sessionKind: 'empty', sessionDay: 'mon', sessionTitle: 'Evening Arms',
      dates: { mon: '2026-08-03' },
      lifts: { mon: { 'Dumbbell Curl': [done(20, 10), done(20, 10), done(20, 10)] } },
      gymStats: { mon: { time: '20:00', avgHR: '110', maxHR: '160', cals: '150' } },
    },
  },
};

const twoRunsOneDay = {
  currentWeek: '3',
  weeks: {
    '3': {
      dates: { mon: '2026-08-03' },
      runSessions: { mon: [{ id: 'r1', dist: '5', time: '25:00' }] },
    },
    'oneoff:r2': {
      sessionId: 'r2', sessionDay: 'mon',
      dates: { mon: '2026-08-03' },
      runSessions: { mon: [{ id: 'r2', dist: '10', time: '50:00', source: 'fit' }] },
    },
  },
};

const monday = (state, type, metric) => {
  const chart = buildWeekChart(state, { ...TWO_SESSION_OPTS, type, metric });
  return { chart, day: chart.days.find((d) => d.dayKey === 'mon') };
};

test('two strength sessions on one day: sets and volume add', () => {
  const sets = monday(twoStrengthOneDay, 'strength', 'sets');
  assert.equal(sets.day.value, 5, '2 + 3 working sets');
  assert.equal(sets.chart.total, 5);
  const volume = monday(twoStrengthOneDay, 'strength', 'volume');
  assert.equal(volume.day.value, 1400, '80×5×2 + 20×10×3');
});

test('two strength sessions on one day: their durations add, not overwrite', () => {
  // Was 1200 (20:00) — the second slot's gymStats replaced the first's outright.
  const { day, chart } = monday(twoStrengthOneDay, 'strength', 'duration');
  assert.equal(day.value, 3900, '45:00 + 20:00 in seconds');
  assert.equal(chart.total, 3900);
});

test('two runs on one day: distance and time add, not overwrite', () => {
  // Was 10km / 50:00 — a morning run simply vanished behind the evening one.
  const dist = monday(twoRunsOneDay, 'running', 'distance');
  assert.equal(dist.day.value, 15, '5km + 10km');
  assert.equal(dist.chart.total, 15);
  const time = monday(twoRunsOneDay, 'running', 'duration');
  assert.equal(time.day.value, 4500, '25:00 + 50:00 in seconds');
});

test('two sessions on one day are counted as two activities', () => {
  // Was hardcoded to 1 per day, whatever the day actually held.
  assert.equal(monday(twoStrengthOneDay, 'strength', 'sets').day.activityCount, 2);
  assert.equal(monday(twoRunsOneDay, 'running', 'distance').day.activityCount, 2);
  // A day with one session still reports one.
  const single = buildWeekChart({
    currentWeek: '3',
    weeks: { '3': { dates: { mon: '2026-08-03' }, lifts: { mon: { 'Bench Press': [done(80, 5)] } } } },
  }, { ...TWO_SESSION_OPTS, type: 'strength', metric: 'sets' });
  assert.equal(single.days.find((d) => d.dayKey === 'mon').activityCount, 1);
});

test('merging two sessions keeps heart rate honest rather than additive', () => {
  const { chart } = monday(twoStrengthOneDay, 'strength', 'duration');
  const gs = chart.weekData.gymStats.mon;
  assert.equal(gs.maxHR, '160', 'peak HR is the higher of the two, never a sum');
  // Duration-weighted: (120×2700 + 110×1200) / 3900 = 116.9…
  assert.equal(gs.avgHR, '117', 'average HR is weighted by session duration');
  assert.equal(gs.cals, '450', 'calories add');
  assert.equal(gs.time, '65:00', 'time stays in the storable M:SS shape');
});

test('a run logged twice in one slot is still not double counted across slots', () => {
  // The control: two runs inside a single stored day already worked and must
  // keep working — the fix must not start counting the same session twice.
  const oneSlot = {
    currentWeek: '3',
    weeks: { '3': {
      dates: { mon: '2026-08-03' },
      runSessions: { mon: [{ id: 'r1', dist: '5', time: '25:00' }, { id: 'r2', dist: '10', time: '50:00' }] },
    } },
  };
  const { day } = monday(oneSlot, 'running', 'distance');
  assert.equal(day.value, 15);
  assert.equal(day.activityCount, 2);
});

// =============================================================================
// TWO **PROGRAMMED** WORKOUTS ON ONE DAY
//
// The case the first fix MISSED, reported from real use: "I completed two
// sessions yesterday and the in focus tile is showing only 17 sets when it should
// be over 30".
//
// The earlier fixture gave its second session a `sessionId`, which only one-off
// sessions carry. Two PROGRAMMED days have no session id, and `indexSlotsByDate`
// treated every id-less slot on a date as one deduplicated family:
//
//   slot.sessionId ? candidate.sessionId === slot.sessionId : !candidate.sessionId
//
// so completing Monday's Push and Tuesday's Pull on the same day made the
// smaller of the two a "duplicate" of the larger and discarded it — before any
// merging could run. The identity now includes the program day.
// =============================================================================
const nSets = (n, w, r) => Array.from({ length: n }, () => ({ c: true, w: String(w), r: String(r) }));

const twoProgrammedOneDay = {
  currentWeek: '3',
  activeProgramId: 'p',
  weeks: {
    '3': {
      dates: { mon: '2026-08-03', tue: '2026-08-03' },
      lifts: {
        mon: { 'Bench Press': nSets(9, 80, 5), 'Overhead Press': nSets(8, 50, 8) },
        tue: { 'Barbell Row': nSets(8, 70, 8), 'Lat Pulldown': nSets(8, 60, 10) },
      },
      gymStats: { mon: { time: '55:00' }, tue: { time: '50:00' } },
    },
  },
};

test('two programmed workouts on one day: every set counts', () => {
  const chart = buildWeekChart(twoProgrammedOneDay, {
    type: 'strength', metric: 'sets', today: '2026-08-05', tz: 'UTC',
  });
  const mon = chart.days.find((d) => d.dayKey === 'mon');
  // 9 + 8 + 8 + 8. Was 17 — Monday's 17 kept, Tuesday's 16 thrown away.
  assert.equal(mon.value, 33);
  assert.equal(chart.total, 33);
  assert.equal(mon.activityCount, 2);
});

test('two programmed workouts on one day: their durations both count', () => {
  const chart = buildWeekChart(twoProgrammedOneDay, {
    type: 'strength', metric: 'duration', today: '2026-08-05', tz: 'UTC',
  });
  assert.equal(chart.days.find((d) => d.dayKey === 'mon').value, 6300, '55:00 + 50:00');
});

test('the same program day stored twice is STILL one session', () => {
  // The collision the dedup exists for: a re-activation reused week numbers, or a
  // cloud copy, so one logical session appears under two week keys on one date.
  // Same program day ⇒ same identity ⇒ counted once, never summed.
  const duplicated = {
    currentWeek: '3',
    weeks: {
      '3': { dates: { mon: '2026-08-03' }, lifts: { mon: { 'Bench Press': nSets(5, 80, 5) } } },
      'arch:old:3': { dates: { mon: '2026-08-03' }, lifts: { mon: { 'Bench Press': nSets(5, 80, 5) } } },
    },
  };
  const chart = buildWeekChart(duplicated, {
    type: 'strength', metric: 'sets', today: '2026-08-05', tz: 'UTC',
  });
  const mon = chart.days.find((d) => d.dayKey === 'mon');
  assert.equal(mon.value, 5, 'a duplicate must not double-count to 10');
  assert.equal(mon.activityCount, 1);
});
