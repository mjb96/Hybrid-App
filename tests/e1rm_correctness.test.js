// =============================================================================
// ESTIMATED 1RM CORRECTNESS
//
// Four defects found by auditing the whole e1RM path, from set entry through
// storage and sync to PR detection and analytics:
//
//  1. `exerciseStats.allTimeMax` only ever ROSE. It is persisted AND synced, so
//     mistyping 500 for 50 and immediately correcting it pinned the PR baseline
//     at 583 kg on every device, forever. The cockpit's PR gate reads that
//     baseline, so no genuine PR for the lift could ever fire again. Deleting
//     the workout did not help either.
//  2. Epley's algebraic form gave w × 31/30 at ONE rep, so a tested 100 kg
//     single reported as 103.3 kg — the app's most reliable data point was its
//     most inflated, and an actual max could never report as itself.
//  3. Five PR sites used four different rules. Two counted an exact TIE as a
//     record, two required +0.5, one required +0.01 — so one session could be a
//     PR in the recap and not in the cockpit.
//  4. PR chips rendered "225kg PR" regardless of the athlete's configured unit.
//
// The fixture shape is the app's real storage schema: state.weeks[weekKey] with
// .dates{day} and .lifts{day}{liftName}[sets], sets as {w, r, c, type}.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatedE1rm, estimatedE1rmForSet, isE1rmEligible, isE1rmExercise,
  isE1rmPr, E1RM_PR_EPSILON, MAX_E1RM_REPS,
} from '../js/strength/e1rm.js';
import { computeExercisePRs } from '../js/engine.js';
import { exerciseLoggerHistory, exercisePerformanceHistory } from '../js/workout/exercise-history.js';
import { allLiftsStats, isWeeklyPR } from '../js/metrics/metrics-strength.js';
import { bestE1rmByLiftForWeek, calendarStrengthSummary } from '../js/analytics/strength-calendar.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r, extra = {}) => ({ c: true, w: String(w), r: String(r), ...extra });
const warm = (w, r) => work(w, r, { type: 'W' });
const open = (w, r) => ({ c: false, w: String(w), r: String(r) });

/** One dated session in the app's real week/day storage shape. */
function session(weekKey, day, date, lifts, extra = {}) {
  return { [weekKey]: { activationId: 'a1', programId: 'p1', dates: { [day]: date }, lifts: { [day]: lifts }, runs: {}, notes: {}, gymRpe: {}, gymStats: {}, ...extra } };
}
const stateWith = (...weeks) => ({
  currentWeek: '1', activeProgramId: 'p1', activeActivationId: 'a1',
  exerciseStats: {}, settings: { weightUnit: 'kg' },
  weeks: Object.assign({}, ...weeks),
});

// ---- 1–6. the formula across the rep ranges the brief names ------------------

test('a single returns the load itself — one rep IS the measurement', () => {
  // Epley's w × (1 + r/30) gives 103.33 at r=1. There is nothing to estimate
  // from a single, and inflating it meant a tested max could never report as
  // the weight actually lifted.
  assert.equal(estimatedE1rm(100, 1), 100);
  assert.equal(estimatedE1rm(142.5, 1), 142.5);
  assert.equal(estimatedE1rm('225', '1'), 225);
});

test('2–5 reps follow Epley exactly', () => {
  assert.equal(estimatedE1rm(100, 2), 100 * (1 + 2 / 30));
  assert.equal(estimatedE1rm(100, 3), 100 * (1 + 3 / 30)); // 110.00000000000001 in binary floating point
  assert.equal(estimatedE1rm(100, 5), 100 * (1 + 5 / 30));
});

test('6–10 reps follow Epley exactly', () => {
  assert.equal(estimatedE1rm(100, 6), 120);
  assert.equal(estimatedE1rm(100, 10), 100 * (1 + 10 / 30));
});

test('11–12 reps are the last eligible band', () => {
  assert.equal(estimatedE1rm(100, 11), 100 * (1 + 11 / 30));
  assert.equal(estimatedE1rm(100, 12), 140);
  assert.equal(MAX_E1RM_REPS, 12);
});

test('13+ reps produce no estimate rather than an implausible one', () => {
  // Rep-based equations are least defensible as sets get lighter and longer.
  // 15 reps at 100 would imply a 150 kg max; 30 would imply 200.
  for (const reps of [13, 15, 20, 30, 100]) {
    assert.equal(estimatedE1rm(100, reps), 0, `${reps} reps must not estimate`);
    assert.equal(isE1rmEligible(100, reps), false);
  }
});

test('the estimate is monotonic in both load and reps within the eligible band', () => {
  for (let r = 2; r <= MAX_E1RM_REPS; r++) {
    assert.ok(estimatedE1rm(100, r) > estimatedE1rm(100, r - 1), `${r} reps must exceed ${r - 1}`);
  }
  assert.ok(estimatedE1rm(101, 5) > estimatedE1rm(100, 5));
});

// ---- 7–11. set eligibility ---------------------------------------------------

test('warm-ups never produce an estimate, however heavy', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', {
    'Back Squat': [warm(200, 3), work(100, 5)],
  }));
  const stats = computeExercisePRs(state, state.exerciseStats);
  assert.equal(Math.round(stats.back_squat.allTimeMax), Math.round(estimatedE1rm(100, 5)));
});

test('incomplete, zero-rep and missing-weight sets are all excluded', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', {
    'Back Squat': [open(300, 5), work(300, 0), work(0, 5), work('', 5), work(100, 5)],
  }));
  const stats = computeExercisePRs(state, state.exerciseStats);
  assert.equal(Math.round(stats.back_squat.allTimeMax), Math.round(estimatedE1rm(100, 5)));
});

test('a negative load cannot produce an estimate', () => {
  assert.equal(estimatedE1rm(-50, 5), 0);
  assert.equal(isE1rmEligible(-50, 5), false);
});

test('junk and malformed values return 0, never NaN', () => {
  for (const [w, r] of [['x', 'y'], [null, null], [undefined, 5], [100, 'many'], [{}, []], [NaN, 5]]) {
    const value = estimatedE1rm(w, r);
    assert.equal(Number.isFinite(value), true, `${String(w)}×${String(r)} must be finite`);
    assert.equal(value, 0);
  }
});

test('a fractional rep count truncates rather than being invented', () => {
  // Legacy/imported data can carry "5.5". parseInt truncates to 5, so the
  // estimate is the conservative whole-rep one — never rounded UP into a
  // stronger result than was actually performed. Fresh entry cannot produce
  // this at all: validateSetEntry refuses fractional reps at the set row.
  assert.equal(estimatedE1rm(100, '5.5'), estimatedE1rm(100, 5));
  assert.ok(estimatedE1rm(100, '5.9') < estimatedE1rm(100, 6));
});

// ---- 12–13. exercise-type eligibility ---------------------------------------

test('bodyweight, assisted and band work are refused rather than fabricated', () => {
  // Effective body mass and band assistance are not comparable external loads.
  assert.equal(estimatedE1rmForSet('Pull-Up', work(75, 8)), 0);
  assert.equal(estimatedE1rmForSet('Back Squat', work(75, 8, { bw: true })), 0);
  assert.equal(estimatedE1rmForSet('Back Squat', work(75, 8, { band: 'M' })), 0);
  assert.equal(estimatedE1rmForSet('Back Squat', work(75, 8, { loadMode: 'bodyweight' })), 0);
  assert.equal(estimatedE1rmForSet('Back Squat', work(75, 8, { loadMode: 'assisted' })), 0);
  assert.equal(isE1rmExercise('Pull-Up'), false);
});

test('a normal loaded lift, including an unknown custom one, stays eligible', () => {
  assert.ok(estimatedE1rmForSet('Back Squat', work(100, 5)) > 0);
  assert.ok(estimatedE1rmForSet('Some Homemade Machine Press', work(100, 5)) > 0);
});

// ---- 14–16. the representative set, rounding and units -----------------------

test('a session is represented by its BEST estimate, not its heaviest set', () => {
  // 100×5 (116.7) beats 110×1 (110). Picking the heaviest load would understate
  // the session and make a heavy grindy single mask a better working set.
  const state = stateWith(session('1', 'mon', '2026-07-06', {
    'Back Squat': [work(110, 1), work(100, 5), work(95, 5)],
  }));
  const rows = exercisePerformanceHistory(state, 'Back Squat');
  assert.equal(rows.length, 1);
  assert.equal(Math.round(rows[0].e1rm), Math.round(estimatedE1rm(100, 5)));
  assert.equal(rows[0].weight, 100, 'the source set is identifiable');
  assert.equal(rows[0].reps, 5);
});

test('the internal value keeps full precision; only display rounds', () => {
  const raw = estimatedE1rm(102.5, 7);
  assert.ok(!Number.isInteger(raw), 'the stored estimate is not pre-rounded');
  assert.equal(raw, 102.5 * (1 + 7 / 30));
});

test('lbs loads are never converted — the number is used as entered', () => {
  // The app stores whatever unit the athlete configured and never converts, so
  // the same numeric load must produce the same estimate in either unit.
  assert.equal(estimatedE1rm(225, 5), estimatedE1rm(225, 5));
  assert.equal(estimatedE1rm(225, 1), 225);
});

test('dumbbell and unilateral loads are used exactly as logged', () => {
  // CONVENTION: `w` is the number the athlete typed, whatever it represents to
  // them. Nothing in the app multiplies or divides it, so the logger, the
  // estimate and the display all agree. A dumbbell press logged as 30 estimates
  // from 30 — it is never silently doubled into a 60 "total".
  assert.equal(estimatedE1rmForSet('Dumbbell Bench Press', work(30, 5)), estimatedE1rm(30, 5));
  assert.equal(estimatedE1rmForSet('Bulgarian Split Squat', work(40, 5)), estimatedE1rm(40, 5));
});

test('barbell and dumbbell variants keep separate histories', () => {
  // Merging them would compare a 30 per-hand press against a 100 barbell press.
  const state = stateWith(session('1', 'mon', '2026-07-06', {
    'Barbell Bench Press': [work(100, 5)],
    'Dumbbell Bench Press': [work(30, 5)],
  }));
  const stats = computeExercisePRs(state, state.exerciseStats);
  const keys = Object.keys(stats);
  assert.equal(keys.length, 2, `expected two identities, got ${keys.join(', ')}`);
});

// ---- 17–18. exercise identity ------------------------------------------------

test('an explicit catalogue alias does not fragment history', () => {
  const state = stateWith(
    session('1', 'mon', '2026-07-06', { 'DB Bench Press': [work(30, 5)] }),
    session('2', 'mon', '2026-07-13', { 'Dumbbell Bench Press': [work(32.5, 5)] }),
  );
  const rows = exercisePerformanceHistory(state, 'Dumbbell Bench Press');
  assert.equal(rows.length, 2, 'both spellings resolve to one exercise');
  const stats = computeExercisePRs(state, state.exerciseStats);
  assert.equal(Object.keys(stats).length, 1);
});

test('an unknown custom name keeps exact identity and is not merged', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', {
    'My Weird Press': [work(60, 5)],
    'My Weird Press 2': [work(80, 5)],
  }));
  assert.equal(exercisePerformanceHistory(state, 'My Weird Press').length, 1);
});

// ---- 19–23. the sticky-PR defect --------------------------------------------

test('correcting a mistyped load lowers the PR instead of pinning it forever', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', { 'Back Squat': [work(500, 5)] }));
  computeExercisePRs(state, state.exerciseStats);
  assert.ok(state.exerciseStats.back_squat.allTimeMax > 500, 'the typo is recorded');

  state.weeks['1'].lifts.mon['Back Squat'] = [work(50, 5)];
  computeExercisePRs(state, state.exerciseStats);
  assert.equal(
    Math.round(state.exerciseStats.back_squat.allTimeMax),
    Math.round(estimatedE1rm(50, 5)),
    'the correction must propagate — this is the defect',
  );
});

test('deleting the workout removes it from the all-time max', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', { 'Back Squat': [work(200, 3)] }));
  computeExercisePRs(state, state.exerciseStats);
  assert.ok(state.exerciseStats.back_squat.allTimeMax > 0);

  delete state.weeks['1'].lifts.mon['Back Squat'];
  computeExercisePRs(state, state.exerciseStats);
  assert.equal(state.exerciseStats.back_squat, undefined, 'a PR with no set is not a PR');
});

test('deleting one of two sessions falls back to the remaining best', () => {
  const state = stateWith(
    session('1', 'mon', '2026-07-06', { 'Back Squat': [work(100, 5)] }),
    session('2', 'mon', '2026-07-13', { 'Back Squat': [work(140, 5)] }),
  );
  computeExercisePRs(state, state.exerciseStats);
  assert.equal(Math.round(state.exerciseStats.back_squat.allTimeMax), Math.round(estimatedE1rm(140, 5)));

  delete state.weeks['2'];
  computeExercisePRs(state, state.exerciseStats);
  assert.equal(Math.round(state.exerciseStats.back_squat.allTimeMax), Math.round(estimatedE1rm(100, 5)));
});

test('the corrected baseline lets a genuine PR fire again', () => {
  // The whole user-visible consequence: the cockpit gate reads this baseline,
  // so while it was pinned at 583 no real PR could ever be recognised.
  const state = stateWith(session('1', 'mon', '2026-07-06', { 'Back Squat': [work(500, 5)] }));
  computeExercisePRs(state, state.exerciseStats);
  state.weeks['1'].lifts.mon['Back Squat'] = [work(100, 5)];
  computeExercisePRs(state, state.exerciseStats);

  const history = exerciseLoggerHistory(state, 'Back Squat');
  assert.ok(history.globalBestEstimated1RM < 200, `baseline still poisoned: ${history.globalBestEstimated1RM}`);
  assert.equal(isE1rmPr(estimatedE1rm(120, 5), history.globalBestEstimated1RM), true);
});

test('pre-catalogue history with no backing sets is rescued, not destroyed', () => {
  // Someone whose early sessions predate reliable set storage has a real max
  // that the stored weeks cannot account for. Rebuilding from sets alone would
  // silently delete it.
  const state = stateWith(session('1', 'mon', '2026-07-06', { 'Back Squat': [work(100, 5)] }));
  state.exerciseStats = { back_squat: { allTimeMax: 250, currentEstimatedMax: 0 } };
  computeExercisePRs(state, state.exerciseStats);

  const stat = state.exerciseStats.back_squat;
  assert.equal(Math.round(stat.allTimeMax), Math.round(estimatedE1rm(100, 5)), 'derived value is honest');
  assert.equal(stat.legacyMax, 250, 'the unbacked history is preserved separately');
  assert.equal(exerciseLoggerHistory(state, 'Back Squat').globalBestEstimated1RM, 250,
    'and still counts as a best to beat, so it is not re-awarded as a new PR');
});

test('the legacy floor is frozen — it never grows into a second sticky field', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', { 'Back Squat': [work(300, 5)] }));
  state.exerciseStats = { back_squat: { allTimeMax: 250, currentEstimatedMax: 0 } };
  computeExercisePRs(state, state.exerciseStats);
  assert.equal(state.exerciseStats.back_squat.legacyMax, undefined,
    'a derived value that already exceeds the old one leaves nothing to rescue');

  // Now a typo, then a correction: legacyMax must not absorb the typo.
  state.weeks['1'].lifts.mon['Back Squat'] = [work(900, 5)];
  computeExercisePRs(state, state.exerciseStats);
  state.weeks['1'].lifts.mon['Back Squat'] = [work(120, 5)];
  computeExercisePRs(state, state.exerciseStats);
  assert.ok((state.exerciseStats.back_squat.legacyMax || 0) < 200,
    'the typo must not be laundered into the legacy floor');
});

// ---- 24–27. PR detection consistency ----------------------------------------

test('every PR site shares one rule: prior history required, and it must be BEATEN', () => {
  assert.equal(isE1rmPr(100, 0), false, 'a first-ever log is a baseline, not a record');
  assert.equal(isE1rmPr(0, 100), false);
  assert.equal(isE1rmPr(100, 100), false, 'an exact tie is not a new record');
  assert.equal(isE1rmPr(100 + E1RM_PR_EPSILON, 100), false, 'the threshold is exclusive');
  assert.equal(isE1rmPr(101, 100), true);
});

test('display rounding cannot manufacture a PR', () => {
  // 100.4 and 100 both render as "100", so celebrating that difference would
  // show a trophy beside two identical numbers.
  assert.equal(isE1rmPr(100.4, 100), false);
  assert.equal(Math.round(100.4), Math.round(100));
});

test('floating-point noise cannot manufacture a PR', () => {
  const base = estimatedE1rm(102.5, 7);
  assert.equal(isE1rmPr(base + 1e-9, base), false);
  assert.equal(isE1rmPr(base, base), false);
});

test('isWeeklyPR no longer treats repeating a past best as a new record', () => {
  // It previously accepted `cur >= all - 0.01`, so a lift matched every week
  // reported a PR every week.
  assert.equal(isWeeklyPR({ currentEstimatedMax: 100, allTimeMax: 100, priorBestMax: 100 }), false);
  assert.equal(isWeeklyPR({ currentEstimatedMax: 105, allTimeMax: 105, priorBestMax: 100 }), true);
  assert.equal(isWeeklyPR({ currentEstimatedMax: 105, allTimeMax: 105, priorBestMax: 0 }), false);
  assert.equal(isWeeklyPR(null), false);
});

test('a warm-up can never trigger a PR', () => {
  const state = stateWith(
    session('1', 'mon', '2026-07-06', { 'Back Squat': [work(100, 5)] }),
    session('2', 'mon', '2026-07-13', { 'Back Squat': [warm(400, 5), work(100, 5)] }),
  );
  const summary = calendarStrengthSummary(state, { today: '2026-07-13' });
  assert.deepEqual(summary.prLifts, [], 'a heavy warm-up must not become a record');
});

// ---- 28–31. history integrity -----------------------------------------------

test('duplicate local and synced copies of one session are counted once', () => {
  const state = stateWith(
    session('1', 'mon', '2026-07-06', { 'Back Squat': [work(100, 5)] }),
    session('2', 'tue', '2026-07-06', { 'Back Squat': [work(100, 5)] }), // same date
  );
  const week = bestE1rmByLiftForWeek(state, { weekStart: '2026-07-06' });
  assert.equal(week['Back Squat'].validSetCount, 1, 'the same-date duplicate is deduplicated');
});

test('an edited set weight recalculates the estimate immediately', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', { 'Back Squat': [work(100, 5)] }));
  const before = exercisePerformanceHistory(state, 'Back Squat')[0].e1rm;
  state.weeks['1'].lifts.mon['Back Squat'][0].w = '110';
  const after = exercisePerformanceHistory(state, 'Back Squat')[0].e1rm;
  assert.equal(Math.round(after), Math.round(estimatedE1rm(110, 5)));
  assert.ok(after > before);
});

test('a program prescription is never mistaken for a performance', () => {
  // Targets live in tw/tr and the set is not complete, so nothing is eligible.
  const state = stateWith(session('1', 'mon', '2026-07-06', {
    'Back Squat': [{ c: false, w: '', r: '', tw: '200', tr: '5' }],
  }));
  assert.deepEqual(computeExercisePRs(state, state.exerciseStats), {});
  assert.deepEqual(exercisePerformanceHistory(state, 'Back Squat'), []);
});

test('starting a new program keeps the previous run\'s history intact', () => {
  // A switch archives the old run's weeks under arch:<id>:<n>; all-time readers
  // must still see them.
  const state = stateWith(
    { 'arch:old:1': { activationId: 'old', programId: 'oldp', dates: { mon: '2026-06-01' }, lifts: { mon: { 'Back Squat': [work(150, 5)] } } } },
    session('1', 'mon', '2026-07-06', { 'Back Squat': [work(100, 5)] }),
  );
  const stats = computeExercisePRs(state, state.exerciseStats);
  assert.equal(Math.round(stats.back_squat.allTimeMax), Math.round(estimatedE1rm(150, 5)));
  assert.equal(exercisePerformanceHistory(state, 'Back Squat').length, 2);
  assert.equal(Math.round(allLiftsStats(state, DAYS)['Back Squat'].allTimeMax), Math.round(estimatedE1rm(150, 5)));
});

// ---- 32–35. degenerate and legacy data --------------------------------------

test('empty history produces no estimates and no false zeros', () => {
  const state = stateWith();
  assert.deepEqual(computeExercisePRs(state, state.exerciseStats), {});
  assert.deepEqual(exercisePerformanceHistory(state, 'Back Squat'), []);
  const history = exerciseLoggerHistory(state, 'Back Squat');
  assert.equal(history.hasHistory, false, 'no history must not claim history');
  assert.equal(history.globalBestEstimated1RM, 0);
  assert.equal(history.latest, null);
});

test('a single session is history, not a PR', () => {
  const state = stateWith(session('1', 'mon', '2026-07-06', { 'Back Squat': [work(100, 5)] }));
  const summary = calendarStrengthSummary(state, { today: '2026-07-06' });
  assert.equal(summary.hasCurrentWork, true);
  assert.deepEqual(summary.prLifts, [], 'a first-ever log is a baseline');
});

test('malformed legacy shapes do not throw or emit NaN', () => {
  const state = {
    currentWeek: '1', exerciseStats: {}, weeks: {
      broken: null,
      noLifts: { dates: { mon: '2026-07-06' } },
      notArrays: { dates: { mon: '2026-07-06' }, lifts: { mon: { 'Back Squat': 'nope' } } },
      nullSets: { dates: { mon: '2026-07-06' }, lifts: { mon: { 'Back Squat': [null, undefined, work(100, 5)] } } },
    },
  };
  const stats = computeExercisePRs(state, state.exerciseStats);
  assert.equal(Number.isFinite(stats.back_squat.allTimeMax), true);
  assert.equal(Math.round(stats.back_squat.allTimeMax), Math.round(estimatedE1rm(100, 5)));
});

test('an undated legacy session still contributes to the all-time max', () => {
  // Dated readers correctly skip it, but the max must not silently lose it.
  const state = stateWith({ legacy: { lifts: { mon: { 'Back Squat': [work(160, 3)] } } } });
  const stats = computeExercisePRs(state, state.exerciseStats);
  assert.equal(Math.round(stats.back_squat.allTimeMax), Math.round(estimatedE1rm(160, 3)));
  assert.deepEqual(exercisePerformanceHistory(state, 'Back Squat'), [], 'but it is never given an invented date');
});
