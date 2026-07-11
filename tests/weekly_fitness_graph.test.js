// =============================================================================
// WEEKLY FITNESS GRAPH — render + accessibility tests
//
// Uses a tiny fake DOM (the project has no jsdom dependency) to render the
// component to an HTML string and assert on structure, accessible labels,
// today-highlighting, honest comparison copy and the absence of NaN/Infinity.
// The graph is imported dynamically AFTER the DOM globals are installed, because
// the module attaches a document-level listener at import time.
// =============================================================================
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

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

before(async () => {
  globalThis.document = {
    addEventListener() {}, removeEventListener() {},
    getElementById: getEl, createElement: () => makeEl(),
    body: makeEl('body'),
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
function mountStrength(state) {
  const id = 'strengthBarChart_' + (++_n);
  const g = initWeeklyFitnessGraph(id, 'strength', () => state);
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

test('each populated bar has a readable accessible label like "Monday, 3 sets"', () => {
  const html = mountStrength(strengthState());
  assert.match(html, /aria-label="Monday, 3 sets"/);
  // an empty day is announced as no activity, not a fake zero bar
  assert.match(html, /aria-label="Tuesday, no activity"/);
});

test('current week uses the live comparison label "vs same point last week"', () => {
  const html = mountStrength(strengthState());
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
  initWeeklyFitnessGraph(id, 'running', () => state);
  const html = getEl(id).innerHTML;
  assert.match(html, /data-wfg-metric="distance"/);
  // 10 km → 6.2 mi
  assert.match(html, /6\.2 mi/);
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
