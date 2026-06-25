// @ts-check
// =============================================================================
// STATE MIGRATIONS (js/state/migrations.js)
//
// Versioned, ordered upgrades for the persisted appState blob. Before this
// existed, schema changes were a hand-maintained list of `if (!state.x)`
// backfills with no version stamp, so there was no safe way to transform
// existing data (only add missing keys). This adds:
//
//   • CURRENT_SCHEMA_VERSION — bump when you add a migration.
//   • MIGRATIONS[i] upgrades state FROM version i TO version i+1.
//   • migrateState(state) runs every pending migration in order, then stamps
//     state.schemaVersion. Idempotent: re-running on an up-to-date state is a
//     no-op. A throwing migration is logged and skipped so one bad step can't
//     brick load.
//
// Legacy data (no schemaVersion) is treated as version 0.
// Pure module — no DOM, unit-tested in tests/state_migrations.test.js.
// =============================================================================

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Append-only. Never renumber or reorder existing entries.
/** @type {Array<(state: any) => void>} */
const MIGRATIONS = [
  // v0 → v1: drop corrupt pre-id-map week objects that stored a day's lifts as
  // a bare array instead of a { liftKey: sets[] } map. They can't be rendered
  // and break tonnage/PR maths, so they were already being deleted ad-hoc on
  // every load — now it's a one-time, versioned step.
  (state) => {
    if (!state.weeks) return;
    for (const wk of Object.keys(state.weeks)) {
      const wd = state.weeks[wk];
      if (!wd || !wd.lifts) continue;
      const isLegacy = DAY_KEYS.some(d => Array.isArray(wd.lifts[d]));
      if (isLegacy) delete state.weeks[wk];
    }
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS.length; // 1

/**
 * Apply every pending migration in order, then stamp the current version.
 * @param {any} state
 * @returns {any} the same (mutated) state
 */
export function migrateState(state) {
  if (!state || typeof state !== 'object') return state;
  let from = Number.isInteger(state.schemaVersion) ? state.schemaVersion : 0;
  if (from < 0) from = 0;
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) continue;
    try {
      step(state);
    } catch (err) {
      console.error(`State migration to v${v + 1} failed; skipping:`, err);
    }
  }
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  return state;
}
