import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeStrengthAnalytics } from '../js/analytics/calculations/strength-calcs.js';
import { _calendarWeekSummary, _heatmapData } from '../js/profile-stats.js';
import * as legacyLoadMetrics from '../js/metrics/metrics-load.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const done = (w, r = 5) => ({ c: true, w: String(w), r: String(r) });

test('Lifetime PR is all-activation history while its chart stays current-run scoped', () => {
  const state = {
    currentWeek: '1', activeActivationId: 'new',
    weeks: {
      '1': {
        activationId: 'new', dates: { mon: '2026-07-13' },
        lifts: { mon: { Squat: [done(100)] } },
      },
      'arch:old:8': {
        activationId: 'old', dates: { thu: '2026-05-21' },
        lifts: { thu: { Squat: [done(150)] } },
      },
    },
  };
  const progression = computeStrengthAnalytics(state, DAYS, 1).liftProgression['Back Squat'];
  assert.equal(Math.round(progression.series[0]), 117, 'program chart uses active numeric week');
  assert.equal(progression.lifetimePR, 175, 'lifetime label includes archived activation');
  assert.equal(progression.seriesScope, 'active-program-run');
  assert.equal(progression.lifetimeScope, 'all-stored-activations');
});

test('profile This Week summary is calendar-dated and includes archived/one-off sessions', () => {
  const state = { weeks: {
    'arch:old:3': {
      dates: { mon: '2026-07-13' },
      lifts: { mon: { Squat: [done(100)] } },
      gymStats: { mon: { time: '45' } },
      runs: {},
    },
    'session:str_1': {
      sessionId: 'str_1', sessionKind: 'empty', dates: { wed: '2026-07-15' },
      lifts: { wed: { Bench: [done(80)] } },
      gymStats: { wed: { time: '30' } }, runs: {},
    },
    '7': {
      dates: { sat: '2026-07-18' }, lifts: {}, gymStats: {},
      runSessions: { sat: [
        { sessionId: 'run_1', dist: '5', time: '25:00', rpe: '6' },
        { sessionId: 'run_2', dist: '3', time: '18:00', rpe: '5' },
      ] },
    },
    // Active program week but a prior calendar week: must not leak into This Week.
    '8': {
      dates: { mon: '2026-07-06' },
      lifts: { mon: { Squat: [done(200)] } }, gymStats: { mon: { time: '60' } }, runs: {},
    },
  } };
  const summary = _calendarWeekSummary(state, { today: '2026-07-16' });
  assert.deepEqual(summary, {
    weekStart: '2026-07-13',
    volume: 900,
    distanceKm: 8,
    sessions: 4,
    minutes: 118,
  });
});

test('profile activity heatmap uses real calendar dates across activations', () => {
  const state = { weeks: {
    'arch:old:1': { dates: { mon: '2026-07-06' }, lifts: { mon: { Squat: [done(100)] } }, runs: {} },
    '1': { dates: { tue: '2026-07-14' }, lifts: { tue: { Bench: [done(80)] } }, runs: {} },
  } };
  const rows = _heatmapData(state, DAYS, 2, { today: '2026-07-16' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].week, '2026-07-06');
  assert.equal(rows[0].cells[0].type, 'lift');
  assert.equal(rows[1].week, '2026-07-13');
  assert.equal(rows[1].cells[1].type, 'lift');
});

test('the obsolete RPE-only readiness exports are gone; evidence-aware scoring is canonical', () => {
  assert.equal('readinessMetrics' in legacyLoadMetrics, false);
  assert.equal('recoveryMetrics' in legacyLoadMetrics, false);
});
