import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  replaceProgramExercise, addProgramExercise, removeProgramExercise,
  moveProgramExercise, makeProgramDayRest, findDescPrescriptionLabel,
  previewProgramWeek,
} from '../js/programs/editor-model.js';
import { liftTarget } from '../js/engine.js';

// A faithful copy of the real home_gym_rebuild_5day "Lower Strength" day shape:
// bare-string lifts plus a narrative-and-prescription description.
function lowerStrengthDay() {
  return {
    title: 'Lower Strength', badge: 'Strength', color: 'var(--accent-green)',
    desc: 'Squat + hinge foundation. Back Squat (4×5-8). Romanian Deadlift (4×6-10). Dumbbell Bulgarian Split Squat (3×8-12). Dumbbell Calf Raise (4×10-20). Weighted Sit-Up (3×15).',
    runs: 'Rest',
    lifts: ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Weighted Sit-Up'],
  };
}

test('replace preserves position and rewrites the exact description label only', () => {
  const day = lowerStrengthDay();
  const ok = replaceProgramExercise(day, 4, 'Seated Calf Raise');
  assert.equal(ok, true);
  assert.deepEqual(day.lifts, ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Seated Calf Raise']);
  // The old exercise is gone; the replacement inherits the 3×15 label in-place.
  assert.ok(!/Weighted Sit-Up/.test(day.desc), 'removed exercise no longer named in desc');
  assert.ok(/Seated Calf Raise \(3×15\)/.test(day.desc), 'replacement carries the old prescription label');
  // The narrative prefix is untouched.
  assert.ok(/Squat \+ hinge foundation\./.test(day.desc));
  // liftTarget now resolves 3×15 for the replacement from the synced desc.
  assert.deepEqual(liftTarget(day.desc, 'Seated Calf Raise', { sets: 3, reps: 10 }), { sets: 3, reps: 15 });
});

test('replace does not touch unrelated narrative prose or other labels', () => {
  const day = lowerStrengthDay();
  replaceProgramExercise(day, 0, 'Front Squat');
  // Only the "Back Squat (4×5-8)" LABEL becomes "Front Squat (4×5-8)"; the
  // narrative sentence "Squat + hinge foundation." is left verbatim.
  assert.ok(/Squat \+ hinge foundation\./.test(day.desc));
  assert.ok(/Front Squat \(4×5-8\)/.test(day.desc));
  assert.ok(!/Back Squat/.test(day.desc));
  // Every other labelled prescription is unchanged.
  assert.ok(/Romanian Deadlift \(4×6-10\)/.test(day.desc));
  assert.ok(/Weighted Sit-Up \(3×15\)/.test(day.desc));
});

test('replace keeps a structured workoutPreview entry aligned by identity', () => {
  const day = {
    desc: '', runs: 'Rest',
    lifts: ['Back Squat', 'Weighted Sit-Up'],
    workoutPreview: { type: 'STRENGTH', exercises: [
      { exercise: 'Back Squat', sets: 4, reps: '5-8' },
      { exercise: 'Weighted Sit-Up', sets: 3, reps: '15' },
    ] },
  };
  replaceProgramExercise(day, 1, 'Seated Calf Raise');
  assert.equal(day.workoutPreview.exercises[1].exercise, 'Seated Calf Raise');
  // The inherited slot keeps its prescription fields.
  assert.equal(day.workoutPreview.exercises[1].sets, 3);
  assert.equal(day.workoutPreview.exercises[1].reps, '15');
  // The untouched entry is unchanged.
  assert.equal(day.workoutPreview.exercises[0].exercise, 'Back Squat');
});

test('remove drops the lift and its stale preview entry, cannot reintroduce it', () => {
  const day = {
    desc: '', runs: 'Rest',
    lifts: ['Back Squat', 'Weighted Sit-Up'],
    workoutPreview: { type: 'STRENGTH', exercises: [
      { exercise: 'Back Squat' }, { exercise: 'Weighted Sit-Up' },
    ] },
  };
  removeProgramExercise(day, 1);
  assert.deepEqual(day.lifts, ['Back Squat']);
  assert.deepEqual(day.workoutPreview.exercises.map(e => e.exercise), ['Back Squat']);
  // The preview cannot reintroduce the removed name as a training row because the
  // renderer derives names from day.lifts.
  const week = previewProgramWeek({ days: { mon: day }, weeklyVolModifiers: { 1: { sets: 3, reps: 10 } } }, '1');
  const names = week.find(d => d.key === 'mon').lifts.map(l => l.name);
  assert.deepEqual(names, ['Back Squat']);
});

test('reorder moves the lift and keeps the preview ordered to match', () => {
  const day = {
    desc: '', runs: 'Rest',
    lifts: ['A', 'B', 'C'],
    workoutPreview: { type: 'STRENGTH', exercises: [
      { exercise: 'A' }, { exercise: 'B' }, { exercise: 'C' },
    ] },
  };
  assert.equal(moveProgramExercise(day, 2, 0), true);
  assert.deepEqual(day.lifts, ['C', 'A', 'B']);
  assert.deepEqual(day.workoutPreview.exercises.map(e => e.exercise), ['C', 'A', 'B']);
});

test('add appends a lift without fabricating a preview prescription', () => {
  const day = { desc: '', runs: 'Rest', lifts: ['Back Squat'] };
  assert.equal(addProgramExercise(day, 'Seated Calf Raise'), true);
  assert.deepEqual(day.lifts, ['Back Squat', 'Seated Calf Raise']);
  assert.equal(day.workoutPreview, undefined);
  // Blank / whitespace names are rejected.
  assert.equal(addProgramExercise(day, '   '), false);
  assert.deepEqual(day.lifts, ['Back Squat', 'Seated Calf Raise']);
});

test('making a day rest clears lifts and the duplicated representations', () => {
  const day = lowerStrengthDay();
  day.workoutPreview = { type: 'STRENGTH', exercises: [{ exercise: 'Back Squat' }] };
  makeProgramDayRest(day);
  assert.deepEqual(day.lifts, []);
  assert.equal(day.desc, '');
  assert.equal(day.runs, 'Rest');
  assert.equal(day.workoutPreview, undefined);
});

test('findDescPrescriptionLabel only matches the labelled form, never narrative', () => {
  const desc = 'Squat + hinge foundation. Back Squat (4×5-8).';
  assert.equal(findDescPrescriptionLabel(desc, 'Back Squat').spec, '4×5-8');
  // "Squat + hinge foundation" has no "(...)" label, so it never matches.
  assert.equal(findDescPrescriptionLabel(desc, 'Squat + hinge foundation'), null);
  assert.equal(findDescPrescriptionLabel(desc, 'Nonexistent'), null);
});

test('replace and remove are safe no-ops on malformed input', () => {
  assert.equal(replaceProgramExercise(null, 0, 'X'), false);
  assert.equal(replaceProgramExercise({ lifts: ['A'] }, 5, 'X'), false);
  assert.equal(replaceProgramExercise({ lifts: ['A'] }, 0, '  '), false);
  assert.equal(removeProgramExercise({ lifts: [] }, 0), false);
  assert.equal(moveProgramExercise({ lifts: ['A'] }, 0, 0), false);
});
