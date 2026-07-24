// ==========================================
// JACKED & TAN: SHED EDITION — tier-aware prescription resolution
// (tests/jt_shed_prescription.test.js)
//
// Regression for the "every exercise shows 4 × 10" bug: the shared
// weeklyVolModifiers week value was being applied to every bare-string lift
// regardless of tier. These tests fail against that behaviour and pass with the
// central resolver (resolveJtPrescription / jtLiftTarget) wired through
// liftTarget → prescribeSetsForLift and the detail/cockpit label paths.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalogEntry } from '../js/programs/catalog.js';
import { JT_SHED_ID, resolveJtPrescription, jtLiftTarget, jtSchemeFor } from '../js/programs/jt-shed-model.js';
import { liftTarget, prescribeSetsForLift } from '../js/engine.js';
import {
  setAppState, appState, verifyWeekStorageSchema, reseedActiveProgramIntoWeek,
} from '../js/state.js';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
}

const P = getCatalogEntry(JT_SHED_ID);
const label = (week, day, name) => resolveJtPrescription(P, week, day, name).displayLabel;
const roles = (week, day, name) => resolveJtPrescription(P, week, day, name).setPlan.map((s) => s.role);

// ---- 1. Week 1 T1 = 10RM + 3×6 @ 70% (+), 4 sets --------------------------

test('1. Week 1 T1 resolves to a 10RM top set plus 3×6 at 70%, last set a plus set', () => {
  const p = resolveJtPrescription(P, 1, 'mon', 'Back Squat');
  assert.equal(p.tier, 'T1');
  assert.equal(p.repMaxTarget, 10);
  assert.equal(p.backoffSets, 3);
  assert.equal(p.backoffReps, 6);
  assert.equal(p.percentage, 70);
  assert.equal(p.percentageSource, 'trainingMax');
  assert.equal(p.isPlusSet, true);
  assert.equal(p.sets, 4);
  assert.match(p.displayLabel, /10RM \+ 3×6 @ 70% \(\+\)/);
  assert.deepEqual(roles(1, 'mon', 'Back Squat'), ['repmax', 'backoff', 'backoff', 'plus']);
  // Friday OHP is the Friday T1.
  assert.match(label(1, 'fri', 'Standing Barbell Overhead Press'), /10RM \+ 3×6 @ 70%/);
});

// ---- 2. Week 1 T2a = 4 × 10 @ 50% -----------------------------------------

test('2. Week 1 T2a resolves to 4 × 10 at 50% — and is the ONLY standard 4×10', () => {
  for (const [day, name] of [['mon', 'Romanian Deadlift'], ['tue', 'Standing Barbell Overhead Press'], ['thu', 'Front Squat'], ['fri', 'Close-Grip Bench Press']]) {
    const p = resolveJtPrescription(P, 1, day, name);
    assert.equal(p.tier, 'T2a', `${name} tier`);
    assert.equal(p.sets, 4);
    assert.equal(p.targetReps, 10);
    assert.equal(p.percentage, 50);
    assert.equal(p.displayLabel, '4 × 10 @ 50%');
  }
});

// ---- 3 & 4. T2b/T2c and T3 target + 2 MRS ---------------------------------

test('3. Week 1 T2b/T2c resolves to target 15 plus two MRS (3 rows)', () => {
  for (const [day, name] of [['mon', 'Dumbbell Bulgarian Split Squat'], ['mon', 'Chest-Supported Dumbbell Row'], ['thu', 'Barbell Row'], ['fri', 'One-Arm Dumbbell Row']]) {
    const p = resolveJtPrescription(P, 1, day, name);
    assert.equal(p.sets, 3, `${name} rows`);
    assert.equal(p.targetReps, 15);
    assert.equal(p.mrsCount, 2);
    assert.equal(p.displayLabel, '15RM + 2 MRS');
    assert.deepEqual(p.setPlan.map((s) => s.role), ['target', 'mrs', 'mrs']);
  }
});

test('4. Week 1 T3 resolves to target 20 plus two MRS (3 rows)', () => {
  for (const [day, name] of [['mon', 'Band Leg Curl'], ['tue', 'Dumbbell Lateral Raise'], ['sat', 'Dumbbell Hammer Curl']]) {
    const p = resolveJtPrescription(P, 1, day, name);
    assert.equal(p.sets, 3, `${name} rows`);
    assert.equal(p.targetReps, 20);
    assert.equal(p.displayLabel, '20RM + 2 MRS');
    assert.deepEqual(p.setPlan.map((s) => s.role), ['target', 'mrs', 'mrs']);
  }
});

// ---- 5. Pull-Up exception --------------------------------------------------

test('5. Pull-Up resolves to 3 × 6–10 double progression (NOT the T2c table, NOT 4×10)', () => {
  const p = resolveJtPrescription(P, 1, 'tue', 'Pull-Up');
  assert.equal(jtSchemeFor('tue', 'Pull-Up', 'T2c (special)'), 'pullup');
  assert.equal(p.sets, 3);
  assert.deepEqual(p.repRange, [6, 10]);
  assert.equal(p.doubleProgression, true);
  assert.equal(p.loadMode, 'bodyweight');
  assert.match(p.displayLabel, /3 × 6–10/);
  assert.notEqual(p.displayLabel, '4 × 10 @ 50%');
});

// ---- 6. Saturday chest-supported row exception -----------------------------

test('6. Saturday Chest-Supported Dumbbell Row resolves to 4 × 8–12 (not T2a 4×10)', () => {
  const p = resolveJtPrescription(P, 1, 'sat', 'Chest-Supported Dumbbell Row');
  assert.equal(p.sets, 4);
  assert.deepEqual(p.repRange, [8, 12]);
  assert.equal(p.doubleProgression, true);
  assert.match(p.displayLabel, /4 × 8–12/);
  // Monday's chest-supported row is the DIFFERENT T2c prescription.
  assert.equal(resolveJtPrescription(P, 1, 'mon', 'Chest-Supported Dumbbell Row').displayLabel, '15RM + 2 MRS');
});

// ---- 7. Core exceptions ----------------------------------------------------

test('7. Core work keeps its exercise-specific range', () => {
  assert.match(resolveJtPrescription(P, 1, 'mon', 'Ab Wheel Rollout').displayLabel, /3 × 6–15/);
  assert.match(resolveJtPrescription(P, 1, 'sat', 'Ab Wheel Rollout').displayLabel, /3 sets/);
  assert.equal(resolveJtPrescription(P, 1, 'mon', 'Ab Wheel Rollout').sets, 3);
});

// ---- 8 & 9. Different prescriptions on the same day ------------------------

test('8/9. exercises on the same day resolve to DIFFERENT prescriptions (not the first applied to all)', () => {
  const monLabels = P.days.mon.lifts.map((n) => label(1, 'mon', n));
  assert.deepEqual(monLabels, [
    '10RM + 3×6 @ 70% (+)', '4 × 10 @ 50%', '15RM + 2 MRS', '15RM + 2 MRS',
    '20RM + 2 MRS', '20RM + 2 MRS', '3 × 6–15 (double progression)',
  ]);
  // The first exercise's label is NOT applied to the rest.
  assert.notEqual(monLabels[1], monLabels[0]);
  assert.equal(new Set(monLabels).size >= 4, true);

  // Tuesday: only the T2a exercise (OHP) shows 4 × 10.
  const tueFourByTen = P.days.tue.lifts.filter((n) => /4 × 10/.test(label(1, 'tue', n)));
  assert.deepEqual(tueFourByTen, ['Standing Barbell Overhead Press']);
});

// ---- 10. Cockpit/materialiser creates the correct set COUNTS ---------------

test('10. materialised set counts match each tier (not 4 across the board)', () => {
  setAppState({ activeProgramId: JT_SHED_ID, customPrograms: [], settings: {}, weeks: {}, currentWeek: '1', schemaVersion: 3 });
  verifyWeekStorageSchema('1');
  reseedActiveProgramIntoWeek('1');
  const mon = appState.weeks['1'].lifts.mon;
  assert.equal(mon['Back Squat'].length, 4);                        // T1
  assert.equal(mon['Romanian Deadlift'].length, 4);                // T2a
  assert.equal(mon['Dumbbell Bulgarian Split Squat'].length, 3);   // T2b
  assert.equal(mon['Band Leg Curl'].length, 3);                    // T3
  assert.equal(mon['Ab Wheel Rollout'].length, 3);                 // core
  const tue = appState.weeks['1'].lifts.tue;
  assert.equal(tue['Pull-Up'].length, 3);                          // double progression
  // Materialised sets stay plain scaffolding (no type/role stamped) so the
  // fresh day is not mis-detected as a started draft.
  const allSets = [...Object.values(mon), ...Object.values(tue)].flat();
  assert.ok(allSets.every((s) => s.type === undefined && s.w === '' && s.r === '' && s.c === false));
});

// ---- 11. Missing training max does not fall back to 4×10 -------------------

test('11. missing training max keeps the tier prescription (no 4×10 fallback, no NaN)', () => {
  // T3 exercise resolved WITHOUT a training max must stay 3 rows / 20RM+2MRS.
  const t3 = liftTarget('', 'Band Leg Curl', { sets: 4, reps: 10 }, { program: P, week: 1, dayKey: 'mon' });
  assert.equal(t3.sets, 3);
  assert.notEqual(`${t3.sets} × ${t3.reps}`, '4 × 10');
  // T2a percentage lift with no TM: label still shows the percentage, load is
  // null (a prompt), never 0 or NaN, and never the week-modifier 4×10 fallback.
  const p = resolveJtPrescription(P, 1, 'mon', 'Romanian Deadlift'); // no opts.trainingMax
  assert.equal(p.displayLabel, '4 × 10 @ 50%');
  assert.equal(p.needsTrainingMax, true);
  assert.equal(p.load, null);
  assert.ok(!Number.isNaN(p.load));
  // With a training max, the load resolves (rounded).
  const withTm = resolveJtPrescription(P, 1, 'mon', 'Romanian Deadlift', { trainingMax: 100 });
  assert.equal(withTm.load, 50);
});

// ---- 12. Week changes alter each tier INDEPENDENTLY ------------------------

test('12. changing the week changes each tier on its own schedule', () => {
  // Week 3: T1 6RM+3×4@80%, T2a 4×6@70%, T2b target 10, T3 target 16.
  assert.match(label(3, 'mon', 'Back Squat'), /6RM \+ 3×4 @ 80%/);
  assert.equal(label(3, 'mon', 'Romanian Deadlift'), '4 × 6 @ 70%');
  assert.equal(label(3, 'mon', 'Dumbbell Bulgarian Split Squat'), '10RM + 2 MRS');
  assert.equal(label(3, 'mon', 'Band Leg Curl'), '16RM + 2 MRS');
  // Week 5: T2a becomes 7×2 while T2b target drops to 6 — independent.
  assert.equal(resolveJtPrescription(P, 5, 'mon', 'Romanian Deadlift').sets, 7);
  assert.equal(resolveJtPrescription(P, 5, 'mon', 'Dumbbell Bulgarian Split Squat').targetReps, 6);
  // Week 6 pivot: T1 heavy single (1 row), no T2a, T3 light — Pull-Up still 3×6–10.
  assert.equal(resolveJtPrescription(P, 6, 'mon', 'Back Squat').sets, 1);
  assert.equal(resolveJtPrescription(P, 6, 'mon', 'Romanian Deadlift').sets, 0);
  assert.equal(resolveJtPrescription(P, 6, 'tue', 'Pull-Up').sets, 3);
  // Week 7 block-2: T1 back-off percentage is of the DAY'S rep-max, not TM.
  assert.equal(resolveJtPrescription(P, 7, 'mon', 'Back Squat').percentageSource, 'dayRepMax');
});

// ---- 13. Existing non-J&T programs are untouched ---------------------------

test('13. non-J&T programs keep the generic week-modifier prescription', () => {
  // No ctx → generic behaviour (week modifier).
  assert.deepEqual(liftTarget('', 'Bench Press', { sets: 5, reps: 5 }), { sets: 5, reps: 5 });
  // ctx for a non-J&T program → still generic.
  const other = { progressionModel: undefined, days: {}, weeklyVolModifiers: {} };
  assert.deepEqual(liftTarget('', 'Bench Press', { sets: 5, reps: 5 }, { program: other, week: 1, dayKey: 'mon' }), { sets: 5, reps: 5 });
  assert.equal(prescribeSetsForLift('1', 'mon', 'Bench Press', '', { sets: 5, reps: 5 }).length, 5);
  // jtLiftTarget returns null for a non-J&T program (caller falls back).
  assert.equal(jtLiftTarget(other, 1, 'mon', 'Bench Press'), null);
});

// ---- 14 & 15. Completed sets + user notes survive reseed -------------------

test('14/15. completed sets and user notes are not mutated when the week is reseeded', () => {
  setAppState({ activeProgramId: JT_SHED_ID, customPrograms: [], settings: {}, weeks: {}, currentWeek: '1', schemaVersion: 3 });
  verifyWeekStorageSchema('1');
  reseedActiveProgramIntoWeek('1');
  // Log two completed Back Squat sets + a session note.
  appState.weeks['1'].lifts.mon['Back Squat'] = [{ w: 120, r: 10, c: true }, { w: 95, r: 6, c: true }];
  appState.weeks['1'].notes.mon = 'Squat 10RM at 120, back-off felt smooth.';

  // Reseeding the SAME active program+week preserves logged rows byte-for-byte
  // (the app-wide non-destructive convention: logged sets are never removed or
  // changed; blanks may be appended to reach the prescribed count — 4 for T1).
  reseedActiveProgramIntoWeek('1');
  const squat = appState.weeks['1'].lifts.mon['Back Squat'];
  assert.deepEqual(squat.slice(0, 2), [{ w: 120, r: 10, c: true }, { w: 95, r: 6, c: true }], 'logged sets unchanged');
  assert.ok(squat.every((s) => s.c === true || (s.w === '' && s.r === '' && s.c === false)), 'only blank rows padded, nothing mutated');
  assert.equal(appState.weeks['1'].notes.mon, 'Squat 10RM at 120, back-off felt smooth.', 'user note intact');
  // An untouched sibling lift is (re)prescribed to the correct tier count (T2b = 3).
  assert.equal(appState.weeks['1'].lifts.mon['Dumbbell Bulgarian Split Squat'].length, 3);
});
