// ==========================================
// JACKED & TAN: SHED EDITION (tests/jt_shed_program.test.js)
//
// Covers the new program-library entry and its pure progression/notes model:
// registration, single-copy activation, five-day schedule, per-day exercises,
// full T1/T2a/T2b/T2c/T3 progressions for all 12 weeks, the pull-up and
// Saturday-row double-progression exceptions, deload/pivot/assessment weeks,
// training-max maths + rounding + missing-TM handling, note content, session-note
// snapshot persistence, completed-workout snapshot protection, program-switch
// isolation, reload persistence, and no-duplicate-creation. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PROGRAM_CATALOG, CATALOG_MAP, getCatalogEntry } from '../js/programs/catalog.js';
import {
  JT_SHED_ID, TRAINING_MAX_LIFTS, T1_LIFTS, T2A_LIFTS, WEEK_LABELS,
  t1Prescription, t2aPrescription, t2bcPrescription, t3Prescription,
  t1BackoffLoad, t2aLoad, roundLoad, suggestTrainingMax,
  PULLUP_SCHEME, SATURDAY_ROW_SCHEME, MONDAY_CORE_SCHEME, SATURDAY_CORE_SCHEME,
  programNotes, weekNote, dayNote, dayExercises,
} from '../js/programs/jt-shed-model.js';
import { buildActivationPlan } from '../js/programs/activation.js';
import {
  setAppState, appState, STORAGE_KEY,
  verifyWeekStorageSchema, reseedActiveProgramIntoWeek, startProgramActivation,
  resolveProgramForState,
} from '../js/state.js';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
}

const PROGRAM = getCatalogEntry(JT_SHED_ID);

// ---- 1. Program-library registration ---------------------------------------

test('1. retired from discovery but retained in the resolver with its original metadata', () => {
  const matches = PROGRAM_CATALOG.filter((p) => p.id === JT_SHED_ID);
  assert.equal(matches.length, 0, 'retired program is not discoverable');
  assert.equal(CATALOG_MAP[JT_SHED_ID].name, 'Jacked & Tan: Shed Edition');
  assert.equal(PROGRAM.durationWeeks, 12);
  assert.equal(PROGRAM.sessionsPerWeek, 5);
  assert.equal(PROGRAM.difficulty, 'intermediate');
  for (const g of ['strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity']) {
    assert.ok(PROGRAM.goals.includes(g), `goal ${g}`);
  }
  for (const e of ['barbell', 'ez-bar', 'rack', 'bench', 'dumbbells', 'bands', 'pullup-bar']) {
    assert.ok(PROGRAM.equipment.includes(e), `equipment ${e}`);
  }
});

// ---- 2 & 19. Single-copy activation, no duplicate creation ------------------

test('2/19. activating resolves the shared catalog entry and creates no duplicate', () => {
  const plan = buildActivationPlan(
    { activeProgramId: null, currentWeek: '1' }, JT_SHED_ID,
    { resolveProgram: (id) => getCatalogEntry(id), resolveName: (id) => getCatalogEntry(id)?.name },
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'first');
  assert.match(plan.title, /Jacked & Tan: Shed Edition/);

  // Resolving for state must NOT add a custom copy — a catalog program stays a
  // single library entry that the engine normalizes on read.
  setAppState({ activeProgramId: JT_SHED_ID, customPrograms: [], settings: {}, weeks: {}, currentWeek: '1', schemaVersion: 3 });
  const resolved = resolveProgramForState(appState, JT_SHED_ID);
  assert.ok(resolved, 'catalog program resolves');
  assert.equal(resolved.id, JT_SHED_ID);
  assert.equal(appState.customPrograms.length, 0, 'no duplicate custom program created');
  assert.equal(PROGRAM_CATALOG.filter((p) => p.id === JT_SHED_ID).length, 0, 'retired program stays out of discovery');
  assert.equal(CATALOG_MAP[JT_SHED_ID].id, JT_SHED_ID, 'legacy activation remains resolvable');
});

// ---- 3. Five-day schedule ---------------------------------------------------

test('3. five training days (Mon/Tue/Thu/Fri/Sat) + Wed/Sun rest', () => {
  const training = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((d) => PROGRAM.days[d].lifts.length);
  assert.deepEqual(training, ['mon', 'tue', 'thu', 'fri', 'sat']);
  assert.equal(PROGRAM.days.wed.lifts.length, 0);
  assert.equal(PROGRAM.days.sun.lifts.length, 0);
  assert.equal(PROGRAM.days.wed.runs, 'Rest');
  assert.equal(PROGRAM.days.sun.runs, 'Rest');
});

// ---- 4. Exercises per day ---------------------------------------------------

test('4. each day carries the correct exercise list', () => {
  assert.deepEqual(PROGRAM.days.mon.lifts, ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Chest-Supported Dumbbell Row', 'Band Leg Curl', 'Barbell Standing Calf Raise', 'Ab Wheel Rollout']);
  assert.deepEqual(PROGRAM.days.tue.lifts, ['Barbell Bench Press', 'Standing Barbell Overhead Press', 'Incline Dumbbell Press', 'Pull-Up', 'Dumbbell Lateral Raise', 'Band Triceps Pushdown', 'Band Face Pull']);
  assert.deepEqual(PROGRAM.days.thu.lifts, ['Conventional Deadlift', 'Front Squat', 'Barbell Row', 'Reverse Lunge', 'Band Leg Curl', 'Seated Dumbbell Calf Raise', 'EZ-Bar Curl']);
  assert.deepEqual(PROGRAM.days.fri.lifts, ['Standing Barbell Overhead Press', 'Close-Grip Bench Press', 'One-Arm Dumbbell Row', 'Dumbbell Pullover', 'Dumbbell Lateral Raise', 'Dumbbell Skull Crusher', 'Dumbbell Rear-Delt Raise']);
  assert.deepEqual(PROGRAM.days.sat.lifts, ['Chest-Supported Dumbbell Row', 'Band Lat Pulldown', 'EZ-Bar Curl', 'Band Triceps Pushdown', 'Dumbbell Hammer Curl', 'Dumbbell Lateral Raise', 'Band Face Pull', 'Ab Wheel Rollout']);

  // Tuesday uses Pull-Up (vertical pull); Saturday keeps Band Lat Pulldown.
  assert.ok(PROGRAM.days.tue.lifts.includes('Pull-Up'));
  assert.ok(!PROGRAM.days.tue.lifts.includes('Band Lat Pulldown'));
  assert.ok(PROGRAM.days.sat.lifts.includes('Band Lat Pulldown'));

  // dayExercises names stay aligned with the bare-string day.lifts.
  for (const d of ['mon', 'tue', 'thu', 'fri', 'sat']) {
    assert.deepEqual(dayExercises(PROGRAM, d).map((e) => e.name), PROGRAM.days[d].lifts);
  }
});

// ---- 5. T1 prescription for all 12 weeks ------------------------------------

test('5. T1 rep-max + back-off for every week', () => {
  const expect = {
    1:  { repMax: 10, bo: { pct: 70,   sets: 3, reps: 6, basis: 'tm' } },
    2:  { repMax: 8,  bo: { pct: 75,   sets: 3, reps: 5, basis: 'tm' } },
    3:  { repMax: 6,  bo: { pct: 80,   sets: 3, reps: 4, basis: 'tm' } },
    4:  { repMax: 4,  bo: { pct: 82.5, sets: 3, reps: 3, basis: 'tm' } },
    5:  { repMax: 2,  bo: { pct: 85,   sets: 4, reps: 2, basis: 'tm' } },
    6:  { single: true, bo: null },
    7:  { repMax: 6,  bo: { pct: 85,   sets: 5, reps: 3, basis: 'dayMax' } },
    8:  { repMax: 4,  bo: { pct: 85,   sets: 5, reps: 2, basis: 'dayMax' } },
    9:  { repMax: 2,  bo: { pct: 85,   sets: 5, reps: 1, basis: 'dayMax' } },
    10: { repMax: 5,  bo: { pct: 90,   sets: 3, reps: 2, basis: 'dayMax' } },
    11: { repMax: 3,  bo: { pct: 90,   sets: 3, reps: 1, basis: 'dayMax' } },
    12: { assessment: true, bo: null },
  };
  for (let w = 1; w <= 12; w++) {
    const p = t1Prescription(w);
    const e = expect[w];
    if (e.single) { assert.equal(p.singleTop, true); assert.equal(p.backoff, null); continue; }
    if (e.assessment) { assert.equal(p.assessment, true); assert.equal(p.trueMaxOptional, true); assert.equal(p.backoff, null); assert.equal(p.repMax, null); continue; }
    assert.equal(p.repMax, e.repMax, `wk${w} repMax`);
    assert.equal(p.backoff.pct, e.bo.pct, `wk${w} bo pct`);
    assert.equal(p.backoff.sets, e.bo.sets, `wk${w} bo sets`);
    assert.equal(p.backoff.reps, e.bo.reps, `wk${w} bo reps`);
    assert.equal(p.backoff.basis, e.bo.basis, `wk${w} bo basis`);
    assert.equal(p.backoff.plusSet, true, `wk${w} plus set`);
  }
});

// ---- 6. T2a prescription for all 12 weeks -----------------------------------

test('6. T2a percentage progression for every week', () => {
  const expect = {
    1: { pct: 50, sets: 4, reps: 10, basis: 'tm' },
    2: { pct: 60, sets: 4, reps: 8,  basis: 'tm' },
    3: { pct: 70, sets: 4, reps: 6,  basis: 'tm' },
    4: { pct: 75, sets: 5, reps: 4,  basis: 'tm' },
    5: { pct: 80, sets: 7, reps: 2,  basis: 'tm' },
    6: null,
    7: { pct: 70, sets: 5, reps: 6,  basis: 'updatedTm' },
    8: { pct: 75, sets: 5, reps: 5,  basis: 'updatedTm' },
    9: { pct: 80, sets: 5, reps: 4,  basis: 'updatedTm' },
    10:{ pct: 82.5, sets: 6, reps: 3, basis: 'updatedTm' },
    11:{ pct: 85, sets: 7, reps: 2,  basis: 'updatedTm' },
    12: null,
  };
  for (let w = 1; w <= 12; w++) {
    const p = t2aPrescription(w);
    if (expect[w] === null) { assert.equal(p, null, `wk${w} no T2a`); continue; }
    assert.deepEqual({ pct: p.pct, sets: p.sets, reps: p.reps, basis: p.basis }, expect[w], `wk${w}`);
  }
});

// ---- 7. T2b/T2c target progression ------------------------------------------

test('7. T2b/T2c target-rep progression (target set + 2 max-rep sets)', () => {
  const targets = { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 7: 15, 8: 12, 9: 10, 10: 6 };
  for (let w = 1; w <= 12; w++) {
    const p = t2bcPrescription(w);
    if (targets[w] != null) {
      assert.equal(p.target, targets[w], `wk${w} target`);
      assert.equal(p.maxRepSets, 2, `wk${w} two max-rep sets`);
      assert.equal(p.none, false);
    } else if (w === 6) {
      assert.equal(p.recovery, true, 'wk6 recovery-only');
      assert.equal(p.target, null);
    } else {
      assert.equal(p.none, true, `wk${w} no T2b/T2c work`);
      assert.equal(p.maxRepSets, 0);
    }
  }
});

// ---- 3rd tier: T3 for all weeks (part of deload coverage) --------------------

test('T3 target progression + light/rest weeks', () => {
  const targets = { 1: 20, 2: 18, 3: 16, 4: 14, 5: 12, 8: 18, 9: 16, 10: 14 };
  for (let w = 1; w <= 12; w++) {
    const p = t3Prescription(w);
    if (targets[w] != null) {
      assert.equal(p.target, targets[w], `wk${w} target`);
      assert.equal(p.maxRepSets, 2);
    }
  }
  assert.deepEqual({ light: t3Prescription(6).light, sets: t3Prescription(6).lightSets, approx: t3Prescription(6).lightApprox }, { light: true, sets: 2, approx: 10 });
  assert.equal(t3Prescription(7).rest, true);
  assert.equal(t3Prescription(7).optionalLight, true);
  assert.deepEqual({ light: t3Prescription(11).light, sets: t3Prescription(11).lightSets, approx: t3Prescription(11).lightApprox }, { light: true, sets: 2, approx: 12 });
  assert.equal(t3Prescription(12).rest, true);
  assert.equal(t3Prescription(12).optionalLight, false);
});

// ---- 8. Pull-up special progression -----------------------------------------

test('8. Pull-Up uses 3×6–10 double progression, not the target-rep tables', () => {
  assert.deepEqual(PULLUP_SCHEME, { sets: 3, minReps: 6, maxReps: 10, doubleProgression: true });
  const pull = dayExercises(PROGRAM, 'tue').find((e) => e.name === 'Pull-Up');
  assert.match(pull.tier, /T2c/);
  assert.match(pull.progression, /6.?10 using double progression|3 sets of 6/);
  assert.ok(pull.notes.some((n) => /band assistance/i.test(n)));
  assert.ok(pull.notes.some((n) => /added weight|external load/i.test(n)));
  assert.ok(pull.notes.some((n) => /15\/12\/10\/8\/6|standard/i.test(n)));
});

// ---- 9. Saturday row double progression -------------------------------------

test('9. Saturday chest-supported row is 4×8–12 double progression', () => {
  assert.deepEqual(SATURDAY_ROW_SCHEME, { sets: 4, minReps: 8, maxReps: 12, doubleProgression: true });
  const row = dayExercises(PROGRAM, 'sat')[0];
  assert.equal(row.name, 'Chest-Supported Dumbbell Row');
  assert.match(row.tier, /Specialization/i);
  assert.match(row.progression, /4 sets of 8.?12/);
  // Core schemes exposed for completeness.
  assert.equal(MONDAY_CORE_SCHEME.maxReps, 15);
  assert.equal(SATURDAY_CORE_SCHEME.sets, 3);
});

// ---- 10. Deload / pivot weeks -----------------------------------------------

test('10. Week 6 pivot: heavy single, no T1 back-off, no T2a, T3 light', () => {
  assert.equal(t1Prescription(6).singleTop, true);
  assert.equal(t1Prescription(6).backoff, null);
  assert.equal(t2aPrescription(6), null);
  assert.equal(t2bcPrescription(6).recovery, true);
  assert.equal(t3Prescription(6).light, true);
});

// ---- 11. Week 12 assessment -------------------------------------------------

test('11. Week 12 assessment: rep-PR optional, no back-off, no T2a/T2b/T2c/T3', () => {
  const t1 = t1Prescription(12);
  assert.equal(t1.assessment, true);
  assert.equal(t1.trueMaxOptional, true);
  assert.equal(t1.backoff, null);
  assert.equal(t2aPrescription(12), null);
  assert.equal(t2bcPrescription(12).none, true);
  assert.equal(t3Prescription(12).rest, true);
});

// ---- 12. Training-max calculations + rounding -------------------------------

test('12. training-max maths round to the 2.5kg loading increment', () => {
  assert.equal(roundLoad(101.2), 100);
  assert.equal(roundLoad(101.3), 102.5);
  assert.equal(roundLoad(100, 5), 100);
  // conservative TM ≈ 90% of current 1RM
  assert.equal(suggestTrainingMax(100), 90);
  assert.equal(suggestTrainingMax(102), 92.5); // 91.8 → nearest 2.5
  // T2a week 1 = 50% TM, rounded
  const wk1 = t2aLoad(1, 100);
  assert.equal(wk1.load, 50);
  assert.equal(wk1.pct, 50);
  assert.equal(wk1.sets, 4);
  assert.equal(wk1.reps, 10);
  // T1 block-1 back-off (of TM)
  const bo1 = t1BackoffLoad(1, { trainingMax: 140 });
  assert.equal(bo1.load, roundLoad(140 * 0.7)); // 98 → 97.5
  assert.equal(bo1.load, 97.5);
  assert.equal(bo1.plusSet, true);
  // T1 block-2 back-off (of the day's rep-max weight)
  const bo7 = t1BackoffLoad(7, { dayRepMaxWeight: 150 });
  assert.equal(bo7.load, roundLoad(150 * 0.85)); // 127.5
  assert.equal(bo7.load, 127.5);
  assert.equal(bo7.basis, 'dayMax');
});

// ---- 13. Missing-training-max handling --------------------------------------

test('13. missing training max prompts, never prescribes 0 or NaN', () => {
  const missing = t2aLoad(1, undefined);
  assert.equal(missing.hasWork, true);
  assert.equal(missing.needsTrainingMax, true);
  assert.equal(missing.load, null);
  assert.notEqual(missing.load, 0);
  assert.ok(!Number.isNaN(missing.load));

  // block-2 back-off needs the day's rep-max weight, not the TM
  const boMissing = t1BackoffLoad(7, {});
  assert.equal(boMissing.hasBackoff, true);
  assert.equal(boMissing.needsDayRepMax, true);
  assert.equal(boMissing.load, null);

  // weeks with no work never demand a TM
  assert.equal(t2aLoad(6, undefined).needsTrainingMax, false);
  assert.equal(t2aLoad(6, undefined).hasWork, false);

  // bad numeric inputs fail closed to null (no NaN)
  assert.equal(roundLoad(NaN), null);
  assert.equal(roundLoad(-10), null);
  assert.equal(suggestTrainingMax('abc'), null);

  // TM lift roster is complete
  for (const lift of ['Back Squat', 'Barbell Bench Press', 'Conventional Deadlift', 'Standing Barbell Overhead Press', 'Romanian Deadlift', 'Front Squat', 'Close-Grip Bench Press']) {
    assert.ok(TRAINING_MAX_LIFTS.includes(lift), `TM lift ${lift}`);
  }
  assert.equal(new Set(TRAINING_MAX_LIFTS).size, TRAINING_MAX_LIFTS.length, 'no duplicate TM lift (OHP listed once)');
});

// ---- 14. Program / week / day / exercise note content -----------------------

test('14. program, week, day and exercise notes are authored (not empty seed)', () => {
  const pn = programNotes(PROGRAM);
  assert.ok(pn.length >= 8);
  assert.ok(pn.some((n) => /90%/.test(n)), 'training-max guidance present');
  assert.ok(pn.some((n) => /Saturday/.test(n)), 'Saturday specialization note present');

  for (let w = 1; w <= 12; w++) {
    const wn = weekNote(PROGRAM, w);
    assert.equal(wn.label, WEEK_LABELS[w], `wk${w} label`);
    assert.ok(wn.notes.length >= 1, `wk${w} has instructions`);
  }
  assert.match(weekNote(PROGRAM, 1).label, /Volume base/);
  assert.match(weekNote(PROGRAM, 6).label, /Pivot/);

  assert.match(dayNote(PROGRAM, 'mon'), /chest-supported row strict/i);
  assert.match(dayNote(PROGRAM, 'sat'), /50.?65 minutes/);

  const rdl = dayExercises(PROGRAM, 'mon').find((e) => e.name === 'Romanian Deadlift');
  assert.ok(rdl.notes.some((n) => /controlled eccentric/i.test(n)));
  const dl = dayExercises(PROGRAM, 'thu').find((e) => e.name === 'Conventional Deadlift');
  assert.ok(dl.notes.some((n) => /pause below the knee|deficit|eccentric/i.test(n)));
});

// ---- state helpers for persistence / isolation tests ------------------------

const done = (w, r) => ({ w, r, c: true });

function freshState(activeId, extra = {}) {
  return {
    activeProgramId: activeId,
    customPrograms: [],
    settings: {},
    weeks: {},
    currentWeek: '1',
    weekStartedAt: new Date().toISOString(),
    schemaVersion: 3,
    ...extra,
  };
}

// ---- 15 & 18. Session-note snapshot persistence + reload --------------------

test('15/18. user session notes persist in the workout snapshot and survive reload', () => {
  setAppState(freshState(JT_SHED_ID));
  verifyWeekStorageSchema('1');
  reseedActiveProgramIntoWeek('1');

  // A user session note is stored on the week/day snapshot, not the program def.
  appState.weeks['1'].notes.mon = 'Felt strong — squat 10RM at 120kg, back tweak on RDL, cut RDL short.';

  // "Reload": serialize exactly like writeLocalNow(), then rehydrate.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  const reloaded = JSON.parse(localStorage.getItem(STORAGE_KEY));

  assert.equal(reloaded.weeks['1'].notes.mon, appState.weeks['1'].notes.mon, 'note survives reload');
  assert.equal(reloaded.activeProgramId, JT_SHED_ID, 'active program survives reload');
  assert.equal(reloaded.currentWeek, '1', 'current program week survives reload');

  // The note lives on the snapshot, never on the shared catalog definition.
  assert.equal(getCatalogEntry(JT_SHED_ID).notes, undefined, 'program def carries no user note field');
});

// ---- 16 & 17. Snapshot protection + program-switch isolation ----------------

test('16/17. completed sets are preserved and no stale completion leaks on switch', () => {
  setAppState(freshState(JT_SHED_ID));
  verifyWeekStorageSchema('1');
  reseedActiveProgramIntoWeek('1');

  // Log Monday: complete Back Squat + a session note.
  const mon = appState.weeks['1'].lifts.mon;
  mon['Back Squat'] = [done(120, 10), done(100, 6), done(100, 6), done(100, 6)];
  appState.weeks['1'].dates.mon = '2026-07-06';
  appState.weeks['1'].notes.mon = 'Squat day done.';
  const snapshotBefore = JSON.stringify(appState.weeks['1'].lifts.mon['Back Squat']);

  // Switch to a different program (StrongLifts) — the real state switch path.
  appState.activeProgramId = 'stronglifts_5x5';
  appState.currentWeek = '1';
  startProgramActivation('stronglifts_5x5', 1);
  reseedActiveProgramIntoWeek('1');

  // The NEW program's active Monday must not contain J&T's completed squat rows.
  const newMon = appState.weeks['1'].lifts.mon;
  const jtOnly = ['Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Chest-Supported Dumbbell Row', 'Ab Wheel Rollout'];
  for (const lift of jtOnly) {
    assert.ok(!(lift in newMon), `${lift} must not leak into StrongLifts' workout`);
  }
  // Any exercise present in the new program begins uncompleted.
  for (const lift of Object.keys(newMon)) {
    assert.ok((newMon[lift] || []).every((s) => !s.c), `${lift} begins uncompleted`);
  }

  // J&T's completed work is archived (kept), byte-for-byte, not mutated.
  const archivedKey = Object.keys(appState.weeks).find((k) => k.startsWith('arch:'));
  assert.ok(archivedKey, 'previous run archived');
  assert.equal(JSON.stringify(appState.weeks[archivedKey].lifts.mon['Back Squat']), snapshotBefore, 'completed squat sets unchanged');
  assert.equal(appState.weeks[archivedKey].notes.mon, 'Squat day done.', 'session note stays attached to the archived workout');
});

test('17b. switching BACK to J&T does not show stale completion from the other program', () => {
  setAppState(freshState('stronglifts_5x5'));
  verifyWeekStorageSchema('1');
  reseedActiveProgramIntoWeek('1');
  // Complete StrongLifts Monday.
  const slMon = appState.weeks['1'].lifts.mon;
  for (const lift of Object.keys(slMon)) slMon[lift] = [done(60, 5), done(60, 5)];
  appState.weeks['1'].dates.mon = '2026-07-06';

  // Switch to J&T.
  appState.activeProgramId = JT_SHED_ID;
  appState.currentWeek = '1';
  startProgramActivation(JT_SHED_ID, 1);
  reseedActiveProgramIntoWeek('1');

  const mon = appState.weeks['1'].lifts.mon;
  assert.deepEqual(Object.keys(mon).sort(), [...PROGRAM.days.mon.lifts].sort(), 'J&T Monday is exactly its own prescription');
  for (const lift of PROGRAM.days.mon.lifts) {
    assert.ok((mon[lift] || []).every((s) => !s.c), `${lift} begins uncompleted (no stale StrongLifts completion)`);
  }
});

// ---- 20. Existing-program regression ----------------------------------------

test('20. adding J&T does not disturb existing catalog programs', () => {
  for (const id of ['stronglifts_5x5', 'nsuns_531', 'texas_method', 'starting_strength', '531_wendler']) {
    assert.ok(getCatalogEntry(id), `existing program ${id} still present`);
  }
  const ids = PROGRAM_CATALOG.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate program ids in the catalog');
  // T1/T2A lift rosters are internally consistent with the program's TM lifts.
  for (const l of T1_LIFTS) assert.ok(TRAINING_MAX_LIFTS.includes(l), `${l} needs a TM`);
  for (const l of T2A_LIFTS) assert.ok(TRAINING_MAX_LIFTS.includes(l), `${l} needs a TM`);
});
