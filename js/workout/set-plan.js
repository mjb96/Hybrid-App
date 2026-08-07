// @ts-check
// =============================================================================
// SESSION SET PLAN (js/workout/set-plan.js)
//
// A deleted set used to come back.
//
// `verifyWeekStorageSchema` (state.js) re-materialises the program's prescribed
// row count into every day of the current week, and it runs constantly — on
// boot, on week nav, on a run log, on a GPS finish. `reconcilePrescribedSets`
// deliberately never REMOVES a row an athlete has touched, but it does PAD a
// short array back up to the prescription. So mid-workout, with sets already
// logged, deleting the 4th set of a 4×5 removed the row, and the next pass
// silently put a blank one back. Deleting an exercise's last set (the only way
// to drop an exercise from today) resurrected the whole exercise the same way.
//
// The set count also fed the finish review from the PLAN rather than the
// session, so even when the row stayed gone the review still counted it:
// "3 of 4 planned sets", session not complete, for a session the athlete had
// finished exactly as they intended.
//
// The missing fact was intent. A short array can mean "not materialised yet"
// (pad it) or "the athlete removed that set" (leave it alone), and nothing
// recorded which. This module is that record: when a row is deleted, the
// athlete's own working-set count for THAT lift, on THAT day, is stamped into
// `weekData.liftMeta[day][lift].plannedSets`.
//
// Scope is deliberate:
//   - Per week + day, because liftMeta is. Dropping a set today does not edit
//     the program or next week's session.
//   - Working sets only, matching every other set count in the app
//     (`isWarmupSet` rows are not training and are never prescribed).
//   - Zero is a real value, not "unset": it means the exercise was removed from
//     this session, and it is what stops the exercise being re-seeded.
//
// PURE. No DOM, no app state, no imports beyond the canonical set predicates.
// =============================================================================

import { isWarmupSet } from '../set-utils.js';

/** The liftMeta field that carries the athlete's own set count. */
export const SET_PLAN_FIELD = 'plannedSets';

/** Working (non-warm-up) rows in a set array. */
export function workingSetCount(sets) {
  if (!Array.isArray(sets)) return 0;
  return sets.filter((set) => !isWarmupSet(set)).length;
}

/**
 * The athlete's explicit working-set count for this lift today, or null when
 * they have not changed it (the program's prescription still owns the count).
 * @returns {number|null}
 */
export function sessionSetPlan(weekData, day, liftName) {
  const raw = weekData?.liftMeta?.[day]?.[liftName]?.[SET_PLAN_FIELD];
  if (raw == null) return null;
  const count = Number(raw);
  if (!Number.isFinite(count) || count < 0) return null;
  return Math.floor(count);
}

/**
 * How many working sets this session actually plans for one lift: the athlete's
 * count when they have set one, otherwise the program's prescription.
 * @param {number} prescribed the program's target set count
 */
export function plannedSetsForLift(weekData, day, liftName, prescribed) {
  const own = sessionSetPlan(weekData, day, liftName);
  return own == null ? prescribed : own;
}

/** Stamp the athlete's own set count for one lift on one day. */
export function recordSessionSetPlan(weekData, day, liftName, count) {
  if (!weekData || !day || !liftName) return;
  const value = Math.max(0, Math.floor(Number(count) || 0));
  if (!weekData.liftMeta) weekData.liftMeta = {};
  if (!weekData.liftMeta[day]) weekData.liftMeta[day] = {};
  if (!weekData.liftMeta[day][liftName]) weekData.liftMeta[day][liftName] = {};
  weekData.liftMeta[day][liftName][SET_PLAN_FIELD] = value;
}

/**
 * Hand the count back to the program. Used by Undo and by a deliberate reseed —
 * the meta object itself is kept (it may carry superset/origin data).
 */
export function clearSessionSetPlan(weekData, day, liftName) {
  const meta = weekData?.liftMeta?.[day]?.[liftName];
  if (meta && SET_PLAN_FIELD in meta) delete meta[SET_PLAN_FIELD];
}

/** Clear every lift's stamped count for a day (a wholesale rebuild of that day). */
export function clearDaySetPlans(weekData, day) {
  const dayMeta = weekData?.liftMeta?.[day];
  if (!dayMeta) return;
  for (const name of Object.keys(dayMeta)) clearSessionSetPlan(weekData, day, name);
}

/**
 * Remove one set row, as the data operation behind the cockpit's ✕.
 *
 * Removing the last row removes the exercise from the session: the lifts key
 * and its liftOrder entry go, and the stamped count of 0 is what keeps them
 * gone across the next scaffolding pass.
 *
 * Returns the snapshot Undo needs — the exact prior sets, order and stamped
 * count — so a fat-fingered ✕ next to the ✓ is recoverable rather than silent
 * data loss.
 *
 * @returns {{ok:boolean, reason?:'missing'|'out-of-range', removed?:any,
 *   priorSets?:any[], priorOrder?:string[]|null, priorPlan?:number|null,
 *   liftRemoved?:boolean, plannedSets?:number}}
 */
export function applySetRemoval(weekData, day, liftName, setIndex) {
  const dayLifts = weekData?.lifts?.[day];
  const sets = dayLifts?.[liftName];
  if (!Array.isArray(sets)) return { ok: false, reason: 'missing' };
  const index = Math.floor(Number(setIndex));
  if (!Number.isFinite(index) || index < 0 || index >= sets.length) {
    return { ok: false, reason: 'out-of-range' };
  }

  // Snapshot BEFORE mutating, including the stamped count, so Undo restores the
  // exact prior state rather than an approximation of it.
  const priorSets = sets.map((set) => ({ ...set }));
  const priorOrder = Array.isArray(weekData.liftOrder?.[day]) ? [...weekData.liftOrder[day]] : null;
  const priorPlan = sessionSetPlan(weekData, day, liftName);

  const [removed] = sets.splice(index, 1);
  const liftRemoved = sets.length === 0;
  if (liftRemoved) {
    delete dayLifts[liftName];
    const order = weekData.liftOrder?.[day];
    if (Array.isArray(order)) weekData.liftOrder[day] = order.filter((n) => n !== liftName);
  }

  const plannedSets = liftRemoved ? 0 : workingSetCount(sets);
  recordSessionSetPlan(weekData, day, liftName, plannedSets);

  return { ok: true, removed, priorSets, priorOrder, priorPlan, liftRemoved, plannedSets };
}

/**
 * Put back exactly what `applySetRemoval` took, including the prior stamped
 * count (usually none, which hands the set count back to the program).
 */
export function restoreSetRemoval(weekData, day, liftName, snapshot) {
  if (!weekData || !snapshot || !Array.isArray(snapshot.priorSets)) return false;
  if (!weekData.lifts) weekData.lifts = {};
  if (!weekData.lifts[day]) weekData.lifts[day] = {};
  weekData.lifts[day][liftName] = snapshot.priorSets.map((set) => ({ ...set }));
  if (snapshot.priorOrder) {
    if (!weekData.liftOrder) weekData.liftOrder = {};
    weekData.liftOrder[day] = [...snapshot.priorOrder];
  }
  if (snapshot.priorPlan == null) clearSessionSetPlan(weekData, day, liftName);
  else recordSessionSetPlan(weekData, day, liftName, snapshot.priorPlan);
  return true;
}
