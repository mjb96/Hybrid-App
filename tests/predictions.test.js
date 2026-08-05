import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeksToTarget, strengthProjections, runningProjection, buildPredictions, topPredictionLine, trendQuality, confidenceNote } from '../js/brain/predictions.js';

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

// ---- projection confidence (roadmap 3D) -------------------------------------

test('trend quality separates a clean progression from a noisy one', () => {
  const steady = trendQuality([100, 102, 104, 106, 108, 110]);
  assert.equal(steady.level, 'high');
  assert.equal(steady.n, 6);
  assert.ok(steady.r2 > 0.9);

  // Three wildly inconsistent weeks. Before this, the SAME arithmetic gave
  // this series a faster projected rate (+5/wk) than the clean one (+2/wk) —
  // the least trustworthy input produced the most optimistic promise.
  const noisy = trendQuality([100, 150, 110]);
  assert.equal(noisy.level, 'low');
  assert.equal(noisy.n, 3);
  assert.ok(noisy.r2 < 0.5, `expected a poor fit, got r2=${noisy.r2}`);
});

test('trend quality is null when there is not enough data to have a trend', () => {
  assert.equal(trendQuality([100, 100]), null);
  assert.equal(trendQuality([]), null);
});

test('a perfectly flat series reports zero fit rather than dividing by zero', () => {
  const flat = trendQuality([100, 100, 100, 100]);
  assert.equal(flat.r2, 0);
  assert.ok(Number.isFinite(flat.r2));
});

test('a weak trend may not promise a distant horizon', () => {
  // Noisy 3-point trend that arithmetically "reaches" a far target: the ETA is
  // withheld rather than dressed up as a plan.
  const noisy = [100, 150, 110];
  assert.equal(weeksToTarget(noisy, 500, true), null, 'a low-confidence trend must not project 78 weeks out');
  // The same series may still speak about something close by.
  assert.ok(weeksToTarget(noisy, 120, true) != null);

  // A clean six-point trend earns the long horizon.
  const steady = [100, 102, 104, 106, 108, 110];
  assert.ok(weeksToTarget(steady, 150, true) != null);
});

test('strength projections carry their confidence, not just an ETA', () => {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const weeks = {};
  [100, 102, 104, 106, 108, 110].forEach((w, i) => {
    weeks[String(i + 1)] = { lifts: { mon: { 'Back Squat': [{ c: true, w: String(w), r: '5' }] } } };
  });
  const out = strengthProjections({ weeks, currentWeek: '6' }, days, 6);
  const squat = out.find((row) => row.lift === 'Squat');
  assert.ok(squat, 'squat projection present');
  assert.ok(['high', 'moderate', 'low'].includes(squat.confidence));
  assert.ok(squat.samples >= 3);
  assert.ok(squat.confidenceNote && squat.confidenceNote.length > 10);
});

test('confidence notes never present a rough guide as a forecast', () => {
  assert.match(confidenceNote({ level: 'low', n: 3, r2: 0.1 }), /rough indication, not a forecast/);
  assert.match(confidenceNote({ level: 'moderate', n: 4, r2: 0.6 }), /rough guide/);
  assert.match(confidenceNote({ level: 'high', n: 6, r2: 0.95 }), /consistent progress/);
  assert.match(confidenceNote(null), /Not enough history/);
});

test('the coaching projection line uses the athlete\'s weight unit', () => {
  const pred = {
    hasData: true,
    running: { nextTarget: null },
    strength: [{ lift: 'Squat', current: 140, target: 150, etaWeeks: 4 }],
  };
  assert.match(topPredictionLine(pred), /150 kg/);
  assert.match(topPredictionLine(pred, 'lbs'), /150 lbs/);
  assert.doesNotMatch(topPredictionLine(pred, 'lbs'), /kg/);
});
