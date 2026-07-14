import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachMemory } from '../js/brain/coach-memory.js';
import { addDaysISO } from '../js/dates.js';

const TODAY = '2026-07-14';
const iso = (daysAgo) => addDaysISO(TODAY, -daysAgo);
const hist = (entries) => ({ hybridScore: { history: entries } });

test('V2-4 — silent when there is no noteworthy history', () => {
  assert.equal(coachMemory({ hybridScore: { history: [] } }, 60), null);
  assert.equal(coachMemory({}, null), null);
});

test('V2-4 — calls out an all-time personal best', () => {
  const state = hist([
    { date: iso(20), score: 60 }, { date: iso(15), score: 72 },
    { date: iso(10), score: 68 }, { date: iso(5), score: 74 },
  ]);
  const line = coachMemory(state, 80, TODAY);
  assert.match(line, /personal best/i);
  assert.match(line, /74/); // beat the prior max
});

test('V2-4 — a PB does not fire on a today score that only ties the prior max', () => {
  const state = hist([
    { date: iso(20), score: 60 }, { date: iso(15), score: 80 },
    { date: iso(10), score: 68 }, { date: iso(5), score: 74 },
  ]);
  const line = coachMemory(state, 80, TODAY); // ties, not beats
  assert.doesNotMatch(line || '', /personal best/i);
});

test('V2-4 — counts consecutive strong weeks (>=2 recorded days each)', () => {
  // Three fixed consecutive ISO weeks, each with Tuesday + Thursday data.
  // Fixed calendar fixtures cannot split weeks based on the day the suite runs.
  const entries = [
    '2026-06-23', '2026-06-25',
    '2026-06-30', '2026-07-02',
    '2026-07-07', '2026-07-09',
  ].map((date, i) => ({ date, score: i % 2 ? 78 : 75 }));
  // today score modest so PB/recent-high branch doesn't win
  const line = coachMemory(hist(entries), 55, TODAY);
  assert.match(line, /strong week in a row/);
});

test('V2-4 — surfaces a longest-ever streak', () => {
  const state = { hybridScore: { history: [] }, streakData: { current: 12, longest: 12 } };
  const line = coachMemory(state, 55, TODAY);
  assert.match(line, /12 days straight/);
  assert.match(line, /longest streak yet/);
});
