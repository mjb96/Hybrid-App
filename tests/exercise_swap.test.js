// ==========================================
// EXERCISE SWAP TEST (tests/exercise_swap.test.js)
// B3 — in-session exercise swap. Two pure pieces: the substitution engine
// (same movement pattern, equipment-filtered) and the re-key operation that
// carries the prescribed target + logged sets across. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSubstitutions, classifyMovement } from '../js/workout/substitutions.js';
import { applyExerciseSwap } from '../js/workout-order.js';

// ── Substitution engine ───────────────────────────────────────────────────────

test('classifies exercises into movement patterns', () => {
  assert.equal(classifyMovement('Back Squat'), 'squat');
  assert.equal(classifyMovement('Barbell Row'), 'hpull');
  assert.equal(classifyMovement('Standing OHP'), 'vpush');
  assert.equal(classifyMovement('Romanian Deadlift'), 'hinge');
  assert.equal(classifyMovement('Hammer Curl'), 'biceps');
  assert.equal(classifyMovement('Made-up nonsense'), null);
});

test('suggests same-pattern swaps and never the original', () => {
  const subs = getSubstitutions('Back Squat', { barbell: true, rack: true, dumbbells: true });
  assert.ok(subs.length > 0);
  assert.ok(subs.every(s => s.pattern === 'squat'));
  assert.ok(!subs.some(s => s.name === 'Back Squat'), 'excludes the original');
});

test('filters by available equipment', () => {
  // No barbell/rack, only bodyweight → barbell squats must drop out, Bodyweight Squat stays.
  const subs = getSubstitutions('Back Squat', { dumbbells: false });
  const names = subs.map(s => s.name);
  assert.ok(!names.includes('Front Squat'), 'barbell squat filtered out without a barbell');
  assert.ok(names.includes('Bodyweight Squat'), 'bodyweight option always offered');
});

test('unknown equipment map does not over-filter (offers everything)', () => {
  const subs = getSubstitutions('Bench Press', {}); // empty = unknown
  assert.ok(subs.length >= 3);
});

// ── The re-key operation ──────────────────────────────────────────────────────

function dayWithLoggedSquat() {
  return {
    lifts: { mon: {
      'Back Squat': [{ w: 100, r: 5, c: true, tw: 100, tr: 5 }, { w: '', r: '', c: false, tw: 100, tr: 5 }],
      'Bench Press': [{ w: 80, r: 5, c: false }],
    } },
    liftOrder: { mon: ['Back Squat', 'Bench Press'] },
    liftMeta: { mon: { 'Back Squat': { groupId: 'A' } } },
  };
}

test('swap carries the target and logged sets across untouched', () => {
  const wd = dayWithLoggedSquat();
  const res = applyExerciseSwap(wd, 'mon', 'Back Squat', 'Goblet Squat');
  assert.equal(res.ok, true);
  assert.ok(!wd.lifts.mon['Back Squat'], 'old key removed');
  const moved = wd.lifts.mon['Goblet Squat'];
  assert.ok(Array.isArray(moved));
  assert.equal(moved[0].w, 100, 'logged weight preserved');
  assert.equal(moved[0].tr, 5, 'prescribed target preserved');
  assert.equal(moved[0].c, true, 'completion preserved');
});

test('swap preserves the exercise position in the day', () => {
  const wd = dayWithLoggedSquat();
  applyExerciseSwap(wd, 'mon', 'Back Squat', 'Goblet Squat');
  assert.deepEqual(wd.liftOrder.mon, ['Goblet Squat', 'Bench Press'], 'stays first, Bench unaffected');
});

test('swap carries superset meta across', () => {
  const wd = dayWithLoggedSquat();
  applyExerciseSwap(wd, 'mon', 'Back Squat', 'Goblet Squat');
  assert.equal(wd.liftMeta.mon['Goblet Squat']?.groupId, 'A');
  assert.ok(!wd.liftMeta.mon['Back Squat']);
});

test('refuses to clobber an exercise already in the session', () => {
  const wd = dayWithLoggedSquat();
  const res = applyExerciseSwap(wd, 'mon', 'Back Squat', 'Bench Press');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'duplicate');
  assert.ok(wd.lifts.mon['Back Squat'], 'original untouched on refusal');
});

test('no-ops on a missing source or identical name', () => {
  const wd = dayWithLoggedSquat();
  assert.equal(applyExerciseSwap(wd, 'mon', 'Ghost Lift', 'X').reason, 'missing');
  assert.equal(applyExerciseSwap(wd, 'mon', 'Back Squat', 'Back Squat').reason, 'noop');
});

// ── C4c neighbourDay (swipe between days) ─────────────────────────────────────
import { neighborDay } from '../js/workout-order.js';

test('neighborDay walks the day list and stops at the ends', () => {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  assert.equal(neighborDay(days, 'wed', 1), 'thu');
  assert.equal(neighborDay(days, 'wed', -1), 'tue');
  assert.equal(neighborDay(days, 'sun', 1), null, 'no wrap past the last day');
  assert.equal(neighborDay(days, 'mon', -1), null, 'no wrap before the first day');
  assert.equal(neighborDay(days, 'nope', 1), null);
});
