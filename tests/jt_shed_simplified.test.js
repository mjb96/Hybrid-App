// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PROGRAM_CATALOG,
  CATALOG_MAP,
  getCatalogEntry,
} from '../js/programs/catalog.js';
import {
  JT_SHED_ID,
  JT_SHED_SIMPLIFIED_ID,
  simplifiedWeekPlan,
  resolveJtPrescription,
  jtLiftTarget,
} from '../js/programs/jt-shed-model.js';
import { canonicalExerciseId, resolveExercise } from '../js/exercises/catalog.js';
import { buildActivationPlan } from '../js/programs/activation.js';
import { buildWeekSchedule } from '../js/programs/schedule.js';
import { estimatedE1rmForSet } from '../js/strength/e1rm.js';
import {
  STORAGE_KEY,
  appState,
  reseedActiveProgramIntoWeek,
  resolveProgramForState,
  setAppState,
  startProgramActivation,
  verifyWeekStorageSchema,
} from '../js/state.js';

if (typeof globalThis.localStorage === 'undefined') {
  const memory = {};
  globalThis.localStorage = {
    getItem: (key) => (key in memory ? memory[key] : null),
    setItem: (key, value) => { memory[key] = String(value); },
    removeItem: (key) => { delete memory[key]; },
  };
}

const PROGRAM = getCatalogEntry(JT_SHED_SIMPLIFIED_ID);
const TRAINING_DAYS = ['mon', 'tue', 'thu', 'fri', 'sat'];

function freshState(activeProgramId = JT_SHED_SIMPLIFIED_ID, week = 1) {
  return {
    activeProgramId,
    activeActivationId: null,
    activations: [],
    customPrograms: [],
    settings: {},
    weeks: {},
    currentWeek: String(week),
    weekStartedAt: new Date().toISOString(),
    schemaVersion: 5,
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  };
}

function target(week, day, exercise) {
  const value = jtLiftTarget(PROGRAM, week, day, exercise);
  assert.ok(value, `${exercise} resolves in Week ${week} ${day}`);
  return value;
}

test('simplified J&T replaces the old program in discovery but preserves legacy resolution', () => {
  assert.ok(PROGRAM);
  assert.equal(PROGRAM.id, 'jacked-tan-shed-simplified');
  assert.equal(PROGRAM.name, 'Jacked & Tan: Shed Edition — Simplified');
  assert.equal(PROGRAM.durationWeeks, 12);
  assert.equal(PROGRAM.sessionsPerWeek, 5);
  assert.deepEqual(PROGRAM.sessionDurationMinutes, { min: 45, max: 80 });
  assert.equal(PROGRAM.difficulty, 'intermediate');
  assert.equal(PROGRAM.progressionModel, 'jt-shed-simplified');
  assert.equal(PROGRAM_CATALOG.filter((program) => program.id === JT_SHED_SIMPLIFIED_ID).length, 1);
  assert.equal(PROGRAM_CATALOG.some((program) => program.id === JT_SHED_ID), false);
  assert.equal(CATALOG_MAP[JT_SHED_ID]?.name, 'Jacked & Tan: Shed Edition');
  assert.ok(getCatalogEntry(JT_SHED_ID), 'an existing legacy activation remains resolvable');

  for (const goal of ['strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity']) {
    assert.ok(PROGRAM.goals.includes(goal), `goal ${goal}`);
  }
  for (const equipment of ['barbell', 'ez-bar', 'rack', 'bench', 'dumbbells', 'bands', 'pullup-bar']) {
    assert.ok(PROGRAM.equipment.includes(equipment), `equipment ${equipment}`);
  }
  assert.ok(PROGRAM.programNotes.some((note) => /not an exact reproduction/i.test(note)));
  assert.ok(PROGRAM.programNotes.some((note) => /RIR means repetitions in reserve/i.test(note)));
  assert.ok(PROGRAM.programNotes.some((note) => /double progression/i.test(note)));
});

test('weekly schedule uses the exact Monday-first order and five training days', () => {
  assert.deepEqual(Object.keys(PROGRAM.days), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.deepEqual(
    TRAINING_DAYS.map((day) => PROGRAM.days[day].title),
    [
      'Bench and Upper Push',
      'Squat and Posterior Chain',
      'Overhead Press and Upper Body',
      'Deadlift and Lower Body',
      'Back, Arms, Delts and Core',
    ],
  );
  assert.deepEqual(PROGRAM.days.mon.lifts, [
    'Barbell Bench Press',
    'Pull-Up',
    'Standing Barbell Overhead Press',
    'Incline Dumbbell Press',
    'Dumbbell Lateral Raise',
    'Band Triceps Pushdown',
    'Band Face Pull',
  ]);
  assert.deepEqual(PROGRAM.days.tue.lifts, [
    'Back Squat',
    'Romanian Deadlift',
    'Dumbbell Bulgarian Split Squat',
    'Chest-Supported Dumbbell Row',
    'Band Leg Curl',
    'Barbell Standing Calf Raise',
    'Ab Wheel Rollout',
  ]);
  assert.deepEqual(PROGRAM.days.thu.lifts, [
    'Standing Barbell Overhead Press',
    'Close-Grip Bench Press',
    'One-Arm Dumbbell Row',
    'Dumbbell Rear-Delt Raise',
    'Dumbbell Skull Crusher',
  ]);
  assert.deepEqual(PROGRAM.days.fri.lifts, [
    'Conventional Deadlift',
    'Front Squat',
    'Reverse Lunge',
    'Band Leg Curl',
    'Seated Dumbbell Calf Raise',
    'EZ-Bar Curl',
  ]);
  assert.deepEqual(PROGRAM.days.sat.lifts, [
    'Chest-Supported Dumbbell Row',
    'Band Lat Pulldown',
    'EZ-Bar Curl',
    'Band Triceps Pushdown',
    'Dumbbell Lateral Raise',
    'Band Face Pull',
    'Ab Wheel Rollout',
  ]);
  assert.deepEqual(PROGRAM.days.wed.lifts, []);
  assert.deepEqual(PROGRAM.days.sun.lifts, []);

  const schedule = buildWeekSchedule(PROGRAM, 1);
  assert.deepEqual(schedule.map((day) => day.dayKey), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.equal(schedule.filter((day) => !day.isRest).length, 5);
});

test('every program exercise resolves to an existing canonical library entry', () => {
  const expectedAliases = {
    'Dumbbell Bulgarian Split Squat': 'bulgarian_split_squat',
    'Dumbbell Rear-Delt Raise': 'rear_delt_fly',
    'Seated Dumbbell Calf Raise': 'seated_calf_raise',
  };
  const names = [...new Set(TRAINING_DAYS.flatMap((day) => PROGRAM.days[day].lifts))];
  for (const name of names) {
    const id = canonicalExerciseId(name);
    assert.ok(id, `${name} has a canonical id`);
    assert.ok(resolveExercise(name), `${name} resolves`);
  }
  for (const [name, id] of Object.entries(expectedAliases)) {
    assert.equal(canonicalExerciseId(name), id);
  }
});

test('all 12 weeks resolve the exact main-lift block without daily rep-max calculations', () => {
  const expected = {
    1: [[4, 8], [3, 6]], 2: [[4, 8], [3, 6]], 3: [[4, 8], [3, 6]],
    4: [[2, 8], [2, 6]],
    5: [[4, 6], [3, 4]], 6: [[4, 6], [3, 4]], 7: [[4, 6], [3, 4]],
    8: [[2, 6], [2, 4]],
    9: [[5, 4], [4, 3]], 10: [[5, 4], [4, 3]], 11: [[5, 4], [4, 3]],
    12: [[1, 4], [1, 3]],
  };

  for (let week = 1; week <= 12; week += 1) {
    const plan = simplifiedWeekPlan(week);
    assert.deepEqual([plan.main.sets, plan.main.reps], expected[week][0], `Week ${week} bench/squat/OHP`);
    assert.deepEqual([plan.deadlift.sets, plan.deadlift.reps], expected[week][1], `Week ${week} deadlift`);

    for (const [day, exercise] of [
      ['mon', 'Barbell Bench Press'],
      ['tue', 'Back Squat'],
      ['thu', 'Standing Barbell Overhead Press'],
    ]) {
      const prescription = resolveJtPrescription(PROGRAM, week, day, exercise);
      assert.equal(prescription.sets, expected[week][0][0], `Week ${week} ${exercise} sets`);
      assert.equal(prescription.targetReps, expected[week][0][1], `Week ${week} ${exercise} reps`);
      if (week < 12) assert.deepEqual(prescription.setPlan.map((set) => set.role), Array(prescription.sets).fill('work'));
    }
    const deadlift = resolveJtPrescription(PROGRAM, week, 'fri', 'Conventional Deadlift');
    assert.equal(deadlift.sets, expected[week][1][0], `Week ${week} deadlift sets`);
    assert.equal(deadlift.targetReps, expected[week][1][1], `Week ${week} deadlift reps`);
    assert.doesNotMatch(deadlift.displayLabel, /\b(?:10|8|6|4|2)RM\b/, `Week ${week} is not a daily rep-max`);
  }
});

test('Weeks 4 and 8 encode real deload set reductions for main lifts and accessories', () => {
  for (const week of [4, 8]) {
    const plan = simplifiedWeekPlan(week);
    assert.equal(plan.deload, true);
    assert.equal(plan.accessoryScale, 0.5);
    assert.match(PROGRAM.weeklyVolModifiers[String(week)].intensityLabel, /Deload/);
    assert.equal(target(week, 'mon', 'Pull-Up').sets, 2, '3-set accessory becomes 2');
    assert.equal(target(week, 'mon', 'Standing Barbell Overhead Press').sets, 1, '2-set accessory becomes 1');
    assert.equal(target(week, 'tue', 'Romanian Deadlift').sets, 2);
    assert.equal(target(week, 'tue', 'Band Leg Curl').sets, 1);
    assert.match(target(week, 'mon', 'Barbell Bench Press').label, /reduce load 10–15%/);
  }
});

test('accessories keep authored repetition ranges and use simple double progression', () => {
  const cases = [
    [1, 'mon', 'Pull-Up', 3, [5, 10]],
    [1, 'mon', 'Standing Barbell Overhead Press', 2, [8, 10]],
    [1, 'tue', 'Romanian Deadlift', 3, [8, 10]],
    [1, 'tue', 'Ab Wheel Rollout', 2, [6, 15]],
    [1, 'thu', 'Close-Grip Bench Press', 3, [6, 10]],
    [1, 'fri', 'Front Squat', 3, [6, 8]],
    [1, 'sat', 'Band Lat Pulldown', 3, [12, 20]],
  ];
  for (const [week, day, exercise, sets, range] of cases) {
    const prescription = resolveJtPrescription(PROGRAM, week, day, exercise);
    assert.equal(prescription.sets, sets);
    assert.deepEqual(prescription.repRange, range);
    assert.equal(prescription.doubleProgression, true);
    assert.match(prescription.displayLabel, /double progression/);
  }
});

test('Week 12 materialises one controlled assessment row and halved accessories', () => {
  const bench = resolveJtPrescription(PROGRAM, 12, 'mon', 'Barbell Bench Press');
  const deadlift = resolveJtPrescription(PROGRAM, 12, 'fri', 'Conventional Deadlift');
  assert.equal(bench.sets, 1);
  assert.equal(bench.targetReps, 4);
  assert.deepEqual(bench.setPlan, [{ role: 'assessment', reps: '4+' }]);
  assert.match(bench.displayLabel, /controlled rep-PR/);
  assert.match(bench.displayLabel, /stop at 1 RIR/);
  assert.equal(deadlift.targetReps, 3);
  assert.deepEqual(deadlift.setPlan, [{ role: 'assessment', reps: '3+' }]);
  assert.equal(target(12, 'mon', 'Pull-Up').sets, 2);
  assert.equal(target(12, 'mon', 'Incline Dumbbell Press').sets, 1);

  setAppState(freshState(JT_SHED_SIMPLIFIED_ID, 12));
  verifyWeekStorageSchema('12');
  reseedActiveProgramIntoWeek('12');
  assert.deepEqual(appState.weeks['12'].liftOrder.mon, PROGRAM.days.mon.lifts);
  assert.equal(appState.weeks['12'].lifts.mon['Barbell Bench Press'].length, 1);
  assert.equal(appState.weeks['12'].lifts.mon['Barbell Bench Press'][0].role, 'assessment');
  assert.equal(appState.weeks['12'].lifts.mon['Pull-Up'].length, 2);

  const e1rm = estimatedE1rmForSet('Barbell Bench Press', { w: 100, r: 6, c: true, role: 'assessment' });
  assert.ok(Number.isFinite(e1rm) && e1rm > 0, 'assessment role does not corrupt e1RM');
  assert.equal(estimatedE1rmForSet('Barbell Bench Press', { w: '', r: '', role: 'assessment' }), 0);
});

test('activation, reload and program-run isolation preserve the correct workout', () => {
  const plan = buildActivationPlan(
    { activeProgramId: null, currentWeek: '1' },
    JT_SHED_SIMPLIFIED_ID,
    { resolveProgram: getCatalogEntry, resolveName: (id) => getCatalogEntry(id)?.name },
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.defaultStartWeek, 1);
  assert.equal(plan.weeks, 12);
  assert.equal(plan.daysPerWeek, 5);

  setAppState(freshState('stronglifts_5x5'));
  verifyWeekStorageSchema('1');
  reseedActiveProgramIntoWeek('1');
  appState.weeks['1'].lifts.mon['Back Squat'] = [{ w: 100, r: 5, c: true }];
  appState.weeks['1'].dates.mon = '2026-08-03';

  appState.activeProgramId = JT_SHED_SIMPLIFIED_ID;
  startProgramActivation(JT_SHED_SIMPLIFIED_ID, 1);
  reseedActiveProgramIntoWeek('1');

  assert.equal(appState.activeProgramId, JT_SHED_SIMPLIFIED_ID);
  assert.equal(appState.currentWeek, '1');
  assert.deepEqual(appState.weeks['1'].liftOrder.mon, PROGRAM.days.mon.lifts);
  assert.equal(appState.weeks['1'].lifts.mon['Barbell Bench Press'].length, 4);
  assert.ok(Object.values(appState.weeks['1'].lifts.mon).flat().every((set) => !set.c));
  assert.ok(Object.keys(appState.weeks).some((key) => key.startsWith('arch:')), 'previous completed program week is archived');
  assert.equal(appState.customPrograms.length, 0, 'activation creates no custom duplicate');

  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  const reloaded = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const resolved = resolveProgramForState(reloaded, reloaded.activeProgramId);
  assert.equal(reloaded.activeProgramId, JT_SHED_SIMPLIFIED_ID);
  assert.equal(reloaded.currentWeek, '1');
  assert.equal(resolved.id, JT_SHED_SIMPLIFIED_ID);
  assert.deepEqual(reloaded.weeks['1'].liftOrder.mon, PROGRAM.days.mon.lifts);
});
