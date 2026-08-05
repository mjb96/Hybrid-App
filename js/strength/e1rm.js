// @ts-check
// =============================================================================
// ESTIMATED 1RM — one bounded strength-trend primitive.
//
// Helyx uses the Epley equation for a directional estimate, not as a measured
// maximal lift or a load prescription. Rep-based 1RM equations are least
// defensible as sets get lighter and longer, so high-repetition work is kept in
// volume/session totals but excluded from e1RM, PR and plateau calculations.
// =============================================================================
import { resolveExercise } from '../exercises/catalog.js';

/** Highest repetition count Helyx accepts for an estimated-1RM data point. */
export const MAX_E1RM_REPS = 12;

/**
 * Whether a logged external-load set is suitable for Helyx's e1RM trend.
 * @param {unknown} weight
 * @param {unknown} reps
 */
export function isE1rmEligible(weight, reps) {
  const w = Number.parseFloat(String(weight ?? ''));
  const r = Number.parseInt(String(reps ?? ''), 10);
  return Number.isFinite(w) && w > 0
    && Number.isInteger(r) && r >= 1 && r <= MAX_E1RM_REPS;
}

/**
 * Epley estimate: load × (1 + repetitions / 30).
 *
 * A SINGLE returns the load itself. Epley's algebraic form gives w × 31/30 at
 * one repetition, which inflated the app's most reliable data point by 3.3% and
 * meant a tested max could never report as the weight actually lifted — a 100 kg
 * single displayed as 103 kg. One rep IS the measurement; there is nothing to
 * estimate from it.
 *
 * Returns 0 when the set is not eligible. Callers treat 0 as "no defensible
 * estimate", never as a real zero-strength result.
 * @param {unknown} weight
 * @param {unknown} reps
 * @returns {number}
 */
export function estimatedE1rm(weight, reps) {
  if (!isE1rmEligible(weight, reps)) return 0;
  const w = Number.parseFloat(String(weight));
  const r = Number.parseInt(String(reps), 10);
  if (r === 1) return w;
  const estimate = w * (1 + r / 30);
  return Number.isFinite(estimate) ? estimate : 0;
}

/**
 * Smallest estimated-1RM difference Helyx treats as a real change.
 *
 * PR detection was previously spread across five sites using four different
 * rules — two of which counted an exact TIE as a personal record — so one
 * session could be a PR in the recap and not in the cockpit. This is the single
 * threshold they now share.
 *
 * 0.5 is deliberate, not a float-comparison epsilon: e1RM is a directional
 * estimate, so a 0.2 kg "record" is noise dressed as an achievement, and the
 * displayed value is rounded to whole units anyway — a difference too small to
 * see must not fire a trophy.
 */
export const E1RM_PR_EPSILON = 0.5;

/**
 * Is `candidate` a genuine new best over `previousBest`?
 *
 * Requires prior history: the first-ever log of a lift is a BASELINE, not a
 * record, and celebrating it fired a trophy on every exercise of a new user's
 * first session. Beating the previous best by less than the epsilon is not a PR.
 *
 * @param {number} candidate      this session's best estimate
 * @param {number} previousBest   best estimate from strictly prior sessions
 * @returns {boolean}
 */
export function isE1rmPr(candidate, previousBest) {
  const cur = Number(candidate) || 0;
  const prior = Number(previousBest) || 0;
  if (cur <= 0 || prior <= 0) return false;
  return cur > prior + E1RM_PR_EPSILON;
}

/**
 * Exercise/load-mode guard for an e1RM set. Effective body mass, assistance
 * bands and nominal band resistance are not comparable external loads.
 * Unknown custom exercises remain eligible when they carry a normal load.
 * @param {string} exerciseName
 * @param {any} [set]
 */
export function isE1rmExercise(exerciseName, set = {}) {
  if (set?.bw || set?.band || set?.loadMode === 'bodyweight' || set?.loadMode === 'assisted') {
    return false;
  }
  const exercise = resolveExercise(exerciseName);
  if (!exercise) return true;
  return exercise.category !== 'conditioning'
    && !exercise.bodyweight
    && !exercise.equipment.includes('bands');
}

/** A set-aware convenience used by every persisted-workout consumer. */
export function estimatedE1rmForSet(exerciseName, set) {
  if (!isE1rmExercise(exerciseName, set)) return 0;
  return estimatedE1rm(set?.w, set?.r);
}
