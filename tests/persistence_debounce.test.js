// ==========================================
// PERSISTENCE DEBOUNCE TEST (tests/persistence_debounce.test.js)
// ------------------------------------------
// Workout logging used to serialise the ENTIRE appState to localStorage on
// every weight/rep keystroke. These prove:
//   • scheduleLocalSave() coalesces a burst of edits into ONE write;
//   • a debounced flush always writes the CURRENT state (no stale writes);
//   • critical saves (saveStateToLocalStorage) persist immediately;
//   • flushLocalSave() drains a pending write (app-close crash safety).
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';

// Fake localStorage that counts writes — installed BEFORE state.js evaluates.
let writes = 0;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { writes++; store.set(k, String(v)); },
  removeItem: (k) => store.delete(k),
};

const state = await import('../js/state.js');
const { setAppState, appState: _initial, scheduleLocalSave, flushLocalSave, saveStateToLocalStorage, STORAGE_KEY } = state;

function baseState() {
  return { currentWeek: '1', weeks: {}, settings: {}, loadMetrics: { atl: 0, ctl: 0 } };
}
function persisted() {
  const raw = store.get(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

test('scheduleLocalSave coalesces a burst into a single write', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  setAppState(baseState());
  writes = 0;
  for (let i = 0; i < 20; i++) scheduleLocalSave(); // 20 "keystrokes"
  assert.equal(writes, 0, 'nothing written synchronously while debouncing');
  mock.timers.tick(400);
  assert.equal(writes, 1, 'exactly one coalesced local write');
  mock.timers.reset();
});

test('a debounced flush persists the CURRENT state, never a stale snapshot', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const s = baseState();
  setAppState(s);
  writes = 0;
  scheduleLocalSave();
  // Mutate after scheduling but before the timer fires.
  s.weeks['1'] = { lifts: { Squat: [{ w: '100', r: '5', c: true }] } };
  mock.timers.tick(400);
  assert.equal(writes, 1);
  assert.equal(persisted().weeks['1'].lifts.Squat[0].w, '100', 'flush wrote the latest edit');
  mock.timers.reset();
});

test('flushLocalSave drains a pending write immediately (crash safety)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  setAppState(baseState());
  writes = 0;
  scheduleLocalSave();
  assert.equal(writes, 0);
  flushLocalSave();
  assert.equal(writes, 1, 'pending write drained without waiting for the timer');
  // A second flush with nothing pending is a no-op.
  flushLocalSave();
  assert.equal(writes, 1);
  mock.timers.reset();
});

test('critical save writes immediately and cancels a pending debounce', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  setAppState(baseState());
  writes = 0;
  scheduleLocalSave();          // pending debounced write
  await saveStateToLocalStorage(true); // critical: should write now + cancel pending
  assert.equal(writes, 1, 'immediate write happened');
  mock.timers.tick(400);
  assert.equal(writes, 1, 'the superseded debounce did not double-write');
  mock.timers.reset();
});
