import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROGRAMS } from '../js/constants.js';
import { PROGRAM_CATALOG } from '../js/programs/catalog.js';
import {
  EQUIPMENT, EXERCISES, MOVEMENT_PATTERNS, MUSCLES,
  canonicalExerciseId, exerciseLibraryByCategory, normaliseExerciseName, resolveExercise,
  exerciseStatForName,
} from '../js/exercises/catalog.js';
import { exercisePerformanceHistory } from '../js/workout/exercise-history.js';
import { computeExercisePRs } from '../js/engine.js';

test('canonical exercise ids and aliases are unique', () => {
  const ids = new Set();
  const names = new Map();
  for (const item of EXERCISES) {
    assert.ok(!ids.has(item.id), `duplicate id: ${item.id}`);
    ids.add(item.id);
    for (const raw of [item.name, ...item.aliases]) {
      const key = normaliseExerciseName(raw);
      assert.ok(key, `empty alias on ${item.id}`);
      assert.ok(!names.has(key) || names.get(key) === item.id, `${raw} aliases both ${names.get(key)} and ${item.id}`);
      names.set(key, item.id);
    }
  }
});

test('every exercise has valid classification fields and set credits', () => {
  const validMuscles = new Set(MUSCLES);
  const validMovement = new Set(MOVEMENT_PATTERNS);
  const validEquipment = new Set(EQUIPMENT);
  for (const item of EXERCISES) {
    assert.ok(item.name && item.category, `${item.id} needs a display name and category`);
    assert.ok(validMovement.has(item.movement), `${item.id} has invalid movement ${item.movement}`);
    assert.ok(item.equipment.length > 0, `${item.id} needs equipment metadata`);
    item.equipment.forEach((value) => assert.ok(validEquipment.has(value), `${item.id} has invalid equipment ${value}`));
    const credits = Object.entries(item.muscles);
    if (item.volumeEligible) assert.ok(credits.some(([, value]) => value === 1), `${item.id} needs a dominant muscle`);
    for (const [muscle, value] of credits) {
      assert.ok(validMuscles.has(muscle), `${item.id} has unknown muscle ${muscle}`);
      assert.ok([0.25, 0.5, 1].includes(value), `${item.id}/${muscle} has invalid credit ${value}`);
    }
  }
});

test('every built-in program exercise resolves despite prescription text', () => {
  const programs = [...Object.values(PROGRAMS), ...PROGRAM_CATALOG];
  const references = [...new Set(programs.flatMap((program) =>
    Object.values(program.days || {}).flatMap((day) => day.lifts || [])
  ))];
  const missing = references.filter((name) => !resolveExercise(name));
  assert.deepEqual(missing, []);
  assert.ok(references.length >= 200, 'validation covers the full program catalogue, not a sample');
});

test('common historical spellings share identity without rewriting stored keys', () => {
  assert.equal(canonicalExerciseId('DB Bench Press'), 'dumbbell_bench_press');
  assert.equal(canonicalExerciseId('Dumbbell Bench'), 'dumbbell_bench_press');
  assert.equal(canonicalExerciseId('Dumbbell Bench Press 4×10'), 'dumbbell_bench_press');
  assert.equal(canonicalExerciseId('Single Arm DB Row'), 'one_arm_dumbbell_row');

  const state = { weeks: {
    '1': { dates: { mon: '2026-07-01' }, lifts: { mon: { 'DB Bench Press': [{ w: '25', r: '10', c: true }] } } },
  } };
  assert.equal(exercisePerformanceHistory(state, 'Dumbbell Bench Press')[0]?.weight, 25);
  assert.equal(state.weeks['1'].lifts.mon['DB Bench Press'][0].w, '25', 'history data remains under its original key');
});

test('the logger search library contains every canonical exercise once', () => {
  const names = Object.values(exerciseLibraryByCategory()).flat();
  assert.equal(names.length, EXERCISES.length);
  assert.equal(new Set(names).size, EXERCISES.length);
  for (const required of ['Band Chest Press', 'Pendlay Row', 'Nordic Curl', 'Pallof Press', 'Suitcase Carry']) {
    assert.ok(names.includes(required), `${required} is searchable`);
  }
});

test('derived PR stats merge aliases under a canonical id while old keys still read', () => {
  const state = { currentWeek: '1', weeks: {
    '1': { lifts: { mon: {
      'DB Bench Press': [{ w: '25', r: '10', c: true }],
      'Dumbbell Bench Press': [{ w: '30', r: '8', c: true }],
    } } },
  } };
  const stats = { 'DB Bench Press': { allTimeMax: 31, currentEstimatedMax: 31 } };
  computeExercisePRs(state, stats);
  assert.ok(stats.dumbbell_bench_press.allTimeMax > 31);
  assert.equal(exerciseStatForName(stats, 'Dumbbell Bench').allTimeMax, stats.dumbbell_bench_press.allTimeMax);
});
