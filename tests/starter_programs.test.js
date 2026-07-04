// ==========================================
// STARTER PROGRAM RECOMMENDER TEST (tests/starter_programs.test.js)
// C1 — onboarding picker is now level- and equipment-aware. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendStarterPrograms } from '../js/onboarding/starter-programs.js';

const CATALOG = [
  { id: 'sl', name: 'StrongLifts', category: 'strength', difficulty: 'beginner', equipmentTier: 'gym', rating: 4.8, popularity: 97 },
  { id: 'nsuns', name: 'nSuns', category: 'strength', difficulty: 'advanced', equipmentTier: 'gym', rating: 4.7, popularity: 90 },
  { id: 'bw', name: 'Bodyweight Beginnings', category: 'strength', difficulty: 'beginner', equipmentTier: 'bodyweight', rating: 4.5, popularity: 70 },
  { id: 'run', name: 'Couch to 5K', category: 'running', difficulty: 'beginner', equipmentTier: 'minimal', rating: 4.6, popularity: 80 },
  { id: 'hyb', name: 'Hybrid Engine', category: 'hybrid', difficulty: 'intermediate', equipmentTier: 'gym', rating: 4.7, popularity: 88 },
];

test('matches the goal to the right program category', () => {
  const recs = recommendStarterPrograms({ goal: 'endurance', level: 'beginner', equipmentTier: 'gym' }, CATALOG);
  assert.ok(recs.length > 0);
  assert.ok(recs.every(p => p.category === 'running'));
});

test('a bodyweight beginner is not handed an advanced barbell program', () => {
  const recs = recommendStarterPrograms({ goal: 'strength', level: 'beginner', equipmentTier: 'bodyweight' }, CATALOG);
  const ids = recs.map(p => p.id);
  assert.equal(ids[0], 'bw', 'the bodyweight beginner program ranks first');
  const nsunsRank = ids.indexOf('nsuns');
  assert.ok(nsunsRank === -1 || nsunsRank > ids.indexOf('bw'), 'advanced gym program never outranks the fitting one');
});

test('a full-gym user is not penalised on equipment', () => {
  const recs = recommendStarterPrograms({ goal: 'strength', level: 'beginner', equipmentTier: 'gym' }, CATALOG);
  assert.equal(recs[0].id, 'sl', 'the popular beginner gym program leads for a gym user');
});

test('always returns something (never an empty picker)', () => {
  const recs = recommendStarterPrograms({ goal: 'strength', level: 'elite', equipmentTier: 'home' }, CATALOG);
  assert.ok(recs.length > 0);
});
