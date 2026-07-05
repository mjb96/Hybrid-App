// ==========================================
// RESEED PRESCRIPTION TEST (tests/reseed_prescription.test.js)
// UX audit 2.1 — when a week is seeded under program A and then the active
// program switches to program B, an *unlogged* lift shared by both programs must
// be re-prescribed to B's set count. Otherwise the cockpit renders A's rows
// under B's "Target: N × M" label (the "Target 3 × 8 but 4 rows" bug seen right
// after onboarding, because boot seeds week 1 under the default program).
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  setAppState, appState,
  verifyWeekStorageSchema, reseedActiveProgramIntoWeek,
} from '../js/state.js';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
}

// Two programs that share a lift name with no inline (N×M) spec in the desc, so
// liftTarget falls through to each program's week-1 modifier.
const progA = {
  id: 'progA', name: 'A', totalWeeks: 4,
  days: { mon: { title: 'Push', desc: 'Bench focus.', runs: 'Rest', lifts: ['Bench Press'] } },
  weeklyVolModifiers: { '1': { sets: 4, reps: 5, intensityLabel: 'A' } },
};
const progB = {
  id: 'progB', name: 'B', totalWeeks: 4,
  days: { mon: { title: 'Push', desc: 'Bench focus.', runs: 'Rest', lifts: ['Bench Press'] } },
  weeklyVolModifiers: { '1': { sets: 3, reps: 8, intensityLabel: 'B' } },
};

function freshState(activeId) {
  return {
    activeProgramId: activeId,
    customPrograms: [structuredClone(progA), structuredClone(progB)],
    settings: {},
    weeks: {},
  };
}

test('switching programs re-prescribes an unlogged shared lift to the new set count', () => {
  setAppState(freshState('progA'));
  // Seed week 1 under program A (4 sets).
  verifyWeekStorageSchema('1');
  assert.equal(appState.weeks['1'].lifts.mon['Bench Press'].length, 4, 'seeded under A → 4 rows');

  // Switch active program to B (3 sets) and reseed.
  appState.activeProgramId = 'progB';
  reseedActiveProgramIntoWeek('1');

  assert.equal(
    appState.weeks['1'].lifts.mon['Bench Press'].length, 3,
    'unlogged shared lift re-prescribed to B → 3 rows (matches the cockpit label)',
  );
});

test('a lift with logged data is preserved across a program switch', () => {
  setAppState(freshState('progA'));
  verifyWeekStorageSchema('1');

  // Log real data into the shared lift (mark a set complete with a weight).
  const sets = appState.weeks['1'].lifts.mon['Bench Press'];
  sets[0].w = 60; sets[0].r = 5; sets[0].c = true;
  const loggedLen = sets.length;

  appState.activeProgramId = 'progB';
  reseedActiveProgramIntoWeek('1');

  const after = appState.weeks['1'].lifts.mon['Bench Press'];
  assert.equal(after.length, loggedLen, 'logged lift keeps its rows (never re-prescribed)');
  assert.equal(after[0].c, true, 'logged set preserved');
  assert.equal(after[0].w, 60, 'logged weight preserved');
});
