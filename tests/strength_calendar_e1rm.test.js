// =============================================================================
// STRENGTH CALENDAR e1RM — the "this week" estimated-1RM metric, calendar-correct.
//
// Proves the Strength overview's e1RM figures attribute work by real workout
// date (not the program-week counter), only ever compare an exercise with
// itself, exclude warm-ups/incompletes/invalid sets, dedup duplicates, and never
// emit a stale value, false zero, NaN or cross-exercise comparison.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatedE1rm, liftE1rmByCalendarWeek, bestE1rmByLiftForWeek,
  calendarStrengthSummary, calendarWeekE1rmSeriesForLift, big3Progression,
} from '../js/metrics/metrics-strength.js';

const work = (w, r) => ({ c: true, w: String(w), r: String(r) });
const warm = (w, r) => ({ c: true, w: String(w), r: String(r), type: 'W' });
const e1 = (w, r) => w * (1 + r / 30);
const TODAY = '2026-07-13';        // Monday, calendar week 13–19 Jul
const WK = '2026-07-13';
const PREV = '2026-07-06';

// ---- canonical formula ------------------------------------------------------
test('estimatedE1rm is the canonical Epley formula and never returns NaN', () => {
  assert.equal(estimatedE1rm(100, 5), 100 * (1 + 5 / 30));
  assert.equal(estimatedE1rm('102.5', '5'), 102.5 * (1 + 5 / 30)); // decimals + strings
  assert.equal(estimatedE1rm(0, 5), 0);        // bodyweight / no load → 0, not NaN
  assert.equal(estimatedE1rm(100, 0), 0);      // no reps → 0
  assert.equal(estimatedE1rm('x', 'y'), 0);    // junk → 0
  assert.equal(estimatedE1rm(100, 30), 200);   // high reps: no cap (preserve existing behaviour)
});

// ---- 1. program week spanning two calendar weeks ----------------------------
test('one program week whose sessions span two calendar weeks splits by real date', () => {
  const state = { currentWeek: '1', weeks: { '1': {
    dates: { mon: '2026-07-06', tue: '2026-07-14' }, // week A, week B
    lifts: { mon: { Bench: [work(100, 5)] }, tue: { Bench: [work(110, 5)] } },
  } } };
  const a = bestE1rmByLiftForWeek(state, { weekStart: '2026-07-06' });
  const b = bestE1rmByLiftForWeek(state, { weekStart: '2026-07-13' });
  assert.equal(Math.round(a.Bench.bestEstimated1RM), Math.round(e1(100, 5)));
  assert.equal(Math.round(b.Bench.bestEstimated1RM), Math.round(e1(110, 5)));
  assert.equal(b.Bench.bestSet.date, '2026-07-14');
});

// ---- 2. rollover without program advancement --------------------------------
test('calendar rollover empties this-week strength without advancing the program', () => {
  const state = { currentWeek: '3', weeks: { '3': { dates: { mon: '2026-07-06' }, lifts: { mon: { Bench: [work(100, 5)] } } } } };
  assert.equal(calendarStrengthSummary(state, { today: '2026-07-12' }).hasCurrentWork, true);
  const rolled = calendarStrengthSummary(state, { today: '2026-07-13' });
  assert.equal(rolled.hasCurrentWork, false);
  assert.equal(rolled.topChange, null);
  assert.equal(state.currentWeek, '3');
});

// ---- 3 & 4. two program weeks / two programs in one calendar week ------------
test('two program weeks in one calendar week both contribute to the same lift best', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { dates: { fri: '2026-07-08' }, lifts: { fri: { Squat: [work(140, 3)] } } },
    '2': { dates: { mon: '2026-07-06' }, lifts: { mon: { Squat: [work(150, 3)] } } },
  } };
  const wk = bestE1rmByLiftForWeek(state, { weekStart: PREV });
  assert.equal(Math.round(wk['Back Squat'].bestEstimated1RM), Math.round(e1(150, 3)));
  assert.deepEqual(wk['Back Squat'].sourceProgramWeeks, [1, 2]);
});

test('old and new program lifts in one calendar week are both present, never merged', () => {
  const state = { currentWeek: '5', weeks: {
    '2': { dates: { thu: '2026-07-09' }, lifts: { thu: { OldRow: [work(80, 8)] } } },
    '5': { dates: { mon: '2026-07-06' }, lifts: { mon: { NewBench: [work(100, 5)] } } },
  } };
  const wk = bestE1rmByLiftForWeek(state, { weekStart: PREV });
  assert.ok(wk.OldRow && wk.NewBench);
  assert.equal(Object.keys(wk).length, 2);
});

// ---- 5,6,7. empty / no-prev / prev-only -------------------------------------
test('no strength this week → honest empty summary (no stale value)', () => {
  const state = { currentWeek: '3', weeks: { '3': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(100, 5)] } } } } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.equal(cs.hasCurrentWork, false);
  assert.equal(cs.bestThisWeek, null);
  assert.equal(cs.topChange, null);
  assert.equal(cs.prCount, 0);
});

test('current week work but no previous-week result → no fabricated change', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } } } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.equal(cs.hasCurrentWork, true);
  assert.equal(cs.topChange, null, 'no same-exercise last-week result → no change claim');
  assert.equal(cs.bestThisWeek.exerciseName, 'Bench');
});

test('previous-week result but none this week is NOT a strength decline', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(100, 5)] } } } } };
  const cs = calendarStrengthSummary(state, { today: TODAY }); // this week empty
  assert.equal(cs.hasCurrentWork, false);
  assert.equal(cs.topChange, null); // never a negative delta from an absent current result
});

// ---- 8,9,10. same-exercise comparison; never cross-exercise -----------------
test('same exercise improving is reported and named', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(100, 5)] } } },
    '2': { dates: { mon: WK },   lifts: { mon: { Bench: [work(105, 5)] } } },
  } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.equal(cs.topChange.exerciseName, 'Bench');
  assert.ok(cs.topChange.deltaKg > 0);
  assert.equal(cs.improvedCount, 1);
});

test('same exercise declining stays same-exercise and is not counted as improved', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(110, 5)] } } },
    '2': { dates: { mon: WK },   lifts: { mon: { Bench: [work(100, 5)] } } },
  } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.equal(cs.topChange.exerciseName, 'Bench');
  assert.ok(cs.topChange.deltaKg < 0);
  assert.equal(cs.improvedCount, 0);
});

test('different exercises are NEVER subtracted from each other', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(100, 5)] } } }, // last week: Bench only
    '2': { dates: { mon: WK },   lifts: { mon: { Squat: [work(140, 5)] } } }, // this week: Squat only
  } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.equal(cs.topChange, null, 'Squat has no Squat last week → no cross-exercise delta');
  assert.equal(cs.bestThisWeek.exerciseName, 'Back Squat');
});

// ---- 11,12. identity: rename / variant stay separate ------------------------
test('an explicit historical alias shares identity for a valid cross-week comparison', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { dates: { mon: PREV }, lifts: { mon: { 'Bench Press': [work(100, 5)] } } },
    '2': { dates: { mon: WK },   lifts: { mon: { 'Barbell Bench Press': [work(105, 5)] } } },
  } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.equal(cs.topChange.exerciseName, 'Barbell Bench Press');
  assert.ok(cs.topChange.deltaKg > 0, 'explicit aliases are the same exercise identity');
});

test('exercise variations (Bench vs Incline Bench) are separate', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: WK },
    lifts: { mon: { 'Bench Press': [work(100, 5)], 'Incline Bench Press': [work(70, 5)] } } } } };
  const wk = bestE1rmByLiftForWeek(state, { weekStart: WK });
  assert.ok(wk['Barbell Bench Press'] && wk['Incline Barbell Bench Press']);
});

// ---- 13,20,21. set validity -------------------------------------------------
test('warm-ups and incompletes are excluded even when heavier', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: WK }, lifts: { mon: { Bench: [
    warm(200, 5), { c: false, w: '300', r: '5' }, work(100, 5),
  ] } } } } };
  const wk = bestE1rmByLiftForWeek(state, { weekStart: WK });
  assert.equal(Math.round(wk.Bench.bestEstimated1RM), Math.round(e1(100, 5)));
  assert.equal(wk.Bench.validSetCount, 1);
});

test('a bodyweight (zero-load) set never becomes a false e1RM', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: WK }, lifts: { mon: { 'Pull-Ups': [work(0, 10)] } } } } };
  const wk = bestE1rmByLiftForWeek(state, { weekStart: WK });
  assert.equal(wk['Pull-Ups'], undefined, 'no valid e1RM set → lift absent, not a 0 entry');
});

// ---- 15,16. edits move to the correct calendar week -------------------------
test('editing a set weight updates the calendar-week best (pure read)', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } } } };
  assert.equal(Math.round(bestE1rmByLiftForWeek(state, { weekStart: WK }).Bench.bestEstimated1RM), Math.round(e1(100, 5)));
  state.weeks['1'].lifts.mon.Bench[0].w = '120';
  assert.equal(Math.round(bestE1rmByLiftForWeek(state, { weekStart: WK }).Bench.bestEstimated1RM), Math.round(e1(120, 5)));
});

test('editing a workout date moves the result to the new calendar week', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } } } };
  assert.ok(bestE1rmByLiftForWeek(state, { weekStart: WK }).Bench);
  state.weeks['1'].dates.mon = PREV; // moved to the previous calendar week
  assert.equal(bestE1rmByLiftForWeek(state, { weekStart: WK }).Bench, undefined);
  assert.ok(bestE1rmByLiftForWeek(state, { weekStart: PREV }).Bench);
});

// ---- 23,24,25. undated + duplicates -----------------------------------------
test('undated legacy sets are excluded from every calendar week', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: {}, lifts: { mon: { Bench: [work(100, 5)] } } } } };
  assert.deepEqual(Object.keys(liftE1rmByCalendarWeek(state)), []);
});

test('a cloud/local duplicate on the same date is counted once', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } },
    '2': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } }, // duplicate day
  } };
  const wk = bestE1rmByLiftForWeek(state, { weekStart: WK });
  assert.equal(Math.round(wk.Bench.bestEstimated1RM), Math.round(e1(100, 5)));
  assert.equal(wk.Bench.validSetCount, 1, 'duplicate not double-counted');
});

// ---- 26. empty intervening week does not reach further back -----------------
test('previous-week comparison uses the immediately prior calendar week only', () => {
  const state = { currentWeek: '3', weeks: {
    '1': { dates: { mon: '2026-06-29' }, lifts: { mon: { Bench: [work(120, 5)] } } }, // 2 weeks ago
    '3': { dates: { mon: WK },           lifts: { mon: { Bench: [work(100, 5)] } } }, // this week
    // last week (6 Jul) intentionally empty
  } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.equal(cs.topChange, null, 'no Bench last week → no change vs the 2-weeks-ago peak');
  assert.equal(cs.bestThisWeek.exerciseName, 'Bench');
});

// ---- 28. calendar-week PR ----------------------------------------------------
test('calendar-week PR requires beating every prior calendar week (with history)', () => {
  const pr = calendarStrengthSummary({ currentWeek: '2', weeks: {
    '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(100, 5)] } } },
    '2': { dates: { mon: WK },   lifts: { mon: { Bench: [work(110, 5)] } } }, // new best
  } }, { today: TODAY });
  assert.deepEqual(pr.prLifts, ['Bench']);
  assert.equal(pr.prCount, 1);

  const notPr = calendarStrengthSummary({ currentWeek: '2', weeks: {
    '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(120, 5)] } } }, // prior higher
    '2': { dates: { mon: WK },   lifts: { mon: { Bench: [work(110, 5)] } } },
  } }, { today: TODAY });
  assert.deepEqual(notPr.prLifts, []);

  const firstEver = calendarStrengthSummary({ currentWeek: '1', weeks: {
    '1': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } }, // no prior history
  } }, { today: TODAY });
  assert.deepEqual(firstEver.prLifts, [], 'a first-ever log is a baseline, not a PR');
});

// ---- 27. historical navigation ----------------------------------------------
test('a past calendar week is directly addressable by weekStart', () => {
  const state = { currentWeek: '9', weeks: {
    '9': { dates: { mon: '2026-06-22' }, lifts: { mon: { Bench: [work(90, 5)] } } },
  } };
  const wk = bestE1rmByLiftForWeek(state, { weekStart: '2026-06-22' });
  assert.equal(Math.round(wk.Bench.bestEstimated1RM), Math.round(e1(90, 5)));
});

// ---- 29. program-progression trend stays program-based ----------------------
test('big3Progression remains keyed by PROGRAM week (intentionally program-based)', () => {
  const prog = big3Progression({ weeks: {
    '4': { dates: { mon: '2026-07-06' }, lifts: { mon: { 'Bench Press': [work(100, 5)] } } },
  } });
  assert.ok('4' in prog.bench.byWeek, 'x-axis is the program week, not a calendar key');
});

// ---- trend series ------------------------------------------------------------
test('calendarWeekE1rmSeriesForLift is a trailing calendar-week series ending this week', () => {
  const state = { currentWeek: '3', weeks: {
    '3': { dates: { mon: PREV, wed: WK }, lifts: { mon: { Bench: [work(100, 5)] }, wed: { Bench: [work(110, 5)] } } },
  } };
  const series = calendarWeekE1rmSeriesForLift(state, 'Bench', { today: TODAY, weeks: 3 });
  assert.equal(series.length, 3);
  assert.equal(Math.round(series[1]), Math.round(e1(100, 5))); // last week
  assert.equal(Math.round(series[2]), Math.round(e1(110, 5))); // this week (newest)
});

// ---- 30. no NaN / Infinity / false zero reaches the aggregate ---------------
test('junk inputs never produce NaN/Infinity in the aggregate', () => {
  const state = { currentWeek: '1', weeks: { '1': { dates: { mon: WK }, lifts: { mon: { Bench: [
    { c: true, w: 'abc', r: 'xyz' }, work(100, 5),
  ] } } } } };
  const cs = calendarStrengthSummary(state, { today: TODAY });
  assert.ok(Number.isFinite(cs.bestThisWeek.e1rm));
  assert.equal(cs.bestThisWeek.exerciseName, 'Bench');
});
