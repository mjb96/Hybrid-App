import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robustE1rmSeries, liftWeight } from '../js/metrics/metrics-strength.js';
import { strengthPillar } from '../js/brain/hybrid-score/pillars.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// One working set per week (weight `kg` × 1 rep) so the weekly best e1RM tracks
// `kg` proportionally — the simplest lens on the progression path.
function liftState(name, weeklyKg) {
  const weeks = {};
  weeklyKg.forEach((kg, i) => {
    weeks[String(i + 1)] = { lifts: { mon: { [name]: [{ w: String(kg), r: '1', c: true }] } }, runs: {} };
  });
  return { currentWeek: String(weeklyKg.length), weeks, settings: { fitnessLevel: 'intermediate' } };
}

// A constant 5×5 backing block every week (keeps tonnage ~flat) plus ONE heavy
// single that varies — so only the top-set e1RM moves week to week, isolating
// the e1RM-spike behaviour from the volume-upkeep term.
function squatState(topSingles) {
  const weeks = {};
  topSingles.forEach((top, i) => {
    const sets = [];
    for (let s = 0; s < 5; s++) sets.push({ w: '80', r: '5', c: true });
    sets.push({ w: String(top), r: '1', c: true });
    weeks[String(i + 1)] = { lifts: { mon: { 'Back Squat': sets } }, runs: {} };
  });
  return { currentWeek: String(topSingles.length), weeks, settings: {} };
}

test('E8 robustE1rmSeries — a lone spike is rejected, sustained gains tracked, zeros preserved', () => {
  // A single final-week spike over a flat block → median flattens it out.
  assert.deepEqual(robustE1rmSeries([100, 100, 100, 100, 140]), [100, 100, 100, 100, 100]);
  // A real climb still rises (trailing-3 median lags slightly but tracks up).
  const steady = robustE1rmSeries([100, 105, 110, 115, 120]);
  assert.equal(steady[0], 100);
  assert.equal(steady[4], 115); // median(110,115,120)
  // Non-training weeks (0) stay 0 so progression's gap-skipping still works.
  assert.deepEqual(
    robustE1rmSeries([100, 0, 0, 120, 0, 140]).map(v => v > 0),
    [true, false, false, true, false, true],
  );
});

test('E8 liftWeight — compounds outrank isolation; "incline bench" resolves as secondary', () => {
  assert.equal(liftWeight('Back Squat'), 1.0);
  assert.equal(liftWeight('Deadlift'), 1.0);
  assert.equal(liftWeight('Bench Press'), 1.0);
  assert.equal(liftWeight('Overhead Press'), 1.0);
  assert.equal(liftWeight('Bicep Curl'), 0.25);
  assert.equal(liftWeight('Lateral Raise'), 0.25);
  assert.equal(liftWeight('Incline Bench Press'), 0.6); // not primary "bench"
  assert.equal(liftWeight('Barbell Row'), 0.6);
  assert.equal(liftWeight('Romanian Deadlift'), 0.6); // not primary "deadlift"
  assert.equal(liftWeight('Zercher Carry'), 0.5); // unknown → neutral
});

test('E8 — a lone near-max single no longer spikes Strength; a repeated gain does', () => {
  const model = { maxWeek: 5, wkNum: 5 };
  const spike = strengthPillar(model, squatState([100, 100, 100, 100, 140]), DAYS, 'intermediate').score;
  const flat = strengthPillar(model, squatState([100, 100, 100, 100, 100]), DAYS, 'intermediate').score;
  const sustained = strengthPillar(model, squatState([100, 110, 120, 130, 140]), DAYS, 'intermediate').score;
  assert.ok(Math.abs(spike - flat) <= 2, `one-off spike (${spike}) scores ~ flat block (${flat})`);
  assert.ok(sustained >= spike + 5, `repeated progression (${sustained}) beats the spike (${spike})`);
});

test('E8 — a curl PR moves Strength less than an identical squat PR', () => {
  const model = { maxWeek: 5, wkNum: 5 };
  // A gentle climb so both gains land inside the scoring band (a saturating
  // climb would peg both at 100 and hide the weighting).
  const squatPR = strengthPillar(model, liftState('Back Squat', [100, 101, 102, 103, 104]), DAYS, 'intermediate').score;
  const curlPR = strengthPillar(model, liftState('Bicep Curl', [100, 101, 102, 103, 104]), DAYS, 'intermediate').score;
  assert.ok(squatPR > curlPR, `squat PR (${squatPR}) should outscore an identical curl PR (${curlPR})`);
});
