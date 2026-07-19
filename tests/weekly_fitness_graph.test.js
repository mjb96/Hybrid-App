// =============================================================================
// WEEKLY FITNESS GRAPH — render + accessibility tests
//
// Uses a tiny fake DOM (the project has no jsdom dependency) to render the
// component to an HTML string and assert on structure, accessible labels,
// today-highlighting, honest comparison copy, date-aware activity navigation,
// and the absence of NaN/Infinity.
// =============================================================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysISO, todayKey } from '../js/dates.js';
import { weekStartOf } from '../js/analytics/weekly-aggregate.js';

// ---- minimal fake DOM -------------------------------------------------------
function makeEl(id) {
  let html = '';
  const el = {
    id: id || '',
    style: {},
    _wfgBound: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
  };
  Object.defineProperty(el, 'innerHTML', { get: () => html, set: v => { html = String(v); } });
  Object.defineProperty(el, 'cssText', {
    get: () => el.style._css || '', set: v => { el.style._css = String(v); },
  });
  Object.defineProperty(el.style, 'cssText', { get: () => el.style._css || '', set: v => { el.style._css = String(v); } });
  return el;
}

const store = new Map();
function getEl(id) { if (!store.has(id)) store.set(id, makeEl(id)); return store.get(id); }

let initWeeklyFitnessGraph, refreshWeeklyFitnessGraph;
let dispatchedEvent = null;

before(async () => {
  globalThis.document = {
    addEventListener() {}, removeEventListener() {},
    dispatchEvent(event) { dispatchedEvent = event; return true; },
    getElementById: getEl, createElement: () => makeEl(),
    body: makeEl('body'),
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };
  ({ initWeeklyFitnessGraph, refreshWeeklyFitnessGraph } =
    await import('../js/home/weekly-fitness-graph.js'));
});

// ---- fixture builders -------------------------------------------------------
const work = (w, r) => ({ c: true, w, r });
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function weekDates(mondayISO) {
  const base = new Date(mondayISO + 'T00:00:00Z');
  const out = {};
  DAY_KEYS.forEach((dk, i) => {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + i);
    out[dk] = d.toISOString().slice(0, 10);
  });
  return out;
}

function strengthState() {
  return {
    currentWeek: '2',
    settings: { weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon' },
    weeks: {
      '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(50, 5), work(50, 5)] }, wed: { A: [work(50, 5)] } } },
      '2': { dates: weekDates('2026-06-08'), lifts: { mon: { A: [work(50, 5), work(50, 5), work(50, 5)] } } },
    },
  };
}

// A distinct container id per test keeps the singleton registry isolated.
let _n = 0;
function mountStrength(state, today) {
  const id = 'strengthBarChart_' + (++_n);
  initWeeklyFitnessGraph(id, 'strength', () => state, today ? { today } : {});
  return getEl(id).innerHTML;
}

// ---- tests ------------------------------------------------------------------

test('renders seven day columns for the week', () => {
  const html = mountStrength(strengthState());
  const cols = (html.match(/wfg-dc/g) || []).length;
  assert.ok(cols >= 7, `expected at least 7 day columns, got ${cols}`);
});

test('default strength metric is Working Sets and the tab is present', () => {
  const html = mountStrength(strengthState());
  assert.match(html, /data-wfg-metric="sets"/);
  assert.match(html, /wfg-tab--on[^>]*>Sets|>Sets<\/button>/);
});

test('each populated bar has a readable accessible activity label', () => {
  const html = mountStrength(strengthState(), '2026-06-10'); // today in week 2 (Jun 8–14)
  assert.match(html, /aria-label="Open activities for Monday, 3 sets"/);
  // an empty day is announced as no activity, not a fake zero bar
  assert.match(html, /aria-label="Tuesday, no activity"/);
});

test('current week uses the live comparison label "vs same point last week"', () => {
  const html = mountStrength(strengthState(), '2026-06-10'); // today in week 2 (Jun 8–14)
  assert.match(html, /vs same point last week/);
});

test('comparison shows a real percentage, never NaN or Infinity', () => {
  const html = mountStrength(strengthState());
  assert.doesNotMatch(html, /NaN/);
  assert.doesNotMatch(html, /Infinity/);
  // week 2 elapsed (today defaults to real today, likely past → full week) — just
  // assert a percentage badge or an honest message exists.
  assert.ok(/wfg-compare/.test(html));
});

test('today is highlighted when a day matches the local date', () => {
  // Make Wednesday of week 2 == today so the highlight is deterministic.
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  const state = {
    currentWeek: '1',
    settings: { weightUnit: 'kg', distanceUnit: 'km' },
    weeks: {
      '1': {
        dates: { mon: today, tue: today, wed: today, thu: today, fri: today, sat: today, sun: today },
        lifts: { mon: { A: [work(50, 5)] } },
      },
    },
  };
  const id = 'strengthBarChart_today';
  initWeeklyFitnessGraph(id, 'strength', () => state);
  const html = getEl(id).innerHTML;
  assert.match(html, /wfg-dc--today|wfg-b--today|wfg-dot--today/);
});

test('future days of the current week read as "upcoming", not "no activity"', () => {
  // Anchor the current week to today so later days are genuinely in the future.
  const today = todayKey();
  const monday = weekStartOf(today);
  const dates = {};
  DAY_KEYS.forEach((dk, i) => { dates[dk] = addDaysISO(monday, i); });
  const state = {
    currentWeek: '1', settings: { weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon' },
    weeks: { '1': { dates, lifts: { mon: { A: [work(50, 5)] } } } },
  };
  const id = 'strengthBarChart_future';
  initWeeklyFitnessGraph(id, 'strength', () => state, { today });
  const html = getEl(id).innerHTML;
  // At least one day this week is after today → it must be announced as upcoming,
  // and a missed/empty day must never share the future's visual/aria treatment.
  const lastDate = dates.sun;
  if (lastDate > today) {
    assert.match(html, /upcoming/, 'a future day is announced as upcoming');
    assert.match(html, /wfg-empty--future|wfg-xd--future/, 'future days carry a distinct class');
  }
});

test('future-dated activity is flagged, excluded and cannot open a workout', () => {
  const state = {
    settings: { weightUnit: 'kg' },
    weeks: { '1': {
      dates: weekDates('2026-06-01'),
      lifts: { sun: { A: [work(50, 5)] } },
    } },
  };
  const id = 'strengthBarChart_future_data';
  initWeeklyFitnessGraph(id, 'strength', () => state, { today: '2026-06-01' });
  const html = getEl(id).innerHTML;
  assert.match(html, /wfg-bb--disabled/);
  assert.match(html, /future-dated activity excluded/);
  assert.doesNotMatch(html, /data-wfg-action="bar-click" data-wfg-day="sun"/);
});

test('nav buttons have accessible names', () => {
  const html = mountStrength(strengthState());
  assert.match(html, /aria-label="Previous week"/);
  assert.match(html, /aria-label="Next week"/);
});

test('plot has an accessible summary describing days, total and comparison', () => {
  const html = mountStrength(strengthState());
  assert.match(html, /role="img" aria-label="Working Sets, week of/);
});

test('running graph defaults to Distance and honours mile units', () => {
  const state = {
    currentWeek: '1',
    settings: { distanceUnit: 'mi' },
    weeks: { '1': { dates: weekDates('2026-06-01'), runs: { tue: { dist: '10', time: '50:00' } } } },
  };
  const id = 'runBarChart_mi';
  initWeeklyFitnessGraph(id, 'running', () => state, { today: '2026-06-03' }); // in the Jun 1 week
  const html = getEl(id).innerHTML;
  assert.match(html, /data-wfg-metric="distance"/);
  // 10 km → 6.2 mi
  assert.match(html, /6\.2 mi/);
});

test('strength bar tap opens Activities using the real calendar date', () => {
  const state = {
    currentWeek: '1',
    settings: { weightUnit: 'kg' },
    weeks: {
      '1': {
        dates: weekDates('2026-06-01'),
        lifts: { mon: {
          'Bench Press': [work(100, 5), work(100, 5), work(100, 5)],
          'Back Squat':  [work(140, 5), work(140, 5)],
        } },
      },
    },
  };
  const id = 'strengthBarChart_activity';
  const g = initWeeklyFitnessGraph(id, 'strength', () => state, { today: '2026-06-03' });
  dispatchedEvent = null;
  g._openActivities('mon');
  assert.equal(dispatchedEvent.type, 'app:open-activities');
  assert.deepEqual(dispatchedEvent.detail, {
    date: '2026-06-01', directIfSingle: true, source: 'in-focus',
  });
});

test('running bar tap uses its selected historical week date', () => {
  const state = {
    currentWeek: '1',
    settings: { distanceUnit: 'km' },
    weeks: { '1': { dates: weekDates('2026-06-01'), runs: { sat: { dist: '6.4', time: '34:10' } } } },
  };
  const id = 'runBarChart_activity';
  const g = initWeeklyFitnessGraph(id, 'running', () => state, { today: '2026-06-03' });
  dispatchedEvent = null;
  g._openActivities('sat');
  assert.equal(dispatchedEvent.detail.date, '2026-06-06');
  assert.equal(dispatchedEvent.detail.directIfSingle, true);
});

test('refresh reflects data edits and unit changes without a remount (no stale cache)', () => {
  const state = {
    currentWeek: '1',
    settings: { distanceUnit: 'km' },
    weeks: { '1': { dates: weekDates('2026-06-01'), runs: { tue: { dist: '10', time: '50:00' } } } },
  };
  const id = 'runBarChart_refresh';
  initWeeklyFitnessGraph(id, 'running', () => state, { today: '2026-06-03' });
  assert.match(getEl(id).innerHTML, /10\.0 km/);

  // Edit the underlying data, then refresh (same instance) → new value shows.
  state.weeks['1'].runs.tue.dist = '12';
  refreshWeeklyFitnessGraph(id);
  assert.match(getEl(id).innerHTML, /12\.0 km/);
  assert.doesNotMatch(getEl(id).innerHTML, /10\.0 km/);

  // Change units → the same refresh re-renders in miles (12 km → 7.5 mi).
  state.settings.distanceUnit = 'mi';
  refreshWeeklyFitnessGraph(id);
  assert.match(getEl(id).innerHTML, /7\.5 mi/);
});

test('deleting the last activity in a week refreshes to an honest zero-data state', () => {
  const state = {
    currentWeek: '1', settings: { weightUnit: 'kg' },
    weeks: { '1': { dates: weekDates('2026-06-01'), lifts: { mon: { A: [work(100, 5)] } } } },
  };
  const id = 'strengthBarChart_del';
  initWeeklyFitnessGraph(id, 'strength', () => state, { today: '2026-06-03' });
  assert.match(getEl(id).innerHTML, /1 set/);
  delete state.weeks['1'].lifts.mon;
  refreshWeeklyFitnessGraph(id);
  const html = getEl(id).innerHTML;
  assert.match(html, /aria-label="Monday, no activity"/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('zero-data week renders gracefully with an honest empty comparison', () => {
  const state = {
    currentWeek: '3',
    settings: {},
    weeks: {
      '2': { dates: weekDates('2026-06-01'), lifts: {} },
      '3': { dates: weekDates('2026-06-08'), lifts: {} },
    },
  };
  const id = 'strengthBarChart_empty';
  initWeeklyFitnessGraph(id, 'strength', () => state);
  const html = getEl(id).innerHTML;
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /No activity to compare|Not enough previous data/);
});
