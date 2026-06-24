import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linearRegression, projectValue, trendLine, rollingAverage,
  pctChange, rollingSum, clamp, maxIndex,
} from '../js/analytics/calculations/math-utils.js';

test('linearRegression: perfect positive line y = 2x + 1', () => {
  const r = linearRegression([1, 3, 5, 7, 9]); // x = 0..4
  assert.ok(Math.abs(r.slope - 2) < 1e-9);
  assert.ok(Math.abs(r.intercept - 1) < 1e-9);
  assert.ok(Math.abs(r.r2 - 1) < 1e-9);
});

test('linearRegression: fewer than 2 valid points returns zero slope', () => {
  assert.deepEqual(linearRegression([]), { slope: 0, intercept: 0, r2: 0 });
  assert.deepEqual(linearRegression([5]), { slope: 0, intercept: 5, r2: 0 });
});

test('linearRegression: ignores non-positive / non-finite values', () => {
  // Only the positive finite points (5,7,9 at x=2,3,4) define the line.
  const r = linearRegression([0, -3, 5, 7, 9]);
  assert.ok(Math.abs(r.slope - 2) < 1e-9);
});

test('projectValue: extrapolates from regression', () => {
  const reg = { slope: 2, intercept: 1, r2: 1 };
  assert.equal(projectValue(reg, 10), 21);
});

test('trendLine: length equals series length plus extension', () => {
  assert.equal(trendLine([1, 2, 3], 0).length, 3);
  assert.equal(trendLine([1, 2, 3], 2).length, 5);
});

test('rollingAverage: window <= 1 returns a copy, not the same ref', () => {
  const src = [1, 2, 3];
  const out = rollingAverage(src, 1);
  assert.deepEqual(out, src);
  assert.notEqual(out, src);
});

test('rollingAverage: expanding window at the leading edge', () => {
  // window 2: [2], [2,4], [4,6] -> 2, 3, 5
  assert.deepEqual(rollingAverage([2, 4, 6], 2), [2, 3, 5]);
});

test('rollingAverage: zeros are excluded from the mean', () => {
  // i1 slice [4,0] filtered -> [4] -> 4 ; i2 slice [0,6] -> [6] -> 6
  assert.deepEqual(rollingAverage([4, 0, 6], 2), [4, 4, 6]);
});

test('pctChange: standard and sign handling', () => {
  assert.equal(pctChange(100, 150), 50);
  assert.equal(pctChange(200, 100), -50);
  assert.equal(pctChange(-100, -50), 50); // uses |a| in denominator
});

test('pctChange: zero or falsy base returns null', () => {
  assert.equal(pctChange(0, 10), null);
  assert.equal(pctChange(null, 10), null);
});

test('rollingSum: moving window sum', () => {
  assert.deepEqual(rollingSum([1, 2, 3], 2), [1, 3, 5]);
  assert.deepEqual(rollingSum([1, 2, 3, 4], 3), [1, 3, 6, 9]);
});

test('clamp: bounds enforcement', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('maxIndex: returns index of the maximum, -1 for empty', () => {
  assert.equal(maxIndex([3, 1, 7, 2]), 2);
  assert.equal(maxIndex([]), -1);
});
