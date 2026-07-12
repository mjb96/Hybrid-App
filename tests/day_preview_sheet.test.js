// ==========================================
// DAY-PREVIEW SHEET LIFECYCLE TESTS (tests/day_preview_sheet.test.js)
//
// Regression coverage for the program-day preview bottom-sheet a11y + scroll
// lifecycle (js/programs/detail.js): background scroll lock, exact scroll
// restoration on close, inner-scroll reset on a fresh open (header visible) vs
// preservation on a same-day week-step, focus in/out, Escape + Android-back
// (popstate) dismissal.
//
// Runs detail.js headless against a minimal, controllable DOM/window/history
// stub (as workout_logging.test.js does for workout.js).
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test, before, beforeEach } from 'node:test';

const noop = () => {};

// ── Stub element ──────────────────────────────────────────────────────────────
function makeEl(id = '') {
  const classes = new Set();
  const el = {
    id,
    style: {},
    _scrollTop: 0,
    focused: false,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    appendChild: (c) => c, removeChild: noop, remove: noop, insertBefore: (c) => c,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    scrollTo: function (x, y) { this._scrollTop = (typeof x === 'object' ? (x.top || 0) : (y || 0)); },
    focus: function () { CURRENT.active = this; this.focused = true; },
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: (c) => classes.has(c),
      toggle: noop,
    },
    querySelector: (sel) => {
      if (sel === '.sheet-close-btn') { if (!el._closeBtn) el._closeBtn = makeEl('closeBtn'); return el._closeBtn; }
      return null;
    },
    querySelectorAll: () => [],
  };
  Object.defineProperty(el, 'scrollTop', { get() { return this._scrollTop; }, set(v) { this._scrollTop = v; } });
  let h = '', t = '';
  Object.defineProperty(el, 'innerHTML', { get: () => h, set: (x) => { h = String(x); } });
  Object.defineProperty(el, 'textContent', { get: () => t, set: (x) => { t = String(x); } });
  return el;
}

// Shared mutable harness the stubs read/write.
const CURRENT = { active: null };
let detail;
let els;           // id -> element
let winListeners;  // event -> [fn]
let docListeners;
let scrollToCalls;
let historyStack;

before(async () => {
  els = new Map();
  const getEl = (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };

  winListeners = {};
  docListeners = {};
  scrollToCalls = [];
  historyStack = [{ n: 0 }];

  const body = makeEl('body');

  globalThis.document = {
    getElementById: getEl,
    createElement: () => makeEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => { (docListeners[ev] ||= []).push(fn); },
    removeEventListener: (ev, fn) => { docListeners[ev] = (docListeners[ev] || []).filter(f => f !== fn); },
    body,
    get activeElement() { return CURRENT.active; },
  };

  globalThis.window = {
    scrollY: 0,
    scrollTo: (x, y) => { scrollToCalls.push(y); globalThis.window.scrollY = y; },
    addEventListener: (ev, fn) => { (winListeners[ev] ||= []).push(fn); },
    removeEventListener: (ev, fn) => { winListeners[ev] = (winListeners[ev] || []).filter(f => f !== fn); },
  };

  globalThis.history = {
    get length() { return historyStack.length; },
    pushState: (s) => { historyStack.push(s); },
    back: () => {
      historyStack.pop();
      (winListeners['popstate'] || []).slice().forEach(fn => fn({ state: historyStack[historyStack.length - 1] }));
    },
  };

  detail = await import('../js/programs/detail.js');
});

beforeEach(() => {
  // Reset per-test view state: close any open sheet, clear scroll + focus.
  try { detail.closeDayPreviewModal(); } catch (_) {}
  els.forEach(e => { e.classList.remove('active'); e._scrollTop = 0; });
  document.body.classList.remove('sheet-scroll-locked');
  document.body.style.top = '';
  CURRENT.active = null;
  globalThis.window.scrollY = 0;
  scrollToCalls.length = 0;
  historyStack = [{ n: 0 }];
});

const PID = 'hybridhq_foundations';
const dispatch = (bucket, ev, arg) => (bucket[ev] || []).slice().forEach(fn => fn(arg));

test('open locks background scroll at the current position and pins body top', () => {
  globalThis.window.scrollY = 1200;
  detail.openDayPreviewModal('mon', PID, 1);
  assert.equal(document.body.classList.contains('sheet-scroll-locked'), true);
  assert.equal(document.body.style.top, '-1200px');
  assert.equal(els.get('wpmSheet').classList.contains('active'), true);
  assert.equal(els.get('wpmBackdrop').classList.contains('active'), true);
});

test('open moves focus into the sheet (close button)', () => {
  const trigger = makeEl('dayBtn'); trigger.focus();
  detail.openDayPreviewModal('mon', PID, 1);
  const sheet = els.get('wpmSheet');
  assert.equal(CURRENT.active, sheet._closeBtn, 'focus is the sheet close button');
});

test('open resets the inner scroll to the top (header/first exercise visible)', () => {
  const bodyEl = els.get('wpmBody');
  bodyEl.scrollTop = 250;
  detail.openDayPreviewModal('mon', PID, 1);
  assert.equal(bodyEl.scrollTop, 0);
});

test('week-step preserves the inner scroll position (same day, different week)', () => {
  detail.openDayPreviewModal('mon', PID, 1);
  const bodyEl = els.get('wpmBody');
  bodyEl.scrollTop = 180;              // reader scrolled down
  detail.stepPreviewWeek(1);           // step to next week
  assert.equal(bodyEl.scrollTop, 180, 'position kept while stepping weeks');
  // Still a single lock — no re-push of history on a re-render.
  assert.equal(document.body.classList.contains('sheet-scroll-locked'), true);
});

test('close restores the exact prior document scroll position and unlocks', () => {
  globalThis.window.scrollY = 1400;
  detail.openDayPreviewModal('mon', PID, 1);
  detail.closeDayPreviewModal();
  assert.equal(document.body.classList.contains('sheet-scroll-locked'), false);
  assert.equal(document.body.style.top, '');
  assert.equal(scrollToCalls[scrollToCalls.length - 1], 1400);
  assert.equal(els.get('wpmSheet').classList.contains('active'), false);
});

test('close returns focus to the triggering element', () => {
  const trigger = makeEl('dayBtn');
  trigger.getAttribute = (a) => (a === 'data-day' ? 'mon' : a === 'data-program-id' ? PID : null);
  trigger.focus();
  // Simulate the real action path, which captures the clicked day button.
  detail.handleDetailAction('open-day-preview', trigger);
  // sanity: focus left the trigger for the sheet
  assert.notEqual(CURRENT.active, trigger);
  detail.closeDayPreviewModal();
  assert.equal(CURRENT.active, trigger, 'focus returned to the day button');
});

test('Escape closes the sheet', () => {
  detail.openDayPreviewModal('mon', PID, 1);
  assert.equal(els.get('wpmSheet').classList.contains('active'), true);
  dispatch(docListeners, 'keydown', { key: 'Escape' });
  assert.equal(els.get('wpmSheet').classList.contains('active'), false);
});

test('Android/browser Back (popstate) closes the sheet', () => {
  detail.openDayPreviewModal('mon', PID, 1);
  const lenWhileOpen = history.length;
  assert.equal(els.get('wpmSheet').classList.contains('active'), true);
  history.back(); // fires popstate
  assert.equal(els.get('wpmSheet').classList.contains('active'), false);
  assert.equal(document.body.classList.contains('sheet-scroll-locked'), false);
  assert.ok(history.length < lenWhileOpen, 'the pushed history entry is consumed');
});

test('an explicit open pushes exactly one history entry; close pops it', () => {
  const before = history.length;
  detail.openDayPreviewModal('mon', PID, 1);
  assert.equal(history.length, before + 1);
  detail.closeDayPreviewModal();
  assert.equal(history.length, before, 'no leftover history entry after close');
});

test('re-opening after close resets scroll again and re-locks', () => {
  globalThis.window.scrollY = 900;
  detail.openDayPreviewModal('mon', PID, 1);
  detail.closeDayPreviewModal();
  const bodyEl = els.get('wpmBody');
  bodyEl.scrollTop = 300;
  globalThis.window.scrollY = 500;
  detail.openDayPreviewModal('wed', PID, 1);
  assert.equal(bodyEl.scrollTop, 0, 'fresh open starts at the top');
  assert.equal(document.body.style.top, '-500px', 're-locked at the new scroll position');
});

test('double close is a safe no-op (no throw, no stray scrollTo)', () => {
  detail.openDayPreviewModal('mon', PID, 1);
  detail.closeDayPreviewModal();
  const calls = scrollToCalls.length;
  assert.doesNotThrow(() => detail.closeDayPreviewModal());
  assert.equal(scrollToCalls.length, calls, 'second close does nothing');
});
