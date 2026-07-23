// ==========================================
// CUSTOMIZE / FORK PROGRAM TEST (tests/customize_program.test.js)
// B1 — "Customize this program" forks ANY program (catalog or custom) into an
// editable copy in customPrograms, without mutating the original. Run with
// `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  setAppState, appState, duplicateCustomProgram, getProgramById,
  isCustomProgram, findPersonalCopyOfSource,
} from '../js/state.js';

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

// ==========================================
// STABLE-IDENTITY EDITING (the "editing creates a duplicate that shows the old
// exercises" report). A personal program edits in place; a built-in forks ONCE.
// ==========================================

test('a fork of a built-in records its source, and re-customizing reuses that copy', () => {
  setAppState(baseState());
  const copyId = duplicateCustomProgram(CATALOG_ID);

  assert.equal(getProgramById(copyId).sourceProgramId, CATALOG_ID, 'fork remembers its origin');
  assert.equal(isCustomProgram(copyId), true, 'the fork is an editable personal program');
  assert.equal(isCustomProgram(CATALOG_ID), false, 'the built-in template is not editable in place');

  const reuse = findPersonalCopyOfSource(CATALOG_ID);
  assert.ok(reuse && reuse.id === copyId, 'a second Customize resolves the existing copy, not a new clone');
});

test('editing a personal program in place does not add another My Programs entry', () => {
  setAppState(baseState());
  const copyId = duplicateCustomProgram(CATALOG_ID);
  const countAfterFork = appState.customPrograms.length;

  // Editing in place = mutate the same record the editor loaded (getProgramById).
  const editing = getProgramById(copyId);
  editing.days.mon.lifts = ['Dumbbell Bench Press', 'Barbell Row', 'Face Pulls'];

  assert.equal(appState.customPrograms.length, countAfterFork, 'no new card is created by an in-place edit');
  // Every reader resolves the same edited definition.
  assert.deepEqual(getProgramById(copyId).days.mon.lifts, ['Dumbbell Bench Press', 'Barbell Row', 'Face Pulls']);
  assert.deepEqual(
    appState.customPrograms.find(p => p.id === copyId).days.mon.lifts,
    ['Dumbbell Bench Press', 'Barbell Row', 'Face Pulls'],
    'the My Programs record and the editor resolve the same object',
  );
});

test('a copy of a personal program inherits the original source, so it still de-dupes', () => {
  setAppState(baseState());
  const copyId = duplicateCustomProgram(CATALOG_ID);
  const copyOfCopy = duplicateCustomProgram(copyId);
  assert.equal(getProgramById(copyOfCopy).sourceProgramId, CATALOG_ID,
    'a copy-of-a-copy still points at the built-in origin, not the intermediate custom id');
});

test('a user-created program (no source) is edited in place and never treated as a template', () => {
  setAppState(baseState());
  appState.customPrograms.push({ id: 'prog_user', name: 'My Plan', totalWeeks: 8, days: { mon: { lifts: ['Bench Press'] } }, weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: '' } } });
  assert.equal(isCustomProgram('prog_user'), true);
  assert.equal(findPersonalCopyOfSource('prog_user'), null, 'a personal program is not a source others fork from');
});
