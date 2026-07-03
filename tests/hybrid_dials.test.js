import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDials, DIAL_MAP } from '../js/brain/hybrid-score/dials.js';

// A pillars object shaped like computeHybridScore's output (score + weight each).
const P = (score, weight) => ({ score, weight, signals: [] });
const fullResult = () => ({
  pillars: {
    consistency: P(80, 22), load: P(60, 12),
    recovery: P(70, 18), lifestyle: P(50, 5),
    strength: P(90, 14), endurance: P(70, 14), momentum: P(60, 10), body: P(40, 5),
  },
});

test('S6 — collapses to exactly three dials, TRAIN / RECOVER / PROGRESS', () => {
  const dials = computeDials(fullResult());
  assert.deepEqual(dials.map(d => d.id), ['train', 'recover', 'progress']);
  assert.deepEqual(dials.map(d => d.label), ['TRAIN', 'RECOVER', 'PROGRESS']);
});

test('S6 — each dial is the weight-blended mean of its member pillars', () => {
  const [train, recover, progress] = computeDials(fullResult());
  // TRAIN = consistency(80·22) + load(60·12) over 34
  assert.equal(train.score, Math.round((80 * 22 + 60 * 12) / 34));
  // RECOVER = recovery(70·18) + lifestyle(50·5) over 23
  assert.equal(recover.score, Math.round((70 * 18 + 50 * 5) / 23));
  // PROGRESS = strength(90·14)+endurance(70·14)+momentum(60·10)+body(40·5) over 43
  assert.equal(progress.score, Math.round((90 * 14 + 70 * 14 + 60 * 10 + 40 * 5) / 43));
});

test('S6 — a data-less pillar is skipped and the dial renormalises across the rest', () => {
  const r = fullResult();
  r.pillars.load = { score: null, signals: [] }; // no load data today
  const train = computeDials(r).find(d => d.id === 'train');
  assert.equal(train.score, 80);                    // pure consistency now
  assert.deepEqual(train.activePillars, ['consistency']);
});

test('S6 — a dial with no member data is null (calibrating), never a fake zero', () => {
  const r = { pillars: { recovery: { score: null }, lifestyle: { score: null } } };
  const recover = computeDials(r).find(d => d.id === 'recover');
  assert.equal(recover.score, null);
  assert.deepEqual(recover.activePillars, []);
});

test('S6 — falls back to config weights when a pillar carries no renormalised weight', () => {
  // Raw pillars object (pre-composite) has no `weight`; dial still computes.
  const r = { pillars: { consistency: { score: 100 }, load: { score: 0 } } };
  const train = computeDials(r).find(d => d.id === 'train');
  // consistency 0.22 vs load 0.12 → 100·22 / 34 ≈ 65
  assert.equal(train.score, Math.round((100 * 22 + 0 * 12) / 34));
});

test('S6 — every pillar in the engine is claimed by exactly one dial', () => {
  const claimed = Object.values(DIAL_MAP).flatMap(d => d.pillars).sort();
  assert.deepEqual(claimed, [
    'body', 'consistency', 'endurance', 'lifestyle', 'load', 'momentum', 'recovery', 'strength',
  ]);
});
