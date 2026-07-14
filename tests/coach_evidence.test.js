// =============================================================================
// COACH EVIDENCE — the "why am I seeing this" reasoning behind a recommendation.
// Deterministic fixtures; asserts concrete values, ordering, data-completeness
// and the "what clears it" line.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachEvidence } from '../js/brain/coach-evidence.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w, r });
function weekDates(mondayISO) {
  const base = new Date(mondayISO + 'T00:00:00Z');
  const out = {};
  DAY_KEYS.forEach((dk, i) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + i); out[dk] = d.toISOString().slice(0, 10); });
  return out;
}
const DAYS = DAY_KEYS;

// Two weeks of strength; current week (2) is fully in the past for a clean total.
function twoWeekStrength() {
  return {
    currentWeek: '2',
    settings: { weightUnit: 'kg', distanceUnit: 'km' },
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(50, 5), work(50, 5)] }, wed: { A: [work(50, 5), work(50, 5)] } } }, // 4 sets
      '2': { dates: weekDates('2026-06-08'), lifts: { mon: { A: [work(50, 5), work(50, 5), work(50, 5)] }, wed: { A: [work(50, 5), work(50, 5), work(50, 5), work(50, 5)] } } }, // 7 sets
    },
  };
}

test('recovery-focused (warning) leads with the load line and includes a clears note', () => {
  const state = twoWeekStrength();
  const model = { load: { hasData: true, acwr: 1.6 }, ready: { hasData: true, score: 44, status: 'Low', confidence: 'high', inputCount: 3 } };
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec: { severity: 'warning', badge: 'Reduce load today' }, today: '2026-06-10' });

  assert.match(ev.bullets[0], /climbing faster than your body is recovering/);
  assert.ok(ev.bullets.some(b => /Readiness is 44/.test(b)));
  assert.ok(ev.bullets.some(b => b.includes('Working sets: 7 this week vs 4 at the same point last week (+3)')));
  assert.match(ev.clears, /settles back toward your baseline/);
});

test('positive recommendation leads with progress (working sets), not the load warning', () => {
  const state = twoWeekStrength();
  const model = { load: { hasData: true, acwr: 1.0 }, ready: { hasData: true, score: 88, status: 'Primed', confidence: 'high', inputCount: 3 } };
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec: { severity: 'positive', badge: 'Well rested — push it today' }, today: '2026-06-10' });

  assert.ok(ev.bullets[0].includes('Working sets: 7 this week vs 4 at the same point last week'));
  assert.match(ev.clears, /Keep it here/);
});

test('data completeness: sparse sleep on a recovery call flags limited confidence', () => {
  const state = twoWeekStrength();
  // Health Connect connected but only 2 of the last 7 nights logged.
  state.healthConnect = { connected: true, sleep: [
    { date: '2026-06-09', totalHours: 7 },
    { date: '2026-06-08', totalHours: 6.5 },
  ] };
  const model = { load: { hasData: true, acwr: 1.55 }, ready: { hasData: true, score: 48, status: 'Low', confidence: 'moderate', inputCount: 2 } };
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec: { severity: 'warning', badge: 'Reduce load today' }, today: '2026-06-10' });

  assert.equal(ev.confidence, 'limited');
  assert.ok(ev.bullets.some(b => /Sleep logged 2 of the last 7 nights/.test(b)));
});

test('a sparse readiness estimate marks recovery evidence as limited', () => {
  const state = twoWeekStrength();
  const model = { load: { hasData: true, acwr: 1.55 }, ready: {
    hasData: true, score: 25, status: 'Limited signal', confidence: 'low', inputCount: 1,
  } };
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec: { severity: 'warning', badge: 'Reduce load today' }, today: '2026-06-10' });
  assert.equal(ev.confidence, 'limited');
  assert.ok(ev.bullets.some(b => /low confidence, 1 signal\)/.test(b)));
});

test('no readiness data on a recovery call is stated honestly (load alone)', () => {
  const state = twoWeekStrength();
  const model = { load: { hasData: true, acwr: 1.55 }, ready: { hasData: false } };
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec: { severity: 'warning', badge: 'Reduce load today' }, today: '2026-06-10' });
  assert.equal(ev.confidence, 'limited');
  assert.ok(ev.bullets.some(b => /based on training load alone/.test(b)));
});

test('strength-only user gets no running bullet; running-only gets no sets bullet', () => {
  const strengthOnly = twoWeekStrength();
  const m = { load: { hasData: true, acwr: 1.0 }, ready: { hasData: false } };
  const evS = buildCoachEvidence({ state: strengthOnly, days: DAYS, model: m, rec: { severity: 'neutral', badge: 'On track' }, today: '2026-06-10' });
  assert.ok(!evS.bullets.some(b => /Running:/.test(b)));

  const runningOnly = {
    currentWeek: '2', settings: { distanceUnit: 'km' },
    weeks: {
      '1': { dates: weekDates('2026-06-01'), runs: { tue: { dist: '5', time: '25:00' } } },
      '2': { dates: weekDates('2026-06-08'), runs: { tue: { dist: '8', time: '40:00' } } },
    },
  };
  const evR = buildCoachEvidence({ state: runningOnly, days: DAYS, model: m, rec: { severity: 'neutral', badge: 'On track' }, today: '2026-06-10' });
  assert.ok(!evR.bullets.some(b => /Working sets:/.test(b)));
  assert.ok(evR.bullets.some(b => b.includes('Running: 8.0 km this week vs 5.0 km at the same point last week')));
});

test('insufficient data yields no fabricated bullets', () => {
  const state = { currentWeek: '1', settings: {}, weeks: { '1': { dates: weekDates('2026-06-08'), lifts: {} } } };
  const model = { load: { hasData: false }, ready: { hasData: false } };
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec: { severity: 'neutral', badge: 'Getting Started' }, today: '2026-06-10' });
  assert.equal(ev.bullets.length, 0);
});

test('detraining badge explains what lifts it', () => {
  const state = twoWeekStrength();
  const model = { load: { hasData: true, acwr: 0.4 }, ready: { hasData: false } };
  const ev = buildCoachEvidence({ state, days: DAYS, model, rec: { severity: 'caution', badge: 'Detraining' }, today: '2026-06-10' });
  assert.match(ev.clears, /string a few full sessions back together/);
});
