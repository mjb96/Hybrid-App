import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRunPerformance } from '../js/analytics/run-performance.js';

// One run/walk session on a Monday of the given week, keyed by session id so the
// activity model treats each as independent. dist in km, time as M:SS.
const week = (date, dist, time, sessionId, extra = {}) => ({
  dates: { mon: date }, runs: {},
  runSessions: { mon: [{ sessionId, dist: String(dist), time, localDate: date, source: 'gps', ...extra }] },
});

test('7D Run Performance totals every dated run and reports duration coverage', () => {
  const state = { settings: { distanceUnit: 'km' }, weeks: {
    '1': week('2026-07-20', 10, '50:00', 'a'),
    'one:b': week('2026-07-22', 5, '', 'b'),        // no time: counts in distance, not duration coverage
    'future': week('2026-07-24', 8, '40:00', 'future'),
    'undated': { dates: {}, runs: {}, runSessions: { mon: [{ sessionId: 'u', dist: '3', time: '15:00', source: 'gps' }] } },
  } };
  const model = buildRunPerformance(state, { today: '2026-07-23', range: '7d', metric: 'distance' });
  assert.equal(model.recordCount, 2, 'the two eligible dated runs count; future and undated are excluded');
  assert.equal(model.formattedTotal, '15.0 km');
  assert.equal(model.durationKnown, 1);
  assert.equal(model.durationMissing, 1);
  assert.deepEqual(model.exclusions, { future: 1, undated: 1 });
});

test('4W Run Performance groups by week and compares an equal elapsed period', () => {
  const state = { settings: { distanceUnit: 'km' }, weeks: {
    old: week('2026-06-25', 6, '30:00', 'old'),
    recent: week('2026-07-10', 7, '35:00', 'recent'),
    current: week('2026-07-23', 9, '45:00', 'current'),
  } };
  const model = buildRunPerformance(state, { today: '2026-07-23', range: '4w', metric: 'sessions' });
  assert.equal(model.bins.length, 4);
  assert.equal(model.total, 2, 'two runs inside the current 4-week window');
  assert.equal(model.comparison.previous, 1);
  assert.equal(model.comparison.percentageChange, 100);
  assert.equal(model.comparison.favorable, true);
});

test('1Y Run Performance uses calendar months and can navigate prior years', () => {
  const state = { settings: { distanceUnit: 'km' }, weeks: {
    jan: week('2025-01-10', 4, '20:00', 'jan'),
    jul: week('2026-07-20', 12, '60:00', 'jul'),
  } };
  const current = buildRunPerformance(state, { today: '2026-07-23', range: '1y', metric: 'distance' });
  assert.equal(current.bins.length, 12);
  assert.equal(current.bins[6].formatted, '12.0 km', 'July bin holds the July run');
  const prior = buildRunPerformance(state, { today: '2026-07-23', range: '1y', metric: 'sessions', offset: -1 });
  assert.equal(prior.period.start, '2025-01-01');
  assert.equal(prior.total, 1);
  assert.equal(prior.canGoNext, true);
});

test('a partial current week compares against the SAME elapsed point last week, not the whole week', () => {
  // today = Wed 2026-07-22. This week Mon 07-20 (10 km). Last week has a Monday
  // run (5 km) AND a Friday run (8 km). An honest partial-week comparison pits
  // Mon–Wed vs Mon–Wed, so the Friday run must NOT count against this week.
  const state = { settings: { distanceUnit: 'km' }, weeks: {
    thisMon: week('2026-07-20', 10, '50:00', 'thisMon'),
    lastMon: week('2026-07-13', 5, '25:00', 'lastMon'),
    lastFri: { dates: { fri: '2026-07-17' }, runs: {}, runSessions: { fri: [{ sessionId: 'lastFri', dist: '8', time: '40:00', localDate: '2026-07-17', source: 'gps' }] } },
  } };
  const model = buildRunPerformance(state, { today: '2026-07-22', range: '7d', metric: 'distance' });
  assert.equal(model.total, 10);
  assert.equal(model.comparison.previous, 5, 'only last Monday is in the same elapsed window');
  assert.equal(model.comparison.direction, 'up');
  assert.equal(model.comparison.favorable, true, 'a bigger week-to-date is a favourable change, not a decline');
});

test('walks are included in distance/time/session totals', () => {
  const state = { settings: { distanceUnit: 'km' }, weeks: {
    run: week('2026-07-20', 5, '25:00', 'run'),
    walk: week('2026-07-21', 3, '30:00', 'walk', { type: 'walk' }),
  } };
  const model = buildRunPerformance(state, { today: '2026-07-23', range: '7d', metric: 'sessions' });
  assert.equal(model.total, 2, 'a walk still counts as an activity in the totals');
});
