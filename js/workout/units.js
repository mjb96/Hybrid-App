// @ts-check
// =============================================================================
// The athlete's weight unit, for labelling.
//
// Two lines, its own file, on purpose: it is read by both js/workout.js and the
// modules split out of it, and the alternatives were worse. Leaving it in
// workout.js would make every extracted module import workout.js back (a cycle);
// duplicating it invites the two copies to disagree about what 'lbs' means.
//
// Loads are STORED canonically and this only decides the label, so it must not
// grow conversion logic — `js/workout.js`'s distance helpers are the precedent
// for where that belongs.
// =============================================================================

/**
 * The unit suffix to show beside a load. Anything other than an explicit 'lbs'
 * is kg, so an absent or malformed setting labels kg rather than nothing.
 * @param {any} appState
 * @returns {'kg'|'lbs'}
 */
export function weightUnitLabel(appState) {
  return appState?.settings?.weightUnit === 'lbs' ? 'lbs' : 'kg';
}
