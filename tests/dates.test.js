// ==========================================
// TIME-AXIS TESTS (tests/dates.test.js) — `node --test`
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDaysISO, dateKey, daysBetween, estimateWeekStart, formatDayMonth, localDayKey,
  slotDate, slotDateISO, todayKey, weekRangeLabel,
} from '../js/dates.js';

// Monday 2026-06-08 as the week start.
const MON = '2026-06-08T00:00:00.000Z';

test('slotDateISO offsets each weekday from the Monday start', () => {
  assert.equal(slotDateISO(MON, 'mon'), '2026-06-08');
  assert.equal(slotDateISO(MON, 'tue'), '2026-06-09');
  assert.equal(slotDateISO(MON, 'sun'), '2026-06-14');
});

test('slotDate returns null for missing/invalid input', () => {
  assert.equal(slotDate(null, 'mon'), null);
  assert.equal(slotDate('not-a-date', 'mon'), null);
});

test('estimateWeekStart walks back/forward 7-day weeks', () => {
  // current week is 5 starting MON; week 3 started two weeks earlier.
  const wk3 = estimateWeekStart(MON, 5, 3);
  assert.equal(new Date(wk3).getUTCDate(), 25); // 2026-05-25
  // a future week
  const wk6 = estimateWeekStart(MON, 5, 6);
  assert.equal(new Date(wk6).getUTCDate(), 15); // 2026-06-15
});

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-06-08', '2026-06-15'), 7);
  assert.equal(daysBetween('2026-06-15', '2026-06-08'), -7);
  assert.equal(daysBetween('x', '2026-06-08'), null);
});

test('weekRangeLabel renders a readable range', () => {
  assert.equal(weekRangeLabel(MON), 'Jun 8–14');
  assert.equal(weekRangeLabel('2026-05-25T00:00:00.000Z'), 'May 25–31');
});

test('local calendar keys honour positive and negative UTC offsets', () => {
  const instant = new Date('2026-07-13T14:30:00.000Z');
  assert.equal(localDayKey(instant, 'Australia/Sydney'), '2026-07-14');
  assert.equal(localDayKey(instant, 'America/Los_Angeles'), '2026-07-13');
  assert.equal(localDayKey('2026-01-01T10:30:00.000Z', 'Pacific/Kiritimati'), '2026-01-02');
  assert.equal(localDayKey('2026-01-01T10:30:00.000Z', 'Etc/GMT+12'), '2025-12-31');
});

test('date-only keys are intentional local days and invalid days fail closed', () => {
  assert.equal(localDayKey('2026-07-14', 'Pacific/Kiritimati'), '2026-07-14');
  assert.equal(localDayKey('2026-07-14', 'America/Los_Angeles'), '2026-07-14');
  assert.equal(localDayKey('2026-02-31'), null);
  assert.equal(localDayKey('not-a-date'), null);
  assert.equal(localDayKey(new Date('2026-07-14T00:00:00Z'), 'Not/A_Timezone'), null);
});

test('todayKey and dateKey accept an injected instant without consulting wall-clock date', () => {
  const instant = new Date('2026-07-13T14:30:00.000Z');
  assert.equal(todayKey('Australia/Sydney', instant), '2026-07-14');
  assert.equal(todayKey('America/Los_Angeles', instant), '2026-07-13');
  assert.equal(dateKey(instant, 'Australia/Sydney'), '2026-07-14');
});

test('whole-day key arithmetic is stable across DST and week/year boundaries', () => {
  // These dates straddle DST changes in Sydney/New York, but a calendar key is
  // not an instant and must always move exactly one displayed day.
  assert.equal(addDaysISO('2026-10-03', 1), '2026-10-04');
  assert.equal(addDaysISO('2026-03-07', 1), '2026-03-08');
  assert.equal(addDaysISO('2026-07-12', 1), '2026-07-13'); // Sun → Mon
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysISO('2026-01-01', -1), '2025-12-31');
  assert.equal(addDaysISO('2026-02-31', 1), null);
  assert.equal(addDaysISO('2026-01-01', 1.5), null);
});

test('date-only display never shifts through a timezone', () => {
  assert.equal(formatDayMonth('2026-07-14'), '14/7');
  assert.equal(formatDayMonth('2026-02-31'), '');
});
