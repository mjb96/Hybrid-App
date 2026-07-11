// @ts-check
// ==========================================
// EXERCISE ORDERING — js/workout-order.js
// Pure function. No DOM, no side effects. Unit-tested.
//
// Render order must NOT come from `for…in` over the lifts object: JavaScript
// enumerates integer-like keys first in ascending numeric order, so any
// legacy/imported day that keys lifts by index (or mixes index + name keys)
// renders out of the prescribed sequence, and a manual drag reorder of such a
// day silently reverts. An explicit `liftOrder[day]` array is the source of
// truth instead.
// ==========================================

/**
 * Resolve the display order of a day's exercises.
 *
 * Priority:
 *   1. A saved `liftOrder` (set by program seeding or a manual drag reorder),
 *      reconciled against the live keys — removed lifts drop out, brand-new
 *      lifts are appended in key order.
 *   2. No saved order (legacy data): derive a stable, blueprint-aligned order so
 *      integer-keyed lifts land in their program position rather than floating
 *      to the top of the object.
 *
 * @param {any} weekData      the week object (`appState.weeks[wk]`)
 * @param {string} day        day key, e.g. 'mon'
 * @param {{ lifts?: any[] }} [blueprint]  the program day blueprint
 * @returns {string[]} ordered exercise keys
 */
export function orderedLiftNames(weekData, day, blueprint) {
  const lifts = (weekData && weekData.lifts && weekData.lifts[day]) || {};
  const keys  = Object.keys(lifts).filter(k => Array.isArray(lifts[k]));
  const saved = (weekData && weekData.liftOrder && Array.isArray(weekData.liftOrder[day]))
    ? weekData.liftOrder[day]
    : null;

  if (saved) {
    const seen = new Set();
    const ordered = [];
    saved.forEach(n => { if (Array.isArray(lifts[n]) && !seen.has(n)) { ordered.push(n); seen.add(n); } });
    keys.forEach(n => { if (!seen.has(n)) { ordered.push(n); seen.add(n); } });
    return ordered;
  }

  const bp = Array.isArray(blueprint && blueprint.lifts) ? blueprint.lifts : [];
  const rank = (name) => {
    if (!isNaN(Number(name)) && bp[parseInt(name, 10)] !== undefined) return parseInt(name, 10);
    const i = bp.indexOf(name);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return keys
    .map((name, i) => ({ name, r: rank(name), i }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map(o => o.name);
}

/**
 * The neighbouring day key in a fixed day list — for swipe-between-days.
 * @param {string[]} days ordered day keys (e.g. the cockpit day pills)
 * @param {string} current
 * @param {number} dir  +1 = next, -1 = previous
 * @returns {string|null} the neighbour, or null at the ends / on bad input
 */
export function neighborDay(days, current, dir) {
  if (!Array.isArray(days) || !days.length) return null;
  const i = days.indexOf(current);
  if (i < 0) return null;
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= days.length) return null;
  return days[j];
}

/**
 * Straight-set inheritance: given an exercise's sets and the index of the one
 * being logged, return the {w, r} of the nearest *earlier completed* set of the
 * same kind (warm-up vs working), or null. So a lifter doing 3×8 at one weight —
 * and a brand-new user with no coach target or history at all — can tick/one-tap
 * later sets to carry the first set's numbers forward instead of re-typing.
 *
 * Warm-ups and working sets don't cross-inherit (different loads). This is a fill
 * convenience only: callers set the input value, never the prescribed target, so
 * an inherited set is never mistaken for plan adherence.
 *
 * @param {{type?:string, w?:string|number, r?:string|number, done?:boolean}[]} sets
 * @param {number} idx
 * @returns {{ w: string, r: string } | null}
 */
export function pickInheritedSet(sets, idx) {
  if (!Array.isArray(sets) || idx <= 0) return null;
  const isWarmup = (s) => (s?.type || '') === 'W';
  const target = sets[idx];
  if (!target) return null;
  for (let j = idx - 1; j >= 0; j--) {
    const prev = sets[j];
    if (!prev) continue;
    if (isWarmup(prev) !== isWarmup(target)) continue;
    if (prev.done && prev.w != null && prev.w !== '' && prev.r != null && prev.r !== '') {
      return { w: String(prev.w), r: String(prev.r) };
    }
  }
  return null;
}

/**
 * Swap one exercise for another within a day, in place. Pure data operation
 * (mutates weekData, returns a result) so the cockpit's executeSwapExercise is a
 * thin wrapper and this is unit-testable.
 *
 * The sets array is re-keyed rather than rebuilt, so the prescribed target
 * (each set's tw/tr) and any already-logged sets (w/r) carry across untouched;
 * the exercise keeps its position in the day's display order; and any per-lift
 * meta (superset grouping) moves with it.
 *
 * @returns {{ ok: boolean, reason?: 'noop'|'missing'|'duplicate' }}
 */
export function applyExerciseSwap(weekData, day, oldName, newName, blueprint) {
  if (!oldName || !newName) return { ok: false, reason: 'missing' };
  if (oldName === newName) return { ok: false, reason: 'noop' };

  const dayLifts = weekData && weekData.lifts && weekData.lifts[day];
  if (!dayLifts || !Array.isArray(dayLifts[oldName])) return { ok: false, reason: 'missing' };
  if (Array.isArray(dayLifts[newName])) return { ok: false, reason: 'duplicate' };

  // Re-key the sets array — this is what carries target + logged data across.
  dayLifts[newName] = dayLifts[oldName];
  delete dayLifts[oldName];

  // Preserve position in the explicit display order (derive one if absent).
  if (!weekData.liftOrder) weekData.liftOrder = {};
  let order = weekData.liftOrder[day];
  if (!Array.isArray(order) || !order.includes(oldName)) {
    order = orderedLiftNames(weekData, day, blueprint);
  }
  weekData.liftOrder[day] = order.map(n => (n === oldName ? newName : n));

  // Carry any per-exercise meta (e.g. superset grouping).
  const meta = weekData.liftMeta && weekData.liftMeta[day];
  if (meta && meta[oldName]) { meta[newName] = meta[oldName]; delete meta[oldName]; }

  return { ok: true };
}
