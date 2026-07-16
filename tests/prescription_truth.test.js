import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCatalogEntry } from '../js/programs/catalog.js';
import { liftTarget, prescribeSetsForLift } from '../js/engine.js';
import { getWeekModifier } from '../js/schema.js';

test('Home Athlete push-ups reach the logger as 4 × max reps, not 3 × 10', () => {
  const program = getCatalogEntry('home_athlete');
  const day = program.days.mon;
  const lift = day.lifts.find((name) => name.startsWith('Push-Ups'));
  const modifier = getWeekModifier(program, '1');

  const target = liftTarget(day.desc, lift, modifier);
  const rows = prescribeSetsForLift('1', 'mon', lift, day.desc, modifier);

  assert.deepEqual(target, { sets: 4, reps: 'max reps' });
  assert.equal(rows.length, 4);
});

test('Home Gym rep ranges stay ranges through the same catalog → logger path', () => {
  const program = getCatalogEntry('home_gym_rebuild_5day');
  const day = program.days.thu;
  const modifier = getWeekModifier(program, '1');

  assert.deepEqual(liftTarget(day.desc, 'Incline Dumbbell Press', modifier), { sets: 4, reps: '8–12' });
  assert.deepEqual(liftTarget(day.desc, 'Push-Ups', modifier), { sets: 3, reps: 'max reps' });
});
