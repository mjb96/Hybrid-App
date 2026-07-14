import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  difficultyDisclosure,
  equipmentForTier,
  onboardingSettings,
} from '../js/onboarding/preferences.js';

for (const goal of ['strength', 'hybrid', 'endurance']) {
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    for (const equipmentTier of ['home', 'gym']) {
      test(`finish settings preserve ${goal}/${level}/${equipmentTier}`, () => {
        const result = onboardingSettings({ goal, level, equipmentTier });
        assert.equal(result.fitnessGoal, goal);
        assert.equal(result.fitnessLevel, level);
        assert.equal(result.equipmentTier, equipmentTier);
        assert.deepEqual(result.equipment, equipmentForTier(equipmentTier));
      });
    }
  }
}

test('home equipment never retains full-gym-only rack, cable, or barbell defaults', () => {
  const equipment = equipmentForTier('home');
  assert.equal(equipment.barbell, false);
  assert.equal(equipment.rack, false);
  assert.equal(equipment.cables, false);
  assert.equal(equipment.dumbbells, true);
  assert.equal(equipment.bands, true);
});

test('equipment maps are fresh objects and cannot contaminate later finishes', () => {
  const home = equipmentForTier('home');
  home.rack = true;
  assert.equal(equipmentForTier('home').rack, false);
});

test('adjacent harder recommendation is visibly labelled and explained', () => {
  const disclosure = difficultyDisclosure('intermediate', 'beginner');
  assert.deepEqual(disclosure, {
    label: 'Intermediate',
    relation: 'stretch',
    explanation: 'A step up — included as a supported stretch option.',
  });
});

test('same-level and larger-gap recommendations remain explicit', () => {
  assert.equal(difficultyDisclosure('beginner', 'beginner').relation, 'match');
  assert.match(difficultyDisclosure('advanced', 'beginner').explanation, /above your selected experience/i);
});
