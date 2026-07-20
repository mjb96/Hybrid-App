import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { computeHybridScore } from '../js/brain/hybrid-score/hybrid-score.js';
import { strengthPillar, endurancePillar } from '../js/brain/hybrid-score/pillars.js';
import { paceMatchedWeekVolume } from '../js/brain/load_models.js';
import { addDaysISO } from '../js/dates.js';

// =============================================================================
// Partial-week Hybrid Score audit (the reported Monday bug).
//
// Symptom: on Monday, with one workout logged whose volume is HIGHER than last
// Monday's, the Strength/Endurance pillars reported "volume down" because the
// in-progress week's cumulative total (one day) was compared against completed
// prior weeks (multiple days). Fair comparison is pace-matched week-to-date:
// this week's trained weekdays vs the SAME weekdays across the trailing weeks.
//
// All tests use FIXED dates so they never depend on the machine clock.
// =============================================================================

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONDAY = '2026-07-20'; // Australia-relevant fixed Monday

const liftSet = (w) => ({ w: String(w), r: 5, c: true });
const liftDay = (w) => ({ 'Back Squat': [liftSet(w), liftSet(w), liftSet(w)] });

// Build a hybrid athlete where the current program week is IN PROGRESS.
// Prior weeks train Mon/Wed/Fri; the current week has only the requested days.
function buildState({ currentWeek = 5, monWeightBase = 100, monWeightStep = 2, currentDays = ['mon'], currentMonBonus = 0 } = {}) {
  const start = addDaysISO(MONDAY, -(currentWeek - 1) * 7);
  const weeks = {};
  for (let w = 1; w <= currentWeek; w++) {
    const monISO = addDaysISO(start, (w - 1) * 7);
    const wedISO = addDaysISO(monISO, 2);
    const friISO = addDaysISO(monISO, 4);
    const monWeight = monWeightBase + (w - 1) * monWeightStep;
    if (w < currentWeek) {
      weeks[String(w)] = {
        lifts: { mon: liftDay(monWeight), wed: liftDay(monWeight), fri: liftDay(monWeight) },
        dates: { mon: monISO, wed: wedISO, fri: friISO },
      };
    } else {
      const lifts = {}; const dates = {};
      const isoFor = { mon: monISO, wed: wedISO, fri: friISO };
      currentDays.forEach(d => { lifts[d] = liftDay(monWeight + (d === 'mon' ? currentMonBonus : 0)); dates[d] = isoFor[d]; });
      weeks[String(w)] = { lifts, dates };
    }
  }
  return {
    currentWeek: String(currentWeek),
    settings: { fitnessLevel: 'intermediate', fitnessGoal: 'strength', weightGoal: 'maintain', distanceUnit: 'km' },
    weeks,
    loadMetrics: { atl: 9, ctl: 10 },
  };
}
const PROGRAM = { totalWeeks: 12, days: { mon: { title: 'Squat', runs: 'Rest', lifts: [{ name: 'Back Squat' }] } } };
const modelFor = (state) => computeDashboardModel(state, DAYS, PROGRAM, 'mon', { today: MONDAY });

// --- unit: the shared pace-matched selector -------------------------------
test('paceMatchedWeekVolume: judges only the trained weekdays, like-for-like', () => {
  const state = buildState({ currentWeek: 4, currentDays: ['mon'], currentMonBonus: 30 });
  const vol = (wd, d) => (wd?.lifts?.[d]?.['Back Squat'] || []).reduce((s, x) => s + (+x.w) * (+x.r), 0);
  const pm = paceMatchedWeekVolume(state, DAYS, 4, vol, 3);
  assert.equal(pm.trainedDays, 1, 'only Monday trained this week');
  assert.ok(pm.priorWeeks >= 1, 'has prior Mondays to compare');
  // cur = this Monday; priorAvg = average of prior weeks OVER MONDAY ONLY (not
  // their full Mon+Wed+Fri totals).
  assert.ok(pm.cur > pm.priorAvg, 'this Monday beats prior Mondays, so cur > priorAvg');
  assert.ok(pm.priorAvg < 1600 * 3, 'priorAvg is a single-day figure, not a 3-day total');
});

test('paceMatchedWeekVolume: no trained days yet → neutral (no basis)', () => {
  const state = buildState({ currentWeek: 4, currentDays: [] });
  state.weeks['4'] = { lifts: {}, dates: {} };
  const vol = (wd, d) => (wd?.lifts?.[d]?.['Back Squat'] || []).reduce((s, x) => s + (+x.w) * (+x.r), 0);
  const pm = paceMatchedWeekVolume(state, DAYS, 4, vol, 3);
  assert.equal(pm.cur, 0);
  assert.equal(pm.priorAvg, 0);
});

// --- Scenario 1-4: Monday, one workout, higher than last Monday ------------
test('Monday one-workout: this Monday > last Monday is NOT reported as a decline', () => {
  // current week has only Monday, and this Monday out-lifts every prior Monday.
  const state = buildState({ currentWeek: 5, currentDays: ['mon'] });
  const model = modelFor(state);
  const sp = strengthPillar(model, state, DAYS, 'intermediate');
  assert.ok(!sp.signals.includes('lifting volume down'),
    `must not claim volume down when on pace, got ${JSON.stringify(sp.signals)}`);
  // The dashboard's pace-matched tile agrees the week-to-date volume is up.
  assert.equal(model.week.volume.delta.dir, 'up');
});

test('Monday partial week does not tank the Strength pillar vs a full week', () => {
  // Compare the pillar on Monday (1 day logged) vs the same athlete after a full
  // 3-day week: the partial week must not score dramatically lower.
  const partial = buildState({ currentWeek: 5, currentDays: ['mon'] });
  const full    = buildState({ currentWeek: 5, currentDays: ['mon', 'wed', 'fri'] });
  const sPartial = strengthPillar(modelFor(partial), partial, DAYS, 'intermediate').score;
  const sFull    = strengthPillar(modelFor(full), full, DAYS, 'intermediate').score;
  assert.ok(sPartial >= sFull - 3,
    `partial Monday (${sPartial}) should be ~on par with the full week (${sFull}), not tanked`);
});

test('the whole Hybrid Score does not drop on Monday purely from partial volume', () => {
  const partial = buildState({ currentWeek: 5, currentDays: ['mon'] });
  const full    = buildState({ currentWeek: 5, currentDays: ['mon', 'wed', 'fri'] });
  const rPartial = computeHybridScore(modelFor(partial), partial, DAYS, PROGRAM);
  const rFull    = computeHybridScore(modelFor(full), full, DAYS, PROGRAM);
  assert.ok(rPartial.score >= rFull.score - 2,
    `Monday score (${rPartial.score}) should not crater vs full week (${rFull.score})`);
  // No driver should be captioned "lifting volume down" while the athlete is on pace.
  assert.ok(!rPartial.drivers.some(d => /volume down/.test(d.label)),
    `no misleading "volume down" driver on pace: ${JSON.stringify(rPartial.drivers.map(d => d.label))}`);
});

test('a genuinely below-pace Monday is still reported as down (fix is not a whitewash)', () => {
  // This Monday is far LIGHTER than prior Mondays → an honest "volume down".
  const state = buildState({ currentWeek: 5, currentDays: ['mon'], currentMonBonus: -60 });
  const sp = strengthPillar(modelFor(state), state, DAYS, 'intermediate');
  assert.ok(sp.signals.includes('lifting volume down'),
    `a real below-pace week must still read down, got ${JSON.stringify(sp.signals)}`);
});

// --- Scenario 5: Wednesday week-to-date vs prior Mon–Wed -------------------
test('Wednesday week-to-date compares against the previous Mon–Wed, not the full week', () => {
  const WED = addDaysISO(MONDAY, 2);
  const state = buildState({ currentWeek: 5, currentDays: ['mon', 'wed'] });
  const model = computeDashboardModel(state, DAYS, PROGRAM, 'wed', { today: WED });
  const sp = strengthPillar(model, state, DAYS, 'intermediate');
  // Two trained days this week vs prior weeks' Mon+Wed (also two days) → on pace,
  // never a decline from the missing Friday.
  assert.ok(!sp.signals.includes('lifting volume down'),
    `Mon–Wed vs prior Mon–Wed is on pace, got ${JSON.stringify(sp.signals)}`);
});

// --- Scenario 6: completed week vs the completed week before it ------------
test('completed-week comparison: a full week below the prior full week reads down', () => {
  // Make the CURRENT week complete (Mon/Wed/Fri) but lighter than prior weeks.
  const state = buildState({ currentWeek: 5, currentDays: ['mon', 'wed', 'fri'], currentMonBonus: 0 });
  // Drop this week's per-day weight below prior weeks by rewriting them lighter.
  for (const d of ['mon', 'wed', 'fri']) state.weeks['5'].lifts[d] = liftDay(80);
  const sp = strengthPillar(modelFor(state), state, DAYS, 'intermediate');
  assert.ok(sp.signals.includes('lifting volume down'),
    `a completed lighter week should read down, got ${JSON.stringify(sp.signals)}`);
});

// --- Scenario 10: different weekdays between weeks -------------------------
test('training different weekdays week-to-week still finds a comparable basis', () => {
  const state = buildState({ currentWeek: 5, currentDays: ['tue'] });
  // Give prior weeks a Tuesday session so there is a like-for-like weekday.
  for (let w = 1; w < 5; w++) {
    state.weeks[String(w)].lifts.tue = liftDay(100);
    state.weeks[String(w)].dates.tue = addDaysISO(state.weeks[String(w)].dates.mon, 1);
  }
  const model = computeDashboardModel(state, DAYS, PROGRAM, 'tue', { today: addDaysISO(MONDAY, 1) });
  const sp = strengthPillar(model, state, DAYS, 'intermediate');
  assert.ok(sp.score != null && sp.score > 0, 'still produces a strength score');
});

// --- Endurance: the same fix for running distance -------------------------
test('Endurance: a partial run week is not scored as a distance drop', () => {
  const start = addDaysISO(MONDAY, -4 * 7);
  const weeks = {};
  for (let w = 1; w <= 5; w++) {
    const monISO = addDaysISO(start, (w - 1) * 7);
    const wedISO = addDaysISO(monISO, 2);
    const friISO = addDaysISO(monISO, 4);
    const run = (km) => ({ dist: String(km), time: '30:00', rpe: '6', type: 'run' });
    if (w < 5) weeks[String(w)] = { runs: { mon: run(5), wed: run(5), fri: run(5) }, lifts: {}, dates: { mon: monISO, wed: wedISO, fri: friISO } };
    else weeks[String(w)] = { runs: { mon: run(6) }, lifts: {}, dates: { mon: monISO } }; // partial, this Monday longer
  }
  const state = { currentWeek: '5', settings: { fitnessLevel: 'intermediate', fitnessGoal: 'endurance', distanceUnit: 'km' }, weeks, loadMetrics: { atl: 9, ctl: 10 } };
  const runProgram = { totalWeeks: 12, days: { mon: { title: 'Run', runs: '5k easy', lifts: [] } } };
  const model = computeDashboardModel(state, DAYS, runProgram, 'mon', { today: MONDAY });
  const ep = endurancePillar(model, state, DAYS, 'intermediate');
  assert.ok(ep.score != null, 'endurance scored');
  // This Monday (6km) beats prior Mondays (5km) → distance term should be at
  // least neutral, and never captioned as a drop.
  assert.ok(!ep.signals.some(s => /down/.test(s)), `no distance-down caption on pace, got ${JSON.stringify(ep.signals)}`);
});
