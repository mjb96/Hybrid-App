// @ts-check
// =============================================================================
// CLEARING TODAY'S LOG — the confirm-reset flow.
//
// Split out of js/workout.js. This is the destructive corner of the cockpit: it
// removes logged sets, discards a one-off session, stops the timers and deletes
// a stored run map. Small, cohesive, and worth reading on its own precisely
// because of what it deletes.
//
// WHY THE ROUTERS DID NOT MOVE FIRST
// The four event routers are only 81 lines but dispatch to 27 functions defined
// in workout.js. Moving them out would mean importing all 27 back — the cycle
// tests/workout_split_guard.test.js forbids. So handlers move out first, while
// the router stays and imports them; the routers go LAST, once there is nothing
// left in workout.js for them to reach into. This module is one of those steps.
//
// State comes from ./context.js, never from workout.js.
// =============================================================================
import { getProgramById, showToast } from '../state.js';
import { prescribeSetsForLift } from '../engine.js';
import { dismissRestTimer, stopAndResetWorkoutTimer } from '../timers.js';
import { deleteMapFromDB } from '../db.js';
import { replaceManagedModal } from '../ui/modal-stack.js';
import { showUndo } from '../ui/undo-bar.js';
import { deleteDayWorkoutData, snapshotDayWorkoutData, restoreDayWorkoutData } from './delete-day.js';
import {
  activeOneOffSession, activeWorkoutDay, activeWorkoutWeekKey,
  discardActiveOneOffSession, oneOffBlueprint,
} from './one-off-session.js';
import { workoutSessionKey } from './session-identity.js';
import {
  getState as _getState,
  getSelectedDay as _getSelectedDay,
  saveState as _saveState,
  switchTab as _switchTab,
  rerenderWorkout,
} from './context.js';

const DAY_NAMES = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

/**
 * Name the workout a discard would remove — "Wednesday's Upper workout", or
 * "Wednesday's workout" when the day has no title. Used in the confirmation so
 * the scope is unmistakable regardless of which day is selected.
 */
function _discardTargetLabel() {
  const appState = _getState?.() || {};
  const day = activeWorkoutDay(appState, _getSelectedDay());
  const dayName = DAY_NAMES[day] || 'this day';
  const program = getProgramById(appState.activeProgramId);
  const title = String(program?.days?.[day]?.title || '').trim();
  return title ? `${dayName}’s ${title} workout` : `${dayName}’s workout`;
}

export function openConfirmResetModal(options = {}) {
  const modal = document.getElementById('confirmResetModal');
  if (!modal) return;
  const oneOff = activeOneOffSession(_getState?.());
  const title = document.getElementById('resetModalTitle');
  const copy = document.getElementById('resetModalCopy');
  const action = document.getElementById('resetModalAction');
  if (oneOff) {
    if (title) title.textContent = 'Discard this workout?';
    if (copy) copy.textContent = 'This removes this unfinished one-off workout. Your programmed sessions and workout history stay unchanged.';
    if (action) action.textContent = 'Discard workout';
  } else {
    // Name the EXACT workout. The old copy said "today's log", which was simply
    // wrong whenever the athlete had another day selected — the one moment a
    // destructive confirmation must not be vague. Shared vocabulary (roadmap
    // §Shared product vocabulary) reserves "Clear" precisely because it does
    // not state its scope.
    const label = _discardTargetLabel();
    if (title) title.textContent = `Discard ${label}?`;
    if (copy) {
      copy.textContent = `This deletes the logged sets, run and notes for ${label}. `
        + 'Your other days and your workout history are not affected. You can undo this straight afterwards.';
    }
    if (action) action.textContent = 'Discard workout';
  }
  if (options.replaceFrom) replaceManagedModal(options.replaceFrom, modal);
  else modal.classList.add('active');
}

export function closeConfirmResetModal() {
  const modal = document.getElementById('confirmResetModal');
  if (modal) modal.classList.remove('active');
}

export function executeResetActiveDayMetrics() {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);

  const activeProgram = getProgramById(appState.activeProgramId);
  const oneOff = activeOneOffSession(appState);
  const blueprint = oneOffBlueprint(appState, activeProgram?.days?.[selectedDay]);

  if (oneOff) {
    const discarded = discardActiveOneOffSession(appState);
    try {
      stopAndResetWorkoutTimer(workoutSessionKey(appState, wk, selectedDay));
      dismissRestTimer();
    } catch(e) { console.warn(e); }
    _saveState(true);
    closeConfirmResetModal();
    showToast('Workout discarded');
    if (_switchTab) _switchTab('home', { skipWorkoutCommit: true });
    if (discarded) {
      deleteMapFromDB(discarded.key, discarded.day, { sessionId: discarded.sessionId }).catch(() => {});
    }
    return;
  }

  /** @type {Record<string, any[]>} */
  const lifts = {};
  const liftOrder = [];

  if (blueprint && blueprint.lifts) {
    blueprint.lifts.forEach(liftName => {
      try {
        const weekModifier = activeProgram.weeklyVolModifiers?.[wk] || { sets: 4, reps: 5, intensityLabel: "Working Sets" };
        lifts[liftName] = prescribeSetsForLift(wk, selectedDay, liftName, blueprint.desc, weekModifier, { program: activeProgram, week: wk, dayKey: selectedDay });
        liftOrder.push(liftName);
      } catch(e) { console.warn(e); }
    });
  }
  // Snapshot BEFORE the clear so the discard is reversible. Taken from the same
  // module that owns the clear, so a field can never be cleared without also
  // being captured.
  const snapshot = snapshotDayWorkoutData(appState.weeks[wk], selectedDay);

  // Reset restores the prescribed program order and clears every workout-only
  // field through the same path used by historical-session deletion.
  deleteDayWorkoutData(appState.weeks[wk], selectedDay, { lifts, liftOrder });
  try {
    stopAndResetWorkoutTimer(workoutSessionKey(appState, wk, selectedDay));
    dismissRestTimer();
  } catch(e) { console.warn(e); }

  _saveState(true);
  rerenderWorkout();
  closeConfirmResetModal();

  // The stored GPS route is the one part that cannot be reversed, so it is
  // deferred to finalize() rather than deleted now — otherwise Undo would
  // restore a run whose route had already been destroyed.
  showUndo('Workout discarded', () => {
    restoreDayWorkoutData(appState.weeks[wk], snapshot);
    _saveState(true);
    rerenderWorkout();
    showToast('Workout restored');
  }, () => deleteMapFromDB(wk, selectedDay, { activationId: appState.activeActivationId }).catch(() => {}));
}
