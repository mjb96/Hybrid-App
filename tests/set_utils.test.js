// ==========================================
// SET UTILITIES TESTS (tests/set_utils.test.js)
// Locks the canonical completion / warmup / volume helpers shared across the
// cockpit, home, and analytics views. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCompletedSet, isWarmupSet, isValidWorkingSet, setVolume, dayVolume } from '../js/set-utils.js';

test('isCompletedSet accepts every legacy "completed" encoding', () => {
  for (const c of [true, 'true', 'on', 1]) {
    assert.equal(isCompletedSet({ c }), true, `c=${JSON.stringify(c)}`);
  }
});

test('isCompletedSet rejects incomplete / malformed sets', () => {
  for (const s of [null, undefined, {}, { c: false }, { c: 'false' }, { c: 0 }, { c: '' }]) {
    assert.equal(isCompletedSet(s), false, JSON.stringify(s));
  }
});

test('isWarmupSet covers both the type marker and legacy flag', () => {
  assert.equal(isWarmupSet({ type: 'W' }), true);
  assert.equal(isWarmupSet({ isWarmup: true }), true);
  assert.equal(isWarmupSet({ type: 'D' }), false);
  assert.equal(isWarmupSet({}), false);
  assert.equal(isWarmupSet(null), false);
});

test('isValidWorkingSet requires explicit completion, non-warmup and positive reps', () => {
  assert.equal(isValidWorkingSet({ c: true, w: '', r: '12' }), true, 'bodyweight can omit load');
  assert.equal(isValidWorkingSet({ c: 'true', w: '20', r: '8' }), true);
  assert.equal(isValidWorkingSet({ c: true, w: '20', r: '0' }), false);
  assert.equal(isValidWorkingSet({ c: true, w: '20', r: '' }), false);
  assert.equal(isValidWorkingSet({ c: true, w: '20', r: '8', type: 'W' }), false);
  assert.equal(isValidWorkingSet({ c: 'false', w: '20', r: '8' }), false);
});

test('setVolume multiplies coerced weight × reps', () => {
  assert.equal(setVolume({ w: '100', r: '5' }), 500);
  assert.equal(setVolume({ w: 60, r: 8 }), 480);
  assert.equal(setVolume({ w: '', r: '5' }), 0);
  assert.equal(setVolume(null), 0);
});

test('dayVolume sums completed working sets and excludes warmups by default', () => {
  const dayLifts = {
    'Back Squat': [
      { w: '40', r: '10', c: true, type: 'W' }, // warmup — excluded
      { w: '100', r: '5', c: true },            // 500
      { w: '100', r: '5', c: false },           // incomplete — excluded
    ],
    'Bench Press': [
      { w: '80', r: '5', c: 'on' },             // 400
    ],
    'Notes': 'not an array',                     // ignored
  };
  assert.equal(dayVolume(dayLifts), 900);
});

test('dayVolume can include warmups when asked', () => {
  const dayLifts = { 'Back Squat': [
    { w: '40', r: '10', c: true, type: 'W' },   // 400
    { w: '100', r: '5', c: true },              // 500
  ] };
  assert.equal(dayVolume(dayLifts, { includeWarmups: true }), 900);
});

test('dayVolume is safe on empty / nullish input', () => {
  assert.equal(dayVolume(null), 0);
  assert.equal(dayVolume({}), 0);
});
