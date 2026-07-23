import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRecoveryPerformance } from '../js/analytics/recovery-performance.js';

const entry = (date, sleep, mood, soreness) => ({ date, sleep, mood, soreness });

test('7D Recovery averages the metric and reports check-in count', () => {
  const state = { wellnessLog: [
    entry('2026-07-20', 8, 4, 2),
    entry('2026-07-21', 7, 3, 3),
    entry('2026-07-24', 6, 5, 1),   // future relative to today
  ] };
  const model = buildRecoveryPerformance(state, { today: '2026-07-23', range: '7d', metric: 'sleep' });
  assert.equal(model.recordCount, 2);
  assert.equal(model.formattedTotal, '7.5 h', 'average of 8 and 7');
  assert.equal(model.exclusions.future, 1);
});

test('a metric is only counted on days it was actually recorded', () => {
  const state = { wellnessLog: [
    entry('2026-07-20', 8, 0, 0),   // only sleep logged
    entry('2026-07-21', 0, 4, 0),   // only mood logged
  ] };
  const sleep = buildRecoveryPerformance(state, { today: '2026-07-23', range: '7d', metric: 'sleep' });
  const mood = buildRecoveryPerformance(state, { today: '2026-07-23', range: '7d', metric: 'mood' });
  assert.equal(sleep.recordCount, 1, 'only the day with a sleep value counts for sleep');
  assert.equal(mood.recordCount, 1, 'only the day with a mood value counts for mood');
});

test('soreness is inverse: a decrease is favourable', () => {
  const state = { wellnessLog: [
    entry('2026-07-20', 8, 4, 2),   // this week Mon
    entry('2026-07-13', 6, 3, 4),   // last week Mon (same elapsed point)
  ] };
  const model = buildRecoveryPerformance(state, { today: '2026-07-22', range: '7d', metric: 'soreness' });
  assert.equal(model.comparison.direction, 'down', 'soreness fell from 4 to 2');
  assert.equal(model.comparison.favorable, true, 'less soreness is the better direction');
});

test('a partial current week compares against the SAME elapsed point last week', () => {
  const state = { wellnessLog: [
    entry('2026-07-20', 8, 4, 2),   // this Mon
    entry('2026-07-13', 6, 3, 3),   // last Mon
    entry('2026-07-17', 4, 2, 5),   // last Fri — beyond the elapsed point
  ] };
  const model = buildRecoveryPerformance(state, { today: '2026-07-22', range: '7d', metric: 'sleep' });
  assert.equal(model.total, 8);
  assert.equal(model.comparison.previous, 6, 'only last Monday is inside the same elapsed window');
  assert.equal(model.comparison.favorable, true);
});

test('an empty period is honest, not a zero, and not comparable', () => {
  const model = buildRecoveryPerformance({ wellnessLog: [] }, { today: '2026-07-23', range: '7d', metric: 'sleep' });
  assert.equal(model.recordCount, 0);
  assert.equal(model.comparison.isComparable, false);
  // Every bin is empty, so none carries evidence.
  assert.equal(model.bins.every((bin) => bin.records.length === 0), true);
});

test('1Y Recovery uses twelve monthly buckets of averages', () => {
  const state = { wellnessLog: [
    entry('2026-02-10', 7, 4, 2),
    entry('2026-07-20', 8, 5, 1),
  ] };
  const model = buildRecoveryPerformance(state, { today: '2026-07-23', range: '1y', metric: 'sleep' });
  assert.equal(model.bins.length, 12);
  assert.equal(model.bins[1].records.length, 1, 'February bucket holds the Feb check-in');
  assert.equal(model.bins[6].records.length, 1, 'July bucket holds the July check-in');
});
