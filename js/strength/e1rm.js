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
  const estimate = w * (1 + r / 30);
  return Number.isFinite(estimate) ? estimate : 0;
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
