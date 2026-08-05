// =============================================================================
// EDIT / DELETE PROPAGATION — roadmap 3D.
//
// "Verify edit/delete/import changes propagate immediately across Home,
// Progress, detail screens, coaching, and Hybrid Score."
//
// Every analytics model in the app is a pure function of state, which is what
// SHOULD make this true — but "should" is how caches and memoised week indexes get
// added later without anyone noticing they broke it. These tests build each
// model, mutate the underlying state, rebuild, and assert the new value.
//
// A model that returns a stale number after an edit is worse than one that is
// merely wrong: the user corrects their data, sees nothing change, and stops
// trusting the correction.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildProgressLanding } from '../js/analytics/progress-landing.js';
import { buildWeeklyStrengthVolumeDetail } from '../js/analytics/strength-volume-detail.js';
import { buildStrengthMetricDetail } from '../js/analytics/strength-detail.js';
import { buildRunningMetricDetail } from '../js/analytics/running-detail.js';
import { buildRecoveryMetricDetail } from '../js/analytics/recovery-detail.js';
import { buildVolumeGuideModel } from '../js/analytics/volume-guide.js';
import { calendarStrengthSummary } from '../js/analytics/strength-calendar.js';
import { computeStreak, activeTrainingDates } from '../js/home/dashboard-model.js';
import { buildPredictions } from '../js/brain/predictions.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TODAY = '2026-07-16';   // Thursday
const WK = '2026-07-13';      // its Monday
const work = (w, r) => ({ c: true, w: String(w), r: String(r) });

function baseState() {
  return {
    currentWeek: '1',
    settings: { weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon' },
    weeks: {
      '1': {
        dates: { mon: WK, tue: '2026-07-14', wed: '2026-07-15' },
        lifts: {
          mon: { 'Barbell Bench Press': [work(100, 5), work(100, 5)] },
          wed: { 'Back Squat': [work(140, 5)] },
        },
        runs: { tue: { dist: '5.0', time: '25:00' } },
      },
    },
    wellnessLog: [
      { date: WK, sleep: 8, mood: 4, soreness: 2 },
      { date: '2026-07-14', sleep: 8, mood: 4, soreness: 2 },
      { date: '2026-07-15', sleep: 8, mood: 4, soreness: 2 },
    ],
  };
}

// ---- deleting a workout ------------------------------------------------------

test('deleting a workout immediately changes every strength surface', () => {
  const state = baseState();
  const opts = { days: DAYS, today: TODAY };

  const before = {
    landing: buildProgressLanding(state, opts).domains.find((d) => d.id === 'consistency').headline.value,
    volume: buildWeeklyStrengthVolumeDetail(state, { weekStart: WK, today: TODAY }).totals.volumeKg,
    guide: buildVolumeGuideModel(state, { weekStart: WK, today: TODAY }).summary.loggedCredits,
    streak: computeStreak(state.weeks, DAYS, state, TODAY).total,
    summary: calendarStrengthSummary(state, { weekStart: WK }).hasCurrentWork,
  };
  assert.equal(before.landing, '3');
  assert.ok(before.volume > 0);
  assert.ok(before.guide > 0);

  // Delete Monday's bench session the way the app does — remove the lifts and
  // its date stamp.
  delete state.weeks['1'].lifts.mon;
  delete state.weeks['1'].dates.mon;

  const after = {
    landing: buildProgressLanding(state, opts).domains.find((d) => d.id === 'consistency').headline.value,
    volume: buildWeeklyStrengthVolumeDetail(state, { weekStart: WK, today: TODAY }).totals.volumeKg,
    guide: buildVolumeGuideModel(state, { weekStart: WK, today: TODAY }).summary.loggedCredits,
    streak: computeStreak(state.weeks, DAYS, state, TODAY).total,
  };

  assert.equal(after.landing, '2', 'the landing must drop the deleted day');
  assert.ok(after.volume < before.volume, 'weekly volume must fall');
  assert.ok(after.guide < before.guide, 'muscle credits must fall');
  assert.equal(after.streak, before.streak - 1, 'the streak must lose the day');
  assert.ok(!activeTrainingDates(state.weeks, DAYS, state).has(WK));
});

test('deleting the last workout empties rather than freezing the old value', () => {
  const state = baseState();
  state.weeks = {};
  const landing = buildProgressLanding(state, { days: DAYS, today: TODAY });
  const consistency = landing.domains.find((d) => d.id === 'consistency');
  assert.equal(consistency.headline.value, '0');
  assert.equal(consistency.empty, true);
  assert.equal(landing.domains.find((d) => d.id === 'strength').empty, true);
  assert.equal(buildWeeklyStrengthVolumeDetail(state, { weekStart: WK, today: TODAY }).totals.volumeKg, 0);
  assert.equal(calendarStrengthSummary(state, { weekStart: WK }).hasCurrentWork, false);
});

// ---- editing a logged value --------------------------------------------------

test('editing a set weight flows through volume, credits and e1RM', () => {
  const state = baseState();
  const read = () => ({
    volume: buildWeeklyStrengthVolumeDetail(state, { weekStart: WK, today: TODAY }).totals.volumeKg,
    best: calendarStrengthSummary(state, { weekStart: WK }).bestThisWeek?.e1rm,
    fourWeek: buildStrengthMetricDetail(state, 'strength.four-week-volume', { today: TODAY })?.value,
  });
  const before = read();

  // Correct a mistyped squat: 140 → 180.
  state.weeks['1'].lifts.wed['Back Squat'] = [work(180, 5)];
  const after = read();

  assert.ok(after.volume > before.volume, `volume ${before.volume} → ${after.volume}`);
  assert.ok(after.best > before.best, `best e1RM ${before.best} → ${after.best}`);
  assert.ok(after.fourWeek > before.fourWeek, 'the trailing 28-day metric must move too');
});

test('correcting a DATE moves the work to its real week everywhere', () => {
  const state = baseState();
  const inWeek = () => buildWeeklyStrengthVolumeDetail(state, { weekStart: WK, today: TODAY }).totals.workingSets;
  const before = inWeek();
  assert.ok(before > 0);

  // The session actually happened the previous week.
  state.weeks['1'].dates.mon = '2026-07-06';

  assert.ok(inWeek() < before, 'the selected week must lose the re-dated session');
  const previous = buildWeeklyStrengthVolumeDetail(state, { weekStart: '2026-07-06', today: TODAY });
  assert.ok(previous.totals.workingSets > 0, 'and the real week must gain it');
});

// ---- imports -----------------------------------------------------------------

test('importing new activity appears without any cache reset', () => {
  const state = baseState();
  const runBefore = buildRunningMetricDetail(state, 'running.weekly-distance', { today: TODAY })?.value || 0;
  const landingBefore = buildProgressLanding(state, { days: DAYS, today: TODAY })
    .domains.find((d) => d.id === 'consistency').headline.value;

  // A .FIT import lands a new dated run on a previously untrained day.
  state.weeks['1'].runs.thu = { dist: '12.0', time: '55:00' };
  state.weeks['1'].dates.thu = TODAY;

  const runAfter = buildRunningMetricDetail(state, 'running.weekly-distance', { today: TODAY })?.value || 0;
  assert.ok(runAfter > runBefore, `weekly distance ${runBefore} → ${runAfter}`);
  const landingAfter = buildProgressLanding(state, { days: DAYS, today: TODAY })
    .domains.find((d) => d.id === 'consistency').headline.value;
  assert.equal(Number(landingAfter), Number(landingBefore) + 1, 'consistency must count the imported day');
});

test('importing wellness readings reaches the recovery details', () => {
  const state = baseState();
  const before = buildRecoveryMetricDetail(state, 'recovery.sleep', { today: TODAY });
  assert.equal(before.readingCount, 3);

  state.wellnessLog.push({ date: TODAY, sleep: 5, mood: 3, soreness: 4 });
  const after = buildRecoveryMetricDetail(state, 'recovery.sleep', { today: TODAY });
  assert.equal(after.readingCount, 4);
  assert.ok(after.value < before.value, 'a short night must pull the average down');

  // And a device metric arriving for the first time flips it out of empty.
  assert.equal(buildRecoveryMetricDetail(state, 'recovery.hrv', { today: TODAY }).empty, true);
  state.healthConnect = { hrv: [{ date: TODAY, rmssd: 60 }, { date: WK, rmssd: 58 }, { date: '2026-07-14', rmssd: 59 }] };
  const hrv = buildRecoveryMetricDetail(state, 'recovery.hrv', { today: TODAY });
  assert.equal(hrv.empty, false);
  assert.equal(hrv.readingCount, 3);
});

// ---- coaching and synthesis --------------------------------------------------

test('coaching projections recompute from edited history', () => {
  const state = { currentWeek: '6', settings: { weightUnit: 'kg' }, weeks: {} };
  [100, 102, 104, 106, 108, 110].forEach((w, i) => {
    state.weeks[String(i + 1)] = { lifts: { mon: { 'Back Squat': [work(w, 5)] } } };
  });
  const before = buildPredictions(state, DAYS);
  const squatBefore = before.strength.find((s) => s.lift === 'Squat');
  assert.ok(squatBefore, 'squat projected');

  // Delete most of the history: the projection must lose confidence or vanish,
  // never persist at its old strength.
  for (const k of ['3', '4', '5', '6']) delete state.weeks[k];
  const after = buildPredictions(state, DAYS);
  const squatAfter = after.strength.find((s) => s.lift === 'Squat');
  if (squatAfter) {
    assert.ok(squatAfter.samples < squatBefore.samples, 'sample count must fall with the history');
    assert.notEqual(squatAfter.current, squatBefore.current, 'the current value must follow the data');
  }
});

test('no model memoises across mutations of the same state object', () => {
  // The same object identity is mutated in place — exactly what the app does —
  // so anything keyed on identity rather than content would return stale data.
  const state = baseState();
  const first = buildWeeklyStrengthVolumeDetail(state, { weekStart: WK, today: TODAY }).totals.volumeKg;
  state.weeks['1'].lifts.mon['Barbell Bench Press'].push(work(100, 5));
  const second = buildWeeklyStrengthVolumeDetail(state, { weekStart: WK, today: TODAY }).totals.volumeKg;
  assert.ok(second > first, `same object mutated in place: ${first} → ${second}`);

  const landingA = buildProgressLanding(state, { days: DAYS, today: TODAY });
  state.weeks['1'].dates.fri = '2026-07-17';
  state.weeks['1'].lifts.fri = { 'Barbell Bench Press': [work(100, 5)] };
  const landingB = buildProgressLanding(state, { days: DAYS, today: '2026-07-17' });
  assert.notEqual(landingB.domains[0].headline.value, landingA.domains[0].headline.value);
});
