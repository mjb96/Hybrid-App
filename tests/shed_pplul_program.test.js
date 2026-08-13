// =============================================================================
// SHED PPLUL — authored plan + performance-based progression contract.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG_MAP, PROGRAM_CATALOG } from '../js/programs/catalog.js';
import { liftTarget } from '../js/engine.js';
import { getWeekModifier } from '../js/schema.js';
import { isDeloadWeek } from '../js/programs/progression.js';
import { canonicalExerciseId, resolveExercise } from '../js/exercises/catalog.js';
import {
  DAY_PLAN, TRAINING_DAYS, MAIN_BY_DAY, DEADLIFT, SHED_PPLUL_WEEKS,
  isShedPplulProgram, shedPplulWeekPlan, shedPplulLiftTarget,
} from '../js/programs/shed-pplul-model.js';

const program = CATALOG_MAP.shed_pplul;

function target(week, dayKey, lift) {
  const day = program.days[dayKey];
  return liftTarget(day.desc, lift, getWeekModifier(program, week), {
    program, week, dayKey,
  });
}

const spec = (week, dayKey, lift) => {
  const resolved = target(week, dayKey, lift);
  return `${resolved.sets}x${resolved.reps}`;
};

test('the ongoing program is registered as a renewable twelve-week window', () => {
  assert.ok(program);
  assert.equal(program.name, 'Shed PPLUL');
  assert.equal(program.durationWeeks, SHED_PPLUL_WEEKS);
  assert.equal(program.durationWeeks, 12, 'retain active runs that may already be beyond week four');
  assert.equal(program.ongoing, true);
  assert.equal(program.reviewEveryWeeks, 4);
  assert.equal(program.sessionsPerWeek, 5);
  assert.ok(program.equipment.includes('treadmill'));
  assert.ok(PROGRAM_CATALOG.some((candidate) => candidate.id === 'shed_pplul'));
  const ids = PROGRAM_CATALOG.map((candidate) => candidate.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the weekly schedule has five lifting days, active recovery Thursday and rest Sunday', () => {
  const training = Object.entries(program.days)
    .filter(([, day]) => day.lifts.length > 0)
    .map(([key]) => key);
  assert.deepEqual(training, ['mon', 'tue', 'wed', 'fri', 'sat']);
  assert.equal(program.days.thu.title, 'Active Recovery');
  assert.equal(program.days.thu.runs, 'Rest', 'the optional walk must not become a mandatory Run Day');
  assert.match(program.days.thu.desc, /45–60 minutes/);
  assert.match(program.days.thu.desc, /conversational pace/);
  assert.equal(program.days.sun.title, 'Rest');
});

test('every training day exactly matches the requested exercise order', () => {
  assert.deepEqual(program.days.mon.lifts, [
    'Barbell Bench Press', 'Incline Dumbbell Press', 'Seated Dumbbell Shoulder Press',
    'Dumbbell Lateral Raise', 'Band Triceps Pushdown', 'Band Face Pull',
  ]);
  assert.deepEqual(program.days.tue.lifts, [
    'Pull-Up', 'Barbell Row', 'Chest-Supported Dumbbell Row',
    'Dumbbell Rear-Delt Raise', 'EZ-Bar Curl', 'Dumbbell Hammer Curl',
  ]);
  assert.deepEqual(program.days.wed.lifts, [
    'Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat',
    'Dumbbell Lying Leg Curl', 'Barbell Standing Calf Raise', 'Hanging Leg Raise',
  ]);
  assert.deepEqual(program.days.fri.lifts, [
    'Standing Barbell Overhead Press', 'Paused Barbell Bench Press', 'Pull-Up',
    'One-Arm Dumbbell Row', 'Dumbbell Lateral Raise', 'EZ-Bar Skull Crusher', 'EZ-Bar Curl',
  ]);
  assert.deepEqual(program.days.sat.lifts, [
    'Paused Conventional Deadlift', 'Front Squat', 'Reverse Lunge',
    'Dumbbell Lying Leg Curl', 'Seated Dumbbell Calf Raise', 'Band Kneeling Crunch',
    'Dumbbell Farmer Carry',
  ]);
});

test('day.lifts stay bare strings and every exercise resolves', () => {
  const missing = [];
  for (const [key, day] of Object.entries(program.days)) {
    for (const lift of day.lifts) {
      assert.equal(typeof lift, 'string');
      if (!resolveExercise(lift)) missing.push(`${key}:${lift}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('paused bench and paused deadlift remain distinct exercise histories', () => {
  assert.notEqual(canonicalExerciseId('Paused Barbell Bench Press'), canonicalExerciseId('Barbell Bench Press'));
  assert.notEqual(canonicalExerciseId('Paused Conventional Deadlift'), canonicalExerciseId('Conventional Deadlift'));
});

test('main-lift prescriptions stay performance-based in every week', () => {
  for (let week = 1; week <= SHED_PPLUL_WEEKS; week++) {
    assert.equal(spec(week, 'mon', 'Barbell Bench Press'), '4x6–8', `bench week ${week}`);
    assert.equal(spec(week, 'wed', 'Back Squat'), '4x6–8', `squat week ${week}`);
    assert.equal(spec(week, 'fri', 'Standing Barbell Overhead Press'), '3x6–8', `press week ${week}`);
    assert.equal(spec(week, 'sat', DEADLIFT), '3x5–8', `deadlift week ${week}`);
  }
});

test('accessory prescriptions exactly match the requested plan', () => {
  const expected = [
    ['mon', 'Incline Dumbbell Press', '3x8–12'],
    ['mon', 'Seated Dumbbell Shoulder Press', '2x8–12'],
    ['mon', 'Dumbbell Lateral Raise', '3x12–20'],
    ['mon', 'Band Triceps Pushdown', '3x10–20'],
    ['mon', 'Band Face Pull', '2x15–20'],
    ['tue', 'Pull-Up', '4x5–8'],
    ['tue', 'Barbell Row', '3x6–10'],
    ['tue', 'Chest-Supported Dumbbell Row', '2x8–12'],
    ['tue', 'Dumbbell Rear-Delt Raise', '2x12–20'],
    ['tue', 'EZ-Bar Curl', '3x8–12'],
    ['tue', 'Dumbbell Hammer Curl', '2x10–15'],
    ['wed', 'Romanian Deadlift', '3x6–10'],
    ['wed', 'Dumbbell Bulgarian Split Squat', '2x8–12'],
    ['wed', 'Dumbbell Lying Leg Curl', '3x10–15'],
    ['wed', 'Barbell Standing Calf Raise', '3x8–15'],
    ['wed', 'Hanging Leg Raise', '3x8–15'],
    ['fri', 'Paused Barbell Bench Press', '3x6–8'],
    ['fri', 'Pull-Up', '3x6–10'],
    ['fri', 'One-Arm Dumbbell Row', '3x8–12'],
    ['fri', 'Dumbbell Lateral Raise', '3x12–20'],
    ['fri', 'EZ-Bar Skull Crusher', '3x8–12'],
    ['fri', 'EZ-Bar Curl', '2x8–12'],
    ['sat', 'Front Squat', '3x6–10'],
    ['sat', 'Reverse Lunge', '2x8–12'],
    ['sat', 'Dumbbell Lying Leg Curl', '2x10–15'],
    ['sat', 'Seated Dumbbell Calf Raise', '3x12–20'],
    ['sat', 'Band Kneeling Crunch', '3x10–15'],
    ['sat', 'Dumbbell Farmer Carry', '2x30–45s'],
  ];
  for (const [day, lift, prescription] of expected) {
    assert.equal(spec(1, day, lift), prescription, `${day}:${lift}`);
    assert.equal(spec(12, day, lift), prescription, `${day}:${lift} must not wave by calendar`);
  }
});

test('repeated exercises retain their day-specific volume', () => {
  assert.equal(spec(1, 'tue', 'Pull-Up'), '4x5–8');
  assert.equal(spec(1, 'fri', 'Pull-Up'), '3x6–10');
  assert.equal(spec(1, 'tue', 'EZ-Bar Curl'), '3x8–12');
  assert.equal(spec(1, 'fri', 'EZ-Bar Curl'), '2x8–12');
  assert.equal(spec(1, 'wed', 'Dumbbell Lying Leg Curl'), '3x10–15');
  assert.equal(spec(1, 'sat', 'Dumbbell Lying Leg Curl'), '2x10–15');
});

test('each day materialises the requested total number of working sets', () => {
  const total = (dayKey) => program.days[dayKey].lifts
    .reduce((sum, lift) => sum + target(1, dayKey, lift).sets, 0);
  assert.equal(total('mon'), 17);
  assert.equal(total('tue'), 16);
  assert.equal(total('wed'), 18);
  assert.equal(total('fri'), 20);
  assert.equal(total('sat'), 18, 'includes the optional two-set farmer carry');
});

test('the removed exercises and retired fixed-wave language are absent', () => {
  const lifts = TRAINING_DAYS.flatMap((dayKey) => program.days[dayKey].lifts);
  assert.equal(lifts.includes('Close-Grip Bench Press'), false);
  assert.equal(lifts.includes('Conventional Deadlift'), false);
  assert.equal(program.days.tue.lifts.includes('Band Face Pull'), false);
  const copy = [program.description, ...program.highlights, ...program.programNotes].join(' ');
  assert.doesNotMatch(copy, /4×8 in weeks 1–3|deloads in weeks 4 and 8|rep-PR assessment/i);
});

test('the available-equipment declaration covers the supplied shed setup', () => {
  assert.deepEqual(program.equipment, [
    'barbell', 'ez-bar', 'rack', 'bench', 'dumbbells', 'bands', 'pullup-bar', 'treadmill',
  ]);
  assert.equal(program.equipmentTier, 'home-gym');
});

test('performance baselines are retained as reference points, not prescriptions', () => {
  assert.deepEqual(program.performanceBaselines.benchPress, ['90 kg × 6 × 4', '85 kg × 8, 8, 8, 6']);
  assert.deepEqual(program.performanceBaselines.backSquat, ['100 kg × 6 × 4']);
  assert.deepEqual(program.performanceBaselines.deadlift, [
    'Historical 1RM: 200 kg', 'Current heavy loading limited by available plates',
  ]);
  assert.match(program.programNotes.join(' '), /Current reference points/);
});

test('the progression guidance names rep-first loading and proximity to failure', () => {
  const notes = program.programNotes.join(' ');
  assert.match(notes, /same load while total repetitions/i);
  assert.match(notes, /smallest practical increment/i);
  assert.match(notes, /Main compound lifts generally stay at 1–3 RIR/i);
  assert.match(notes, /Isolation work may occasionally reach 0–1 RIR/i);
});

test('deload guidance is evidence-triggered and starts with volume reduction', () => {
  const notes = program.programNotes.join(' ');
  assert.match(notes, /Do not deload automatically/i);
  assert.match(notes, /reduce volume by approximately 30–50%/i);
  assert.match(notes, /repeated performance decline/i);
});

test('conditioning guidance keeps walking easy and hard running out', () => {
  const notes = program.programNotes.join(' ');
  assert.match(notes, /45–60 minutes of conversational-pace walking/i);
  assert.match(notes, /avoid hard running or intervals/i);
  assert.match(program.days.sun.desc, /Easy walking/i);
});

test('paused deadlift progression includes non-load performance signals', () => {
  const deadlift = DAY_PLAN.sat.exercises.find((exercise) => exercise.name === DEADLIFT);
  const notes = deadlift.notes.join(' ');
  assert.match(notes, /one to two seconds/i);
  assert.match(notes, /bar speed/i);
  assert.match(notes, /lower RPE/i);
  assert.match(notes, /do not use excessively high-repetition deadlift sets/i);
});

test('detail metadata marks only the farmer carry as optional', () => {
  const optional = Object.values(program.dayExercises)
    .flat()
    .filter((exercise) => exercise.optional)
    .map((exercise) => exercise.name);
  assert.deepEqual(optional, ['Dumbbell Farmer Carry']);
  assert.equal(program.dayExercises.fri.find((exercise) => exercise.name === 'Paused Barbell Bench Press').tier, 'Accessory');
});

test('review checkpoints never become automatic deloads', () => {
  for (let week = 1; week <= SHED_PPLUL_WEEKS; week++) {
    const plan = shedPplulWeekPlan(week);
    assert.equal(plan.review, week % 4 === 0, `week ${week} review state`);
    assert.equal(plan.deload, false);
    assert.equal(plan.accessoryScale, 1);
    assert.equal(isDeloadWeek(getWeekModifier(program, week)), false);
  }
});

test('week labels describe performance progression and four-week reviews', () => {
  for (let week = 1; week <= SHED_PPLUL_WEEKS; week++) {
    const mod = getWeekModifier(program, week);
    assert.equal(mod.sets, 4);
    assert.equal(mod.reps, '6–8');
    assert.match(mod.intensityLabel, /Performance-based/i);
    assert.equal(/Review checkpoint/i.test(mod.intensityLabel), week % 4 === 0);
  }
});

test('days, detail metadata and the model plan stay in sync', () => {
  for (const key of TRAINING_DAYS) {
    const planned = DAY_PLAN[key].exercises.map((exercise) => exercise.name);
    assert.deepEqual(program.days[key].lifts, planned);
    assert.deepEqual(program.dayExercises[key].map((exercise) => exercise.name), planned);
  }
});

test('each strength day has exactly one priority lift', () => {
  for (const [dayKey, mainLift] of Object.entries(MAIN_BY_DAY)) {
    const mains = DAY_PLAN[dayKey].exercises.filter((exercise) => exercise.main);
    assert.equal(mains.length, 1);
    assert.equal(mains[0].name, mainLift);
  }
  assert.equal(DAY_PLAN.tue.exercises.filter((exercise) => exercise.main).length, 0);
});

test('every authored exercise carries a usable prescription', () => {
  for (const key of TRAINING_DAYS) {
    for (const exercise of DAY_PLAN[key].exercises) {
      assert.ok(exercise.sets > 0, `${key}:${exercise.name}`);
      const range = Number.isFinite(exercise.min) && Number.isFinite(exercise.max)
        && exercise.max >= exercise.min;
      assert.ok(range || typeof exercise.reps === 'string', `${key}:${exercise.name}`);
    }
  }
});

test('the model rejects out-of-window weeks, unauthored lifts and foreign programs', () => {
  for (const bad of [0, 13, -1, NaN, null, undefined, 'x']) {
    assert.equal(shedPplulWeekPlan(bad), null);
    assert.equal(shedPplulLiftTarget(program, bad, 'mon', 'Barbell Bench Press'), null);
  }
  assert.equal(shedPplulLiftTarget(program, 1, 'mon', 'Barbell Shrug'), null);
  assert.equal(isShedPplulProgram({ progressionModel: 'jt-shed' }), false);
  for (const other of PROGRAM_CATALOG.filter((candidate) => candidate.id !== 'shed_pplul')) {
    assert.equal(shedPplulLiftTarget(other, 1, 'mon', 'Barbell Bench Press'), null);
  }
});

function legacyCopy() {
  const copy = JSON.parse(JSON.stringify(program));
  copy.id = 'prog_legacy_copy';
  copy.sourceProgramId = 'shed_pplul';
  copy.isPrimaryCustomization = true;
  delete copy.progressionModel;
  return copy;
}

function copySpec(copy, week, dayKey, lift) {
  const resolved = liftTarget(copy.days[dayKey].desc, lift, getWeekModifier(copy, week), {
    program: copy, week, dayKey,
  });
  return `${resolved.sets}x${resolved.reps}`;
}

test('a legacy copy still inherits the per-lift performance model at read time', () => {
  const copy = legacyCopy();
  assert.equal(copy.progressionModel, undefined);
  assert.equal(copySpec(copy, 1, 'mon', 'Barbell Bench Press'), '4x6–8');
  assert.equal(copySpec(copy, 12, 'sat', DEADLIFT), '3x5–8');
  assert.equal(copySpec(copy, 4, 'mon', 'Band Face Pull'), '2x15–20');
});

test('model inheritance requires a real source and preserves unauthored edits', () => {
  const own = legacyCopy();
  delete own.sourceProgramId;
  assert.equal(copySpec(own, 1, 'mon', 'Incline Dumbbell Press'), '4x6–8');

  const unknown = legacyCopy();
  unknown.sourceProgramId = 'no_such_program';
  assert.equal(copySpec(unknown, 1, 'mon', 'Incline Dumbbell Press'), '4x6–8');

  const copy = legacyCopy();
  assert.equal(copySpec(copy, 1, 'mon', 'Cable Crossover'), '4x6–8');
});
