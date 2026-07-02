import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forEachLoggedDay, loggedDateSet, resolveSlotDate } from '../js/analytics/logged-days.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test('resolveSlotDate: prefers stored date, else reconstructs', () => {
  assert.equal(resolveSlotDate({}, 1, 0, '2026-07-01'), '2026-07-01');
  const state = { currentWeek: '2', weekStartedAt: '2026-07-06' }; // week 2 Monday
  // week 1, dayIdx 0 → one week before base → 2026-06-29
  assert.equal(resolveSlotDate(state, 1, 0, null), '2026-06-29');
});

test('forEachLoggedDay: yields only days with completed lifts or a run', () => {
  const state = {
    currentWeek: '1', weekStartedAt: '2026-07-06',
    weeks: { '1': {
      lifts: {
        mon: { Squat: [{ w: 100, r: 5, c: true }] },     // logged
        tue: { Bench: [{ w: 60, r: 5 }] },               // NOT completed → skip
      },
      runs: { wed: { dist: '5', time: '25:00' }, thu: { dist: '0' } },
      dates: { mon: '2026-07-06', wed: '2026-07-08' },
    } },
  };
  const seen = [];
  forEachLoggedDay(state, DAYS, (d) => seen.push(d.dateISO + ':' + Math.round(d.volume) + ':' + d.distance));
  assert.deepEqual(seen.sort(), ['2026-07-06:500:0', '2026-07-08:0:5']);
});

test('loggedDateSet: distinct training dates', () => {
  const state = {
    currentWeek: '1', weekStartedAt: '2026-07-06',
    weeks: { '1': { lifts: { mon: { S: [{ w: 100, r: 5, c: true }] } }, runs: { mon: { dist: '3' } }, dates: { mon: '2026-07-06' } } },
  };
  const set = loggedDateSet(state, DAYS);
  assert.equal(set.size, 1);
  assert.ok(set.has('2026-07-06'));
});
