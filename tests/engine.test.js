// ==========================================
// ENGINE PRIMITIVE TESTS (tests/engine.test.js)
// Foundation suite for the centralised metric primitives:
//   epley1RM, isCompletedSet, parseDurationToMinutes,
//   paceSecondsPerKm, formatPace
// These are the single-source calculations consumed by analytics, home,
// dashboard, workout and state — so future Hybrid Brain logic can rely on
// them instead of re-deriving its own. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  epley1RM,
  isCompletedSet,
  parseDurationToMinutes,
  paceSecondsPerKm,
  formatPace,
  initEngine,
  computeDiagnosticForLift,
  suggestProgression,
  findLastPerformance,
  computeGAP,
  liftTarget,
  prescribeSetsForLift,
  reconcilePrescribedSets,
  repGoalFromTarget,
} from '../js/engine.js';

// ---- epley1RM (D1) --------------------------------------------------------
test('epley1RM computes the Epley estimate w*(1+r/30)', () => {
  assert.equal(epley1RM(100, 5), 100 * (1 + 5 / 30));
  // CHANGED 2026-08-05, deliberately: this previously asserted 62 for a 60 kg
  // single, pinning Epley's algebraic w × 31/30. That inflated the app's single
  // most reliable data point by 3.3% and meant a tested max could never report
  // as the weight actually lifted. One rep IS the measurement — see
  // tests/e1rm_correctness.test.js for the full contract.
  assert.equal(epley1RM(60, 1), 60);
  assert.equal(epley1RM(100, 0), 0);            // zero reps → 0
  assert.equal(epley1RM(0, 5), 0);              // zero load → 0
});

test('epley1RM coerces string inputs and guards garbage', () => {
  assert.equal(epley1RM('100', '5'), 100 * (1 + 5 / 30));
  assert.equal(epley1RM('abc', '5'), 0);
  assert.equal(epley1RM(-50, 5), 0);            // negative load → 0
  assert.equal(epley1RM(50, 13), 0);            // high-rep work is not a defensible e1RM point
});

// ---- isCompletedSet (D2) --------------------------------------------------
test('isCompletedSet accepts every legacy "truthy completed" encoding', () => {
  for (const c of [true, 'true', 'on', 1]) {
    assert.equal(isCompletedSet({ c }), true, `c=${JSON.stringify(c)}`);
  }
});

test('isCompletedSet rejects incomplete / malformed sets', () => {
  for (const v of [{ c: false }, { c: 0 }, { c: 'off' }, {}, null, undefined]) {
    assert.equal(isCompletedSet(v), false, `value=${JSON.stringify(v)}`);
  }
});

// ---- parseDurationToMinutes (D3) -----------------------------------------
test('parseDurationToMinutes handles h:mm:ss, mm:ss, bare minutes', () => {
  assert.equal(parseDurationToMinutes('1:30:00'), 90);
  assert.equal(parseDurationToMinutes('30:00'), 30);
  assert.equal(parseDurationToMinutes('45'), 45);
  assert.equal(parseDurationToMinutes('0:30'), 0.5);
});

test('parseDurationToMinutes returns 0 for empty / malformed input', () => {
  assert.equal(parseDurationToMinutes(''), 0);
  assert.equal(parseDurationToMinutes(null), 0);
  assert.equal(parseDurationToMinutes(undefined), 0);
  assert.equal(parseDurationToMinutes('x:y'), 0);
});

// ---- paceSecondsPerKm (D6) -----------------------------------------------
test('paceSecondsPerKm = total seconds / distance(km)', () => {
  assert.equal(paceSecondsPerKm(5, '25:00'), 300);     // 1500s / 5km
  assert.equal(paceSecondsPerKm(10, '50:00'), 300);
  assert.equal(paceSecondsPerKm(2, '1:00:00'), 1800);  // h:mm:ss form
});

test('paceSecondsPerKm returns 0 when distance or time is missing', () => {
  assert.equal(paceSecondsPerKm(0, '25:00'), 0);
  assert.equal(paceSecondsPerKm(5, ''), 0);
  assert.equal(paceSecondsPerKm('', '25:00'), 0);
});

// ---- formatPace (D6) ------------------------------------------------------
test('formatPace renders m:ss/km with zero-padded seconds', () => {
  assert.equal(formatPace(300), '5:00/km');
  assert.equal(formatPace(305), '5:05/km');
  assert.equal(formatPace(0), '--');
  assert.equal(formatPace(null), '--');
});

// ---- round-trip ------------------------------------------------------------
test('pace round-trips: format(paceSecondsPerKm(dist,time)) is stable', () => {
  assert.equal(formatPace(paceSecondsPerKm(5, '25:00')), '5:00/km');
});

// ---- computeDiagnosticForLift — per-set RPE (D7) --------------------------
// Helpers: one week of history so history.length===1 (stall check skipped),
// RPE path reached.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DIAG_ACTIVATION = 'diag_activation';
const DIAG_PROGRAM = 'diag_program';
function stampDiagnosticState(state) {
  state.activeActivationId = DIAG_ACTIVATION;
  state.activeProgramId = DIAG_PROGRAM;
  Object.values(state.weeks || {}).forEach((week) => {
    week.activationId = DIAG_ACTIVATION;
    week.programId = DIAG_PROGRAM;
  });
  return state;
}
const makeDiagState = (week1Sets, week1GymRpe = null) => stampDiagnosticState({
  currentWeek: '2',
  weeks: {
    '1': {
      lifts: { mon: { Squat: week1Sets.map((set) => set?.type === 'W' ? set : { tr: 5, ...set }) } },
      dates: { mon: '2026-07-07' },
      gymRpe: week1GymRpe != null ? { mon: String(week1GymRpe) } : {},
      runs: {},
      gymStats: {},
      notes: {},
    },
    '2': { lifts: { mon: { Squat: [] } }, dates: {}, gymRpe: {}, runs: {}, gymStats: {}, notes: {} },
  },
  streakData: {},
});

test('computeDiagnosticForLift: per-set rpe >= threshold flags fatigue overload', () => {
  const sets = [
    { w: '80', r: '5', c: true, rpe: '9' },
    { w: '80', r: '5', c: true, rpe: '9.5' },
  ];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat', 5);
  assert.equal(r.isFatigueOverload, true);
});

test('computeDiagnosticForLift: per-set rpe < threshold does not flag fatigue overload', () => {
  const sets = [
    { w: '80', r: '5', c: true, rpe: '7' },
    { w: '80', r: '5', c: true, rpe: '7.5' },
  ];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, false);
});

test('computeDiagnosticForLift: falls back to session-level rpe when no per-set rpe', () => {
  const sets = [{ w: '80', r: '5', c: true }, { w: '80', r: '5', c: true }];
  initEngine(() => makeDiagState(sets, 9), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat', 5);
  assert.equal(r.isFatigueOverload, true);
  assert.equal(r.progression?.action, 'hold', 'high strength-session RPE must not still recommend loading up');
});

test('computeDiagnosticForLift: no rpe data at all does not flag fatigue overload', () => {
  const sets = [{ w: '80', r: '5', c: true }];
  initEngine(() => makeDiagState(sets, null), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, false);
});

test('computeDiagnosticForLift: unrelated lift and run RPE do not contaminate this exercise', () => {
  const state = makeDiagState([{ w: '80', r: '5', c: true, rpe: '7' }]);
  state.weeks['1'].lifts.mon.Curl = [{ w: '20', r: '10', c: true, rpe: '10' }];
  state.weeks['1'].runs.mon = { dist: '5', time: '25:00', rpe: '10' };
  initEngine(() => state, () => DAYS);
  const result = computeDiagnosticForLift('2', 'mon', 'Squat', 5);
  assert.equal(result.isFatigueOverload, false);
  assert.equal(result.progression?.action, 'load-up');
});

// ---- computeGAP (D10) --------------------------------------------------------

test('computeGAP: flat course returns pace ≈ actual pace', () => {
  // 5 km at 6:00/km (360 s/km), flat altitude
  const distKm    = [0, 1, 2, 3, 4, 5];
  const elapsedSec = [0, 360, 720, 1080, 1440, 1800];
  const altitude   = [100, 100, 100, 100, 100, 100];
  const gap = computeGAP(distKm, elapsedSec, altitude);
  // All points should be close to 360 s/km (grade=0 → factor=1)
  for (let i = 1; i < gap.length; i++) {
    assert.ok(Math.abs(gap[i] - 360) < 1, `point ${i}: expected ~360, got ${gap[i]}`);
  }
});

test('computeGAP: uphill makes GAP faster than actual pace', () => {
  // 1 km/360s on 10% grade (100m elevation gain per km)
  const distKm    = [0, 1];
  const elapsedSec = [0, 360];
  const altitude   = [0, 100];
  const gap = computeGAP(distKm, elapsedSec, altitude);
  assert.ok(gap[1] < 360, `uphill GAP should be < actual pace (was ${gap[1]})`);
  assert.ok(gap[1] > 50,  `GAP should remain positive and sane (was ${gap[1]})`);
});

test('computeGAP: downhill makes GAP slower than actual pace', () => {
  // 1 km/360s on −10% grade
  const distKm    = [0, 1];
  const elapsedSec = [0, 360];
  const altitude   = [100, 0];
  const gap = computeGAP(distKm, elapsedSec, altitude);
  assert.ok(gap[1] > 360, `downhill GAP should be > actual pace (was ${gap[1]})`);
});

test('computeGAP: returns zeros for missing altitude', () => {
  const distKm    = [0, 1, 2];
  const elapsedSec = [0, 360, 720];
  const gap = computeGAP(distKm, elapsedSec, []);
  assert.equal(gap.length, 0);
});

test('computeGAP: returns empty for single-point arrays', () => {
  const gap = computeGAP([0], [0], [100]);
  assert.equal(gap.length, 1);
  assert.equal(gap[0], 0);
});

// ---- findLastPerformance (name-keyed storage) -------------------------------
test('findLastPerformance returns the most recent completed working sets', () => {
  const state = { currentWeek: '3' };
  state.weeks = {
    '1': { dates: { mon: '2026-07-01' }, lifts: { mon: { 'Squat': [{ w: '90', r: '5', c: true }] } } },
    '2': { dates: { mon: '2026-07-08' }, lifts: { mon: { 'Squat': [{ w: '100', r: '5', c: true }] } } },
    '3': { lifts: { mon: { 'Squat': [] } } },
  };
  const result = findLastPerformance(state, 'Squat', { excludeWeek: '3', days: DAYS });
  assert.ok(result, 'should find last performance');
  assert.equal(result.weekKey, '2');
  assert.equal(result.workingSets[0].w, '100');
});

test('findLastPerformance skips warmups and incomplete sets', () => {
  const state = { currentWeek: '2' };
  state.weeks = {
    '1': { dates: { mon: '2026-07-08' }, lifts: { mon: { 'Bench Press': [
      { w: '40', r: '10', c: true, type: 'W' },
      { w: '80', r: '5', c: false },
      { w: '75', r: '5', c: true },
    ] } } },
    '2': { lifts: { mon: { 'Bench Press': [] } } },
  };
  const result = findLastPerformance(state, 'Bench Press', { excludeWeek: '2', days: DAYS });
  assert.ok(result, 'should find a working set');
  assert.equal(result.workingSets.length, 1);
  assert.equal(result.workingSets[0].w, '75');
});

// ==========================================
// SET PRESCRIPTION — target and materialisation agree; no silent reduction
// ==========================================

test('liftTarget prefers the inline spec, else the week modifier', () => {
  const desc = 'Targets: Back Squat (4x5), Romanian Deadlift (3x8)...';
  const mod = { sets: 2, reps: 8 };
  assert.deepEqual(liftTarget(desc, 'Back Squat', mod), { sets: 4, reps: 5 });   // inline
  assert.deepEqual(liftTarget(desc, 'Calf Raises', mod), { sets: 2, reps: 8 });  // modifier (deload)
});

test('liftTarget preserves rep ranges and max-rep prescriptions verbatim', () => {
  const desc = 'Push-Ups (3×max). Incline DB Press (4×10-12).';
  assert.deepEqual(liftTarget(desc, 'Push-Ups', {}), { sets: 3, reps: 'max reps' });
  assert.deepEqual(liftTarget(desc, 'Incline DB Press', {}), { sets: 4, reps: '10–12' });
  assert.equal(repGoalFromTarget('10–12'), 12);
  assert.equal(repGoalFromTarget('max reps'), null);
});

test('liftTarget reads authored sets×reps embedded in legacy lift names', () => {
  assert.deepEqual(liftTarget('Push-up progressions.', 'Push-Ups 4×max', { sets: 3, reps: 10 }), { sets: 4, reps: 'max reps' });
  assert.deepEqual(liftTarget('Volume work.', 'Cable Curl 3×10-12', { sets: 4, reps: 8 }), { sets: 3, reps: '10–12' });
  assert.deepEqual(liftTarget('Legacy rich lift.', { name: 'Back Squat' }, { sets: 2, reps: 6 }), { sets: 2, reps: 6 });
});

test('prescription reconciliation resizes blank rows but never removes user work', () => {
  assert.equal(reconcilePrescribedSets([{ w: '', r: '', c: false }], 4).length, 4);
  assert.equal(reconcilePrescribedSets(Array.from({ length: 4 }, () => ({ w: '', r: '', c: false })), 2).length, 2);
  const logged = [{ w: '20', r: '10', c: true }, { w: '', r: '', c: false }, { w: '', r: '', c: false }];
  assert.equal(reconcilePrescribedSets(logged, 2), logged);
  assert.equal(reconcilePrescribedSets(logged, 4).length, 4);
});

test('prescribeSetsForLift populates the full target with blank, ghost-ready sets', () => {
  const desc = 'Targets: Back Squat (4x5)...';
  const sets = prescribeSetsForLift('4', 'wed', 'Back Squat', desc, { sets: 2, reps: 8 });
  assert.equal(sets.length, 4);                                   // inline 4, not the deload 2
  assert.ok(sets.every(s => s.w === '' && s.r === '' && s.c === false));
});

// ==========================================
// AUTO-PROGRESSION (double progression + RPE autoregulation)
// ==========================================

test('suggestProgression: no history yields a baseline (no suggestion)', () => {
  assert.equal(suggestProgression([], 5).action, 'baseline');
  assert.equal(suggestProgression(null, 5).action, 'baseline');
  // Sets with no usable weight/reps are ignored → baseline.
  assert.equal(suggestProgression([{ w: '', r: '' }], 5).action, 'baseline');
});

test('suggestProgression: hit rep target with effort in hand → add one increment', () => {
  const sets = [{ w: '100', r: '5', rpe: '7' }, { w: '100', r: '5', rpe: '7.5' }];
  const p = suggestProgression(sets, 5, { increment: 2.5, hardRpe: 8.5 });
  assert.equal(p.action, 'load-up');
  assert.equal(p.weight, 102.5);
  assert.equal(p.reps, 5);
});

test('suggestProgression: hit rep target but effort maximal → hold to consolidate', () => {
  const sets = [{ w: '100', r: '5', rpe: '9' }, { w: '100', r: '5', rpe: '9.5' }];
  const p = suggestProgression(sets, 5, { increment: 2.5, hardRpe: 8.5 });
  assert.equal(p.action, 'hold');
  assert.equal(p.weight, 100);
  assert.equal(p.reps, 5);
});

test('suggestProgression: missed rep target → chase one more rep at same load', () => {
  const sets = [{ w: '100', r: '3', rpe: '8' }];
  const p = suggestProgression(sets, 5, { increment: 2.5 });
  assert.equal(p.action, 'rep-up');
  assert.equal(p.weight, 100);
  assert.equal(p.reps, 4);          // R+1, capped at target
});

test('suggestProgression: cutting holds load even when target is hit easily', () => {
  const sets = [{ w: '100', r: '5', rpe: '7' }];
  const p = suggestProgression(sets, 5, { increment: 2.5, weightGoal: 'cut' });
  assert.equal(p.action, 'hold');
  assert.equal(p.weight, 100);
});

test('suggestProgression: a flat trend holds load instead of inventing a precise deload', () => {
  const sets = [{ w: '100', r: '5', rpe: '9' }];
  const p = suggestProgression(sets, 5, { increment: 2.5, stalled: true });
  assert.equal(p.action, 'hold');
  assert.equal(p.weight, 100);
});

test('suggestProgression: uses the heaviest working set as the reference', () => {
  // Heaviest set (105×5) drives the decision, not the first-listed set.
  const sets = [{ w: '95', r: '8', rpe: '7' }, { w: '105', r: '5', rpe: '7' }];
  const p = suggestProgression(sets, 5, { increment: 5, hardRpe: 8.5 });
  assert.equal(p.action, 'load-up');
  assert.equal(p.weight, 110);
});

test('suggestProgression: one missed set at the top load blocks a load increase', () => {
  const sets = [
    { w: '100', r: '5', rpe: '7' },
    { w: '100', r: '4', rpe: '8' },
    { w: '90', r: '8', rpe: '7' },
  ];
  const p = suggestProgression(sets, 5, { increment: 2.5, hardRpe: 8.5 });
  assert.equal(p.action, 'rep-up');
  assert.equal(p.weight, 100);
  assert.equal(p.reps, 5);
});

test('suggestProgression: completed target can progress when optional RPE is absent', () => {
  const sets = [{ w: '60', r: '10' }];
  const p = suggestProgression(sets, 10, { increment: 2.5 });
  assert.equal(p.action, 'load-up');
  assert.equal(p.weight, 62.5);
});

test('computeDiagnosticForLift: surfaces a load-up progression from last session', () => {
  const sets = [{ w: '80', r: '5', c: true, rpe: '7' }, { w: '80', r: '5', c: true, rpe: '7' }];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat', 5);
  assert.ok(r.progression, 'should attach a progression');
  assert.equal(r.progression.action, 'load-up');
  assert.equal(r.suggestedWeight, 82.5);
  assert.equal(r.suggestedReps, 5);
});

test('computeDiagnosticForLift: warm-up-only history yields no progression', () => {
  const sets = [{ w: '40', r: '10', c: true, type: 'W' }];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat', 5);
  assert.equal(r.progression, null);
});

test('computeDiagnosticForLift: warm-up effort is excluded from the fatigue average', () => {
  // A completed warm-up carrying a high RPE must not, on its own, flag fatigue.
  const sets = [{ w: '40', r: '10', c: true, type: 'W', rpe: '10' }];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat', 5);
  assert.equal(r.isFatigueOverload, false);
});

test('computeDiagnosticForLift: completed targets are progression evidence, not a plateau', () => {
  // Three identical sessions all met the target, so double progression wins.
  const flat = [{ w: '100', r: '5', c: true, tr: 5 }];
  const state = {
    currentWeek: '4',
    weeks: {
      '1': { dates: { mon: '2026-06-23' }, lifts: { mon: { Squat: flat } }, gymRpe: {}, runs: {} },
      '2': { dates: { mon: '2026-06-30' }, lifts: { mon: { Squat: flat } }, gymRpe: {}, runs: {} },
      '3': { dates: { mon: '2026-07-07' }, lifts: { mon: { Squat: flat } }, gymRpe: {}, runs: {} },
      '4': { lifts: { mon: { Squat: [] } }, gymRpe: {}, runs: {} },
    },
  };
  stampDiagnosticState(state);
  initEngine(() => state, () => DAYS);
  const r = computeDiagnosticForLift('4', 'mon', 'Squat', 5);
  assert.equal(r.isStalled, false);
  assert.ok(r.progression);
  assert.equal(r.progression.action, 'load-up');
  assert.equal(r.suggestedWeight, 102.5);
  assert.equal(r.message, '');
});

test('computeDiagnosticForLift: repeated target misses over a meaningful span prompt a progress check', () => {
  const missed = [{ w: '100', r: '4', c: true, tr: 5 }];
  const state = {
    currentWeek: '4',
    weeks: {
      '1': { dates: { mon: '2026-06-23' }, lifts: { mon: { Squat: missed } }, gymRpe: {}, runs: {} },
      '2': { dates: { mon: '2026-06-30' }, lifts: { mon: { Squat: missed } }, gymRpe: {}, runs: {} },
      '3': { dates: { mon: '2026-07-07' }, lifts: { mon: { Squat: missed } }, gymRpe: {}, runs: {} },
      '4': { lifts: { mon: { Squat: [] } }, gymRpe: {}, runs: {} },
    },
  };
  stampDiagnosticState(state);
  initEngine(() => state, () => DAYS);
  const result = computeDiagnosticForLift('4', 'mon', 'Squat', 5);
  assert.equal(result.isStalled, true);
  assert.equal(result.progression.action, 'hold');
  assert.match(result.message, /3 comparable sessions over 14 days/i);
  assert.doesNotMatch(result.message, /plateau/i);
});

test('computeDiagnosticForLift: three sessions inside two weeks are too soon for a progress warning', () => {
  const missed = [{ w: '100', r: '4', c: true, tr: 5 }];
  const state = {
    currentWeek: '4', weeks: {
      '1': { dates: { mon: '2026-07-01' }, lifts: { mon: { Squat: missed } }, gymRpe: {}, runs: {} },
      '2': { dates: { mon: '2026-07-05' }, lifts: { mon: { Squat: missed } }, gymRpe: {}, runs: {} },
      '3': { dates: { mon: '2026-07-08' }, lifts: { mon: { Squat: missed } }, gymRpe: {}, runs: {} },
      '4': { lifts: { mon: { Squat: [] } }, gymRpe: {}, runs: {} },
    },
  };
  stampDiagnosticState(state);
  initEngine(() => state, () => DAYS);
  assert.equal(computeDiagnosticForLift('4', 'mon', 'Squat', 5).isStalled, false);
});

test('computeDiagnosticForLift: high-rep work cannot fabricate an e1RM plateau', () => {
  const highRep = [{ w: '40', r: '20', c: true, tr: 20 }];
  const state = {
    currentWeek: '4',
    weeks: {
      '1': { dates: { mon: '2026-06-23' }, lifts: { mon: { Curl: highRep } }, gymRpe: {}, runs: {} },
      '2': { dates: { mon: '2026-06-30' }, lifts: { mon: { Curl: highRep } }, gymRpe: {}, runs: {} },
      '3': { dates: { mon: '2026-07-07' }, lifts: { mon: { Curl: highRep } }, gymRpe: {}, runs: {} },
      '4': { lifts: { mon: { Curl: [] } }, gymRpe: {}, runs: {} },
    },
  };
  stampDiagnosticState(state);
  initEngine(() => state, () => DAYS);
  const result = computeDiagnosticForLift('4', 'mon', 'Curl', 20);
  assert.equal(result.isStalled, false);
});

test('computeDiagnosticForLift: bodyweight and max-rep work reuse history without fake kg progression', () => {
  const bodyweight = [{ w: '82', r: '15', c: true, loadMode: 'bodyweight', bw: true }];
  const state = makeDiagState(bodyweight);
  state.weeks['1'].lifts.mon['Push-Ups'] = bodyweight;
  delete state.weeks['1'].lifts.mon.Squat;
  state.weeks['2'].lifts.mon['Push-Ups'] = [];
  delete state.weeks['2'].lifts.mon.Squat;
  initEngine(() => state, () => DAYS);
  const result = computeDiagnosticForLift('2', 'mon', 'Push-Ups', 0);
  assert.equal(result.progression, null);
  assert.equal(result.suggestedWeight, 82, 'last performance remains available as context');
  assert.equal(result.isStalled, false);
});
