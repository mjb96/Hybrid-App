import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReadiness, readinessStatus, readinessColor,
  readinessRecommendation, strengthBalanceScore,
} from '../js/analytics/scoring/readiness-scoring.js';

test('computeReadiness: no signals -> null score, No Data', () => {
  const r = computeReadiness({});
  assert.equal(r.score, null);
  assert.equal(r.status, 'No Data');
  assert.deepEqual(r.available, []);
});

test('computeReadiness: a single signal carries full weight', () => {
  // sleepHours 8.5 -> sleep component 100; only signal -> score 100.
  const r = computeReadiness({ sleepHours: 8.5 });
  assert.equal(r.score, 100);
  assert.equal(r.status, 'Peak');
  assert.deepEqual(r.available, ['sleep']);
  assert.equal(r.components.sleep, 100);
});

test('computeReadiness: optimal load ratio scores 100', () => {
  // atl/ctl = 0.9 -> loadComponent 100
  const r = computeReadiness({ atl: 9, ctl: 10 });
  assert.equal(r.components.load, 100);
  assert.equal(r.score, 100);
});

test('computeReadiness: danger-zone load ratio scores low', () => {
  const r = computeReadiness({ atl: 20, ctl: 10 }); // ratio 2.0 -> 15
  assert.equal(r.components.load, 15);
  assert.equal(r.status, 'Rest Advised');
});

test('computeReadiness: combines weighted components', () => {
  // sleep 7.5 -> 85, load 0.9 -> 100. Weights sleep .27, load .23.
  // score = (85*.27 + 100*.23) / (.27+.23) = (22.95 + 23) / .5 = 91.9 -> 92
  const r = computeReadiness({ sleepHours: 7.5, atl: 9, ctl: 10 });
  assert.equal(r.score, 92);
  assert.deepEqual(r.available.sort(), ['load', 'sleep']);
});

test('computeReadiness: resting HR below baseline = excellent', () => {
  const restingHrValues = [
    { date: '2026-06-24', bpm: 48 }, // today, well below baseline
    { date: '2026-06-23', bpm: 55 },
    { date: '2026-06-22', bpm: 56 },
  ];
  const r = computeReadiness({ restingHrValues });
  assert.equal(r.components.restingHr, 100);
});

test('computeReadiness: wellness from mood and soreness', () => {
  // mood 5 -> 100, soreness 1 -> ((6-1)/5)*100 = 100, avg 100
  const r = computeReadiness({ todayWellness: { mood: 5, soreness: 1 } });
  assert.equal(r.components.wellness, 100);
});

test('readinessStatus: threshold boundaries', () => {
  assert.equal(readinessStatus(null), 'No Data');
  assert.equal(readinessStatus(85), 'Peak');
  assert.equal(readinessStatus(70), 'Ready');
  assert.equal(readinessStatus(55), 'Moderate');
  assert.equal(readinessStatus(40), 'Low');
  assert.equal(readinessStatus(39), 'Rest Advised');
});

test('readinessColor: returns a colour for every band', () => {
  assert.match(readinessColor(null), /rgba/);
  assert.equal(readinessColor(90), '#10b981');
  assert.equal(readinessColor(72), '#3b82f6');
  assert.equal(readinessColor(60), '#f59e0b');
  assert.equal(readinessColor(45), '#f97316');
  assert.equal(readinessColor(10), '#ef4444');
});

test('readinessRecommendation: sleep-limited moderate band', () => {
  const rec = readinessRecommendation(60, { sleep: 50 });
  assert.match(rec, /Sleep quality/);
});

test('readinessRecommendation: peak band suggests PR attempt', () => {
  assert.match(readinessRecommendation(90, {}), /PR attempt/);
});

test('strengthBalanceScore: balanced vs imbalanced', () => {
  assert.equal(strengthBalanceScore(null), null);
  assert.equal(strengthBalanceScore({}), null);
  // all in-range -> 100
  assert.equal(strengthBalanceScore({ a: 'optimal', b: 'growth' }), 100);
  // half below MEV (no_data excluded from tracked) -> penalty 50
  assert.equal(
    strengthBalanceScore({ a: 'optimal', b: 'detraining', c: 'no_data' }),
    50,
  );
  // 'maintenance' also counts as below effective volume
  assert.equal(
    strengthBalanceScore({ a: 'growth', b: 'maintenance' }),
    50,
  );
});
