// @ts-check
// =============================================================================
// WORKOUT CONTEXT — the app-level accessors the workout code is given.
//
// WHY THIS EXISTS
// `js/workout.js` held these as module-local `let`s, set once by `initWorkout`.
// That works for one file and blocks splitting it: any module carved out of
// workout.js still needs the state, the selected day and the save function, and
// its only route to them was to import workout.js — which imports the new module
// back. ES modules tolerate that cycle, but it makes initialisation order load-
// bearing, which is a poor foundation for a refactor whose whole purpose is to
// make the file safer to change.
//
// Both sides now depend on THIS module instead, so the graph stays a tree.
//
// This is a pure move: the same functions, set at the same moment, read at the
// same moments. No behaviour changes, which is the point — it is the enabling
// step, not the improvement.
// =============================================================================

/** @type {undefined | (() => any)} */              let _getState;
/** @type {undefined | (() => string)} */           let _getSelectedDay;
/** @type {undefined | (() => any)} */              let _getDays;
/** @type {undefined | ((immediate?: boolean) => any)} */ let _saveState;
/** @type {undefined | ((tab: string) => any)} */   let _switchTab;
/** @type {undefined | (() => any)} */              let _scheduleSave;

/**
 * Wire the workout modules to the app. Called once from `initWorkout`.
 *
 * `scheduleSaveFn` is optional and falls back to an immediate save, so a caller
 * that never wired the debounced path still persists rather than silently
 * dropping keystrokes — the behaviour the original default carried.
 */
export function setWorkoutContext(getStateFn, getSelectedDayFn, getDaysFn, saveStateFn, switchTabFn, scheduleSaveFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
  _saveState = saveStateFn;
  _switchTab = switchTabFn;
  _scheduleSave = scheduleSaveFn || (() => saveStateFn(true));
}

// Read through functions rather than exporting the bindings: a live binding
// would be `undefined` for any module that reads it before initWorkout runs,
// and the failure would be a silent no-op rather than an obvious one.
export const getState = () => _getState?.();
export const getSelectedDay = () => _getSelectedDay?.();
export const getDays = () => _getDays?.();
export const saveState = (immediate) => _saveState?.(immediate);
export const switchTab = (tab) => _switchTab?.(tab);
export const scheduleSave = () => _scheduleSave?.();

/** True once the app has wired the context — for guards and tests. */
export const workoutContextReady = () => typeof _getState === 'function';
