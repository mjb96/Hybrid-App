import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessOvertrainingRisk, riskSignature } from '../js/brain/risk.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const model = (over = {}) => ({
  load: { hasData: true, acwr: 0.9, tsb: 0 },
  ready: { hasData: true, score: 70 },
  ...over,
});

test('calm athlete → no risk', () => {
  const a = assessOvertrainingRisk(model(), { currentWeek: '2', weeks: {} }, DAYS);
  assert.equal(a.level, 'none');
  assert.deepEqual(a.signals, []);
  assert.equal(riskSignature(a), '');
});

test('ACWR spike alone → high (injury-risk literature)', () => {
  const a = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.6, tsb: -5 } }), { currentWeek: '2', weeks: {} }, DAYS);
  assert.equal(a.level, 'high');
  assert.match(a.headline, /Overtraining risk/);
  assert.match(a.advice, /deload/i);
  assert.ok(a.signals.some(s => s.key === 'acwrSpike'));
});

test('two moderate signals stack to high; one alone is only watch', () => {
  // Elevated ACWR (1) + readiness dip (1) = 2 → watch
  const watch = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.35, tsb: -5 }, ready: { hasData: true, score: 50 } }), { currentWeek: '2', weeks: {} }, DAYS);
  assert.equal(watch.level, 'watch');
  // Deep fatigue (2) + low readiness (2) = 4 → high
  const high = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.0, tsb: -30 }, ready: { hasData: true, score: 35 } }), { currentWeek: '2', weeks: {} }, DAYS);
  assert.equal(high.level, 'high');
});

test('sleep debt read from health log', () => {
  const state = { currentWeek: '2', weeks: {}, healthConnect: { sleep: [
    { date: iso(0), totalHours: 5.2 }, { date: iso(1), totalHours: 5.5 }, { date: iso(2), totalHours: 5.8 },
  ] } };
  const a = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.35, tsb: 0 } }), state, DAYS);
  assert.ok(a.signals.some(s => s.key === 'sleepDebt'));
  assert.equal(a.level, 'watch'); // elevated(1) + sleepDebt(2) = 3 → watch (needs ≥4 for high)
});

test('Hybrid Score sliding needs 3 consecutive declines AND a low latest', () => {
  const declining = { currentWeek: '2', weeks: {}, hybridScore: { history: [
    { date: iso(3), score: 70 }, { date: iso(2), score: 62 }, { date: iso(1), score: 54 }, { date: iso(0), score: 48 },
  ] } };
  const a = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.35 } }), declining, DAYS);
  assert.ok(a.signals.some(s => s.key === 'scoreSlide'));
  // A decline that stays high is NOT a signal.
  const highDecline = { currentWeek: '2', weeks: {}, hybridScore: { history: [
    { date: iso(3), score: 95 }, { date: iso(2), score: 92 }, { date: iso(1), score: 88 }, { date: iso(0), score: 84 },
  ] } };
  const b = assessOvertrainingRisk(model(), highDecline, DAYS);
  assert.ok(!b.signals.some(s => s.key === 'scoreSlide'));
});

test('high-RPE streak from logged sessions', () => {
  const state = { currentWeek: '2', weeks: { '2': {
    gymRpe: { mon: '9', wed: '8', fri: '8' },
    runs: {},
  } } };
  const a = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.0, tsb: -26 } }), state, DAYS);
  assert.ok(a.signals.some(s => s.key === 'highRpeStreak'));
  assert.equal(a.level, 'high'); // deepFatigue(2) + highRpeStreak(2) = 4
});

test('signature is stable + set-based; changes when signals change', () => {
  const s1 = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.6, tsb: -30 } }), { currentWeek: '2', weeks: {} }, DAYS);
  const sig1 = riskSignature(s1);
  assert.ok(sig1.includes('acwrSpike'));
  assert.ok(sig1.includes('deepFatigue'));
  assert.equal(sig1, riskSignature(s1)); // deterministic
  const s2 = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.6, tsb: 0 } }), { currentWeek: '2', weeks: {} }, DAYS);
  assert.notEqual(riskSignature(s2), sig1); // deepFatigue gone → different condition
});

test('deloadPlanned softens the copy', () => {
  const a = assessOvertrainingRisk(model({ load: { hasData: true, acwr: 1.6 } }), { currentWeek: '4', deloadApplied: '4', weeks: {} }, DAYS);
  assert.equal(a.level, 'high');
  assert.equal(a.deloadPlanned, true);
  assert.match(a.headline, /stay in recovery/i);
  assert.doesNotMatch(a.advice, /Take a deload week now/);
});
