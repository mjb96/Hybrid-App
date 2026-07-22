import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGymPerformance } from '../js/analytics/gym-performance.js';

const set = (w = 100, r = 5) => ({ w: String(w), r: String(r), c: true });
const week = (date, time, sessionId, extra = {}) => ({
  sessionId, dates: { mon: date }, lifts: { mon: { Squat: [set()] } },
  gymStats: { mon: { time } }, runs: {}, ...extra,
});

test('7D Gym Performance totals every exact workout and reports duration coverage', () => {
  const state = { settings: { weightUnit: 'kg' }, weeks: {
    '1': week('2026-07-20', '60', null),
    'one:a': week('2026-07-20', '30:00', 'a'),
    'one:b': week('2026-07-22', '', 'b'),
    'future': week('2026-07-24', '20:00', 'future'),
    'undated': week(null, '10:00', 'undated'),
  } };
  const model = buildGymPerformance(state, { today: '2026-07-23', range: '7d', metric: 'time' });
  assert.equal(model.total, 5400);
  assert.equal(model.formattedTotal, '1h 30m');
  assert.equal(model.recordCount, 3);
  assert.equal(model.durationKnown, 2);
  assert.equal(model.durationMissing, 1);
  assert.equal(model.bins[0].records.length, 2, 'same-day independent workouts remain separate evidence');
  assert.deepEqual(model.exclusions, { future: 1, undated: 1 });
});

test('4W Gym Performance groups by week and compares an equal elapsed period', () => {
  const state = { settings: { weightUnit: 'kg' }, weeks: {
    old: week('2026-06-25', '20:00', 'old'),
    recent: week('2026-07-10', '40:00', 'recent'),
    current: week('2026-07-23', '60:00', 'current'),
  } };
  const model = buildGymPerformance(state, { today: '2026-07-23', range: '4w', metric: 'sessions' });
  assert.equal(model.bins.length, 4);
  assert.equal(model.total, 2);
  assert.equal(model.comparison.previous, 1);
  assert.equal(model.comparison.percentageChange, 100);
});

test('1Y Gym Performance uses calendar months and can navigate prior years', () => {
  const state = { settings: { weightUnit: 'kg' }, weeks: {
    jan: week('2025-01-10', '30:00', 'jan'),
    jul: week('2026-07-20', '45:00', 'jul'),
  } };
  const current = buildGymPerformance(state, { today: '2026-07-23', range: '1y', metric: 'sets' });
  assert.equal(current.bins.length, 12);
  assert.equal(current.bins[6].value, 1);
  const prior = buildGymPerformance(state, { today: '2026-07-23', range: '1y', metric: 'time', offset: -1 });
  assert.equal(prior.period.start, '2025-01-01');
  assert.equal(prior.total, 1800);
  assert.equal(prior.canGoNext, true);
});

test('note- or RPE-only days with no sets and no duration are not counted as workouts', () => {
  const state = { settings: { weightUnit: 'kg' }, weeks: {
    real: week('2026-07-20', '45:00', 'real'),
    noteOnly: {
      dates: { tue: '2026-07-21' }, lifts: {}, runs: {},
      gymRpe: { tue: '8' }, notes: { tue: 'felt tired' }, gymStats: {},
    },
  } };
  const sessions = buildGymPerformance(state, { today: '2026-07-23', range: '7d', metric: 'sessions' });
  assert.equal(sessions.total, 1, 'only the session with real training work counts');
  assert.equal(sessions.recordCount, 1);
  // The phantom day must not appear as contributing evidence in any bin.
  const evidence = sessions.bins.flatMap((bin) => bin.records.map((r) => r.localDate));
  assert.deepEqual(evidence, ['2026-07-20']);
});

test('duration-only FIT gym activities remain visible in time totals', () => {
  const state = { weeks: {
    fit: {
      dates: { mon: '2026-07-20' }, lifts: { mon: {} }, runs: {},
      gymStats: { mon: { time: '45:00', avgHR: 130 } },
    },
  } };
  const model = buildGymPerformance(state, { today: '2026-07-23', metric: 'time' });
  assert.equal(model.recordCount, 1);
  assert.equal(model.total, 2700);
});
