import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutQuality } from '../js/metrics/metrics-strength.js';
import { consistencyPillar } from '../js/brain/hybrid-score/pillars.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A completed working set: weight w × reps r, measured against target tw × tr.
const set = (w, r, tw, tr) => ({ w: String(w), r: String(r), tw, tr, c: true });

function liftWeek(sets) {
  return { weeks: { '1': { lifts: { mon: { 'Back Squat': sets } } } } };
}

test('E5 workoutQuality — hitting the prescription scores ~100, junk scores low', () => {
  const onTarget = workoutQuality(liftWeek([set(100, 5, 100, 5), set(100, 5, 100, 5)]), DAYS, 1);
  assert.equal(onTarget.pct, 100);
  assert.equal(onTarget.n, 2);

  const junk = workoutQuality(liftWeek([set(20, 2, 100, 5), set(20, 2, 100, 5)]), DAYS, 1);
  assert.ok(junk.pct <= 15, `junk sets (${junk.pct}) should score low`);
  assert.ok(onTarget.pct > junk.pct);
});

test('E5 workoutQuality — beating target caps at 100 (no bonus for overshoot)', () => {
  const over = workoutQuality(liftWeek([set(120, 6, 100, 5)]), DAYS, 1);
  assert.equal(over.pct, 100);
});

test('E5 workoutQuality — sets without a target and incomplete sets are ignored', () => {
  // No tw/tr → not measurable.
  const noTarget = workoutQuality(liftWeek([{ w: '100', r: '5', c: true }]), DAYS, 1);
  assert.equal(noTarget.hasData, false);
  assert.equal(noTarget.pct, null);
  // Incomplete set (c:false) with a target → ignored (completion is Consistency's job).
  const incomplete = workoutQuality(liftWeek([{ w: '0', r: '0', tw: 100, tr: 5, c: false }]), DAYS, 1);
  assert.equal(incomplete.hasData, false);
});

test('E5 — Consistency trims for junk work but never below its neutral floor of the plan', () => {
  const base = {
    week: { consistencyTotal: 6, consistencyDone: 6, consistencyPct: 100 },
    streak: { current: 4 },
    goal: { avgConsistency: 90 },
  };
  const withTargets = (qPct, qN) => ({ ...base, week: { ...base.week, qualityPct: qPct, qualityN: qN } });

  const clean = consistencyPillar(withTargets(100, 6));
  const junk = consistencyPillar(withTargets(30, 6));
  const noQuality = consistencyPillar(base); // qualityPct undefined → no change

  assert.ok(junk.score < clean.score, `junk (${junk.score}) should score below clean (${clean.score})`);
  assert.equal(clean.score, noQuality.score, 'hitting targets == the un-adjusted score');
  assert.ok(junk.signals.includes('sets logged below target'));
  assert.ok(clean.signals.includes('hitting your targets'));
});
