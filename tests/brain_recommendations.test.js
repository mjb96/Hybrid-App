// ==========================================
// BRAIN RECOMMENDATIONS TESTS (tests/brain_recommendations.test.js)
// Focus: the coaching card acknowledges an already-logged session instead of
// prescribing effort that's already been put in.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateRecommendation } from '../js/brain/recommendations.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function stateWith(lifts = {}, runs = {}) {
  return { currentWeek: '2', loadMetrics: { atl: 120, ctl: 100 }, weeks: { '2': { lifts, runs } } };
}

test('a fully-logged gym session flips coaching to an acknowledgement', () => {
  const program = { days: { mon: { title: 'Push', lifts: ['Back Squat'], runs: 'Rest' } }, weeklyVolModifiers: { '2': { sets: 3, reps: 5 } } };
  const s = stateWith({ mon: { 'Back Squat': [
    { w: '100', r: '5', c: true }, { w: '100', r: '5', c: true }, { w: '100', r: '5', c: true },
  ] } });
  const rec = generateRecommendation(s, DAYS, program, 'mon');
  assert.equal(rec.severity, 'positive');
  assert.equal(rec.badge, 'Session Done');
  assert.match(rec.advice, /logged|done/i);
});

test('an unfinished gym session still gets a prescriptive recommendation', () => {
  const program = { days: { mon: { title: 'Push', lifts: ['Back Squat'], runs: 'Rest' } }, weeklyVolModifiers: { '2': { sets: 3, reps: 5 } } };
  const s = stateWith({ mon: { 'Back Squat': [
    { w: '100', r: '5', c: true }, { w: '100', r: '5', c: true }, { w: '100', r: '5', c: false },
  ] } });
  const rec = generateRecommendation(s, DAYS, program, 'mon');
  assert.notEqual(rec.badge, 'Session Done');
});

test('a logged run-only day is acknowledged', () => {
  const program = { days: { wed: { title: 'Recovery', lifts: [], runs: '5km easy' } } };
  const s = stateWith({}, { wed: { dist: '5', time: '30:00' } });
  const rec = generateRecommendation(s, DAYS, program, 'wed');
  assert.equal(rec.badge, 'Session Done');
  assert.match(rec.advice, /run/i);
});

test('a rest day is never treated as a completed session', () => {
  const program = { days: { sun: { title: 'Rest Day', lifts: [], runs: 'Rest' } } };
  const rec = generateRecommendation(stateWith(), DAYS, program, 'sun');
  assert.notEqual(rec.badge, 'Session Done');
});
