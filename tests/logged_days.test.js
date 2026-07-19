import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forEachLoggedDay, loggedDateSet, resolveSlotDate, resolveDateToSlot } from '../js/analytics/logged-days.js';
import { localDayKey, addDaysISO } from '../js/dates.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test('resolveSlotDate: prefers stored date, else reconstructs', () => {
  assert.equal(resolveSlotDate({}, 1, 0, '2026-07-01'), '2026-07-01');
  const state = { currentWeek: '2', weekStartedAt: '2026-07-06' }; // week 2 Monday
  // week 1, dayIdx 0 → one week before base → 2026-06-29
  assert.equal(resolveSlotDate(state, 1, 0, null), '2026-06-29');
});

test('resolveSlotDate: reconstructs the LOCAL day, not the UTC slice of the anchor', () => {
  // A full instant near the UTC day boundary. In a timezone ahead of UTC (the
  // app default is Australia/Sydney) this local day is 2026-07-07, while the old
  // `toISOString().slice(0,10)` code always returned 2026-07-06 — misfiling an
  // evening workout onto the previous calendar day and hiding it from "today".
  // The CI matrix runs this suite under UTC, UTC+14 and UTC−12, so comparing to
  // localDayKey (which resolves in the runner's zone) proves the fix in each.
  const anchor = '2026-07-06T13:30:00Z';
  const state = { currentWeek: '1', weekStartedAt: anchor };
  const localAnchor = localDayKey(anchor);
  assert.equal(resolveSlotDate(state, 1, 0, null), localAnchor);
  assert.equal(resolveSlotDate(state, 1, 3, null), addDaysISO(localAnchor, 3));
  // A stored date is always authoritative and is returned verbatim.
  assert.equal(resolveSlotDate(state, 1, 0, '2026-07-06'), '2026-07-06');
});

test('resolveDateToSlot: maps the LOCAL today to the current-week slot in any zone', () => {
  // The exact quick-start/run-logger path: "today" must resolve to a real slot,
  // not fall one weekday short because the anchor was serialized through UTC.
  const now = new Date();
  const state = { currentWeek: '2', weekStartedAt: now.toISOString() };
  const today = localDayKey(now);
  const slot = resolveDateToSlot(state, today);
  assert.ok(slot, 'local today resolves to a slot');
  assert.equal(resolveSlotDate(state, slot.weekNum, slot.dayIdx, null), today);
});

test('resolveDateToSlot: exact inverse of resolveSlotDate across weeks', () => {
  const state = { currentWeek: '3', weekStartedAt: '2026-07-06' }; // week 3 Monday
  // Round-trips for every slot from week 1 to the current week.
  for (let weekNum = 1; weekNum <= 3; weekNum++) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const iso = resolveSlotDate(state, weekNum, dayIdx, null);
      assert.deepEqual(
        resolveDateToSlot(state, iso),
        { weekNum, dayIdx, day: DAYS[dayIdx] },
        `slot w${weekNum} d${dayIdx} (${iso}) should round-trip`,
      );
    }
  }
});

test('resolveDateToSlot: maps a specific past date to the right week+day', () => {
  const state = { currentWeek: '3', weekStartedAt: '2026-07-06' }; // wk3 Mon = 2026-07-06
  // wk2 Wed = 2026-07-01 (wk2 Mon 2026-06-29 + 2 days).
  assert.deepEqual(resolveDateToSlot(state, '2026-07-01'), { weekNum: 2, dayIdx: 2, day: 'wed' });
  // wk1 Wed = 2026-06-24 (two full weeks before wk3 Wed).
  assert.deepEqual(resolveDateToSlot(state, '2026-06-24'), { weekNum: 1, dayIdx: 2, day: 'wed' });
  // Today (wk3 Monday) stays in the current week.
  assert.deepEqual(resolveDateToSlot(state, '2026-07-06'), { weekNum: 3, dayIdx: 0, day: 'mon' });
});

test('resolveDateToSlot: rejects dates before week 1 and invalid input', () => {
  const state = { currentWeek: '2', weekStartedAt: '2026-07-06' }; // wk1 Mon = 2026-06-29
  assert.equal(resolveDateToSlot(state, '2026-06-28'), null); // day before program start
  assert.equal(resolveDateToSlot(state, ''), null);
  assert.equal(resolveDateToSlot(state, null), null);
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

test('calendar activity excludes undated legacy work instead of inventing a date', () => {
  const state = {
    currentWeek: '4', weekStartedAt: '2026-07-06',
    weeks: { legacy: { lifts: { mon: { S: [{ w: 100, r: 5, c: true }] } } } },
  };
  const seen = [];
  forEachLoggedDay(state, DAYS, (row) => seen.push(row));
  assert.deepEqual(seen, []);
  assert.equal(loggedDateSet(state, DAYS).size, 0);
});
