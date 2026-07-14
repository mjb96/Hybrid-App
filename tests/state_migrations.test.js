// ==========================================
// STATE MIGRATION TESTS (tests/state_migrations.test.js)
// Covers the versioned appState migration runner: legacy-week cleanup,
// version stamping, idempotency, transactional rollback, and safe retry.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  migrateState,
  CURRENT_SCHEMA_VERSION,
  StateMigrationError,
} from '../js/state/migrations.js';

function fixtureAtVersion(version) {
  const commonWeek = {
    lifts: { mon: { 'Back Squat': [{ w: '100', r: '5', c: true }] } },
    runs: { mon: { dist: '5', time: '25:00', rpe: '6' } },
    dates: { mon: '2026-06-01' },
  };
  if (version === 0) {
    return {
      schemaVersion: 0,
      weeks: {
        corrupt: { lifts: { mon: [{ w: '80', r: '5' }] } },
        '1': commonWeek,
      },
    };
  }
  if (version === 1) {
    return {
      schemaVersion: 1,
      liftNames: { lift_ab12: 'Back Squat' },
      weeks: {
        '1': {
          ...commonWeek,
          lifts: { mon: { lift_ab12: [{ w: '100', r: '5', c: true }] } },
        },
      },
    };
  }
  if (version === 2) return { schemaVersion: 2, weeks: { '1': commonWeek } };
  return {
    schemaVersion: 3,
    activeActivationId: 'act_existing',
    activations: [{ id: 'act_existing' }],
    weeks: { '1': { ...commonWeek, activationId: 'act_existing' } },
  };
}

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

test('every migration step rolls back partial mutations and remains retryable', () => {
  for (let version = 0; version < CURRENT_SCHEMA_VERSION; version++) {
    const state = fixtureAtVersion(version);
    const originalBytes = JSON.stringify(state);

    assert.throws(
      () => migrateState(state, {
        afterStep: ({ fromVersion, state: candidate }) => {
          assert.equal(fromVersion, version);
          candidate.faultInjected = true;
          throw new Error(`fault at v${version}`);
        },
      }),
      (error) => error instanceof StateMigrationError &&
        error.fromVersion === version && error.toVersion === version + 1,
    );

    assert.equal(JSON.stringify(state), originalBytes, `v${version} input must remain byte-for-byte recoverable`);
    assert.equal(state.schemaVersion, version, `v${version} must not be stamped after failure`);

    assert.doesNotThrow(() => migrateState(state), `v${version} should succeed on retry`);
    assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
  }
});

test('validation failure cannot commit a completed step or current version', () => {
  const state = fixtureAtVersion(3);
  const originalBytes = JSON.stringify(state);

  assert.throws(() => migrateState(state, {
    afterStep: ({ state: candidate }) => {
      candidate.weeks['1'].runSessions.mon = {};
    },
  }), StateMigrationError);

  assert.equal(JSON.stringify(state), originalBytes);
  assert.equal(state.schemaVersion, 3);
});

test('legacy fixture corpus reaches current schema and is idempotent', () => {
  for (let version = 0; version < CURRENT_SCHEMA_VERSION; version++) {
    const state = fixtureAtVersion(version);
    migrateState(state);
    assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION, `fixture v${version}`);
    const migratedBytes = JSON.stringify(state);
    migrateState(state);
    assert.equal(JSON.stringify(state), migratedBytes, `fixture v${version} must be idempotent`);
  }
});

test('future schema is never downgraded or overwritten', () => {
  const state = { schemaVersion: CURRENT_SCHEMA_VERSION + 1, futureField: { keep: true } };
  const originalBytes = JSON.stringify(state);
  assert.throws(() => migrateState(state), StateMigrationError);
  assert.equal(JSON.stringify(state), originalBytes);
});
