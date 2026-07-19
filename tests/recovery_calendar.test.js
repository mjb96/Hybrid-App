import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarWeekRpe } from '../js/analytics/recovery-calendar.js';

test('this-week RPE follows logged dates rather than the active program-week counter', () => {
  const state = { currentWeek: '1', weeks: {
    '1': { dates: { mon: '2026-07-06' }, gymRpe: { mon: '9' }, lifts: { mon: { Squat: [{ c: true, w: '100', r: '5' }] } } },
    '7': { dates: { tue: '2026-07-14' }, gymRpe: { tue: '6' }, lifts: { tue: { Bench: [{ c: true, w: '80', r: '5' }] } }, runs: { tue: { dist: '5', time: '25:00', rpe: '4' } } },
  } };
  const result = calendarWeekRpe(state, { today: '2026-07-15' });
  assert.equal(result.count, 2);
  assert.equal(result.average, 5);
  assert.equal(result.weekStart, '2026-07-13');
});
