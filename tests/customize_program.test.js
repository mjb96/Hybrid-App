// ==========================================
// CUSTOMIZE / FORK PROGRAM TEST (tests/customize_program.test.js)
// B1 — "Customize this program" forks ANY program (catalog or custom) into an
// editable copy in customPrograms, without mutating the original. Run with
// `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setAppState, appState, duplicateCustomProgram, getProgramById } from '../js/state.js';

// A node-safe localStorage shim so saveStateToLocalStorage() doesn't throw.
if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
}

const baseState = () => ({ customPrograms: [], settings: {} });
const CATALOG_ID = 'stronglifts_5x5'; // catalog-only program with a full days map

test('forks a catalog program into an editable custom copy', () => {
  setAppState(baseState());
  const newId = duplicateCustomProgram(CATALOG_ID);

  assert.ok(newId && newId.startsWith('prog_'), 'returns the new fork id');
  const fork = appState.customPrograms.find(p => p.id === newId);
  assert.ok(fork, 'fork lands in customPrograms');

  // The trainable shape carries over so it loads as real workouts.
  assert.ok(fork.days && fork.days.mon, 'days map carried over from catalog');
  assert.ok(
    fork.weeklyVolModifiers && Object.keys(fork.weeklyVolModifiers).length > 0,
    'weekly progression carried over',
  );

  // Re-authored to the user, name marked as a copy.
  assert.equal(fork.dossier.creator, 'You');
  assert.equal(fork.author?.name, 'You');
  assert.equal(fork.author?.verified, false);
  assert.match(fork.name, /Copy/);
});

test('forking does not mutate the original catalog program', () => {
  setAppState(baseState());
  const before = JSON.stringify(getProgramById(CATALOG_ID));
  duplicateCustomProgram(CATALOG_ID);
  const after = JSON.stringify(getProgramById(CATALOG_ID));
  assert.equal(before, after, 'catalog source is untouched by the fork');
});

test('the fork is independently editable (deep clone, not a reference)', () => {
  setAppState(baseState());
  const newId = duplicateCustomProgram(CATALOG_ID);
  const fork = appState.customPrograms.find(p => p.id === newId);

  fork.days.mon.lifts.push('Face Pull'); // edit the fork
  const original = getProgramById(CATALOG_ID);
  assert.ok(
    !(original.days?.mon?.lifts || []).includes('Face Pull'),
    'editing the fork does not leak into the catalog program',
  );
});
