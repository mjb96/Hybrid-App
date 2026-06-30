// @ts-check
// Locks the exercise-type → rest-period classification so a curl never again
// inherits the same rest as a squat. recommendedRestFor is a pure function.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendedRestFor } from '../js/timers.js';

const PRIMARY = 180, SECONDARY = 120, ISOLATION = 90;

test('heavy compounds get 3 minutes', () => {
  for (const lift of ['Back Squat', 'Front Squat', 'Conventional Deadlift',
    'Romanian Deadlift', 'Bench Press', 'Close-Grip Bench Press',
    'Overhead Press', 'Standing Barbell OHP', 'Barbell Row', 'Hip Thrust',
    'Power Clean']) {
    assert.equal(recommendedRestFor(lift), PRIMARY, `${lift} should be ${PRIMARY}s`);
  }
});

test('secondary / assistance compounds get 2 minutes', () => {
  for (const lift of ['Pull-Up', 'Chin-Up', 'Dip', 'Walking Lunge',
    'Incline DB Press', 'Leg Press', 'Lat Pulldown', 'Seated Cable Row',
    'Dumbbell Row']) {
    assert.equal(recommendedRestFor(lift), SECONDARY, `${lift} should be ${SECONDARY}s`);
  }
});

test('isolation / single-joint work gets 90s — the reported bug', () => {
  for (const lift of ['Dumbbell Curl', 'Hammer Curl', 'Preacher Curl',
    'Bicep Curl', 'Lateral Raise', 'Front Raise', 'Tricep Pushdown',
    'Tricep Band Pushdown', 'Leg Extension', 'Leg Curl', 'Calf Raise',
    'Cable Fly', 'Face Pull', 'Barbell Shrug']) {
    assert.equal(recommendedRestFor(lift), ISOLATION, `${lift} should be ${ISOLATION}s`);
  }
});

test('isolation is matched before the broad compound keywords', () => {
  // "leg extension" contains no compound word, but "leg curl" must not be a
  // compound and "calf raise" must beat any stray match.
  assert.equal(recommendedRestFor('Leg Extension'), ISOLATION);
  assert.equal(recommendedRestFor('Lying Leg Curl'), ISOLATION);
  assert.equal(recommendedRestFor('Overhead Tricep Extension'), ISOLATION);
});

test('unrecognised / custom lifts return null (caller uses the user default)', () => {
  assert.equal(recommendedRestFor('Sled Push'), null);
  assert.equal(recommendedRestFor('Farmer Carry'), null);
  assert.equal(recommendedRestFor(''), null);
  assert.equal(recommendedRestFor(null), null);
  assert.equal(recommendedRestFor(undefined), null);
});
