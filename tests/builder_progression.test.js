// ==========================================
// BUILDER WEEKLY PROGRESSION TEST (tests/builder_progression.test.js)
// B2 — the per-week progression editor. Proves that editing weeklyVolModifiers
// (what the builder writes) flows through the SAME resolver chain the cockpit
// uses to materialise sets/reps: getWeekModifier() → liftTarget(). Run with
// `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ensureWeeklyMods, setWeekField, markWeekDeload, isDeloadWeek, weekKeys,
} from '../js/programs/progression.js';
import { getWeekModifier } from '../js/schema.js';
import { liftTarget } from '../js/engine.js';

test('ensureWeeklyMods seeds a well-formed entry for every week 1..totalWeeks', () => {
  const prog = { totalWeeks: 6, weeklyVolModifiers: {} };
  ensureWeeklyMods(prog);
  assert.deepEqual(weekKeys(prog), ['1', '2', '3', '4', '5', '6']);
  for (const k of weekKeys(prog)) {
    const m = prog.weeklyVolModifiers[k];
    assert.equal(typeof m.sets, 'number');
    assert.ok(m.reps != null);
    assert.equal(typeof m.intensityLabel, 'string');
  }
});

test('ensureWeeklyMods never overwrites authored values (fill gaps only)', () => {
  const prog = { totalWeeks: 3, weeklyVolModifiers: { '1': { sets: 5, reps: 5, intensityLabel: 'Base' } } };
  ensureWeeklyMods(prog);
  assert.deepEqual(prog.weeklyVolModifiers['1'], { sets: 5, reps: 5, intensityLabel: 'Base' });
  assert.ok(prog.weeklyVolModifiers['3']); // gap filled
});

test('editing a week flows into what the cockpit materialises', () => {
  const prog = { totalWeeks: 4, weeklyVolModifiers: {} };
  ensureWeeklyMods(prog);
  setWeekField(prog, '2', 'sets', '5');
  setWeekField(prog, '2', 'reps', '5');
  setWeekField(prog, '2', 'intensityLabel', 'Intensity block');

  // Same chain the workout cockpit uses (custom program → empty desc → falls
  // back to the week modifier).
  const mod = getWeekModifier(prog, '2');
  const target = liftTarget('', 'Back Squat', mod);
  assert.equal(target.sets, 5, 'edited sets are prescribed');
  assert.equal(target.reps, 5, 'edited reps are prescribed');
  assert.equal(mod.intensityLabel, 'Intensity block');
});

test('sets are clamped to a sane integer range', () => {
  const prog = { totalWeeks: 2, weeklyVolModifiers: {} };
  ensureWeeklyMods(prog);
  assert.equal(setWeekField(prog, '1', 'sets', '99').sets, 12);
  assert.equal(setWeekField(prog, '1', 'sets', '0').sets, 1);
  assert.equal(setWeekField(prog, '1', 'sets', 'abc').sets, 3); // garbage → default
});

test('reps accepts a plain number or a range string', () => {
  const prog = { totalWeeks: 2, weeklyVolModifiers: {} };
  ensureWeeklyMods(prog);
  assert.equal(setWeekField(prog, '1', 'reps', '8').reps, 8);       // numeric → Number
  assert.equal(setWeekField(prog, '1', 'reps', '8-10').reps, '8-10'); // range → string
});

test('markWeekDeload halves the sets and labels it as a deload', () => {
  const prog = { totalWeeks: 4, weeklyVolModifiers: { '3': { sets: 8, reps: 5, intensityLabel: 'Peak' } } };
  ensureWeeklyMods(prog);
  const m = markWeekDeload(prog, '3');
  assert.equal(m.sets, 4, 'sets roughly halved');
  assert.ok(isDeloadWeek(m), 'labelled as a deload');
  // and the cockpit sees the reduced volume
  assert.equal(getWeekModifier(prog, '3').sets, 4);
});
