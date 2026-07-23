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
  isCustomProgram, findPrimaryCustomization, adoptLegacyPrimaryCustomization,
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

// The first Customize of a built-in is modelled by a primary fork; the explicit
// Duplicate action is modelled by a default (variant) copy.
const forkPrimary = (id) => duplicateCustomProgram(id, { primary: true });

test('first customization of a built-in creates the one primary copy', () => {
  setAppState(baseState());
  const primaryId = forkPrimary(CATALOG_ID);

  assert.equal(getProgramById(primaryId).sourceProgramId, CATALOG_ID, 'fork remembers its origin');
  assert.equal(getProgramById(primaryId).isPrimaryCustomization, true, 'it is the primary customization');
  assert.equal(isCustomProgram(primaryId), true, 'the fork is an editable personal program');
  assert.equal(isCustomProgram(CATALOG_ID), false, 'the built-in template is not editable in place');
});

test('re-customizing reopens the same primary, resolved by flag not array order', () => {
  setAppState(baseState());
  const primaryId = forkPrimary(CATALOG_ID);
  const found = findPrimaryCustomization(CATALOG_ID);
  assert.ok(found && found.id === primaryId, 'Customize resolves the explicit primary');
});

test('duplicating the primary produces an independent variant that Customize never selects', () => {
  setAppState(baseState());
  const primaryId = forkPrimary(CATALOG_ID);
  const variantId = duplicateCustomProgram(primaryId); // default = variant

  assert.notEqual(variantId, primaryId, 'the variant is a separate program');
  assert.equal(getProgramById(variantId).sourceProgramId, CATALOG_ID, 'variant keeps source attribution');
  assert.equal(getProgramById(variantId).isPrimaryCustomization, false, 'variant is explicitly not primary');
  assert.equal(findPrimaryCustomization(CATALOG_ID).id, primaryId, 'Customize still opens the primary, never the variant');
});

test('editing the variant updates it in place and never touches the primary', () => {
  setAppState(baseState());
  const primaryId = forkPrimary(CATALOG_ID);
  const variantId = duplicateCustomProgram(primaryId);
  const count = appState.customPrograms.length;

  getProgramById(variantId).days.mon.lifts = ['Face Pull'];
  assert.equal(appState.customPrograms.length, count, 'in-place edit adds no card');
  assert.deepEqual(getProgramById(variantId).days.mon.lifts, ['Face Pull']);
  assert.notDeepEqual(getProgramById(primaryId).days.mon.lifts, ['Face Pull'], 'the primary is unaffected');
});

test('deleting the primary is deterministic: Customize forks a fresh primary, ignoring variants', () => {
  setAppState(baseState());
  const primaryId = forkPrimary(CATALOG_ID);
  duplicateCustomProgram(primaryId); // a variant remains behind
  appState.customPrograms = appState.customPrograms.filter(p => p.id !== primaryId); // delete primary

  assert.equal(findPrimaryCustomization(CATALOG_ID), null, 'no primary after deletion');
  assert.equal(adoptLegacyPrimaryCustomization(CATALOG_ID), null, 'a deliberate variant is never promoted to primary');
});

test('legacy single copy (no flag) is adopted as the primary, idempotently', () => {
  setAppState(baseState());
  // Simulate a pre-isPrimaryCustomization copy: source set, flag undefined.
  appState.customPrograms.push({ id: 'prog_legacy', name: 'Old Copy', totalWeeks: 8, sourceProgramId: CATALOG_ID, days: { mon: { lifts: ['Bench Press'] } }, weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: '' } } });

  assert.equal(findPrimaryCustomization(CATALOG_ID), null, 'no explicit primary yet');
  assert.equal(adoptLegacyPrimaryCustomization(CATALOG_ID), 'prog_legacy', 'the lone legacy copy is adopted');
  assert.equal(findPrimaryCustomization(CATALOG_ID).id, 'prog_legacy', 'and now resolves as the primary');
  assert.equal(adoptLegacyPrimaryCustomization(CATALOG_ID), null, 'adoption is idempotent');
});

test('ambiguous legacy copies (two, no flag) are never guessed and do not crash', () => {
  setAppState(baseState());
  appState.customPrograms.push(
    { id: 'prog_l1', name: 'Old A', totalWeeks: 8, sourceProgramId: CATALOG_ID, days: { mon: { lifts: [] } }, weeklyVolModifiers: { '1': {} } },
    { id: 'prog_l2', name: 'Old B', totalWeeks: 8, sourceProgramId: CATALOG_ID, days: { mon: { lifts: [] } }, weeklyVolModifiers: { '1': {} } },
  );
  assert.equal(adoptLegacyPrimaryCustomization(CATALOG_ID), null, 'no arbitrary first-match adoption');
  assert.equal(findPrimaryCustomization(CATALOG_ID), null, 'still no primary; Customize would fork a fresh one');
});

test('a user-created program (no source) is not a customization template', () => {
  setAppState(baseState());
  appState.customPrograms.push({ id: 'prog_user', name: 'My Plan', totalWeeks: 8, days: { mon: { lifts: ['Bench Press'] } }, weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: '' } } });
  assert.equal(isCustomProgram('prog_user'), true);
  assert.equal(findPrimaryCustomization('prog_user'), null, 'a personal program is not a source others fork from');
});
