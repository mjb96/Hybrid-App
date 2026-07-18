// ==========================================
// METRICS-LOAD TESTS
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  weeklyLoadSeries,
  weeklyRpeSeries,
  streakView,
  formatFormTSB,
} from '../js/metrics/metrics-load.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function fixture() {
  return {
    currentWeek: '2',
    weeks: {
      '1': {
        lifts: { mon: { 'Back Squat': [{ w: '100', r: '5', c: true }] } },
        gymRpe:   { mon: '7' },
        gymStats: { mon: { time: '60' } },      // 60 min
        runs:     { sat: { dist: '8', time: '40:00', rpe: '6' } },
      },
      '2': {
        lifts: { mon: { 'Back Squat': [{ w: '105', r: '5', c: true }] } },
        gymRpe:   { mon: '8' },
        gymStats: { mon: { time: '55' } },      // 55 min
        runs:     { sat: { dist: '10', time: '50:00', rpe: '7' } },
      },
    },
  };
}

// ---- weeklyLoadSeries --------------------------------------------------
test('weeklyLoadSeries returns {lift, run} sRPE per week', () => {
  const result = weeklyLoadSeries(fixture(), DAYS, 2);
  // wk1: gym 7*60=420 + run 6*40=240; wk2: gym 8*55=440 + run 7*50=350
  assert.deepEqual(result.lift, [420, 440]);
  assert.deepEqual(result.run,  [240, 350]);
});

test('weeklyLoadSeries handles empty state', () => {
  const result = weeklyLoadSeries({ weeks: {} }, DAYS, 2);
  assert.deepEqual(result.lift, [0, 0]);
  assert.deepEqual(result.run,  [0, 0]);
});

// ---- weeklyRpeSeries ---------------------------------------------------
test('weeklyRpeSeries combines gym and run RPE into a single weekly average', () => {
  const result = weeklyRpeSeries(fixture(), DAYS, 2);
  // wk1: gym RPE=7, run RPE=6 → avg = 6.5
  assert.equal(result[0], 6.5);
  // wk2: gym RPE=8, run RPE=7 → avg = 7.5
  assert.equal(result[1], 7.5);
});

test('weeklyRpeSeries returns 0 for weeks with no RPE data', () => {
  const result = weeklyRpeSeries({ weeks: {} }, DAYS, 2);
  assert.deepEqual(result, [0, 0]);
});

test('weeklyRpeSeries handles gym-only weeks', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { gymRpe: { mon: '8' }, gymStats: { mon: { time: '45' } } } },
  };
  const result = weeklyRpeSeries(state, DAYS, 1);
  assert.equal(result[0], 8);
});

test('weeklyRpeSeries handles run-only weeks', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { runs: { tue: { dist: '5', time: '25:00', rpe: '6' } } } },
  };
  const result = weeklyRpeSeries(state, DAYS, 1);
  assert.equal(result[0], 6);
});

// ---- streakView --------------------------------------------------------
test('streakView returns current and longest streak', () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const streakData = {
    current: 5,
    longest: 12,
    lastActivityDate: yesterday.toISOString().slice(0, 10),
  };
  const result = streakView(streakData);
  assert.equal(result.current, 5);
  assert.equal(result.longest, 12);
  assert.equal(result.broken, false);
  assert.equal(result.hasData, true);
});

test('streakView detects a broken streak', () => {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const streakData = {
    current: 5,
    longest: 10,
    lastActivityDate: threeDaysAgo.toISOString().slice(0, 10),
  };
  const result = streakView(streakData);
  assert.equal(result.current, 0);
  assert.equal(result.broken, true);
});

test('streakView handles empty streak data', () => {
  const result = streakView({});
  assert.equal(result.hasData, false);
  assert.equal(result.current, 0);
});

// ── Form (TSB) card — no confident verdict on zero data ───────────────────────
// Regression: the Recovery leaf showed "0 · fresh / peaking" with no training
// history (currentCTL 0 → TSB 0), while the sibling ACWR card and Stats-tab TSB
// both correctly showed "--". formatFormTSB gates on real load data.

test('formatFormTSB shows a neutral empty state when there is no load data', () => {
  assert.deepEqual(formatFormTSB(0, 0), { value: '--', sub: 'Log training to build this' });
  assert.deepEqual(formatFormTSB(null, null), { value: '--', sub: 'Log training to build this' });
  assert.deepEqual(formatFormTSB(undefined, 5), { value: '--', sub: 'Log training to build this' });
});

test('formatFormTSB reads positive form (fresh) once load history exists', () => {
  const r = formatFormTSB(30, 22); // CTL 30, ATL 22 -> TSB +8
  assert.equal(r.value, '+8');
  assert.equal(r.sub, 'fresh / peaking');
});

test('formatFormTSB reads negative form (carrying fatigue)', () => {
  const r = formatFormTSB(20, 33); // TSB -13
  assert.equal(r.value, '-13');
  assert.equal(r.sub, 'carrying fatigue');
});

test('formatFormTSB shows a bare 0 (not +0) at exact balance with data present', () => {
  const r = formatFormTSB(25, 25); // has data, TSB 0
  assert.equal(r.value, '0');
  assert.equal(r.sub, 'fresh / peaking');
});
