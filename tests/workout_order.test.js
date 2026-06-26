// ==========================================
// EXERCISE ORDERING TESTS (tests/workout_order.test.js)
// Locks in the fix for "exercises load in the wrong order": render order must
// follow an explicit liftOrder array / blueprint, never raw object-key
// enumeration (which floats integer-like keys to the top).
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderedLiftNames } from '../js/workout-order.js';

const blueprint = { lifts: ['Back Squat', 'Bench Press', 'Barbell Row', 'Lateral Raise'] };

function dayWith(keys) {
  const lifts = {};
  keys.forEach(k => { lifts[k] = [{ w: '60', r: '5', c: false }]; });
  return { lifts: { mon: lifts } };
}

test('named keys preserve insertion (blueprint) order', () => {
  const wd = dayWith(['Back Squat', 'Bench Press', 'Barbell Row']);
  assert.deepEqual(orderedLiftNames(wd, 'mon', blueprint),
    ['Back Squat', 'Bench Press', 'Barbell Row']);
});

test('a saved liftOrder is the source of truth', () => {
  const wd = dayWith(['Back Squat', 'Bench Press', 'Barbell Row']);
  wd.liftOrder = { mon: ['Barbell Row', 'Back Squat', 'Bench Press'] };
  assert.deepEqual(orderedLiftNames(wd, 'mon', blueprint),
    ['Barbell Row', 'Back Squat', 'Bench Press']);
});

test('integer-keyed legacy day follows blueprint position, not numeric float', () => {
  // Object enumeration would give 0,1,2,3 — which happens to equal blueprint
  // order here; the point is we resolve via blueprint, not object quirks.
  const wd = dayWith(['2', '0', '3', '1']);
  assert.deepEqual(orderedLiftNames(wd, 'mon', blueprint), ['0', '1', '2', '3']);
});

test('mixed integer + name keys do not scramble (the reported bug)', () => {
  // Raw `for…in` would emit the integer keys ('0','1') FIRST, ahead of the
  // named custom exercise — even though the custom lift was added last.
  const wd = dayWith(['Back Squat', 'Bench Press', 'Curls']); // simulate live keys
  // Re-key so two are integer-like and one is a trailing custom name.
  wd.lifts.mon = {
    'Curls': [{ w: '20', r: '12', c: false }], // inserted "first" but is custom
    '0': [{ w: '60', r: '5', c: false }],      // Back Squat by index
    '1': [{ w: '40', r: '5', c: false }],      // Bench Press by index
  };
  // Blueprint-resolved: index 0, index 1, then the unknown custom name last.
  assert.deepEqual(orderedLiftNames(wd, 'mon', blueprint), ['0', '1', 'Curls']);
});

test('saved order reconciles: removed lifts drop, new lifts append', () => {
  const wd = dayWith(['Back Squat', 'Bench Press', 'Deadlift']);
  // Saved order references an old lift ('Lunges') no longer present, and omits
  // the newly added 'Deadlift'.
  wd.liftOrder = { mon: ['Bench Press', 'Lunges', 'Back Squat'] };
  assert.deepEqual(orderedLiftNames(wd, 'mon', blueprint),
    ['Bench Press', 'Back Squat', 'Deadlift']);
});

test('custom-only exercises (none in blueprint) keep their key order', () => {
  const wd = dayWith(['Sled Push', 'Farmers Carry', 'Sandbag Clean']);
  assert.deepEqual(orderedLiftNames(wd, 'mon', blueprint),
    ['Sled Push', 'Farmers Carry', 'Sandbag Clean']);
});

test('empty / missing day is safe', () => {
  assert.deepEqual(orderedLiftNames({}, 'mon', blueprint), []);
  assert.deepEqual(orderedLiftNames({ lifts: {} }, 'mon'), []);
});

test('non-array values are ignored', () => {
  const wd = { lifts: { mon: { 'Back Squat': [{ w: '60' }], junk: 'nope' } } };
  assert.deepEqual(orderedLiftNames(wd, 'mon', blueprint), ['Back Squat']);
});
