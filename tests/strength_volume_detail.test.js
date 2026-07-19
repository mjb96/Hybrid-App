import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyStrengthVolumeDetail } from '../js/analytics/strength-volume-detail.js';

const work = (w, r) => ({ c: true, w: String(w), r: String(r) });

test('weekly volume detail preserves exact workouts and merges explicit aliases', () => {
  const state = { settings: { weightUnit: 'kg' }, weeks: {
    '1': {
      sessionId: 'session-a', sessionTitle: 'Upper A',
      dates: { mon: '2026-07-06' },
      gymStats: { mon: { time: '45:00' } },
      lifts: { mon: { 'Bench Press': [work(100, 5), work(100, 5)] } },
    },
    '2': {
      sessionId: 'session-b', sessionTitle: 'Upper B',
      dates: { wed: '2026-07-08' },
      lifts: { wed: { 'Barbell Bench Press': [work(105, 5)] } },
    },
  } };
  const detail = buildWeeklyStrengthVolumeDetail(state, { weekStart: '2026-07-06', today: '2026-07-12' });
  assert.equal(detail.totals.volumeKg, 1525);
  assert.equal(detail.totals.workingSets, 3);
  assert.equal(detail.workouts.length, 2);
  assert.deepEqual(detail.workouts.map(row => row.id).sort(), ['strength:session-a', 'strength:session-b']);
  assert.equal(detail.exercises.length, 1, 'catalogue aliases share one exercise identity');
  assert.equal(detail.exercises[0].name, 'Barbell Bench Press');
  assert.deepEqual(detail.exercises[0].storedNames.sort(), ['Barbell Bench Press', 'Bench Press']);
  assert.equal(detail.muscles.find(row => row.id === 'chest').directSets, 3);
  const triceps = detail.muscles.find(row => row.id === 'triceps');
  assert.equal(triceps.indirectSets, 1.5);
  assert.deepEqual(triceps.exerciseCredits, [{
    id: 'barbell_bench_press', name: 'Barbell Bench Press',
    directSets: 0, indirectSets: 1.5, totalSetCredits: 1.5,
  }]);
});

test('live weekly detail excludes future records and compares elapsed days only', () => {
  const state = { weeks: {
    prev: { dates: { mon: '2026-07-06', fri: '2026-07-10' }, lifts: { mon: { Squat: [work(50, 2)] }, fri: { Squat: [work(999, 1)] } } },
    live: { dates: { mon: '2026-07-13', fri: '2026-07-17' }, lifts: { mon: { Squat: [work(100, 2)] }, fri: { Squat: [work(999, 1)] } } },
  } };
  const detail = buildWeeklyStrengthVolumeDetail(state, { weekStart: '2026-07-13', today: '2026-07-15' });
  assert.equal(detail.totals.volumeKg, 200);
  assert.equal(detail.excludedFutureRecords, 1);
  assert.equal(detail.comparison.previousTotal, 100, 'prior Friday is outside the elapsed matched period');
  assert.equal(detail.comparisonPeriod.muscles.find(row => row.id === 'quads').totalSetCredits, 1,
    'muscle evidence uses the same elapsed prior-period cutoff as the headline comparison');
  assert.equal(detail.comparison.percentageChange, 100);
  assert.equal(detail.comparison.comparisonLabel, 'vs same point last week');
});

test('empty weekly detail returns honest zero summaries without invalid numbers', () => {
  const detail = buildWeeklyStrengthVolumeDetail({ weeks: {} }, { weekStart: '2026-07-13', today: '2026-07-15' });
  assert.equal(detail.totals.volumeKg, 0);
  assert.equal(detail.workouts.length, 0);
  assert.equal(detail.exercises.length, 0);
  assert.equal(detail.comparison.percentageChange, null);
});
