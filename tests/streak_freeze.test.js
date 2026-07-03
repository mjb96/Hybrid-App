import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileStreakFreezes, streakFreezeInfo, streakRiskLine } from '../js/brain/streak.js';
import { computeStreak } from '../js/home/dashboard-model.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ISO = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

// Build a state whose logged dates are exactly `dates` (each as a one-lift day).
function stateWithDates(dates, extra = {}) {
  const weeks = { '1': { lifts: {}, runs: {}, dates: {} } };
  const wk = weeks['1'];
  dates.forEach((ds, i) => {
    const key = 'd' + i;
    // Map to distinct day slots; the stored date is what streak logic reads.
    const slot = DAYS[i % 7];
    wk.lifts[slot] = wk.lifts[slot] || {};
    wk.lifts[slot]['Squat_' + i] = [{ w: 100, r: 5, c: true }];
    wk.dates[slot] = ds; // NOTE: only last write per slot survives — see below
  });
  return { currentWeek: '1', weekStartedAt: ISO(0), weeks, ...extra };
}

test('a frozen day bridges a gap so the streak survives', () => {
  const today = ISO(0);
  // Trained today, day-2, day-3; missed yesterday (day-1). Freeze covers it.
  const state = {
    currentWeek: '1', weekStartedAt: today,
    weeks: { '1': {
      lifts: {
        mon: { A: [{ w: 100, r: 5, c: true }] },
        wed: { B: [{ w: 100, r: 5, c: true }] },
        thu: { C: [{ w: 100, r: 5, c: true }] },
      },
      dates: { mon: today, wed: ISO(2), thu: ISO(3) },
    } },
    streakFreezes: { available: 1, used: [], earnedTier: 0 },
  };
  // Without a freeze the streak is just today (1) — yesterday broke it.
  assert.equal(computeStreak(state.weeks, DAYS, state).current, 1);
  const r = reconcileStreakFreezes(state, DAYS, today);
  assert.equal(r.froze, true);
  assert.equal(r.frozeDate, ISO(1));
  assert.equal(state.streakFreezes.available, 0);
  // Now today + frozen-yesterday + day2 + day3 = 4.
  assert.equal(computeStreak(state.weeks, DAYS, state).current, 4);
});

test('no auto-freeze when there is no ongoing streak to protect', () => {
  const today = ISO(0);
  // Only today logged; yesterday AND day-before missed → nothing to bridge.
  const state = {
    currentWeek: '1', weekStartedAt: today,
    weeks: { '1': { lifts: { mon: { A: [{ w: 100, r: 5, c: true }] } }, dates: { mon: today } } },
    streakFreezes: { available: 1, used: [], earnedTier: 0 },
  };
  const r = reconcileStreakFreezes(state, DAYS, today);
  assert.equal(r.froze, false);
  assert.equal(state.streakFreezes.available, 1); // untouched
});

test('idempotent: reconciling twice does not double-spend', () => {
  const today = ISO(0);
  const state = {
    currentWeek: '1', weekStartedAt: today,
    weeks: { '1': { lifts: { mon: { A: [{ w: 100, r: 5, c: true }] }, wed: { B: [{ w: 100, r: 5, c: true }] } }, dates: { mon: today, wed: ISO(2) } } },
    streakFreezes: { available: 1, used: [], earnedTier: 0 },
  };
  reconcileStreakFreezes(state, DAYS, today);
  const before = state.streakFreezes.available;
  const r2 = reconcileStreakFreezes(state, DAYS, today);
  assert.equal(r2.froze, false);
  assert.equal(state.streakFreezes.available, before);
  assert.equal(state.streakFreezes.used.filter(d => d === ISO(1)).length, 1);
});

test('crossing a 7-day tier earns a freeze (capped at 2)', () => {
  const today = ISO(0);
  const weeks = { '1': { lifts: {}, runs: {}, dates: {} } };
  // 7 consecutive days ending today.
  for (let i = 0; i < 7; i++) {
    const slot = DAYS[i];
    weeks['1'].lifts[slot] = { ['L' + i]: [{ w: 100, r: 5, c: true }] };
    weeks['1'].dates[slot] = ISO(i);
  }
  const state = { currentWeek: '1', weekStartedAt: today, weeks, streakFreezes: { available: 0, used: [], earnedTier: 0 } };
  const r = reconcileStreakFreezes(state, DAYS, today);
  assert.equal(r.earned, true);
  assert.equal(state.streakFreezes.available, 1);
  assert.equal(state.streakFreezes.earnedTier, 1);
  // Re-running the same day does not re-earn.
  const r2 = reconcileStreakFreezes(state, DAYS, today);
  assert.equal(r2.earned, false);
});

test('streakFreezeInfo + streakRiskLine framing', () => {
  const today = ISO(0);
  const state = { currentWeek: '1', weekStartedAt: today, weeks: { '1': { lifts: {}, dates: {} } }, streakFreezes: { available: 1, used: [], earnedTier: 0 } };
  const info = streakFreezeInfo(state);
  assert.equal(info.available, 1);
  assert.equal(info.max, 2);
  // Long streak, nothing logged today, freeze available → caution.
  const caution = streakRiskLine(state, { streak: { current: 8 } }, today);
  assert.equal(caution.tone, 'caution');
  // No freezes left → warning.
  state.streakFreezes.available = 0;
  assert.equal(streakRiskLine(state, { streak: { current: 8 } }, today).tone, 'warning');
  // Short streak → nothing.
  assert.equal(streakRiskLine(state, { streak: { current: 2 } }, today), null);
});
