// ==========================================
// WORKOUT LOGGING INTEGRATION TEST (tests/workout_logging.test.js)
// Exercises the real log-a-workout state path in the under-tested js/workout.js
// (CLAUDE.md flags it): adding sets, cycling set type/load, per-set RIR, and
// removal — asserting the actual appState mutations + that a save fires.
// Runs js/workout.js against a minimal DOM stub (as scripts/smoke.mjs does).
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test, before } from 'node:test';

// ── Minimal DOM/globals stub so workout.js runs headless ──────────────────────
const noop = () => {};
function makeEl(id = '') {
  const e = {
    id, setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    appendChild: (c) => c, insertBefore: (c) => c, removeChild: noop, remove: noop,
    after: noop, before: noop, prepend: noop, append: noop, replaceChildren: noop,
    replaceWith: noop, insertAdjacentHTML: noop, insertAdjacentElement: noop, scrollIntoView: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    matches: () => false, hasAttribute: () => false,
    contains: () => false, click: noop, focus: noop,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 50 }),
    style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => '' },
    dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    previousElementSibling: null, firstChild: null, parentElement: null,
    parentNode: { removeChild: noop }, children: [], offsetWidth: 100,
  };
  let h = '', t = '', v = '';
  Object.defineProperty(e, 'innerHTML', { get: () => h, set: (x) => { h = String(x); } });
  Object.defineProperty(e, 'textContent', { get: () => t, set: (x) => { t = String(x); } });
  Object.defineProperty(e, 'value', { get: () => v, set: (x) => { v = String(x); } });
  return e;
}

let workout;
let state;
let saveCount;

before(async () => {
  const store = new Map();
  globalThis.document = {
    addEventListener: noop, removeEventListener: noop,
    getElementById: (id) => { if (!store.has(id)) store.set(id, makeEl(id)); return store.get(id); },
    querySelector: () => null, querySelectorAll: () => [], createElement: () => makeEl(),
    dispatchEvent: noop, readyState: 'complete', body: makeEl('body'), documentElement: makeEl('html'),
  };
  globalThis.window = { addEventListener: noop, removeEventListener: noop, supabase: undefined,
    location: { reload: noop, href: '' }, matchMedia: () => ({ matches: false, addEventListener: noop }),
    // Complete the browser-API surface the render path touches — a missing
    // scrollTo used to throw a swallowed "window.scrollTo is not a function"
    // while the test still passed (a false green).
    scrollTo: noop, scroll: noop, scrollBy: noop, scrollY: 0, scrollX: 0,
    requestAnimationFrame: (cb) => { cb && cb(0); return 0; }, cancelAnimationFrame: noop,
    getComputedStyle: () => ({ display: 'block', getPropertyValue: () => '' }) };
  globalThis.scrollTo = noop;
  globalThis.requestAnimationFrame = (cb) => { cb && cb(0); return 0; };
  globalThis.CSS = { escape: (s) => String(s) };
  globalThis.getComputedStyle = () => ({ display: 'block' });
  globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
  globalThis.L = { map: () => ({ remove: noop, fitBounds: noop, setView: noop, invalidateSize: noop }),
    tileLayer: () => ({ addTo: () => ({}) }), polyline: () => ({ addTo: () => ({ getBounds: noop }) }),
    circleMarker: () => ({ addTo: () => ({}) }) };

  workout = await import('../js/workout.js');
});

function freshState() {
  return {
    currentWeek: '1',
    activeProgramId: 'hybrid_engine',
    weeks: { '1': { lifts: { mon: {} }, liftOrder: { mon: [] }, runs: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {} } },
    settings: { bandWeights: { L: 10, M: 20, H: 30 } },
    bodyWeightLog: [{ weight: 80 }],
    exerciseStats: {},
  };
}

function initWith(s) {
  state = s;
  saveCount = 0;
  workout.initWorkout(() => state, () => 'mon', () => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], () => { saveCount++; }, () => {});
}

const sets = (lift) => state.weeks['1'].lifts.mon[lift];

test('appendCustomSetRow adds a blank working set and saves', () => {
  initWith(freshState());
  workout.appendCustomSetRow(null, 'Bench Press');
  assert.deepEqual(sets('Bench Press'), [{ w: '', r: '', c: false }]);
  assert.ok(saveCount >= 1);
});

test('appendWarmupSetRow inserts a warm-up before the first working set', () => {
  initWith(freshState());
  workout.appendCustomSetRow(null, 'Squat');           // working set at idx 0
  workout.appendWarmupSetRow(null, 'Squat');           // warm-up should go to idx 0
  assert.equal(sets('Squat').length, 2);
  assert.equal(sets('Squat')[0].type, 'W');
  assert.equal(sets('Squat')[1].type, undefined);      // original working set
});

test('cycleSetType walks ""→W→D→F→"" ', () => {
  initWith(freshState());
  workout.appendCustomSetRow(null, 'OHP');
  const seq = [];
  for (let i = 0; i < 4; i++) { workout.cycleSetType('OHP', 0); seq.push(sets('OHP')[0].type); }
  assert.deepEqual(seq, ['W', 'D', 'F', '']);
});

test('cycleSetLoad stamps bodyweight, subtracts band assistance, then clears', () => {
  initWith(freshState());
  workout.appendCustomSetRow(null, 'Pull-up');
  // '' -> BW (stamps latest logged bodyweight 80)
  workout.cycleSetLoad('Pull-up', 0);
  assert.equal(sets('Pull-up')[0].bw, true);
  assert.equal(sets('Pull-up')[0].w, '80');
  // BW -> L (band light = 10)
  workout.cycleSetLoad('Pull-up', 0);
  assert.equal(sets('Pull-up')[0].band, 'L');
  assert.equal(sets('Pull-up')[0].w, '70');
  // L -> M -> H -> '' (weighted, cleared)
  workout.cycleSetLoad('Pull-up', 0); // M
  workout.cycleSetLoad('Pull-up', 0); // H
  workout.cycleSetLoad('Pull-up', 0); // ''
  assert.equal(sets('Pull-up')[0].w, '');
  assert.equal(sets('Pull-up')[0].bw, undefined);
  assert.equal(sets('Pull-up')[0].band, undefined);
});

test('setSetLoadMode exposes direct Bodyweight, Weighted, and Assisted choices', () => {
  initWith(freshState());
  workout.appendCustomSetRow(null, 'Dips');
  workout.setSetLoadMode('Dips', 0, 'bodyweight');
  assert.equal(sets('Dips')[0].bw, true);
  assert.equal(sets('Dips')[0].w, '80');
  workout.setSetLoadMode('Dips', 0, 'assisted');
  assert.equal(sets('Dips')[0].band, 'M');
  assert.equal(sets('Dips')[0].w, '60');
  workout.setSetLoadMode('Dips', 0, 'weighted');
  assert.equal(sets('Dips')[0].loadMode, 'weighted');
  assert.equal(sets('Dips')[0].w, '');
});

test('setPerSetRir sets RIR + derived RPE, and taps to clear', () => {
  initWith(freshState());
  workout.appendCustomSetRow(null, 'Row');
  workout.setPerSetRir('Row', 0, 2);
  assert.equal(sets('Row')[0].rir, 2);
  assert.equal(sets('Row')[0].rpe, 8);   // 10 - RIR
  // tapping the same value clears it
  workout.setPerSetRir('Row', 0, 2);
  assert.equal(sets('Row')[0].rir, null);
  assert.equal(sets('Row')[0].rpe, null);
});

test('removeCustomSetRow deletes the set and prunes empty lift from liftOrder', () => {
  initWith(freshState());
  state.weeks['1'].liftOrder.mon = ['Deadlift'];
  workout.appendCustomSetRow(null, 'Deadlift');
  assert.ok(sets('Deadlift'));
  workout.removeCustomSetRow('Deadlift', 0);
  assert.equal(sets('Deadlift'), undefined);                    // lift removed when empty
  assert.deepEqual(state.weeks['1'].liftOrder.mon, []);         // and pruned from order
});

test('render guard: a stray lift_* key never surfaces as an exercise name', () => {
  initWith(freshState());
  // Simulate an un-migrated key arriving (e.g. from an old device's cloud blob)
  // directly in the day the cockpit is about to render.
  state.weeks['1'].lifts.mon['lift_abcd12'] = [
    { w: '120', r: '5', c: true }, { w: '120', r: '5', c: true },
  ];
  state.weeks['1'].liftOrder.mon = ['lift_abcd12'];

  // Spy on every card element the render path builds so we can read its HTML
  // (appendChild is a no-op in the stub, so cards aren't reachable otherwise).
  const created = [];
  const origCreate = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => { const el = origCreate(tag); created.push(el); return el; };
  try {
    workout.renderWorkout();
  } finally {
    globalThis.document.createElement = origCreate;
  }

  const html = created.map(el => el.innerHTML || '').join('\n');
  // The visible exercise name is the cockpit-ex-name span. The raw id may still
  // appear in data-liftname (the internal handle used to key logging), but it
  // must never be the displayed NAME.
  const names = [...html.matchAll(/<span class="cockpit-ex-name">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.ok(names.includes('Unknown exercise'), 'honest fallback label is the displayed name');
  assert.equal(names.some(n => /lift_/.test(n)), false, 'raw internal id is never the displayed name');
});

test('workout card carries prior sets across program archives and exercise aliases', () => {
  initWith(freshState());
  state.weeks['1'].lifts.mon['Bench Press'] = [{ w: '', r: '', c: false }];
  state.weeks['1'].liftOrder.mon = ['Bench Press'];
  state.weeks['arch:old:1'] = {
    activationId: 'old', programId: 'old_program',
    dates: { tue: '2026-07-18' },
    lifts: { tue: { 'Barbell Bench Press': [{ w: '80', r: '5', c: true }] } },
    runs: {}, notes: {}, gymRpe: {}, gymStats: {},
  };

  const created = [];
  const origCreate = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => { const el = origCreate(tag); created.push(el); return el; };
  try {
    workout.renderWorkout();
  } finally {
    globalThis.document.createElement = origCreate;
  }

  const benchCard = created.find((el) => /cockpit-ex-name">Bench Press</.test(el.innerHTML || ''));
  assert.ok(benchCard, 'current program Bench Press card renders');
  assert.match(benchCard.innerHTML, /Last session: \[ 80kg × 5 \]/);
  assert.doesNotMatch(benchCard.innerHTML, /First time logging/);
});

test('pairAsSuperset / unpairSuperset tag and clear a shared groupId', () => {
  initWith(freshState());
  workout.appendCustomSetRow(null, 'Bench');
  workout.appendCustomSetRow(null, 'Row');
  workout.pairAsSuperset('Bench', 'Row');
  const meta = state.weeks['1'].liftMeta.mon;
  assert.equal(meta.Bench.groupId, 'A');
  assert.equal(meta.Row.groupId, 'A');
  workout.unpairSuperset('Bench');
  assert.equal(meta.Bench.groupId, undefined);
  assert.equal(meta.Row.groupId, undefined);
});
