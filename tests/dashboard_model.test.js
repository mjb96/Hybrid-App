// ==========================================
// DASHBOARD MODEL TESTS — the unified "brain pass" behind the At a Glance tiles.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDashboardModel } from '../js/home/dashboard-model.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const PROGRAM = {
  totalWeeks: 12,
  days: {
    mon: { title: 'Push', runs: 'Rest' },
    sat: { title: 'Long Run', runs: '10km easy' },
  },
};

function fixture() {
  return {
    currentWeek: '2',
    weekStartedAt: '2026-06-15T00:00:00.000Z',
    loadMetrics: { atl: 120, ctl: 100 },          // ACWR 1.2, TSB -20
    bodyWeightLog: [
      { date: '2026-06-08', weight: 82 },
      { date: '2026-06-15', weight: 81.2 },
    ],
    healthConnect: { connected: false, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [] },
    wellnessLog: [],
    weeks: {
      '1': {
        lifts: { mon: { 'Back Squat': [{ w: '100', r: '5', c: true }] } },
        gymRpe: { mon: '7' }, gymStats: { mon: { time: '60' } },
        runs: { sat: { dist: '8', time: '40:00', rpe: '6' } },
      },
      '2': {
        lifts: { mon: { 'Back Squat': [{ w: '110', r: '5', c: true }, { w: '110', r: '5', c: true }] } },
        gymRpe: { mon: '8' }, gymStats: { mon: { time: '55' } },
        runs: { sat: { dist: '10', time: '50:00', rpe: '7' } },
      },
    },
  };
}

test('computeDashboardModel returns a complete, non-throwing model', () => {
  const m = computeDashboardModel(fixture(), DAYS, PROGRAM, 'mon');
  assert.ok(m.load && m.ready && m.week && m.fasting && m.series);
  assert.equal(m.wkNum, 2);
});

test('load block derives ACWR and TSB from EWMA metrics', () => {
  const m = computeDashboardModel(fixture(), DAYS, PROGRAM, 'mon');
  assert.equal(m.load.hasData, true);
  assert.equal(m.load.acwr, 1.2);              // 120 / 100
  assert.equal(Math.round(m.load.tsb), -20);   // 100 - 120
  assert.equal(m.load.status, 'Productive');   // 1.0 <= acwr < 1.3
});

test('weekly volume + delta reflect completed tonnage growth', () => {
  const m = computeDashboardModel(fixture(), DAYS, PROGRAM, 'mon');
  // Week 2: 2 sets × 110 × 5 = 1100; Week 1: 1 × 100 × 5 = 500
  assert.equal(m.week.volume.current, 1100);
  assert.equal(m.week.volume.prev, 500);
  assert.ok(m.week.volume.delta);
  assert.equal(m.week.volume.delta.dir, 'up');
  assert.equal(m.week.volume.delta.good, true);
});

test('weekly consistency drives the header progress (done/total/pct)', () => {
  const m = computeDashboardModel(fixture(), DAYS, PROGRAM, 'mon');
  // Week 2: Sat run scheduled + logged (1/1) and 2 completed squat sets (2/2).
  assert.equal(m.week.consistencyDone, 3);
  assert.equal(m.week.consistencyTotal, 3);
  assert.equal(m.week.consistencyPct, 100);
});

test('weekCompare totals this week vs last (canonical tonnage + distance)', () => {
  const m = computeDashboardModel(fixture(), DAYS, PROGRAM, 'mon');
  assert.equal(m.weekCompare.hasPrev, true);
  assert.equal(m.weekCompare.prevWeek, 1);
  assert.equal(m.weekCompare.volume.current, 1100);   // 2 × 110 × 5
  assert.equal(m.weekCompare.volume.prev, 500);        // 1 × 100 × 5
  assert.equal(m.weekCompare.distance.current, 10);    // week 2 Sat run
  assert.equal(m.weekCompare.distance.prev, 8);        // week 1 Sat run
});

test('weekCompare reports no previous week in week 1', () => {
  const s = fixture();
  s.currentWeek = '1';
  const m = computeDashboardModel(s, DAYS, PROGRAM, 'mon');
  assert.equal(m.weekCompare.hasPrev, false);
});

test('weekCompare excludes warm-up sets from tonnage', () => {
  const s = fixture();
  // Add a completed warm-up to week 2 — it must not inflate compare volume.
  s.weeks['2'].lifts.mon['Back Squat'].push({ w: '60', r: '5', c: true, type: 'W' });
  const m = computeDashboardModel(s, DAYS, PROGRAM, 'mon');
  assert.equal(m.weekCompare.volume.current, 1100);   // warm-up ignored
});

test('body weight trend exposes latest value and 7-day delta', () => {
  const m = computeDashboardModel(fixture(), DAYS, PROGRAM, 'mon');
  assert.equal(m.bodyweight.hasData, true);
  assert.equal(m.bodyweight.latest, 81.2);
  assert.equal(m.bodyweight.delta7, -0.8);     // 81.2 - 82
});

test('big-3 estimated 1RM is computed from completed working sets', () => {
  const m = computeDashboardModel(fixture(), DAYS, PROGRAM, 'mon');
  // 110 × (1 + 5/30) = 128.3 -> 128
  assert.equal(m.big3.sq, 128);
  assert.equal(m.big3.total, 128);
});

test('topInsight prioritises an active fast over everything else', () => {
  const s = fixture();
  s.fastingSession = { active: true, startTime: new Date(Date.now() - 14 * 3600 * 1000).toISOString(), goal: 16, history: [] };
  const m = computeDashboardModel(s, DAYS, PROGRAM, 'mon');
  assert.match(m.topInsight.text, /Fasting/);
  assert.equal(m.topInsight.nav, 'custom:fasting');
});

test('empty state is safe (no data logged)', () => {
  const empty = { currentWeek: '1', weeks: {}, loadMetrics: {}, healthConnect: { connected: false } };
  const m = computeDashboardModel(empty, DAYS, PROGRAM, 'mon');
  assert.equal(m.load.hasData, false);
  assert.equal(m.ready.hasData, false);
  assert.ok(m.topInsight.text.length > 0);
});
