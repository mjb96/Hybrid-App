// @ts-check
// =============================================================================
// INTERNAL LIFT-ID DETECTION (js/state/lift-id.js)
//
// Helyx once had a "lift identity" subsystem (removed in commit e2e624f) that
// keyed a day's logged sets by an opaque generated id — literally
// `'lift_' + Math.random().toString(36).slice(2, 10)` — and resolved it back to
// a display name via a `liftNames` (id -> name) map plus a `liftIdMap`
// (name -> id) map. That subsystem was deleted *without migrating the existing
// id-keyed workout data*, so any user who logged during that era still has set
// arrays stored under keys like `lift_76dsje3t`.
//
// A workout row is keyed by its object key, and the render path uses the key
// directly as the exercise name, so the raw id surfaced *as the exercise name*
// on the cockpit ("DONE · 5 sets · top 120 kg") — the reported bug.
//
// This leaf module (no imports, no DOM) is the single source of truth for
// recognising such a key. It is used by the repair migration
// (state/migrations.js) to rename id-keyed history back to real exercise names,
// and as a render-time guard (workout.js) so an internal id can never again be
// shown to a user as an exercise name.
// =============================================================================

// Matches ONLY the generated shape: `lift_` followed by 4–10 lowercase base36
// characters. Deliberately tight so a genuine custom exercise — which is stored
// under its real, user-typed display name (words, spaces, capitals, e.g.
// "Zercher Squat") — can never be mistaken for an internal id and repaired away.
const INTERNAL_LIFT_ID = /^lift_[0-9a-z]{4,10}$/;

/**
 * True only for keys that match the legacy generated lift-id shape.
 * @param {unknown} key
 * @returns {boolean}
 */
export function isInternalLiftId(key) {
  return typeof key === 'string' && INTERNAL_LIFT_ID.test(key);
}

/** Honest fallback label for an id that cannot be resolved to a real name. */
export const UNKNOWN_LIFT_NAME = 'Unknown exercise';
