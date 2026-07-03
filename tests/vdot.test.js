import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vdotFromPerformance, thresholdSecsFromVdot, bestEffortVdot, effectiveVdot, vdotFromThresholdPace } from '../js/analytics/calculations/running-calcs.js';
import { runningProjection } from '../js/brain/predictions.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test('vdotFromPerformance: Daniels benchmark (20:00 5k ≈ VDOT 49–51)', () => {
  const v = vdotFromPerformance(5, 20 * 60);
  assert.ok(v >= 49 && v <= 51, `20:00 5k → VDOT ${v}`);
  // A faster 5k gives a higher VDOT; slower gives lower.
  assert.ok(vdotFromPerformance(5, 18 * 60) > v);
  assert.ok(vdotFromPerformance(5, 24 * 60) < v);
  assert.equal(vdotFromPerformance(0, 100), null);
});

test('thresholdSecsFromVdot ∘ vdotFromThresholdPace round-trips', () => {
  const thr = thresholdSecsFromVdot(50);
  assert.ok(thr > 0);
  assert.ok(Math.abs(vdotFromThresholdPace(thr) - 50) <= 1);
});

test('bestEffortVdot: takes the hardest qualifying run, ignores sprints/walks', () => {
  const weeks = {
    '1': { runs: { mon: { dist: '5', time: '22:00' }, wed: { dist: '10', time: '50:00' } } },       // ~44, ~44
    '2': { runs: { tue: { dist: '5', time: '19:30' },                                                 // hard 5k → higher
                   thu: { dist: '0.4', time: '1:20' },                                                // sprint — excluded
                   sat: { dist: '6', time: '40:00', type: 'walk' } } },                               // walk — excluded
  };
  const state = { weeks };
  const best = bestEffortVdot(state, DAYS, 2);
  const hard5k = vdotFromPerformance(5, 19.5 * 60);
  assert.equal(best, hard5k); // the 19:30 5k is the best effort
});

test('effectiveVdot: manual threshold wins; else estimates from runs', () => {
  const runState = { weeks: { '1': { runs: { mon: { dist: '5', time: '20:00' } } } } };
  const est = effectiveVdot(runState, DAYS, 1);
  assert.equal(est.source, 'estimated');
  assert.ok(est.vdot >= 49 && est.vdot <= 51);
  assert.ok(est.thresholdSecs > 0);
  // Manual threshold overrides estimation.
  const manual = effectiveVdot({ ...runState, thresholdPaceSeconds: 240 }, DAYS, 1);
  assert.equal(manual.source, 'threshold');
  assert.equal(manual.thresholdSecs, 240);
});

test('E4 — projections work with NO manual threshold (estimated VDOT)', () => {
  const weeks = {};
  for (let w = 1; w <= 5; w++) {
    // A hard 5k each week, getting faster: 21:00 → 20:00.
    const sec = (21 - (w - 1) * 0.25) * 60;
    const mm = Math.floor(sec / 60), ss = String(Math.round(sec) % 60).padStart(2, '0');
    weeks[String(w)] = { runs: { wed: { dist: '5', time: `${mm}:${ss}` } }, lifts: {} };
  }
  const state = { currentWeek: '5', weeks, settings: { distanceUnit: 'km' } }; // NO thresholdPaceSeconds
  const r = runningProjection(state, DAYS, 5);
  assert.equal(r.hasData, true, 'VDOT estimated from runs → projections available');
  assert.ok(r.vdot > 0);
  assert.ok(r.races && r.races.fiveK);
  assert.ok(r.current5k);
});
