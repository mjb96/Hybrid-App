// ==========================================
// DAY VERDICT + rest/deload-aware coach (Sprint 2). One disposition per day, so
// the projection, the coach line and the flag slot stop contradicting each other.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayVerdict } from '../js/brain/day-verdict.js';
import { generateRecommendation } from '../js/brain/recommendations.js';
import { projectScore } from '../js/brain/hybrid-score/project.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// ---- dayVerdict ----------------------------------------------------------
test('dayVerdict: a rest day is mode "rest" and cannot project a gain', () => {
  const model = { rec: { sessionLabel: 'Rest Day', badge: '' }, ready: { hasData: true, score: 93, status: 'Peak' } };
  const v = dayVerdict(model, { currentWeek: '3' }, {}, 'sun');
  assert.equal(v.mode, 'rest');
  assert.equal(v.isRestDay, true);
  assert.equal(v.canProjectGain, false);
  assert.equal(v.readiness, 93);
});

test('dayVerdict: a deload week training day is mode "deload"', () => {
  const program = { weeklyVolModifiers: { '8': { intensityLabel: 'Deload' } } };
  const model = { rec: { sessionLabel: 'Push Day', badge: '' }, ready: { hasData: true, score: 70, status: 'Ready' } };
  const v = dayVerdict(model, { currentWeek: '8' }, program, 'mon');
  assert.equal(v.isDeloadWeek, true);
  assert.equal(v.mode, 'deload');
  assert.equal(v.canProjectGain, true); // the lighter session still lifts the score
});

test('dayVerdict: a logged session is mode "done"; low readiness on a work day is "recover"', () => {
  const done = dayVerdict({ rec: { sessionLabel: 'Push Day', badge: 'Session Done' } }, { currentWeek: '2' }, {}, 'mon');
  assert.equal(done.mode, 'done');
  assert.equal(done.canProjectGain, false);
  const recover = dayVerdict({ rec: { sessionLabel: 'Push Day', badge: '' }, ready: { hasData: true, score: 30, confidence: 'high' } }, { currentWeek: '2' }, {}, 'mon');
  assert.equal(recover.mode, 'recover');
  const limited = dayVerdict({ rec: { sessionLabel: 'Push Day', badge: '' }, ready: { hasData: true, score: 30, confidence: 'low' } }, { currentWeek: '2' }, {}, 'mon');
  assert.equal(limited.mode, 'train');
});

// ---- projection is rest-aware -------------------------------------------
test('projectScore: no "train today" gain on a rest day even with weekly work open', () => {
  const model = {
    rec: { sessionLabel: 'Rest Day', badge: '' },
    week: { consistencyTotal: 10, consistencyDone: 4, consistencyPct: 40 },
    streak: { current: 3 },
    // enough for computeHybridScore to have data:
    ready: { hasData: true, score: 70, status: 'Ready' },
  };
  const state = { currentWeek: '3', settings: {}, loadMetrics: { atl: 40, ctl: 42 }, weeks: {} };
  const p = projectScore(model, state, DAYS);
  assert.equal(p.canProject, false);
  assert.equal(p.gain, 0);
});

// ---- coach voice is rest/deload-aware -----------------------------------
test('generateRecommendation: a rest day never says "push" — it frames recovery', () => {
  const program = { days: { sun: { title: 'Rest', runs: 'Rest' } } };
  const s = { currentWeek: '2', loadMetrics: { atl: 90, ctl: 100 }, weeks: { '2': {} } };
  const rec = generateRecommendation(s, DAYS, program, 'sun');
  assert.equal(rec.badge, 'Rest Day');
  assert.match(rec.headline, /rest day/i);
  assert.doesNotMatch(rec.headline, /push/i);
});

test('generateRecommendation: a deload training day says keep it light, not push', () => {
  const program = {
    days: { mon: { title: 'Push', lifts: ['Bench'], runs: 'Rest' } },
    weeklyVolModifiers: { '8': { intensityLabel: 'Deload' } },
  };
  const s = { currentWeek: '8', loadMetrics: { atl: 95, ctl: 100 }, weeks: { '8': { lifts: { mon: { 'Bench': [{ w: '60', r: '5', c: false }] } } } } };
  const rec = generateRecommendation(s, DAYS, program, 'mon');
  assert.equal(rec.badge, 'Deload');
  assert.match(rec.headline, /light/i);
  assert.doesNotMatch(rec.headline, /push/i);
});
