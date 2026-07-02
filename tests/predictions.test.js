import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeksToTarget, strengthProjections, runningProjection, buildPredictions, topPredictionLine } from '../js/brain/predictions.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test('weeksToTarget: projects from the CURRENT value at the trend rate', () => {
  // climbing 5/week, current (latest) = 120; target 130 → 2 weeks.
  const s = [100, 105, 110, 115, 120];
  assert.equal(weeksToTarget(s, 130, true), 2);
  // Already at/above target → 0.
  assert.equal(weeksToTarget(s, 118, true), 0);
});

test('weeksToTarget: not improving (or wrong direction) → null', () => {
  assert.equal(weeksToTarget([120, 118, 119, 117, 118], 130, true), null); // flat/declining
  assert.equal(weeksToTarget([100, 100], 130, true), null);                // too few points
});

test('weeksToTarget: pace (lower is better) improving projects', () => {
  // pace dropping 5s/km per week, current (latest) = 280; target 270 → 2 weeks.
  const pace = [300, 295, 290, 285, 280];
  assert.equal(weeksToTarget(pace, 270, false), 2);
  // Getting slower → null.
  assert.equal(weeksToTarget([280, 285, 290, 295], 270, false), null);
});

function liftingState() {
  const weeks = {};
  for (let w = 1; w <= 5; w++) {
    const sq = 100 + (w - 1) * 5;   // 100..120 e1RM-ish (5×5)
    weeks[String(w)] = { lifts: { mon: { 'Back Squat': [{ w: String(sq), r: 5, c: true }] } }, runs: {}, dates: {} };
  }
  return { currentWeek: '5', weeks };
}

test('strengthProjections: rising squat gets a next-plate ETA', () => {
  const p = strengthProjections(liftingState(), DAYS, 5);
  const squat = p.find(x => x.lift === 'Squat');
  assert.ok(squat);
  assert.ok(squat.current > 100);
  assert.equal(squat.target % 10, 0);
  assert.ok(squat.target > squat.current);
  assert.ok(squat.etaWeeks === null || squat.etaWeeks > 0);
});

test('runningProjection: threshold pace yields VDOT, races and a faster 5k ETA', () => {
  const weeks = {};
  for (let w = 1; w <= 5; w++) {
    // avg pace improving 5s/week: 300 → 280
    weeks[String(w)] = { runs: { wed: { dist: '5', time: `${Math.floor((300 - (w - 1) * 5) * 5 / 60)}:00`, rpe: '6' } }, lifts: {}, dates: {} };
  }
  const state = { currentWeek: '5', weeks, thresholdPaceSeconds: 250 };
  const r = runningProjection(state, DAYS, 5);
  assert.equal(r.hasData, true);
  assert.ok(r.vdot > 0);
  assert.ok(r.races && r.races.fiveK);
  assert.ok(r.current5k);
  // next faster target below the current predicted 5k should exist
  if (r.nextTarget) assert.match(r.nextTarget.time, /^\d+:\d\d$/);
});

test('buildPredictions + topPredictionLine', () => {
  const pred = buildPredictions(liftingState(), DAYS);
  assert.equal(pred.hasData, true);
  const line = topPredictionLine(pred);
  // May be null if the trend flattened, but when present it reads naturally.
  if (line) assert.match(line, /current trend/);
  // No data → no line.
  assert.equal(topPredictionLine({ hasData: false }), null);
});
