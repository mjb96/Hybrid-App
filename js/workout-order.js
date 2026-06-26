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
