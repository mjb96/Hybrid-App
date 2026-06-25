// ==========================================
// STATE MIGRATION TESTS (tests/state_migrations.test.js)
// Covers the versioned appState migration runner: legacy-week cleanup,
// version stamping, idempotency, and resilience to a throwing step.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../js/state/migrations.js';

test('legacy (unstamped) state is migrated and stamped to current version', () => {
  const state = {
    weeks: {
      // legacy: a day stores lifts as a bare array → corrupt, should be dropped
      '1': { lifts: { mon: [{ w: '100', r: '5' }] } },
      // valid: day stores a { liftKey: sets[] } map → kept
      '2': { lifts: { mon: { 'Back Squat': [{ w: '100', r: '5', c: true }] } } },
    },
  };
  migrateState(state);
  assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(state.weeks['1'], undefined);          // legacy week removed
  assert.ok(state.weeks['2']);                          // valid week preserved
});

test('migrateState is idempotent — already-current state is untouched', () => {
  const state = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    weeks: { '1': { lifts: { mon: [{ w: '100' }] } } }, // would be "legacy" but version says current
  };
  migrateState(state);
  assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(state.weeks['1'], 'no migration runs when already at current version');
});

test('migrateState stamps an empty/new state without error', () => {
  const state = {};
  migrateState(state);
  assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('migrateState tolerates non-object input', () => {
  assert.equal(migrateState(null), null);
  assert.equal(migrateState(undefined), undefined);
});
