// @ts-check
// =============================================================================
// REST TIMER PAUSE — roadmap Phase 2A
// ("Keep rest timing attached to the active exercise/set, with obvious
//  pause/skip/adjust controls.")
//
// The bar had −30s, +30s and Done, but no pause — while rendering a decorative
// "⏸ REST" label that looked exactly like one. A control that appears to exist
// and does nothing is worse than an absent control: you press it, nothing
// happens, and you learn not to trust the bar.
//
// Rest is not always uninterrupted. Without pause the only options were to
// watch the countdown run out or dismiss it and lose the prescription.
//
// These tests pin the state machine, especially the leaks between sets: a pause
// held into the next set would silently stop that set's rest from counting down
// at all, which is the failure this feature could most easily introduce.
// =============================================================================
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

// timers.js reads the DOM through document.getElementById only, so a tiny
// registry stub is enough — and keeps this a logic test, with the real bar
// exercised by scripts/rest-timer-browser-check.mjs.
function makeNode(id) {
  const classes = new Set();
  const attrs = {};
  return {
    id,
    textContent: '',
    style: {},
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    appendChild: () => {},
  };
}

let nodes;
globalThis.document = /** @type {any} */ ({
  getElementById: (id) => nodes[id] || null,
  querySelector: () => null,
  hidden: false,
});

const { triggerRestTimerEngine, toggleRestPause, isRestPaused, dismissRestTimer,
  adjustRestDuration, setRestTimerEnabled } = await import('../js/timers.js');

const bar = () => nodes.cockpitTimerBar;
const pauseBtn = () => nodes.restPauseBtn;

beforeEach(() => {
  nodes = {
    cockpitTimerBar: makeNode('cockpitTimerBar'),
    cockpitTimerClock: makeNode('cockpitTimerClock'),
    restProgressFill: makeNode('restProgressFill'),
    restPauseBtn: makeNode('restPauseBtn'),
  };
  if (typeof setRestTimerEnabled === 'function') setRestTimerEnabled(true);
  dismissRestTimer();
});

test('pausing an idle bar does nothing — there is no rest to hold', () => {
  assert.equal(toggleRestPause(), false);
  assert.equal(isRestPaused(), false);
});

test('pause holds the countdown, and pressing again resumes it', () => {
  triggerRestTimerEngine('Back Squat', null, '');
  assert.equal(isRestPaused(), false, 'a new rest starts running');

  assert.equal(toggleRestPause(), true);
  assert.equal(isRestPaused(), true);

  assert.equal(toggleRestPause(), false);
  assert.equal(isRestPaused(), false);
  dismissRestTimer();
});

test('the label says which state it is in, and exposes it to assistive tech', () => {
  triggerRestTimerEngine('Back Squat', null, '');
  assert.equal(pauseBtn().textContent, '⏸ REST');
  assert.equal(pauseBtn().getAttribute('aria-pressed'), 'false');

  toggleRestPause();
  assert.equal(pauseBtn().textContent, '▶ PAUSED');
  assert.equal(pauseBtn().getAttribute('aria-pressed'), 'true');
  assert.match(pauseBtn().getAttribute('aria-label'), /resume/i);
  // A held countdown must not be styled like a running one.
  assert.equal(bar().classList.contains('rest-paused'), true);

  toggleRestPause();
  assert.equal(pauseBtn().textContent, '⏸ REST');
  assert.equal(bar().classList.contains('rest-paused'), false);
  dismissRestTimer();
});

// ---- the leaks worth guarding ------------------------------------------------

test('a pause never carries into the next set', () => {
  // The failure this feature could most easily introduce: the next set's rest
  // starts already held, so it never counts down and the athlete waits forever.
  triggerRestTimerEngine('Back Squat', null, '');
  toggleRestPause();
  assert.equal(isRestPaused(), true);

  triggerRestTimerEngine('Back Squat', null, '');
  assert.equal(isRestPaused(), false, 'a new set always starts running');
  assert.equal(pauseBtn().textContent, '⏸ REST');
  dismissRestTimer();
});

test('dismissing clears the pause with the rest it belonged to', () => {
  triggerRestTimerEngine('Back Squat', null, '');
  toggleRestPause();
  dismissRestTimer();
  assert.equal(isRestPaused(), false);
  assert.equal(bar().classList.contains('rest-paused'), false);
  assert.equal(pauseBtn().getAttribute('aria-pressed'), 'false');
});

test('adjusting while paused keeps it paused', () => {
  // +30s is a correction to the prescription, not a request to start counting.
  triggerRestTimerEngine('Back Squat', null, '');
  toggleRestPause();
  adjustRestDuration(30);
  assert.equal(isRestPaused(), true, 'adjusting must not secretly resume');
  dismissRestTimer();
});

test('a finished countdown cannot be paused', () => {
  // Holding a completed timer would display a frozen 0:00 as if rest were still
  // owed. Simulated by adjusting the remaining time down past zero.
  triggerRestTimerEngine('Lateral Raise', null, ''); // 90s isolation tier
  adjustRestDuration(-600);
  adjustRestDuration(-600);
  assert.equal(toggleRestPause(), false);
  assert.equal(isRestPaused(), false);
  dismissRestTimer();
});
