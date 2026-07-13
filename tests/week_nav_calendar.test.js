// =============================================================================
// WEEK NAVIGATOR — calendar-week behaviour (fake DOM).
//
// The analytics week navigator moves by CALENDAR weeks, labels the real Mon–Sun
// range, cannot go past the current week, only goes back while older activity
// exists, and never mutates the program week.
// =============================================================================
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initWeekNav, updateWeekNavDisplay, resetWeekNav,
  getCalendarWeekOffset, getSelectedWeekStart,
} from '../js/analytics/week-nav.js';
import { weekStartOf, localDayKey, addDaysISO } from '../js/analytics/weekly-aggregate.js';

// ---- minimal fake DOM -------------------------------------------------------
function makeEl() {
  return { textContent: '', disabled: false, _listener: null,
    addEventListener(_t, fn) { this._listener = fn; } };
}
let els, view, onNavigateCalls;
function install() {
  els = {
    weekNavLabel: makeEl(), weekNavDates: makeEl(),
    weekNavPrev: makeEl(), weekNavNext: makeEl(),
  };
  view = makeEl();
  globalThis.document = {
    getElementById: (id) => (id === 'view-analytics' ? view : els[id] || null),
  };
  onNavigateCalls = 0;
}
// Simulate a click on the prev/next arrow through the delegated listener.
function click(which) {
  const btnId = which === 'prev' ? 'weekNavPrev' : 'weekNavNext';
  view._listener({ target: { closest: (sel) => (sel === `#${btnId}` ? els[btnId] : null) } });
}

// A state whose only logged day is LAST calendar week (Mon 6 Jul), program week
// frozen at 3. "Today" in these tests is driven by the real clock via the module,
// so we assert relationships that hold regardless of the actual date.
function stateLastWeek(todayISO) {
  const lastMon = addDaysISO(weekStartOf(todayISO), -7);
  return { currentWeek: '3', weeks: { '3': { dates: { mon: lastMon }, lifts: { mon: { A: [{ c: true, w: '100', r: '5' }] } } } } };
}

beforeEach(() => { install(); resetWeekNav(); });

test('defaults to the current calendar week ("This week") with the real Mon–Sun range', () => {
  const today = localDayKey(new Date());
  const state = stateLastWeek(today);
  initWeekNav(() => state, () => { onNavigateCalls++; });
  updateWeekNavDisplay(() => state);

  assert.equal(getCalendarWeekOffset(), 0);
  assert.equal(els.weekNavLabel.textContent, 'This week');
  assert.equal(getSelectedWeekStart(today), weekStartOf(today));
  assert.equal(els.weekNavNext.disabled, true, 'cannot navigate into the future');
  assert.equal(els.weekNavPrev.disabled, false, 'older activity exists → can go back');
});

test('stepping back selects the previous calendar week and never touches currentWeek', () => {
  const today = localDayKey(new Date());
  const state = stateLastWeek(today);
  initWeekNav(() => state, () => { onNavigateCalls++; });
  updateWeekNavDisplay(() => state);

  click('prev');
  assert.equal(getCalendarWeekOffset(), -1);
  assert.equal(els.weekNavLabel.textContent, 'Previous week');
  assert.equal(getSelectedWeekStart(today), addDaysISO(weekStartOf(today), -7));
  assert.equal(state.currentWeek, '3', 'analytics navigation must not advance the program week');
  assert.equal(els.weekNavNext.disabled, false, 'can now step forward toward this week');
  assert.ok(onNavigateCalls >= 1, 're-render fired');
});

test('cannot step forward past the current calendar week', () => {
  const state = stateLastWeek(localDayKey(new Date()));
  initWeekNav(() => state, () => {});
  updateWeekNavDisplay(() => state);
  click('next'); // already at offset 0 → no-op
  assert.equal(getCalendarWeekOffset(), 0);
});

test('back-navigation stops once there is no older logged activity', () => {
  const today = localDayKey(new Date());
  const state = stateLastWeek(today);
  initWeekNav(() => state, () => {});
  click('prev');                       // now viewing last week (the only data)
  updateWeekNavDisplay(() => state);
  assert.equal(getCalendarWeekOffset(), -1);
  assert.equal(els.weekNavPrev.disabled, true, 'no data before last week → prev disabled');
});

test('an empty history never offers back-navigation', () => {
  const state = { currentWeek: '1', weeks: {} };
  initWeekNav(() => state, () => {});
  updateWeekNavDisplay(() => state);
  assert.equal(els.weekNavPrev.disabled, true);
  assert.equal(els.weekNavNext.disabled, true);
  assert.equal(els.weekNavLabel.textContent, 'This week');
});
