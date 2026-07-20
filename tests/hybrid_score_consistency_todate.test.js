import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { consistencyPillar } from '../js/brain/hybrid-score/pillars.js';
import { computeHybridScore } from '../js/brain/hybrid-score/hybrid-score.js';
import { addDaysISO } from '../js/dates.js';

// =============================================================================
// Consistency scheduled-to-date audit (reported: "27% of this week done on a
// Monday, marked down for doing today's workout").
//
// Two defects fixed:
//   1. avgConsistency (the baseline) included the in-progress current week,
//      dragging it down every Monday.
//   2. the pillar judged done ÷ WHOLE-week plan, so a completed Monday read ~27%.
// Fix: baseline = COMPLETED weeks only; the current week is judged on
// scheduled-to-date adherence (only sessions whose day has already passed, plus
// anything already trained). All dates are FIXED.
// =============================================================================

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MON = '2026-07-20';         // fixed Monday
const WED = addDaysISO(MON, 2);

const PROGRAM = { totalWeeks: 12, days: {
  mon: { title: 'Squat', runs: 'Rest', lifts: [{ name: 'Back Squat' }] },
  wed: { title: 'Bench', runs: 'Rest', lifts: [{ name: 'Bench Press' }] },
  fri: { title: 'Deadlift', runs: 'Rest', lifts: [{ name: 'Deadlift' }] },
} };

const done = (w) => ({ w: String(w), r: 5, c: true });
const ghost = () => ({ w: '', r: 5, c: false });
const ld = (n, w) => ({ [n]: [done(w), done(w), done(w)] });
const lg = (n) => ({ [n]: [ghost(), ghost(), ghost()] });

function week(monISO, { complete }) {
  const dates = {}; const lifts = {};
  const sched = { mon: 'Back Squat', wed: 'Bench Press', fri: 'Deadlift' };
  for (const [d, n] of Object.entries(sched)) lifts[d] = complete ? ld(n, 100) : lg(n);
  if (complete) { dates.mon = monISO; dates.wed = addDaysISO(monISO, 2); dates.fri = addDaysISO(monISO, 4); }
  return { lifts, runs: {}, dates };
}

// 4 completed weeks of perfect adherence + a 5th in-progress week.
function stateWith(currentWeek) {
  const start = addDaysISO(MON, -4 * 7);
  const weeks = {};
  for (let w = 1; w < 5; w++) weeks[String(w)] = week(addDaysISO(start, (w - 1) * 7), { complete: true });
  weeks['5'] = currentWeek;
  return {
    currentWeek: '5',
    weekStartedAt: new Date(MON + 'T08:00:00').toISOString(),
    settings: { fitnessLevel: 'intermediate', fitnessGoal: 'strength', weightGoal: 'maintain', distanceUnit: 'km' },
    weeks, loadMetrics: { atl: 9, ctl: 10 },
  };
}
const modelAt = (state, day, today) => computeDashboardModel(state, DAYS, PROGRAM, day, { today });

test('baseline excludes the in-progress week (no Monday drag)', () => {
  const partialMon = week(MON, { complete: false });
  partialMon.lifts.mon = ld('Back Squat', 105); partialMon.dates.mon = MON;
  const model = modelAt(stateWith(partialMon), 'mon', MON);
  // Whole-week % is still low (progress bar), but the baseline is the completed
  // weeks' 100%, NOT dragged toward the 27% of the just-started week.
  assert.ok(model.week.consistencyPct < 40, `whole-week progress stays low, got ${model.week.consistencyPct}`);
  assert.equal(model.goal.avgConsistency, 100, 'baseline is over completed weeks only');
});

test('Monday after the workout is on track, not "27% done"', () => {
  const cur = week(MON, { complete: false });
  cur.lifts.mon = ld('Back Squat', 105); cur.dates.mon = MON;
  const model = modelAt(stateWith(cur), 'mon', MON);
  assert.equal(model.week.consistencyPctToDate, 100, 'today is the only thing due, and it is done');
  const p = consistencyPillar(model);
  assert.ok(p.score >= 95, `should not be marked down, got ${p.score}`);
  assert.ok(p.signals.some(s => /on track|up to date/.test(s)),
    `signal should read on-track, got ${JSON.stringify(p.signals)}`);
  assert.ok(!p.signals.some(s => /27%|of this week's plan/.test(s)), 'no misleading whole-week caption');
});

test('Monday MORNING before any workout does not drop and does not read as missed', () => {
  const cur = week(MON, { complete: false }); // nothing done yet
  const model = modelAt(stateWith(cur), 'mon', MON);
  assert.equal(model.week.consistencyPctToDate, null, 'nothing was due yet on Monday morning');
  const p = consistencyPillar(model);
  assert.ok(p.score >= 95, `Monday morning holds at baseline, got ${p.score}`);
  assert.ok(!p.signals.some(s => /missed|0%/.test(s)), `no "missed" framing, got ${JSON.stringify(p.signals)}`);
});

test('doing today\'s workout never lowers the Hybrid Score vs not having done it', () => {
  const morning = week(MON, { complete: false });
  const afterMon = week(MON, { complete: false });
  afterMon.lifts.mon = ld('Back Squat', 105); afterMon.dates.mon = MON;
  const rMorning = computeHybridScore(modelAt(stateWith(morning), 'mon', MON), stateWith(morning), DAYS, PROGRAM);
  const rAfter   = computeHybridScore(modelAt(stateWith(afterMon), 'mon', MON), stateWith(afterMon), DAYS, PROGRAM);
  assert.ok(rAfter.score >= rMorning.score,
    `completing today's session must not reduce the score (${rAfter.score} vs ${rMorning.score})`);
});

test('a future scheduled session is not counted as missed', () => {
  // Wednesday: Monday done, Wednesday is today (pending), Friday still future.
  const cur = week(MON, { complete: false });
  cur.lifts.mon = ld('Back Squat', 100); cur.dates.mon = MON;
  const model = modelAt(stateWith(cur), 'wed', WED);
  // Only Monday counts as due-and-past → 100%. Wed (today) is pending, Fri future.
  assert.equal(model.week.consistencyTotalToDate, 3, 'only Monday (3 sets) is overdue');
  assert.equal(model.week.consistencyPctToDate, 100);
});

test('a genuinely missed past session is still reflected (fix is not a whitewash)', () => {
  // Wednesday, Monday's session was never done.
  const cur = week(MON, { complete: false });
  const model = modelAt(stateWith(cur), 'wed', WED);
  assert.equal(model.week.consistencyPctToDate, 0, 'Monday overdue and not done → 0% to-date');
  const p = consistencyPillar(model);
  assert.ok(p.signals.some(s => /0%|due so far/.test(s)), `the miss is surfaced, got ${JSON.stringify(p.signals)}`);
});

test('whole-week consistencyPct is preserved for progress tiles', () => {
  const cur = week(MON, { complete: false });
  cur.lifts.mon = ld('Back Squat', 100); cur.dates.mon = MON;
  const model = modelAt(stateWith(cur), 'mon', MON);
  // 3 of 9 planned lift sets done across the whole week.
  assert.equal(model.week.consistencyPct, Math.round((3 / 9) * 100));
});
