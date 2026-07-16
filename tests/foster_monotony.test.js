// Phase 5.7 / 5.8 — Foster training monotony (daily-load method) + neutral
// acute:chronic load wording. See docs/archive/HARDENING_PLAN-legacy-2026-07-13.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  trainingMonotony,
  strainScore,
  trainingLoadStatus,
} from '../js/analytics/calculations/load-calcs.js';
import { weekDailyLoads } from '../js/metrics/metrics-load.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test('weekDailyLoads returns per-day gym+run sRPE with rest days as 0', () => {
  const state = {
    weeks: {
      '1': {
        gymRpe:   { mon: 8, wed: 7 },
        gymStats: { mon: { time: 60 }, wed: { time: 50 } },
        runs:     { fri: { rpe: 6, time: '40:00' } },
      },
    },
  };
  const daily = weekDailyLoads(state, DAYS, 1);
  // mon: 8*60=480, wed: 7*50=350, fri: 6*40=240, rest days 0
  assert.deepEqual(daily, [480, 0, 350, 0, 240, 0, 0]);
});

test('Foster monotony is computed from DAILY loads within one week (not weekly totals)', () => {
  // mean = 1070/7 = 152.857 ; population SD ≈ 190.6 ; monotony ≈ 0.8
  const daily = [480, 0, 350, 0, 240, 0, 0];
  assert.equal(trainingMonotony(daily), 0.8);
});

test('a more even (repetitive) week yields HIGHER monotony than a spiky week', () => {
  const even  = [100, 90, 110, 100, 95, 105, 100]; // low spread → high monotony
  const spiky = [500, 0, 0, 0, 0, 0, 20];          // high spread → low monotony
  const mEven  = trainingMonotony(even);
  const mSpiky = trainingMonotony(spiky);
  assert.ok(mEven > mSpiky, `expected even(${mEven}) > spiky(${mSpiky})`);
});

test('monotony returns null (insufficient) rather than a huge number when SD is 0', () => {
  // Every day identical → zero spread → not a valid monotony figure.
  assert.equal(trainingMonotony([100, 100, 100, 100, 100, 100, 100]), null);
});

test('monotony returns null with fewer than two training days', () => {
  assert.equal(trainingMonotony([500, 0, 0, 0, 0, 0, 0]), null);
  assert.equal(trainingMonotony([0, 0, 0, 0, 0, 0, 0]), null);
  assert.equal(trainingMonotony([]), null);
  assert.equal(trainingMonotony(null), null);
});

test('Foster strain = weekly load × monotony, null when monotony is undefined', () => {
  const daily = [480, 0, 350, 0, 240, 0, 0];
  assert.equal(strainScore(1070, daily), Math.round(1070 * 0.8)); // 856
  assert.equal(strainScore(1070, [100, 100, 100, 100, 100, 100, 100]), null); // SD 0
  assert.equal(strainScore(0, daily), 0); // load 0 → strain 0 (monotony valid)
});

test('load status wording is descriptive baseline language, never injury prediction', () => {
  const labels = [
    trainingLoadStatus(500, 0),   // no chronic baseline
    trainingLoadStatus(200, 500), // well below
    trainingLoadStatus(100, 100), // near
    trainingLoadStatus(140, 100), // above
    trainingLoadStatus(500, 300), // substantially above (ratio 1.66)
  ].map(s => s.status);

  // No causal-injury or scare wording.
  for (const label of labels) {
    assert.doesNotMatch(label, /danger|injury|overtrain/i, `bad label: ${label}`);
    assert.match(label, /baseline/i, `expected baseline wording: ${label}`);
  }
  // Zones are preserved so downstream logic/styling still works.
  assert.equal(trainingLoadStatus(500, 300).zone, 'danger');
  assert.equal(trainingLoadStatus(500, 0).zone, 'unknown');
});
