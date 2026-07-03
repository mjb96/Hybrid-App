import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectScore, projectionLine } from '../js/brain/hybrid-score/project.js';
import { computeHybridScore } from '../js/brain/hybrid-score/hybrid-score.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const iso = (d) => d.toISOString().slice(0, 10);

// A compact but real state that yields a data-backed score (recovery + strength).
function makeState() {
  const today = iso(new Date());
  const weekAgo = iso(new Date(Date.now() - 7 * 86400000));
  return {
    currentWeek: '3',
    settings: { fitnessLevel: 'intermediate', distanceUnit: 'km' },
    weeks: {
      '1': { lifts: { mon: { 'Back Squat': [{ w: '100', r: 5, c: true }] } }, dates: { mon: weekAgo } },
      '3': { lifts: { mon: { 'Back Squat': [{ w: '110', r: 5, c: true }] } }, gymRpe: { mon: '7' }, dates: { mon: today } },
    },
    loadMetrics: { atl: 9, ctl: 10 },
    wellnessLog: [{ date: today, mood: 4, soreness: 2, sleep: 8 }],
    healthConnect: { connected: true, sleep: [{ date: today, totalHours: 8 }], restingHR: [{ date: today, bpm: 52 }], steps: [{ date: today, count: 11000 }] },
  };
}
const PROGRAM = { totalWeeks: 12, days: { mon: { title: 'Squat', lifts: [{ name: 'Back Squat' }] } } };
const modelWithWeek = (week) => {
  const m = computeDashboardModel(makeState(), DAYS, PROGRAM, 'mon');
  m.week = { ...m.week, ...week };
  return m;
};

test('V2-3 — with an open planned session, training today projects a gain (real engine, not fiction)', () => {
  const model = modelWithWeek({ consistencyTotal: 5, consistencyDone: 2, consistencyPct: 40 });
  const state = makeState();
  const p = projectScore(model, state, DAYS);
  assert.equal(p.current.hasData, true);
  assert.ok(p.projected.score >= p.current.score, 'projection never below current');
  assert.equal(p.gain, p.projected.score - p.current.score);
  if (p.gain > 0) assert.equal(p.canProject, true);
});

test('V2-3 — projected score equals the real engine run with one more session done', () => {
  const state = makeState();
  const model = modelWithWeek({ consistencyTotal: 5, consistencyDone: 2, consistencyPct: 40 });
  const p = projectScore(model, state, DAYS);
  // Reproduce the simulated model independently and confirm the number matches.
  const manual = computeHybridScore(
    { ...model, week: { ...model.week, consistencyDone: 3, consistencyPct: 60 }, streak: { ...(model.streak || {}), current: (model.streak?.current || 0) + 1 } },
    state, DAYS,
  );
  assert.equal(p.projected.score, manual.score);
});

test('V2-3 — nothing to do (week complete) → no projection, no fake gain', () => {
  const model = modelWithWeek({ consistencyTotal: 4, consistencyDone: 4, consistencyPct: 100 });
  const p = projectScore(model, makeState(), DAYS);
  assert.equal(p.canProject, false);
  assert.equal(p.gain, 0);
  assert.equal(p.projected.score, p.current.score);
});

test('V2-3 — calibrating (no data) never projects', () => {
  const emptyState = { currentWeek: '1', settings: {}, weeks: {} };
  const model = computeDashboardModel(emptyState, DAYS, PROGRAM, 'mon');
  const p = projectScore(model, emptyState, DAYS);
  assert.equal(p.canProject, false);
  assert.equal(p.gain, 0);
});

test('V2-3 — projectionLine is decisive when there is a gain, empty otherwise', () => {
  assert.equal(projectionLine({ canProject: false, gain: 0 }), '');
  assert.equal(projectionLine({ canProject: true, gain: 0 }), '');  // sub-point gain
  const line = projectionLine({ canProject: true, gain: 7, current: { score: 78 }, projected: { score: 85 } });
  assert.match(line, /78 today/);
  assert.match(line, /rises to 85/);
});
