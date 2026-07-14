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

import { isInternalLiftId, UNKNOWN_LIFT_NAME } from './lift-id.js';
import { reportHandledError } from '../monitoring/report-error.js';
import { migrateLegacyRunSessions } from './run-sessions.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A set counts as real, keepable history once it's completed or carries an
// entered weight (mirrors state.liftHasLoggedData). Prescribed-but-untouched
// rows seed w:'' with only a rep target and must never block a merge.
function hasLoggedSets(sets) {
  return Array.isArray(sets) && sets.some(s =>
    s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1 ||
          (s.w !== '' && s.w != null)));
}

// Return `base`, or the first `base N` that isn't already a key of `obj`, so a
// recovered/unknown entry never silently overwrites an existing one.
function uniqueKey(obj, base) {
  if (!(base in obj)) return base;
  let i = 2;
  while (`${base} ${i}` in obj) i++;
  return `${base} ${i}`;
}

// Place an id-keyed set array under its resolved display `name`, merging safely
// with any entry already stored under that name. Returns the final key used.
//   • name free                         → straight rename.
//   • collision, id has history & name empty (fresh prescription) → history wins.
//   • collision, id has no history (empty stub)                    → drop the stub.
//   • collision, BOTH carry history      → never lose data: keep the existing
//     entry and retain the id-keyed history under a distinct, honest key.
function placeSets(dayLifts, name, sets, isUnresolved) {
  const existing = dayLifts[name];
  if (!Array.isArray(existing)) { dayLifts[name] = sets; return name; }
  if (existing === sets) return name;

  const sLogged = hasLoggedSets(sets);
  const eLogged = hasLoggedSets(existing);
  if (sLogged && !eLogged) { dayLifts[name] = sets; return name; }
  if (!sLogged) return name;

  const label = isUnresolved ? name : `${name} (recovered)`;
  const key = uniqueKey(dayLifts, label);
  dayLifts[key] = sets;
  return key;
}

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

  // v1 → v2: repair orphaned lift-identity keys. The removed "lift identity"
  // subsystem stored logged sets under generated ids (`lift_<base36>`) resolved
  // to a display name via `liftNames`/`liftIdMap`. Deleting the subsystem left
  // those id-keyed set arrays in place, so the raw id renders as the exercise
  // name and the completed sets leak into the day's workout as phantom "DONE"
  // rows. Here we rename each id key back to its real exercise name (still
  // recoverable from the persisted maps), merging with any existing name-keyed
  // entry without losing logged history; unresolvable ids fall back to an honest
  // "Unknown exercise" rather than the raw id or a silent delete. liftOrder and
  // liftMeta references are re-pointed, and derived exerciseStats id keys are
  // dropped (they recompute from the now-clean week data). Idempotent: a second
  // run finds no id-shaped keys.
  (state) => {
    const weeks = state.weeks;
    if (!weeks || typeof weeks !== 'object') return;

    // id -> display name, from the still-persisted legacy maps.
    const idToName = (state.liftNames && typeof state.liftNames === 'object') ? state.liftNames : {};
    const nameToId = (state.liftIdMap && typeof state.liftIdMap === 'object') ? state.liftIdMap : {};
    const idFromNameMap = {};
    for (const nm of Object.keys(nameToId)) {
      const id = nameToId[nm];
      if (typeof id === 'string' && !(id in idFromNameMap)) idFromNameMap[id] = nm;
    }
    const resolve = (id) => {
      const a = idToName[id];
      if (typeof a === 'string' && a.trim()) return a.trim();
      const b = idFromNameMap[id];
      if (typeof b === 'string' && b.trim()) return b.trim();
      return null;
    };

    let repaired = 0;
    let unresolved = 0;
    const touchedDays = [];

    for (const wk of Object.keys(weeks)) {
      const week = weeks[wk];
      if (!week || !week.lifts || typeof week.lifts !== 'object') continue;

      for (const day of Object.keys(week.lifts)) {
        const dayLifts = week.lifts[day];
        if (!dayLifts || typeof dayLifts !== 'object' || Array.isArray(dayLifts)) continue;

        const ids = Object.keys(dayLifts).filter(isInternalLiftId);
        if (ids.length === 0) continue;

        const remap = {}; // oldId -> finalKey (or null if the value was dropped)
        for (const id of ids) {
          const sets = dayLifts[id];
          // A non-array value under an id key is malformed leftover, not history.
          if (!Array.isArray(sets)) { delete dayLifts[id]; remap[id] = null; repaired++; continue; }

          let name = resolve(id);
          const isUnresolved = !name;
          if (isUnresolved) { name = UNKNOWN_LIFT_NAME; unresolved++; }

          const finalKey = placeSets(dayLifts, name, sets, isUnresolved);
          if (finalKey !== id) delete dayLifts[id];
          remap[id] = finalKey;
          repaired++;
        }

        // Re-point per-exercise meta (superset grouping) from ids to real names.
        const meta = week.liftMeta && week.liftMeta[day];
        if (meta && typeof meta === 'object') {
          for (const id of Object.keys(remap)) {
            if (meta[id] === undefined) continue;
            const finalKey = remap[id];
            if (finalKey && finalKey !== id && meta[finalKey] === undefined) meta[finalKey] = meta[id];
            if (finalKey !== id) delete meta[id];
          }
        }

        // Rebuild explicit display order against the live keys: map ids to their
        // final names, drop entries that no longer exist, de-dupe, then append
        // any keys the order didn't mention (recovered/unknown entries).
        if (week.liftOrder && Array.isArray(week.liftOrder[day])) {
          const seen = new Set();
          const newOrder = [];
          for (const entry of week.liftOrder[day]) {
            const mapped = (entry in remap) ? remap[entry] : entry;
            if (!mapped || !Array.isArray(dayLifts[mapped]) || seen.has(mapped)) continue;
            seen.add(mapped); newOrder.push(mapped);
          }
          for (const k of Object.keys(dayLifts)) {
            if (Array.isArray(dayLifts[k]) && !seen.has(k)) { seen.add(k); newOrder.push(k); }
          }
          week.liftOrder[day] = newOrder;
        }

        touchedDays.push(`${wk}/${day}`);
      }
    }

    // Derived per-exercise stats are keyed by display name; drop any id-keyed
    // leftovers (they recompute from the repaired week data on next load).
    if (state.exerciseStats && typeof state.exerciseStats === 'object') {
      for (const key of Object.keys(state.exerciseStats)) {
        if (!isInternalLiftId(key)) continue;
        const name = resolve(key);
        if (name && !state.exerciseStats[name]) state.exerciseStats[name] = state.exerciseStats[key];
        delete state.exerciseStats[key];
      }
    }

    // Observable, but not per-record spam and never carrying set contents or raw
    // ids: one summary when a repair actually happened. Visible in dev/CI,
    // scrubbed telemetry in production.
    if (repaired > 0) {
      reportHandledError('migration:v2-lift-id-repair', {
        message: 'Repaired legacy lift-identity-keyed workout entries',
        repaired, unresolved, days: touchedDays.length,
      });
    }
  },

  // v2 → v3: introduce PROGRAM ACTIVATION IDENTITY. Before this, logged training
  // was keyed only by program-week number + weekday, so switching programs reused
  // the previous program's week slots and its completed lifts leaked into the new
  // workout. Existing users have weeks with no owner. Here we adopt all current
  // weeks into ONE legacy activation for the active program and stamp it as the
  // active run, so today's data stays exactly where it is (no archival, no leak)
  // and only a FUTURE program switch begins a new, isolated run. Idempotent: a
  // state that already carries an activeActivationId is left untouched.
  (state) => {
    if (state.activeActivationId) return; // already migrated / freshly created
    const legacyId = `act_legacy_${Date.now().toString(36)}`;
    state.activeActivationId = legacyId;
    if (!Array.isArray(state.activations)) state.activations = [];
    state.activations.push({
      id: legacyId,
      programId: state.activeProgramId || null,
      startWeek: Math.max(1, parseInt(String(state.currentWeek), 10) || 1),
      startedAt: new Date().toISOString(),
      legacy: true,
    });
    let stamped = 0;
    const weeks = state.weeks;
    if (weeks && typeof weeks === 'object') {
      for (const wk of Object.keys(weeks)) {
        const week = weeks[wk];
        if (!week || typeof week !== 'object') continue;
        if (week.activationId) continue; // an archived key or already-owned slot
        week.activationId = legacyId;
        week.programId = state.activeProgramId || week.programId || null;
        stamped++;
      }
    }
    if (stamped > 0) {
      reportHandledError('migration:v3-activation-identity', {
        message: 'Adopted existing weeks into a legacy program activation',
        weeksStamped: stamped,
      });
    }
  },

  // v3 → v4: give every stored run a stable SESSION identity without changing
  // the legacy cockpit shape. The original `runs[day]` object is preserved as
  // the editable projection; canonical appendable history lives alongside it
  // in `runSessions[day]`. Empty scaffolding becomes an empty list, never a fake
  // session. Deterministic ids make the migration idempotent and export-safe.
  (state) => {
    const migrated = migrateLegacyRunSessions(state, DAY_KEYS);
    if (migrated > 0) {
      reportHandledError('migration:v4-run-session-identity', {
        message: 'Adopted legacy run slots into stable run sessions',
        sessionsMigrated: migrated,
      });
    }
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS.length; // 4

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
