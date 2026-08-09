// =============================================================================
// SHED PPLUL — program + progression contract.
//
// The reason this program needed its own model is the thing most worth pinning:
// bench/squat/press and the deadlift run DIFFERENT weekly progressions, and the
// app's shared per-week modifier cannot express both. If someone later "tidies"
// the model away onto weeklyVolModifiers, the deadlift silently inherits the
// primary wave (4×8 deadlifts in week 1) and nothing else would catch it.
//
// Also guards the boundary in the other direction: an exercise this program does
// not author must NOT receive a main-lift prescription.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG_MAP, PROGRAM_CATALOG } from '../js/programs/catalog.js';
import { liftTarget } from '../js/engine.js';
import { getWeekModifier } from '../js/schema.js';
import { isDeloadWeek } from '../js/programs/progression.js';
import { resolveExercise } from '../js/exercises/catalog.js';
import {
  DAY_PLAN, TRAINING_DAYS, MAIN_BY_DAY, DEADLIFT, SHED_PPLUL_WEEKS,
  isShedPplulProgram, shedPplulWeekPlan, shedPplulLiftTarget,
} from '../js/programs/shed-pplul-model.js';

const program = CATALOG_MAP['shed_pplul'];

/** Resolve exactly the way the cockpit does. */
function target(week, dayKey, lift) {
  const day = program.days[dayKey];
  return liftTarget(day.desc, lift, getWeekModifier(program, week), {
    program, week, dayKey,
  });
}
const spec = (week, dayKey, lift) => {
  const t = target(week, dayKey, lift);
  return `${t.sets}x${t.reps}`;
};

// ── Registration ─────────────────────────────────────────────────────────────

test('the program is registered and discoverable', () => {
  assert.ok(program, 'shed_pplul must resolve from the catalog');
  assert.equal(program.name, 'Shed PPLUL');
  assert.equal(program.durationWeeks, SHED_PPLUL_WEEKS);
  assert.equal(program.sessionsPerWeek, 5);
  assert.ok(PROGRAM_CATALOG.some((p) => p.id === 'shed_pplul'), 'must appear in the discoverable catalog');
  const ids = PROGRAM_CATALOG.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'program ids must stay unique');
});

test('five training days plus two rest days, on the authored schedule', () => {
  const training = Object.entries(program.days).filter(([, d]) => d.lifts.length > 0).map(([k]) => k);
  assert.deepEqual(training, ['mon', 'tue', 'wed', 'fri', 'sat']);
  assert.equal(program.days.thu.lifts.length, 0, 'Thursday is a rest day');
  assert.equal(program.days.sun.lifts.length, 0, 'Sunday is a rest day');
});

test('day.lifts stay bare strings', () => {
  for (const day of Object.values(program.days)) {
    for (const lift of day.lifts) {
      assert.equal(typeof lift, 'string', 'lifts must remain bare strings — do not migrate to objects');
      assert.ok(lift.trim().length > 0);
    }
  }
});

test('every programmed exercise resolves in the exercise catalog', () => {
  const missing = [];
  for (const [key, day] of Object.entries(program.days)) {
    for (const lift of day.lifts) if (!resolveExercise(lift)) missing.push(`${key}:${lift}`);
  }
  assert.deepEqual(missing, [], 'unresolved exercises lose muscle/equipment metadata in analytics');
});

// ── The two main-lift progressions ───────────────────────────────────────────

test('bench, squat and overhead press share the primary progression', () => {
  const expected = {
    1: '4x8', 2: '4x8', 3: '4x8',
    4: '2x8',                       // deload
    5: '4x6', 6: '4x6', 7: '4x6',
    8: '2x6',                       // deload
    9: '5x4', 10: '5x4', 11: '5x4',
    12: '3x4',                      // 1 assessment set + 2 back-offs
  };
  for (let w = 1; w <= 12; w++) {
    assert.equal(spec(w, 'mon', 'Barbell Bench Press'), expected[w], `bench week ${w}`);
    assert.equal(spec(w, 'wed', 'Back Squat'), expected[w], `squat week ${w}`);
    assert.equal(spec(w, 'fri', 'Standing Barbell Overhead Press'), expected[w], `press week ${w}`);
  }
});

test('the deadlift runs its OWN progression, not the primary wave', () => {
  const expected = {
    1: '3x6', 2: '3x6', 3: '3x6',
    4: '2x5',                       // deload — 5s, NOT the primary's 8s
    5: '3x5', 6: '3x5', 7: '3x5',
    8: '2x4',                       // deload
    9: '4x3', 10: '4x3', 11: '4x3',
    12: '3x3',                      // 1 assessment set + 2 back-offs
  };
  for (let w = 1; w <= 12; w++) {
    assert.equal(spec(w, 'sat', DEADLIFT), expected[w], `deadlift week ${w}`);
  }
});

test('the deadlift and the primary lifts genuinely diverge', () => {
  // The single assertion that would fail if the model were collapsed back onto
  // one shared week modifier.
  let diverged = 0;
  for (let w = 1; w <= 12; w++) {
    if (spec(w, 'sat', DEADLIFT) !== spec(w, 'mon', 'Barbell Bench Press')) diverged++;
  }
  assert.equal(diverged, 12, 'the deadlift must differ from the primary lifts in every week');
});

test('week 12 is an assessment set plus two back-off sets, not a single', () => {
  const plan = shedPplulWeekPlan(12);
  assert.equal(plan.assessment, true);
  assert.equal(plan.main.sets, 3, 'one controlled rep-PR set + two back-offs at ~90%');
  assert.equal(plan.deadlift.sets, 3);
  assert.equal(plan.deload, false, 'the assessment week is not a deload');
});

test('deload weeks are labelled so the timeline and cockpit detect them', () => {
  for (const w of [4, 8]) {
    assert.ok(isDeloadWeek(getWeekModifier(program, w)), `week ${w} must read as a deload`);
    assert.equal(shedPplulWeekPlan(w).deload, true);
  }
  for (const w of [1, 5, 9, 11, 12]) {
    assert.ok(!isDeloadWeek(getWeekModifier(program, w)), `week ${w} must not read as a deload`);
  }
});

// ── Accessories ──────────────────────────────────────────────────────────────

test('accessories hold their rep range across the whole block', () => {
  // Double progression adds reps inside the range then load; the prescription
  // itself must not wave with the main lifts.
  for (const w of [1, 3, 5, 7, 9, 11, 12]) {
    assert.equal(spec(w, 'mon', 'Incline Dumbbell Press'), '3x8–12', `week ${w}`);
    assert.equal(spec(w, 'wed', 'Barbell Standing Calf Raise'), '4x8–15', `week ${w}`);
    assert.equal(spec(w, 'sat', 'Front Squat'), '3x6–10', `week ${w}`);
  }
});

test('deload weeks halve accessory sets, and only weeks 4 and 8 do', () => {
  assert.equal(spec(4, 'mon', 'Incline Dumbbell Press'), '2x8–12', '3 sets halve to 2');
  assert.equal(spec(8, 'wed', 'Barbell Standing Calf Raise'), '2x8–15', '4 sets halve to 2');
  assert.equal(spec(4, 'mon', 'Band Face Pull'), '1x15–20', '2 sets halve to 1, never 0');
  // Week 12 reduces main-lift work but the spec keeps accessories at full volume.
  assert.equal(spec(12, 'mon', 'Incline Dumbbell Press'), '3x8–12');
  assert.equal(shedPplulWeekPlan(12).accessoryScale, 1);
});

test('the same lift on different days keeps different prescriptions', () => {
  // Tuesday owns the main pull-up work; Friday's vertical pull stays lower.
  assert.equal(spec(1, 'tue', 'Pull-Up'), '4x5–8');
  assert.equal(spec(1, 'fri', 'Pull-Up'), '3x6–10');
  assert.equal(spec(1, 'tue', 'EZ-Bar Curl'), '3x8–12');
  assert.equal(spec(1, 'fri', 'EZ-Bar Curl'), '2x8–12');
});

// ── Boundaries ───────────────────────────────────────────────────────────────

test('an unauthored lift does not inherit a main-lift prescription', () => {
  // Adding an exercise mid-session must fall through to normal handling rather
  // than being handed the day's main-lift sets and reps.
  assert.equal(shedPplulLiftTarget(program, 1, 'mon', 'Barbell Shrug'), null);
  const t = target(1, 'mon', 'Barbell Shrug');
  assert.equal(t.sets, getWeekModifier(program, 1).sets, 'falls back to the week modifier');
});

test('the model refuses weeks outside the block and foreign programs', () => {
  for (const bad of [0, 13, -1, NaN, null, undefined, 'x']) {
    assert.equal(shedPplulWeekPlan(bad), null, `week ${String(bad)} must not resolve`);
    assert.equal(shedPplulLiftTarget(program, bad, 'mon', 'Barbell Bench Press'), null);
  }
  assert.equal(isShedPplulProgram({ progressionModel: 'jt-shed' }), false);
  assert.equal(isShedPplulProgram(null), false);
  assert.equal(shedPplulLiftTarget({ id: 'other' }, 1, 'mon', 'Barbell Bench Press'), null);
});

test('the engine change does not touch any other program', () => {
  // Every other catalog program must resolve exactly as it did before, i.e.
  // through description parsing or the week modifier.
  for (const other of PROGRAM_CATALOG.filter((p) => p.id !== 'shed_pplul')) {
    assert.equal(shedPplulLiftTarget(other, 1, 'mon', 'Barbell Bench Press'), null,
      `${other.id} must not be resolved by the Shed PPLUL model`);
  }
});

test('Shed PPLUL does not share the Jacked & Tan table', () => {
  // J&T Simplified is close but wrong here: its deadlift is 2×6 in week 4 and
  // 3×4 in weeks 5–7. Sharing one table would also couple future edits.
  assert.equal(program.progressionModel, 'shed-pplul');
  assert.equal(spec(4, 'sat', DEADLIFT), '2x5', 'not J&T’s 2×6');
  assert.equal(spec(6, 'sat', DEADLIFT), '3x5', 'not J&T’s 3×4');
});

// ── Authoring integrity ──────────────────────────────────────────────────────

test('days, dayExercises and the model plan stay in sync', () => {
  for (const key of TRAINING_DAYS) {
    const planned = DAY_PLAN[key].exercises.map((e) => e.name);
    assert.deepEqual(program.days[key].lifts, planned, `${key}: days.lifts must mirror DAY_PLAN`);
    assert.deepEqual(program.dayExercises[key].map((e) => e.name), planned,
      `${key}: dayExercises must mirror DAY_PLAN order`);
  }
});

test('each training day is anchored on exactly one main lift', () => {
  for (const [dayKey, mainLift] of Object.entries(MAIN_BY_DAY)) {
    const mains = DAY_PLAN[dayKey].exercises.filter((e) => e.main);
    assert.equal(mains.length, 1, `${dayKey} must have exactly one main lift`);
    assert.equal(mains[0].name, mainLift);
  }
  // Tuesday (Pull) is deliberately accessory-only — no fifth main lift.
  assert.equal(DAY_PLAN.tue.exercises.filter((e) => e.main).length, 0);
});

test('every accessory carries a usable rep prescription', () => {
  for (const key of TRAINING_DAYS) {
    for (const e of DAY_PLAN[key].exercises) {
      if (e.main) continue;
      assert.ok(e.sets > 0, `${key}:${e.name} needs a set count`);
      const hasRange = Number.isFinite(e.min) && Number.isFinite(e.max) && e.max >= e.min;
      assert.ok(hasRange || typeof e.reps === 'string',
        `${key}:${e.name} needs either a min/max range or an explicit reps string`);
    }
  }
});

test('weekly volume modifiers exist for all twelve weeks', () => {
  for (let w = 1; w <= 12; w++) {
    const mod = getWeekModifier(program, w);
    assert.ok(mod.sets > 0 && mod.reps > 0, `week ${w} modifier must be populated`);
    assert.ok(String(mod.intensityLabel || '').length > 10, `week ${w} needs a descriptive label`);
  }
});

// ── A personal copy inherits the progression model ───────────────────────────
//
// `duplicateCustomProgram` deep-clones the catalog entry into `customPrograms`,
// so a copy made BEFORE its source gained `progressionModel` has no hook. Every
// lift on every day then collapses to the one shared week modifier: a real Shed
// PPLUL copy showed "4 × 8" for the entire programme — six accessories that
// should each have their own prescription, and a deadlift that should be 3 × 6.
//
// The copy lives in the athlete's own state, so shipping a corrected catalog
// never reaches it. `liftTarget` therefore resolves the model from
// `sourceProgramId` at READ time. Nothing stored is rewritten, so there is no
// migration, sync or export surface.

/** A copy exactly as duplicateCustomProgram makes one, minus the newer field. */
function legacyCopy() {
  const copy = JSON.parse(JSON.stringify(program));
  copy.id = 'prog_legacy_copy';
  copy.sourceProgramId = 'shed_pplul';
  copy.isPrimaryCustomization = true;
  delete copy.progressionModel;
  return copy;
}

const copyTarget = (prog, week, dayKey, lift) => {
  const t = liftTarget(prog.days[dayKey].desc, lift, getWeekModifier(prog, week), { program: prog, week, dayKey });
  return `${t.sets}x${t.reps}`;
};

test('a copy made before progressionModel existed still resolves accessories', () => {
  const copy = legacyCopy();
  assert.equal(copy.progressionModel, undefined, 'fixture must lack the hook');

  // The exact reported symptom: every Monday lift reading 4x8.
  assert.equal(copyTarget(copy, 1, 'mon', 'Incline Dumbbell Press'), '3x8–12');
  assert.equal(copyTarget(copy, 1, 'mon', 'Seated Dumbbell Shoulder Press'), '2x8–12');
  assert.equal(copyTarget(copy, 1, 'mon', 'Band Face Pull'), '2x15–20');
});

test('a copy keeps the deadlift on its own wave, not the primary one', () => {
  // The sharpest tell: week 1 primary is 4x8, the deadlift is 3x6. A copy that
  // lost the model showed the deadlift as 4x8 — a different exercise entirely.
  const copy = legacyCopy();
  assert.equal(copyTarget(copy, 1, 'sat', DEADLIFT), '3x6');
  assert.equal(copyTarget(copy, 1, 'mon', MAIN_BY_DAY.mon), '4x8');
  assert.equal(copyTarget(copy, 9, 'sat', DEADLIFT), '4x3');
});

test('a copy still halves accessory volume on a deload', () => {
  const copy = legacyCopy();
  assert.equal(copyTarget(copy, 4, 'mon', 'Dumbbell Lateral Raise'), '2x12–20');
  assert.equal(copyTarget(copy, 4, 'mon', MAIN_BY_DAY.mon), '2x8');
});

test('inheritance needs a real source — it never guesses a model', () => {
  // A personal program the athlete built themselves has no sourceProgramId, and
  // a copy of something that carries no model must not acquire one.
  const own = legacyCopy();
  delete own.sourceProgramId;
  assert.equal(copyTarget(own, 1, 'mon', 'Incline Dumbbell Press'),
    `${getWeekModifier(own, 1).sets}x${getWeekModifier(own, 1).reps}`,
    'a program with no source must fall through to its week modifier');

  const unknownSource = legacyCopy();
  unknownSource.sourceProgramId = 'no_such_program';
  assert.equal(copyTarget(unknownSource, 1, 'mon', 'Incline Dumbbell Press'),
    `${getWeekModifier(unknownSource, 1).sets}x${getWeekModifier(unknownSource, 1).reps}`);
});

test('an exercise the athlete swapped in is not given a programmed prescription', () => {
  // Edits must survive inheritance: an unauthored lift falls through exactly as
  // it does for the catalog program itself.
  const copy = legacyCopy();
  const mod = getWeekModifier(copy, 1);
  assert.equal(copyTarget(copy, 1, 'mon', 'Cable Crossover'), `${mod.sets}x${mod.reps}`);
});
