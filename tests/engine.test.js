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
  findLastPerformance,
  computeGAP,
} from '../js/engine.js';

// ---- epley1RM (D1) --------------------------------------------------------
test('epley1RM computes the Epley estimate w*(1+r/30)', () => {
  assert.equal(epley1RM(100, 5), 100 * (1 + 5 / 30));
  assert.ok(Math.abs(epley1RM(60, 1) - 62) < 1e-9); // single rep ≈ load + 1/30
  assert.equal(epley1RM(100, 0), 0);            // zero reps → 0
  assert.equal(epley1RM(0, 5), 0);              // zero load → 0
});

test('epley1RM coerces string inputs and guards garbage', () => {
  assert.equal(epley1RM('100', '5'), 100 * (1 + 5 / 30));
  assert.equal(epley1RM('abc', '5'), 0);
  assert.equal(epley1RM(-50, 5), 0);            // negative load → 0
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
const makeDiagState = (week1Sets, week1GymRpe = null) => ({
  currentWeek: '2',
  weeks: {
    '1': {
      lifts: { mon: { Squat: week1Sets } },
      gymRpe: week1GymRpe != null ? { mon: String(week1GymRpe) } : {},
      runs: {},
      gymStats: {},
      notes: {},
    },
    '2': { lifts: { mon: { Squat: [] } }, gymRpe: {}, runs: {}, gymStats: {}, notes: {} },
  },
  streakData: {},
});

test('computeDiagnosticForLift: per-set rpe >= threshold flags fatigue overload', () => {
  const sets = [
    { w: '80', r: '5', c: true, rpe: '9' },
    { w: '80', r: '5', c: true, rpe: '9.5' },
  ];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
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
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, true);
});

test('computeDiagnosticForLift: no rpe data at all does not flag fatigue overload', () => {
  const sets = [{ w: '80', r: '5', c: true }];
  initEngine(() => makeDiagState(sets, null), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, false);
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
    '1': { lifts: { mon: { 'Squat': [{ w: '90', r: '5', c: true }] } } },
    '2': { lifts: { mon: { 'Squat': [{ w: '100', r: '5', c: true }] } } },
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
    '1': { lifts: { mon: { 'Bench Press': [
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
import { liftTarget, prescribeSetsForLift } from '../js/engine.js';

test('liftTarget prefers the inline spec, else the week modifier', () => {
  const desc = 'Targets: Back Squat (4x5), Romanian Deadlift (3x8)...';
  const mod = { sets: 2, reps: 8 };
  assert.deepEqual(liftTarget(desc, 'Back Squat', mod), { sets: 4, reps: 5 });   // inline
  assert.deepEqual(liftTarget(desc, 'Calf Raises', mod), { sets: 2, reps: 8 });  // modifier (deload)
});

test('prescribeSetsForLift populates the full target with blank, ghost-ready sets', () => {
  const desc = 'Targets: Back Squat (4x5)...';
  const sets = prescribeSetsForLift('4', 'wed', 'Back Squat', desc, { sets: 2, reps: 8 });
  assert.equal(sets.length, 4);                                   // inline 4, not the deload 2
  assert.ok(sets.every(s => s.w === '' && s.r === '' && s.c === false));
});
