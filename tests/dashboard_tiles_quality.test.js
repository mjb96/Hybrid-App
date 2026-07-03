// ==========================================
// DASHBOARD TILE QUALITY (tests/dashboard_tiles_quality.test.js)
// Guards against the redundancy/jargon that was cluttering the At-a-Glance
// tiles: no line restating another, no raw EWMA units, no input-name lists.
// ==========================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_REGISTRY } from '../js/dashboard.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const tile = (id) => TILE_REGISTRY.find(t => t.id === id);
const run = (id, appState, model, program = {}, day = 'mon') => tile(id).renderData(appState, DAYS, program, day, model);

test('Weekly Volume: no insight line restating the delta chip', () => {
  const model = { week: { volume: { current: 2200, delta: { good: true, pctLabel: '4%', dir: 'up' }, spark: [1, 2, 3] }, sets: 4, reps: 20 } };
  const d = run('weekly-volume', {}, model);
  assert.ok(d.delta, 'keeps the delta chip');
  assert.ok(!d.insight, 'drops the insight that duplicated the delta');
});

test('Training Status: no raw CTL/ATL "Fitness N" jargon', () => {
  const model = { load: { hasData: true, status: 'Maintaining', ctl: 10, atl: 9, tsb: 1, color: 'var(--color-blue)' }, series: { ctl: [8, 9, 10] } };
  const d = run('recovery-score', {}, model);
  assert.doesNotMatch(String(d.sub), /Fitness \d|Fatigue \d/);
  assert.ok(['Fresh', 'Fatigued', 'Balanced'].includes(d.tag), `plain-language tag, got ${d.tag}`);
});

test('Readiness: sub shows values, not a list of input names', () => {
  const model = {
    ready: { hasData: true, score: 85, status: 'Peak', color: 'var(--color-green)', available: ['hrv', 'sleep', 'load'] },
    health: { sleepHours: 7.8, hrv: 62, restingHR: 52 },
  };
  const d = run('readiness', {}, model);
  assert.match(String(d.sub), /Sleep 7\.8h|HRV 62ms/);
  assert.doesNotMatch(String(d.sub), /HRV · Sleep · Load/); // not the old name list
});

test('Streak: no "🔥N" tag duplicating the "Nd" hero', () => {
  const model = { streak: { current: 1, longest: 3, total: 5 } };
  const d = run('streak', { streakFreezes: { available: 1 } }, model);
  assert.equal(d.hero, '1d');
  assert.doesNotMatch(String(d.tag || ''), /🔥\s*\d/);
  assert.match(String(d.tag), /to record/); // useful new info instead
});

test('Today: completed session has no tag restating "Done"', () => {
  const appState = { weeks: { '1': { lifts: { mon: { Squat: [{ w: 100, r: 5, c: true }, { w: 100, r: 5, c: true }] } }, runs: {} } }, currentWeek: '1', settings: {} };
  const model = { wkNum: 1 };
  const d = run('today', appState, model, { days: { mon: { title: 'Squat' } } });
  assert.equal(d.hero, '✓ Done');
  assert.ok(!d.tag, 'no "Complete" tag repeating the ✓ Done hero');
});
