import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReadiness, readinessStatus, readinessColor,
  readinessRecommendation,
} from '../js/analytics/scoring/readiness-scoring.js';

test('computeReadiness: no signals -> null score, No Data', () => {
  const r = computeReadiness({});
  assert.equal(r.score, null);
  assert.equal(r.status, 'No Data');
  assert.deepEqual(r.available, []);
  assert.equal(r.confidence, 'none');
  assert.equal(r.inputCount, 0);
  assert.deepEqual(r.evidence, []);
});

test('computeReadiness: a single signal carries full weight but stays low-confidence', () => {
  // sleepHours 8.5 -> sleep component 100; only signal -> score 100.
  const r = computeReadiness({ sleepHours: 8.5 });
  assert.equal(r.score, 100);
  assert.equal(r.status, 'Limited signal');
  assert.equal(r.confidence, 'low');
  assert.equal(r.inputCount, 1);
  assert.deepEqual(r.available, ['sleep']);
  assert.equal(r.components.sleep, 100);
  assert.doesNotMatch(r.recommendation, /PR attempt|time trial|primed/i);
  assert.match(r.recommendation, /not enough to recommend pushing or backing off/i);
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
  assert.equal(r.status, 'Limited signal');
  assert.doesNotMatch(r.recommendation, /rest advised|back off/i);
});

test('computeReadiness: combines weighted components', () => {
  // sleep 7.5 -> 85, load 0.9 -> 100. Weights sleep .27, load .23.
  // score = (85*.27 + 100*.23) / (.27+.23) = (22.95 + 23) / .5 = 91.9 -> 92
  const r = computeReadiness({ sleepHours: 7.5, atl: 9, ctl: 10 });
  assert.equal(r.score, 92);
  assert.equal(r.status, 'Developing read');
  assert.equal(r.confidence, 'moderate');
  assert.equal(r.inputCount, 2);
  assert.match(r.recommendation, /wait for more evidence before a PR or time trial/i);
  assert.deepEqual(r.available.sort(), ['load', 'sleep']);
});

test('computeReadiness: three signals unlock high-confidence decisive advice', () => {
  const r = computeReadiness({
    hrvStat: { status: 'elevated' }, sleepHours: 8.5, atl: 9, ctl: 10,
  });
  assert.equal(r.confidence, 'high');
  assert.equal(r.inputCount, 3);
  assert.equal(r.status, 'Peak');
  assert.match(r.recommendation, /PR attempt/i);
});

test('computeReadiness: stale, future, and implausible inputs are excluded', () => {
  const r = computeReadiness({
    sleepHours: 8,
    todayWellness: { mood: 5, soreness: 1 },
    restingHrValues: [{ date: '2026-07-14', bpm: 500 }, { date: '2026-07-13', bpm: 52 }],
    signalDates: { sleep: '2026-07-10', wellness: '2026-07-15', restingHr: '2026-07-14' },
    asOf: '2026-07-14',
  });
  assert.equal(r.score, null);
  assert.deepEqual(r.excluded.map((item) => [item.key, item.reason]), [
    ['sleep', 'stale'], ['restingHr', 'invalid'], ['wellness', 'future-dated'],
  ]);
});

test('computeReadiness: outliers do not become evidence and trace weights are normalized', () => {
  const outlier = computeReadiness({ sleepHours: 20 });
  assert.equal(outlier.score, null);
  assert.deepEqual(outlier.excluded, [{ key: 'sleep', reason: 'invalid' }]);

  const r = computeReadiness({ sleepHours: 7.5, atl: 9, ctl: 10 });
  const total = Object.values(r.devTrace.normalizedWeights).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 1);
  assert.deepEqual(r.evidence.map((item) => item.key).sort(), ['load', 'sleep']);
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
