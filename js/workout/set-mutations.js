// @ts-check
// =============================================================================
// SET MUTATIONS — row structure and row metadata in the workout cockpit.
//
// This module owns adding/removing rows, removal Undo, set type, load mode,
// bodyweight/band handling and per-set RIR. The event router stays in
// js/workout.js and calls these handlers. State and redraws flow through the
// forward-only workout context, so this module never imports workout.js back.
//
// Quick-log, checkbox completion and finish-review persistence deliberately stay
// out: they coordinate PRs, timers, accordion flow and session completion, which
// are separate seams rather than simple row mutations.
// =============================================================================
import { showToast } from '../state.js';
import { dateKey } from '../dates.js';
import { numberPromptModal } from '../ui/confirm-modal.js';
import { applySetRemoval, restoreSetRemoval } from './set-plan.js';
import { applyBandLoad, applyLoadMode, bandRole, resolvedLoadMode } from './load-mode.js';
import { activeWorkoutDay, activeWorkoutWeekKey } from './one-off-session.js';
import {
  getState as _getState,
  getSelectedDay as _getSelectedDay,
  saveState as _saveState,
  rerenderWorkout,
} from './context.js';

export function appendCustomSetRow(btnNode, liftName) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const weekKey = activeWorkoutWeekKey(appState);

  if (!appState.weeks[weekKey].lifts[selectedDay]) appState.weeks[weekKey].lifts[selectedDay] = {};
  if (!appState.weeks[weekKey].lifts[selectedDay][liftName]) {
    appState.weeks[weekKey].lifts[selectedDay][liftName] = [];
  }
  appState.weeks[weekKey].lifts[selectedDay][liftName].push({ w: '', r: '', c: false });
  _saveState(true);
  rerenderWorkout();
}

export function appendWarmupSetRow(btnNode, liftName) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const weekKey = activeWorkoutWeekKey(appState);

  if (!appState.weeks[weekKey].lifts[selectedDay]) appState.weeks[weekKey].lifts[selectedDay] = {};
  if (!appState.weeks[weekKey].lifts[selectedDay][liftName]) {
    appState.weeks[weekKey].lifts[selectedDay][liftName] = [];
  }
  const sets = appState.weeks[weekKey].lifts[selectedDay][liftName];
  const firstWorkingIndex = sets.findIndex((set) => !set.type || set.type !== 'W');
  const newSet = { w: '', r: '', c: false, type: 'W' };
  if (firstWorkingIndex === -1) sets.push(newSet);
  else sets.splice(firstWorkingIndex, 0, newSet);

  _saveState(true);
  rerenderWorkout();
}

export function removeCustomSetRow(liftName, setIndex) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const weekKey = activeWorkoutWeekKey(appState);
  const week = appState.weeks?.[weekKey];
  if (!week) return;

  // set-plan.js owns the data operation and stamps the athlete's chosen count so
  // the scaffolding pass cannot silently pad a deleted row back into the workout.
  const result = applySetRemoval(week, selectedDay, liftName, setIndex);
  if (!result.ok) return;

  _saveState(true);
  rerenderWorkout();
  _offerSetUndo({ liftName, selectedDay, weekKey, snapshot: result });
}

function _restoreRemovedSet(undo) {
  const appState = _getState();
  const week = appState.weeks?.[undo.weekKey];
  if (!week) return;
  if (!restoreSetRemoval(week, undo.selectedDay, undo.liftName, undo.snapshot)) return;
  _saveState(true);
  rerenderWorkout();
  showToast('Set restored ✓');
}

// This snackbar predates the shared workout-discard Undo. Its exact interaction
// is preserved during extraction; consolidating visual primitives is separate.
let _undoSnackTimer = null;
function _offerSetUndo(undo) {
  if (typeof document === 'undefined') return;
  document.getElementById('setUndoSnack')?.remove();
  if (_undoSnackTimer) {
    clearTimeout(_undoSnackTimer);
    _undoSnackTimer = null;
  }

  const snack = document.createElement('div');
  snack.id = 'setUndoSnack';
  snack.setAttribute('role', 'status');
  snack.style.cssText =
    'position:fixed;left:50%;transform:translateX(-50%);' +
    'bottom:calc(88px + env(safe-area-inset-bottom, 0px));z-index:9998;' +
    'display:flex;align-items:center;gap:14px;max-width:calc(100% - 32px);' +
    'background:#1e293b;color:#f8fafc;border:1px solid rgba(255,255,255,0.14);' +
    'border-radius:12px;padding:11px 16px;box-shadow:0 8px 28px rgba(0,0,0,0.4);font-size:0.85rem;';
  snack.innerHTML =
    '<span style="flex:1;">Set removed</span>' +
    '<button type="button" id="setUndoBtn" style="min-height:44px;background:none;border:none;' +
    'color:#60a5fa;font-weight:800;font-size:0.85rem;cursor:pointer;padding:4px 8px;">UNDO</button>';
  document.body.appendChild(snack);

  const dismiss = () => {
    snack.remove();
    if (_undoSnackTimer) clearTimeout(_undoSnackTimer);
    _undoSnackTimer = null;
  };
  snack.querySelector('#setUndoBtn')?.addEventListener('click', () => {
    _restoreRemovedSet(undo);
    dismiss();
  });
  _undoSnackTimer = setTimeout(dismiss, 6000);
}

export function cycleSetType(liftName, setIndex) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const weekKey = activeWorkoutWeekKey(appState);
  const sets = appState.weeks?.[weekKey]?.lifts?.[selectedDay]?.[liftName];
  if (!sets || setIndex >= sets.length) return;

  const cycle = /** @type {Record<string, string>} */ ({ '': 'W', W: 'D', D: 'F', F: '' });
  const newType = cycle[sets[setIndex].type || ''];
  sets[setIndex].type = newType;

  const exerciseCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = exerciseCard?.querySelectorAll('.cockpit-set-row')?.[setIndex];
  if (row) {
    row.classList.remove('type-warmup', 'type-dropset', 'type-amrap');
    if (newType === 'W') row.classList.add('type-warmup');
    else if (newType === 'D') row.classList.add('type-dropset');
    else if (newType === 'F') row.classList.add('type-amrap');
    const label = row.querySelector('.set-num-lbl');
    const pill = row.querySelector('.type-pill');
    const numberLabels = { '': `S${setIndex + 1}`, W: 'W', D: 'D', F: 'F' };
    const pillLabels = { '': 'set', W: 'warm', D: 'drop', F: 'amrp' };
    if (label) label.textContent = numberLabels[newType];
    if (pill) pill.textContent = pillLabels[newType];
  }
  _saveState(true);
}

/** The latest athlete-supplied body weight, or null. Never fabricate a default. */
export function currentBodyweight(appState) {
  const log = appState.bodyWeightLog || [];
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const weight = parseFloat(log[index]?.weight);
    if (Number.isFinite(weight) && weight > 0) return weight;
  }
  const defaultWeight = parseFloat(appState.settings?.defaultBodyWeight);
  if (Number.isFinite(defaultWeight) && defaultWeight > 0) return defaultWeight;
  return null;
}

function _replaceSet(sets, index, next) {
  // Preserve array identity because other workout consumers can hold this list.
  sets[index] = next;
}

function _syncLoadModeRow(liftName, setIndex, set) {
  const exerciseCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = /** @type {HTMLElement|undefined} */ (exerciseCard?.querySelectorAll('.cockpit-set-row')?.[setIndex]);
  if (!row) return;
  const mode = resolvedLoadMode(set, liftName);
  row.dataset.loadMode = mode;
  row.querySelectorAll('.set-load-choice__btn').forEach((button) => {
    const active = button.getAttribute('data-mode') === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const weightInput = /** @type {HTMLInputElement|null} */ (row.querySelector('.input-weight-node'));
  if (weightInput) weightInput.value = set.w || '';
}

/** Ask once when a bodyweight-dependent load mode has no real body weight. */
async function _ensureBodyweight(appState) {
  const known = currentBodyweight(appState);
  if (known != null) return known;

  const unit = appState.settings?.weightUnit === 'lbs' ? 'lbs' : 'kg';
  const entered = await numberPromptModal({
    title: 'What do you weigh?',
    message: 'Bodyweight and band-assisted sets are logged against your body weight, so this is the load for those sets.',
    label: 'Body weight',
    unit,
    confirmLabel: 'Save',
    max: unit === 'lbs' ? 1000 : 450,
  });
  if (entered == null) return null;

  if (!appState.settings) appState.settings = {};
  appState.settings.defaultBodyWeight = entered;
  if (!Array.isArray(appState.bodyWeightLog)) appState.bodyWeightLog = [];
  const today = dateKey();
  const existing = appState.bodyWeightLog.findIndex((entry) => entry?.date === today);
  if (existing >= 0) appState.bodyWeightLog[existing].weight = entered;
  else appState.bodyWeightLog.push({ date: today, weight: entered });
  _saveState(true);
  return entered;
}

export async function setSetLoadMode(liftName, setIndex, mode) {
  if (!['bodyweight', 'weighted', 'assisted'].includes(mode)) return;
  const appState = _getState();
  if ((mode === 'bodyweight' || mode === 'assisted') && await _ensureBodyweight(appState) == null) return;

  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const weekKey = activeWorkoutWeekKey(appState);
  const sets = appState.weeks?.[weekKey]?.lifts?.[selectedDay]?.[liftName];
  if (!sets || setIndex < 0 || setIndex >= sets.length) return;
  const next = applyLoadMode(sets[setIndex], mode, {
    bodyweight: currentBodyweight(appState),
    bandWeights: appState.settings?.bandWeights,
  });
  _replaceSet(sets, setIndex, next);
  _syncLoadModeRow(liftName, setIndex, next);
  _saveState(true);
}

export async function cycleSetLoad(liftName, setIndex) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const weekKey = activeWorkoutWeekKey(appState);
  const sets = appState.weeks?.[weekKey]?.lifts?.[selectedDay]?.[liftName];
  if (!sets || setIndex < 0 || setIndex >= sets.length) return;
  const set = sets[setIndex];
  const bands = appState.settings?.bandWeights || { L: 10, M: 20, H: 30 };

  const order = ['', 'BW', 'L', 'M', 'H'];
  const current = set.bw ? 'BW' : (set.band || '');
  const next = order[(order.indexOf(current) + 1) % order.length];
  const needsBodyweight = next === 'BW' || (next && bandRole(liftName) === 'assist');
  if (needsBodyweight && await _ensureBodyweight(appState) == null) return;

  let nextSet;
  if (next === 'BW') {
    nextSet = applyLoadMode(set, 'bodyweight', {
      bodyweight: currentBodyweight(appState), bandWeights: bands,
    });
  } else if (next) {
    nextSet = applyBandLoad(set, next, {
      exercise: liftName,
      bodyweight: currentBodyweight(appState),
      bandWeights: bands,
    });
  } else {
    nextSet = applyLoadMode(set, 'weighted', {
      bodyweight: currentBodyweight(appState), bandWeights: bands,
    });
  }
  _replaceSet(sets, setIndex, nextSet);

  const exerciseCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = exerciseCard?.querySelectorAll('.cockpit-set-row')?.[setIndex];
  if (row) {
    const chip = /** @type {HTMLElement|null} */ (row.querySelector('.btn-load'));
    const labels = { '': 'Weighted', BW: 'Bodyweight', L: '🟢 Light band', M: '🟡 Med band', H: '🔴 Heavy band' };
    const className = next === '' ? 'weighted' : next === 'BW' ? 'bw' : next;
    if (chip) {
      chip.textContent = labels[next];
      chip.className = `btn-load tactile-scale load-${className}`;
    }
    const weightInput = /** @type {HTMLInputElement|null} */ (row.querySelector('.input-weight-node'));
    if (weightInput) weightInput.value = nextSet.w;
  }
  _syncLoadModeRow(liftName, setIndex, nextSet);
  _saveState(true);
}

export function setPerSetRir(liftName, setIndex, rir) {
  const appState = _getState();
  const day = _getSelectedDay();
  const weekKey = activeWorkoutWeekKey(appState);
  const sets = appState.weeks[weekKey].lifts?.[day]?.[liftName];
  if (!sets || !sets[setIndex]) return;
  const cleared = sets[setIndex].rir === rir;
  sets[setIndex].rir = cleared ? null : rir;
  sets[setIndex].rpe = cleared ? null : 10 - rir;
  _saveState(true);

  const row = document.querySelector(
    `.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"] .cockpit-set-row[data-set-index="${setIndex}"]`,
  );
  row?.querySelectorAll('.btn-rpe').forEach((button) => {
    button.classList.toggle('rpe-selected', parseInt(button.getAttribute('data-rir'), 10) === sets[setIndex].rir);
  });
}
