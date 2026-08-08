import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROGRAMS } from '../js/constants.js';
import { PROGRAM_CATALOG } from '../js/programs/catalog.js';
import {
  browseExercises, EQUIPMENT, EXERCISES, EXERCISE_DIFFICULTIES, MOVEMENT_PATTERNS, MUSCLES,
  canonicalExerciseId, exerciseLibraryByCategory, normaliseExerciseName, resolveExercise,
  exerciseStatForName, equipmentLabel, searchExercises,
} from '../js/exercises/catalog.js';
import { exerciseDetailHtml } from '../js/exercises/detail.js';
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
    assert.ok(Array.isArray(item.instructions), `${item.id} instructions must be an array`);
    assert.ok(Array.isArray(item.safetyNotes), `${item.id} safetyNotes must be an array`);
    assert.ok(item.difficulty === null || EXERCISE_DIFFICULTIES.includes(item.difficulty), `${item.id} has invalid difficulty`);
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

test('calf-raise variations resolve deterministically without alias collisions', () => {
  // The barbell variation is a distinct exercise, not an alias of the dumbbell one.
  assert.equal(canonicalExerciseId('Barbell Standing Calf Raise'), 'barbell_standing_calf_raise');
  assert.equal(canonicalExerciseId('Barbell Calf Raise'), 'barbell_standing_calf_raise');
  assert.equal(canonicalExerciseId('Barbell Calf Raises'), 'barbell_standing_calf_raise');
  assert.equal(canonicalExerciseId('Standing Barbell Calf Raise'), 'barbell_standing_calf_raise');
  assert.equal(canonicalExerciseId('Rack Barbell Calf Raise'), 'barbell_standing_calf_raise');

  // The dumbbell/loaded standing variation keeps every dumbbell + generic legacy key.
  assert.equal(canonicalExerciseId('Dumbbell Calf Raise'), 'standing_calf_raise');
  assert.equal(canonicalExerciseId('Dumbbell Calf Raises'), 'standing_calf_raise');
  assert.equal(canonicalExerciseId('Standing Dumbbell Calf Raise'), 'standing_calf_raise');
  assert.equal(canonicalExerciseId('Calf Raise'), 'standing_calf_raise');
  assert.equal(canonicalExerciseId('Calf Raises'), 'standing_calf_raise');

  // The seated variation gains its dumbbell aliases and keeps dumbbells + bench.
  assert.equal(canonicalExerciseId('Seated Dumbbell Calf Raise'), 'seated_calf_raise');
  assert.equal(canonicalExerciseId('Dumbbell Seated Calf Raise'), 'seated_calf_raise');
  const seated = resolveExercise('Seated Calf Raise');
  assert.deepEqual([...seated.equipment].sort(), ['bench', 'dumbbells']);
});

test('barbell standing calf raise is classified and searchable', () => {
  const item = resolveExercise('Barbell Standing Calf Raise');
  assert.equal(item.id, 'barbell_standing_calf_raise');
  assert.equal(item.category, 'legs');
  assert.equal(item.movement, 'calf_raise');
  assert.deepEqual([...item.equipment].sort(), ['barbell', 'rack']);
  assert.deepEqual({ ...item.muscles }, { calves: 1 });
  assert.equal(item.compound, false);
  assert.equal(item.unilateral, false);
  assert.equal(item.bodyweight, false);
  assert.equal(item.volumeEligible, true);
  // Present in the logger's searchable library (Legs group).
  assert.ok(exerciseLibraryByCategory().Legs.includes('Barbell Standing Calf Raise'));
});

test('new home-gym exercises are all present and distinct', () => {
  const required = [
    'Barbell Shrug', 'Barbell Floor Press', 'Barbell Glute Bridge',
    'Barbell Reverse Lunge', 'Barbell Bulgarian Split Squat', 'Band Row',
    'Band Pull-Through', 'Band Overhead Triceps Extension', 'Band Good Morning',
    'Band Romanian Deadlift', 'Barbell Step-Up', 'Dumbbell Front Squat',
    'Zercher Squat', 'Landmine Row', 'Rack Pull', 'Pin Squat', 'Tempo Squat',
    'Single-Leg Dumbbell Calf Raise', 'Barbell Standing Calf Raise',
  ];
  const searchable = Object.values(exerciseLibraryByCategory()).flat();
  for (const name of required) {
    const item = resolveExercise(name);
    assert.ok(item, `${name} resolves to a canonical exercise`);
    assert.ok(searchable.includes(item.name), `${name} appears in the searchable library`);
  }
  // Existing dumbbell variations are not duplicated by the barbell/band ones.
  assert.equal(canonicalExerciseId('Dumbbell Step-Up'), 'step_up');
  assert.equal(canonicalExerciseId('Dumbbell Bulgarian Split Squat'), 'bulgarian_split_squat');
});

test('an equipment filter over the catalogue surfaces the barbell calf raise for barbell users', () => {
  // The home-gym kit: barbell, rack, adjustable bench, dumbbells, bands.
  const owned = new Set(['barbell', 'rack', 'bench', 'dumbbells', 'bands']);
  const trainable = EXERCISES.filter((item) => item.equipment.every((eq) => owned.has(eq) || eq === 'bodyweight'));
  const names = new Set(trainable.map((i) => i.name));
  assert.ok(names.has('Barbell Standing Calf Raise'), 'barbell+rack calf raise is trainable');
  assert.ok(names.has('Band Row'));
  assert.ok(names.has('Seated Calf Raise'));
  // A machine-only exercise is filtered out for this kit.
  assert.ok(!names.has('Leg Press'), 'machine-only work is excluded from a home-gym kit');
});

test('EZ-bar exercises are a distinct equipment identity from barbell/dumbbell', () => {
  // Existing id kept and reclassified to ezBar.
  const curl = resolveExercise('EZ-Bar Curl');
  assert.equal(curl.id, 'ez_bar_curl');
  assert.deepEqual([...curl.equipment], ['ezBar']);
  assert.equal(canonicalExerciseId('EZ Bar Curl'), 'ez_bar_curl');
  assert.equal(canonicalExerciseId('Ezy Bar Curl'), 'ez_bar_curl');
  assert.equal(canonicalExerciseId('E-Z Bar Curls'), 'ez_bar_curl');
  assert.equal(canonicalExerciseId('EZ Curl Bar Curl'), 'ez_bar_curl');
  assert.equal(canonicalExerciseId('EZ-Bar Biceps Curl'), 'ez_bar_curl');

  // Straight-bar curl stays separate.
  assert.equal(canonicalExerciseId('Barbell Curl'), 'barbell_curl');
  assert.equal(canonicalExerciseId('Bicep Curl'), 'barbell_curl');

  // EZ-bar skull crusher is separate from the dumbbell one; its aliases do not
  // bleed onto skull_crusher.
  assert.equal(canonicalExerciseId('EZ Bar Skull Crushers'), 'ez_bar_skull_crusher');
  assert.equal(canonicalExerciseId('Lying EZ-Bar Triceps Extension'), 'ez_bar_skull_crusher');
  assert.equal(canonicalExerciseId('EZ Curl Bar Skull Crusher'), 'ez_bar_skull_crusher');
  assert.equal(canonicalExerciseId('Dumbbell Skull Crusher'), 'skull_crusher');
  assert.equal(canonicalExerciseId('Lying DB Tricep Extension'), 'skull_crusher');
  assert.deepEqual([...resolveExercise('EZ-Bar Skull Crusher').equipment].sort(), ['bench', 'ezBar']);

  // The other EZ-bar variations.
  assert.equal(canonicalExerciseId('EZ Bar Reverse Curl'), 'ez_bar_reverse_curl');
  assert.equal(canonicalExerciseId('Reverse EZ-Bar Curl'), 'ez_bar_reverse_curl');
  assert.equal(canonicalExerciseId('Reverse Curl'), 'reverse_curl');
  assert.equal(canonicalExerciseId('EZ-Bar Overhead Tricep Extension'), 'ez_bar_overhead_triceps_extension');
  assert.equal(canonicalExerciseId('Overhead Tricep Extension'), 'overhead_triceps_extension');
  assert.equal(canonicalExerciseId('Close-Grip EZ-Bar Bench Press'), 'ez_bar_close_grip_bench_press');
  assert.equal(canonicalExerciseId('EZ-Bar Spider Curls'), 'ez_bar_spider_curl');
  assert.equal(canonicalExerciseId('EZ Bar Upright Row'), 'ez_bar_upright_row');
  assert.equal(canonicalExerciseId('Upright Row'), 'upright_row');
});

test('the reviewed EZ-bar catalogue spans suitable muscle groups with complete guidance', () => {
  const expected = [
    'EZ-Bar Bent-Over Row',
    'EZ-Bar Close-Grip Bench Press',
    'EZ-Bar Curl',
    'EZ-Bar Drag Curl',
    'EZ-Bar Floor Press',
    'EZ-Bar Front Raise',
    'EZ-Bar Glute Bridge',
    'EZ-Bar Overhead Triceps Extension',
    'EZ-Bar Pullover',
    'EZ-Bar Reverse Curl',
    'EZ-Bar Romanian Deadlift',
    'EZ-Bar Shrug',
    'EZ-Bar Skull Crusher',
    'EZ-Bar Spider Curl',
    'EZ-Bar Upright Row',
    'EZ-Bar Zercher Squat',
  ];
  const items = browseExercises({ equipment: 'ezBar' }, 100);
  assert.deepEqual(items.map((item) => item.name), expected);
  assert.deepEqual([...new Set(items.map((item) => item.category))].sort(), ['legs', 'pull', 'push']);
  for (const item of items) {
    assert.ok(item.equipment.includes('ezBar'), `${item.name} uses the EZ-bar equipment identity`);
    assert.ok(item.instructions.length >= 2, `${item.name} has actionable instructions`);
    assert.ok(EXERCISE_DIFFICULTIES.includes(item.difficulty), `${item.name} has reviewed difficulty`);
    assert.ok(item.safetyNotes.length >= 1, `${item.name} has exercise-specific safety guidance`);
    assert.ok(Object.values(item.muscles).includes(1), `${item.name} has a primary muscle`);
  }
});

test('EZ-bar filtering and aliases do not collapse distinct straight-bar variations', () => {
  assert.equal(canonicalExerciseId('EZ Bar Row'), 'ez_bar_bent_over_row');
  assert.equal(canonicalExerciseId('Barbell Bent-Over Row'), 'barbell_row');
  assert.equal(canonicalExerciseId('EZ Bar RDL'), 'ez_bar_romanian_deadlift');
  assert.equal(canonicalExerciseId('RDL'), 'romanian_deadlift');
  assert.equal(canonicalExerciseId('EZ Curl Bar Floor Press'), 'ez_bar_floor_press');
  assert.equal(canonicalExerciseId('Barbell Floor Press'), 'barbell_floor_press');
  const legs = browseExercises({ equipment: 'ezBar', category: 'legs' }, 100).map((item) => item.name);
  assert.deepEqual(legs, ['EZ-Bar Glute Bridge', 'EZ-Bar Romanian Deadlift', 'EZ-Bar Zercher Squat']);
  assert.equal(browseExercises({ query: 'ez curl bar row', equipment: 'ezBar' })[0]?.name, 'EZ-Bar Bent-Over Row');
});

test('exercise detail output exposes supported metadata and escapes unknown markup', () => {
  const html = exerciseDetailHtml('EZ-Bar Romanian Deadlift');
  for (const expected of ['Intermediate', 'Hinge', 'EZ bar', 'Hamstrings', 'Glutes', 'How to perform it', 'Safety']) {
    assert.ok(html.includes(expected), `detail includes ${expected}`);
  }
  assert.ok(!exerciseDetailHtml('<img src=x onerror=alert(1)>').includes('<img'));
});

test('ezBar is a canonical equipment key with a readable label', () => {
  assert.ok(EQUIPMENT.includes('ezBar'));
  assert.equal(equipmentLabel('ezBar'), 'EZ bar');
  assert.equal(equipmentLabel('barbell'), 'Barbell');
  assert.equal(equipmentLabel('pullupBar'), 'Pull-up bar');
});

test('equipment filtering distinguishes barbell-only from EZ-bar owners', () => {
  const barbellOnly = new Set(['barbell', 'rack', 'bench', 'dumbbells', 'bands']);
  const withEz = new Set([...barbellOnly, 'ezBar']);
  const trainable = (owned) => new Set(EXERCISES
    .filter((item) => item.equipment.every((eq) => owned.has(eq) || eq === 'bodyweight'))
    .map((i) => i.name));
  assert.ok(!trainable(barbellOnly).has('EZ-Bar Curl'), 'no EZ bar → EZ-Bar Curl excluded');
  assert.ok(trainable(withEz).has('EZ-Bar Curl'), 'EZ bar owned → EZ-Bar Curl included');
  // Straight-bar curl is available to a barbell owner regardless.
  assert.ok(trainable(barbellOnly).has('Barbell Curl'));
});

test('search ranks the EZ-bar variation first for an EZ-bar query', () => {
  const ez = searchExercises('EZ bar skull crusher', 5).map((i) => i.name);
  assert.equal(ez[0], 'EZ-Bar Skull Crusher');
  assert.ok(!ez.includes('Skull Crusher'), 'a specific EZ-bar query does not surface the dumbbell one');
  // A generic "lying skull crusher" may show both, EZ variation ranked first.
  const lying = searchExercises('lying skull crusher', 5).map((i) => i.name);
  assert.ok(lying.includes('EZ-Bar Skull Crusher') && lying.includes('Skull Crusher'));
  // A straight-bar query ranks the straight-bar curl first.
  assert.equal(searchExercises('barbell curl', 3)[0].name, 'Barbell Curl');
});

test('muscle attribution is retained for the reclassified EZ-bar curl', () => {
  assert.deepEqual({ ...resolveExercise('EZ-Bar Curl').muscles }, { biceps: 1, brachialis: 0.25 });
  assert.deepEqual({ ...resolveExercise('EZ-Bar Reverse Curl').muscles }, { brachialis: 1, forearms: 0.5, biceps: 0.25 });
});

test('derived PR stats exclude high-rep, bodyweight and nominal-band loads', () => {
  const state = { currentWeek: '1', weeks: {
    '1': { lifts: { mon: {
      Curl: [{ w: '20', r: '20', c: true }],
      'Push-Ups': [{ w: '80', r: '10', c: true, loadMode: 'bodyweight', bw: true }],
      'Band Chest Press': [{ w: '30', r: '10', c: true }],
    } } },
  } };
  assert.deepEqual(computeExercisePRs(state, {}), {});
});

// =============================================================================
// PRIMARY-MUSCLE BROWSING (roadmap Phase 4D)
//
// 4D asks for muscle and equipment browsing "without exposing anatomical
// clutter". `MUSCLES` holds 19 anatomical keys — a picker with nineteen chips is
// worse than no muscle filter at all — so browsing uses six training words, and
// filters on PRIMARY involvement only.
// =============================================================================
import { MUSCLE_GROUPS, primaryMuscleGroups } from '../js/exercises/catalog.js';

test('every anatomical muscle belongs to exactly one browsing group', () => {
  const seen = new Map();
  for (const [id, group] of Object.entries(MUSCLE_GROUPS)) {
    assert.ok(group.label, `${id} needs a training-language label`);
    for (const muscle of group.muscles) {
      assert.ok(MUSCLES.includes(muscle), `${muscle} is not a catalogue muscle`);
      assert.equal(seen.has(muscle), false, `${muscle} is in two groups (${seen.get(muscle)} and ${id})`);
      seen.set(muscle, id);
    }
  }
  assert.equal(seen.size, MUSCLES.length, 'every muscle must be reachable by browsing');
});

test('browsing stays six groups — the point is to avoid nineteen', () => {
  assert.equal(Object.keys(MUSCLE_GROUPS).length, 6);
  assert.deepEqual(
    Object.values(MUSCLE_GROUPS).map((g) => g.label),
    ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'],
  );
});

test('a group is claimed only on FULL credit, not any involvement', () => {
  // Half credit is support work. Listing it as a primary target is how "what can
  // I do for glutes" ends up answering with Bench Press.
  assert.deepEqual(primaryMuscleGroups({ muscles: { chest: 1, triceps: 0.5 } }), ['chest']);
  assert.deepEqual(primaryMuscleGroups({ muscles: { glutes: 0.5 } }), []);
  assert.deepEqual(primaryMuscleGroups({ muscles: {} }), []);
  assert.deepEqual(primaryMuscleGroups(null), []);
});

test('an exercise training two groups is listed under both, once each', () => {
  const groups = primaryMuscleGroups({ muscles: { quads: 1, glutes: 1, core: 1 } });
  assert.deepEqual(groups.sort(), ['core', 'legs']);
});

test('browsing by muscle returns only exercises that primarily train it', () => {
  for (const id of Object.keys(MUSCLE_GROUPS)) {
    const list = browseExercises({ muscleGroup: id }, 500);
    assert.ok(list.length > 0, `${id} must return exercises`);
    for (const item of list) {
      assert.ok(primaryMuscleGroups(item).includes(id), `${item.name} is not a primary ${id} exercise`);
    }
  }
});

test('muscle browsing composes with equipment and search', () => {
  const barbellLegs = browseExercises({ muscleGroup: 'legs', equipment: 'barbell' }, 500);
  assert.ok(barbellLegs.length > 0);
  for (const item of barbellLegs) {
    assert.ok(item.equipment.includes('barbell'), `${item.name} is not a barbell exercise`);
    assert.ok(primaryMuscleGroups(item).includes('legs'), `${item.name} is not a primary legs exercise`);
  }
  const searched = browseExercises({ query: 'press', muscleGroup: 'chest' }, 500);
  for (const item of searched) {
    assert.ok(primaryMuscleGroups(item).includes('chest'), `${item.name} is not a primary chest exercise`);
  }
});

test('an unknown muscle group returns nothing rather than everything', () => {
  assert.equal(browseExercises({ muscleGroup: 'not_a_group' }, 500).length, 0);
});

test('conditioning movements with no single primary muscle stay reachable', () => {
  // Burpees and kettlebell swings honestly have no one primary group; they must
  // not be forced into one, and must still appear when no muscle filter is set.
  const all = browseExercises({}, 500);
  const ungrouped = all.filter((item) => primaryMuscleGroups(item).length === 0);
  assert.ok(ungrouped.length > 0, 'fixture sanity: some movements have no primary group');
  const names = ungrouped.map((item) => item.name);
  assert.ok(names.some((n) => /Kettlebell Swing|Burpee|Rowing|SkiErg/i.test(n)), names.join(', '));
});
