import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReview, reviewToText, pickWeeklyFocus } from '../js/brain/weekly-review.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const iso = (d) => d.toISOString().slice(0, 10);

function makeState() {
  const start = new Date();
  start.setDate(start.getDate() - 2 * 7);
  const weeks = {};
  // Week 1: squat 100; week 2: squat 110 (PR) + 2 runs.
  for (let w = 1; w <= 3; w++) {
    const ws = new Date(start); ws.setDate(start.getDate() + (w - 1) * 7);
    weeks[String(w)] = {
      lifts: { mon: { 'Back Squat': [{ w: String(95 + w * 5), r: 5, c: true }, { w: String(95 + w * 5), r: 5, c: true }] } },
      runs: { wed: { dist: String(4 + w), time: '25:00', rpe: '6' } },
      gymRpe: { mon: '7' }, gymStats: { mon: { time: '45' } },
      dates: { mon: iso(ws), wed: iso(new Date(ws.getTime() + 2 * 864e5)) },
    };
  }
  const today = iso(new Date());
  return {
    currentWeek: '3',
    weekStartedAt: iso(new Date(Date.now() - 2 * 864e5)),
    settings: { fitnessLevel: 'intermediate' },
    weeks,
    loadMetrics: { atl: 9, ctl: 10 },
    hybridScore: {
      xp: 900, lastRecordedDate: today,
      history: [
        { date: iso(new Date(Date.now() - 5 * 864e5)), score: 72, level: 2 },
        { date: iso(new Date(Date.now() - 2 * 864e5)), score: 78, level: 2 },
        { date: today, score: 84, level: 2 },
      ],
    },
  };
}
const PROGRAM = { totalWeeks: 12, days: { mon: { title: 'Squat', runs: 'Rest', lifts: [{ name: 'Back Squat' }] }, wed: { title: 'Run', runs: '5k easy' } } };

test('buildWeeklyReview: totals, PR detection, score arc', () => {
  const r = buildWeeklyReview(makeState(), DAYS, PROGRAM);
  assert.equal(r.hasData, true);
  assert.equal(r.wkNum, 3);
  assert.equal(r.totals.sessions, 2);                 // mon lift + wed run
  assert.equal(r.totals.volume, 110 * 5 * 2);         // 2×5 @ 110
  assert.equal(r.totals.distanceKm, 7);
  // Week 3 squat e1RM beats weeks 1–2 → PR
  assert.equal(r.prs.length, 1);
  assert.equal(r.prs[0].lift, 'Back Squat');
  // Arc across the recorded week: 72 → 84
  assert.equal(r.arc.hasData, true);
  assert.equal(r.arc.delta, 12);
  assert.ok(r.focus.area.length > 0);
});

test('buildWeeklyReview: empty week degrades honestly', () => {
  const r = buildWeeklyReview({ currentWeek: '1', settings: {}, weeks: {} }, DAYS, null);
  assert.equal(r.hasData, false);
  assert.match(reviewToText(r), /no sessions logged/);
});

test('pickWeeklyFocus: priority order', () => {
  assert.equal(pickWeeklyFocus({ consistencyPct: 50, hasPlan: true, acwr: 1.5, distance: 0, volumeDeltaPct: -20 }).area, 'Consistency');
  assert.equal(pickWeeklyFocus({ consistencyPct: 90, hasPlan: true, acwr: 1.5, distance: 0, volumeDeltaPct: -20 }).area, 'Recovery');
  assert.equal(pickWeeklyFocus({ consistencyPct: 90, hasPlan: true, acwr: 0.9, distance: 0, volumeDeltaPct: -20 }).area, 'Endurance');
  assert.equal(pickWeeklyFocus({ consistencyPct: 90, hasPlan: true, acwr: 0.9, distance: 10, volumeDeltaPct: -20 }).area, 'Strength');
  assert.equal(pickWeeklyFocus({ consistencyPct: 90, hasPlan: true, acwr: 0.9, distance: 10, volumeDeltaPct: 5 }).area, 'Momentum');
});

test('reviewToText: numbers-first share copy with unit conversion', () => {
  const r = buildWeeklyReview(makeState(), DAYS, PROGRAM);
  const txt = reviewToText(r, 'km');
  assert.match(txt, /Week 3 on Helyx: 1,100 kg lifted · 7 km run · 2 sessions · 1 PR 🏆\./);
  assert.match(txt, /Hybrid Score 84 \(\+12 this week\)/);
  assert.match(txt, /Next week's focus — /);
  assert.match(reviewToText(r, 'mi'), /4\.3 mi run/);
});
