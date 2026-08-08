// =============================================================================
// BUILDER — BROAD PROGRESSION SHAPES (roadmap Phase 4C, "Simple" editing)
//
// Filling a 12-week grid by hand is 36 inputs before you have a programme, and
// it was the only way the builder let you say "make this get harder". A shape
// answers that once and writes the SAME `weeklyVolModifiers` the per-week editor
// writes — no new stored field and no per-lift prescription, so the 4C ADR gate
// on normalised prescription DATA stays shut.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESSION_SHAPES, DELOAD_CADENCES, planProgressionShape, applyProgressionShape,
  restoreProgression, describeProgressionPlan, ensureWeeklyMods, isDeloadWeek, weekKeys,
} from '../js/programs/progression.js';

const program = (totalWeeks = 8, first = { sets: 3, reps: 10 }) => {
  const p = { id: 'c1', totalWeeks, weeklyVolModifiers: { 1: { ...first, intensityLabel: 'Working Sets' } } };
  ensureWeeklyMods(p);
  return p;
};

test('the shapes and deload cadences are a small, stated set', () => {
  assert.equal(PROGRESSION_SHAPES.length, 3, 'Simple editing must not become another grid');
  assert.deepEqual(PROGRESSION_SHAPES.map((s) => s.id), ['steady', 'volume', 'intensity']);
  for (const shape of PROGRESSION_SHAPES) {
    assert.ok(shape.label && shape.blurb, `${shape.id} must explain itself`);
  }
  assert.deepEqual(DELOAD_CADENCES.map((d) => d.value), [0, 4, 6]);
});

test('planning changes nothing — the athlete sees the block before agreeing to it', () => {
  const p = program(8);
  const before = JSON.stringify(p.weeklyVolModifiers);
  const plan = planProgressionShape(p, 'volume', { deloadEvery: 4 });
  assert.equal(plan.length, 8);
  assert.equal(JSON.stringify(p.weeklyVolModifiers), before, 'planning must be pure');
});

test('steady keeps every training week identical', () => {
  const plan = planProgressionShape(program(6, { sets: 4, reps: 8 }), 'steady');
  assert.deepEqual(plan.map((r) => r.sets), [4, 4, 4, 4, 4, 4]);
  assert.deepEqual(plan.map((r) => String(r.reps)), ['8', '8', '8', '8', '8', '8']);
  assert.ok(plan.every((r) => !r.deload));
});

test('volume adds a set every three training weeks, from the athlete\'s own base', () => {
  const plan = planProgressionShape(program(9, { sets: 3, reps: 10 }), 'volume');
  assert.deepEqual(plan.map((r) => r.sets), [3, 3, 3, 4, 4, 4, 5, 5, 5]);
  assert.equal(plan[0].intensityLabel, 'Working Sets');
  assert.equal(plan[3].intensityLabel, 'Volume +1');
});

test('intensity walks reps DOWN from where the athlete started, not from a fixed 12', () => {
  const from8 = planProgressionShape(program(6, { sets: 4, reps: 8 }), 'intensity');
  assert.deepEqual(from8.map((r) => r.reps), [8, 8, 6, 6, 5, 5]);
  assert.equal(from8[from8.length - 1].intensityLabel, 'Peak');
  // Starting higher gives more of the ladder to walk down.
  const from12 = planProgressionShape(program(6, { sets: 4, reps: 12 }), 'intensity');
  assert.deepEqual(from12.map((r) => r.reps), [12, 12, 10, 10, 8, 8]);
});

test('a deload halves the sets and never consumes a step of the ramp', () => {
  const plan = planProgressionShape(program(8, { sets: 4, reps: 10 }), 'volume', { deloadEvery: 4 });
  assert.equal(plan[3].deload, true, 'week 4');
  assert.equal(plan[7].deload, true, 'week 8');
  assert.equal(plan[3].sets, 2, '4 sets halved');
  assert.equal(plan[3].intensityLabel, 'Deload week');
  // Training weeks 1,2,3,5,6,7 are ramp steps 0..5 → +0,+0,+0,+1,+1,+1.
  assert.deepEqual(plan.filter((r) => !r.deload).map((r) => r.sets), [4, 4, 4, 5, 5, 5]);
});

test('applying writes every week and hands back a real undo', () => {
  const p = program(6, { sets: 3, reps: 10 });
  p.weeklyVolModifiers['2'].intensityLabel = 'Hand tuned';
  const { applied, previous } = applyProgressionShape(p, 'volume', { deloadEvery: 0 });
  assert.equal(applied, 6);
  assert.equal(p.weeklyVolModifiers['4'].sets, 4, 'the shape was written');
  assert.equal(p.weeklyVolModifiers['2'].intensityLabel, 'Working Sets', 'and it overwrote the hand tuning');

  assert.equal(restoreProgression(p, previous), true);
  assert.equal(p.weeklyVolModifiers['2'].intensityLabel, 'Hand tuned', 'undo restores exactly what was there');
  assert.equal(p.weeklyVolModifiers['4'].sets, 3);
});

test('undo is a snapshot, not a live reference', () => {
  const p = program(4);
  const { previous } = applyProgressionShape(p, 'volume');
  p.weeklyVolModifiers['1'].sets = 11;
  restoreProgression(p, previous);
  assert.equal(p.weeklyVolModifiers['1'].sets, 3, 'later edits must not leak into the snapshot');
});

test('deload weeks written by a shape are recognised as deloads downstream', () => {
  const p = program(8, { sets: 4, reps: 10 });
  applyProgressionShape(p, 'steady', { deloadEvery: 4 });
  assert.equal(isDeloadWeek(p.weeklyVolModifiers['4']), true);
  assert.equal(isDeloadWeek(p.weeklyVolModifiers['3']), false);
});

test('a shape covers exactly the programme\'s weeks, however long it is', () => {
  for (const weeks of [1, 5, 12, 52]) {
    const p = program(weeks);
    const { applied } = applyProgressionShape(p, 'intensity', { deloadEvery: 4 });
    assert.equal(applied, weeks);
    assert.deepEqual(Object.keys(p.weeklyVolModifiers).sort((a, b) => Number(a) - Number(b)), weekKeys(p));
  }
});

test('the description is a sentence about the block, not a table', () => {
  const steady = describeProgressionPlan(planProgressionShape(program(6, { sets: 4, reps: 8 }), 'steady'));
  assert.equal(steady, '4 sets · 8 reps across 6 training weeks');

  const ramped = describeProgressionPlan(planProgressionShape(program(8, { sets: 3, reps: 10 }), 'volume', { deloadEvery: 4 }));
  assert.match(ramped, /3 → 4 sets/);
  assert.match(ramped, /2 deload weeks \(4, 8\)/);

  assert.equal(describeProgressionPlan([]), '');
});

test('a rep RANGE base is tolerated rather than mangled', () => {
  // Stored reps may be "8-10"; steady must keep the athlete's string intact.
  const p = program(4, { sets: 3, reps: '8-10' });
  const plan = planProgressionShape(p, 'steady');
  assert.deepEqual(plan.map((r) => r.reps), ['8-10', '8-10', '8-10', '8-10']);
  // Intensity needs a number to ladder from, and takes the first one it finds.
  const laddered = planProgressionShape(p, 'intensity');
  assert.deepEqual(laddered.map((r) => r.reps), [8, 8, 6, 6]);
});

test('garbage stored values do not produce a garbage block', () => {
  const p = { id: 'x', totalWeeks: 4, weeklyVolModifiers: { 1: { sets: 999, reps: null } } };
  ensureWeeklyMods(p);
  const plan = planProgressionShape(p, 'volume');
  assert.ok(plan.every((r) => r.sets >= 1 && r.sets <= 12), `got ${JSON.stringify(plan.map((r) => r.sets))}`);
});
