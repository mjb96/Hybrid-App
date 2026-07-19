// ==========================================
// WORKOUT VIEW
// ==========================================
import { getProgramById } from './state.js';
import { EXERCISE_LIBRARY } from './constants.js';
import { computeDiagnosticForLift, parseTargetFromDescription, prescribeSetsForLift, computeExercisePRs, liftTarget, repGoalFromTarget } from './engine.js';
import { getWeekModifier } from './schema.js';
import { isCompletedSet, isWarmupSet, setVolume } from './set-utils.js';
import { triggerRestTimerEngine, adjustRestDuration, moveRestTimerToActiveExercise, dismissRestTimer, stopAndResetWorkoutTimer, getWorkoutElapsedSeconds, startWorkoutTimer, bindWorkoutTimerSession } from './timers.js';
import { mountExerciseDragAndDropSystems } from './dragdrop.js';
import { showToast, saveNewCustomExerciseToLibrary } from './state.js';
import { escapeHtml } from './util.js';
import { buildEmptyWorkoutCard, buildSetRow, buildExerciseCard } from './templates.js';
import { activeSessionLiftNames, applyExerciseSwap, neighborDay, pickInheritedSet } from './workout-order.js';
import { getSubstitutions } from './workout/substitutions.js';
import { plateHint } from './workout/plates.js';
import { deleteMapFromDB } from './db.js';
import { renderRunMap } from './workout-map.js';
import { hapticTick, hapticSuccess } from './haptics.js';
import { dateKey } from './dates.js';
import { isInternalLiftId, UNKNOWN_LIFT_NAME } from './state/lift-id.js';
import { computeDashboardModel } from './home/dashboard-model.js';
import { generateRecommendation } from './brain/recommendations.js';
import { projectScore, projectionLine } from './brain/hybrid-score/project.js';
import { hasRunData, newRunSessionId, upsertRunSession } from './state/run-sessions.js';
import { completionPresentation, evaluateSessionCompletion } from './workout/completion-policy.js';
import { detectRunType } from './workout/run-type.js';
import { rescheduledWorkoutContext } from './workout/program-session-picker.js';
import { applyBandAssistance, applyLoadMode, isBodyweightExercise, resolvedLoadMode } from './workout/load-mode.js';
import { deleteDayWorkoutData, hasDayWorkoutDraft } from './workout/delete-day.js';
import { finishSession, markSessionInProgress } from './workout/session-status.js';
import { exerciseStatForName } from './exercises/catalog.js';
import { exerciseLoggerHistory } from './workout/exercise-history.js';
import { estimatedE1rmForSet, isE1rmExercise } from './strength/e1rm.js';
import {
  activeOneOffSession, activeWorkoutDay, activeWorkoutWeekKey,
  clearActiveOneOffSession, oneOffBlueprint,
} from './workout/one-off-session.js';
import { workoutSessionKey } from './workout/session-identity.js';

let _getState;
let _getSelectedDay;

// E5 — a set-row input's placeholder carries the prescribed ghost target (the
// coach's suggestion); the default "kg"/"reps" placeholders are non-numeric.
// Returns the numeric target, or null when there's no real prescription.
function _numericPlaceholder(inputNode) {
  const ph = String(inputNode?.getAttribute?.('placeholder') || '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(ph)) return null;
  const n = Number(ph);
  return Number.isFinite(n) ? n : null;
}

function _prescribedRepGoal(inputNode) {
  const explicit = Number(inputNode?.dataset?.targetReps);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : _numericPlaceholder(inputNode);
}

// Straight-set convenience: read this exercise's set rows from the live DOM and
// delegate to the pure `pickInheritedSet` — the nearest earlier completed set of
// the same kind fills the value only (never the placeholder), so an inherited set
// is never banked as a "prescribed target" and true-adherence stays honest.
function _inheritedSetFromSession(exCard, parentRow) {
  if (!exCard || !parentRow) return null;
  const rows = Array.from(exCard.querySelectorAll('.cockpit-set-row'));
  const idx = rows.indexOf(parentRow);
  if (idx < 0) return null;
  const sets = rows.map(row => ({
    type: row.classList.contains('type-warmup') ? 'W' : '',
    w: row.querySelector('.input-weight-node')?.value || '',
    r: row.querySelector('.input-reps-node')?.value || '',
    done: !!row.querySelector('.gym-check')?.checked,
  }));
  return pickInheritedSet(sets, idx);
}

// ── Distance-unit helpers ──────────────────────────────────────────────────────
// Distance is stored canonically in km everywhere. The cockpit run panel accepts
// and displays the user's configured unit (km|mi) and converts on the boundary.
const KM_TO_MI = 0.621371;
function _runDistUnit(appState) {
  return appState?.settings?.distanceUnit === 'mi' ? 'mi' : 'km';
}
function _kmToDisplayDist(km, unit) {
  const n = parseFloat(km);
  if (!isFinite(n)) return '';
  const v = unit === 'mi' ? n * KM_TO_MI : n;
  return String(Math.round(v * 100) / 100);
}
function _displayDistToKm(val, unit) {
  const n = parseFloat(val);
  if (!isFinite(n)) return '';
  const km = unit === 'mi' ? n / KM_TO_MI : n;
  return String(Math.round(km * 1000) / 1000);
}

// ── Pace helpers ──────────────────────────────────────────────────────────────
// Note: _paceFromDistTime divides time by whatever distance number it is given,
// so passing a display-unit distance yields a per-display-unit pace.
function _paceFromDistTime(distKm, timeStr) {
  const dist = parseFloat(distKm);
  if (!dist || dist <= 0 || !timeStr) return '';
  const parts = String(timeStr).trim().split(':');
  let secs = 0;
  if (parts.length === 3) secs = +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2]);
  else if (parts.length === 2) secs = +parts[0] * 60 + parseFloat(parts[1]);
  if (!secs) return '';
  const secPerKm = secs / dist;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function _timeFromPaceDist(paceStr, distKm) {
  const dist = parseFloat(distKm);
  if (!dist || dist <= 0 || !paceStr) return '';
  const parts = String(paceStr).trim().replace(/\/km.*/i, '').trim().split(':');
  if (parts.length !== 2) return '';
  const secPerKm = +parts[0] * 60 + parseFloat(parts[1]);
  if (!secPerKm) return '';
  const totalSecs = secPerKm * dist;
  const m = Math.floor(totalSecs / 60);
  const s = Math.round(totalSecs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

let _getDays;
let _saveState;
let _switchTab;
let _scheduleSave;

export function initWorkout(getStateFn, getSelectedDayFn, getDaysFn, saveStateFn, switchTabFn, scheduleSaveFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
  _saveState = saveStateFn;
  _switchTab = switchTabFn;
  // Debounced local persist for rapid keystrokes; falls back to the immediate
  // save if a caller didn't wire it (keeps behaviour safe by default).
  _scheduleSave = scheduleSaveFn || (() => saveStateFn(true));
}

export function activeWorkoutTimerKey() {
  const state = _getState?.();
  if (!state) return null;
  const week = activeWorkoutWeekKey(state);
  const day = activeWorkoutDay(state, _getSelectedDay?.());
  return workoutSessionKey(state, week, day);
}

/**
 * Durable status used by program activation. A running timer or any user edit
 * makes the workout unresolved; a program switch must explicitly save or
 * discard it before activation state can change.
 */
export function activeWorkoutSwitchStatus() {
  const state = _getState?.();
  if (!state) return { unresolved: false, hasDraft: false, timerActive: false, week: null, day: null };
  const week = activeWorkoutWeekKey(state);
  const day = activeWorkoutDay(state, _getSelectedDay?.());
  const timerActive = getWorkoutElapsedSeconds(workoutSessionKey(state, week, day)) > 0;
  const hasDraft = !!day && hasDayWorkoutDraft(state.weeks?.[week], day);
  return { unresolved: timerActive || hasDraft, hasDraft, timerActive, week, day };
}

function blankProgramDay(state, week, day) {
  const program = getProgramById(state.activeProgramId);
  const blueprint = program?.days?.[day];
  const lifts = {};
  const liftOrder = [];
  if (!program || !blueprint) return { lifts, liftOrder };
  const modifier = getWeekModifier(program, week);
  for (const liftName of (blueprint.lifts || [])) {
    if (typeof liftName !== 'string' || !liftName.trim()) continue;
    lifts[liftName] = prescribeSetsForLift(week, day, liftName, blueprint.desc, modifier);
    liftOrder.push(liftName);
  }
  return { lifts, liftOrder };
}

/**
 * Resolve the active workout before a program switch. Saving commits the live
 * controls and records elapsed time; discarding restores the blank prescription
 * (or removes a one-off session). Both stop the session timers before returning.
 * @param {'save'|'discard'} action
 */
export async function resolveWorkoutBeforeProgramSwitch(action) {
  if (action !== 'save' && action !== 'discard') return false;
  const state = _getState?.();
  if (!state) return false;
  const status = activeWorkoutSwitchStatus();
  const week = status.week;
  const day = status.day;
  if (!week || !day) return false;

  const oneOff = activeOneOffSession(state);
  if (action === 'save') {
    commitWorkoutUIState();
    const timerKey = workoutSessionKey(state, week, day);
    const elapsed = getWorkoutElapsedSeconds(timerKey);
    const weekData = state.weeks?.[week];
    if (elapsed > 0 && weekData) {
      if (!weekData.gymStats) weekData.gymStats = {};
      if (!weekData.gymStats[day]) weekData.gymStats[day] = { time: '', avgHR: '', maxHR: '', cals: '' };
      if (!weekData.gymStats[day].time) {
        weekData.gymStats[day].time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
      }
    }
    if (oneOff?.key === week) {
      clearActiveOneOffSession(state);
      if (!hasDayWorkoutDraft(state.weeks?.[week], day)) delete state.weeks[week];
    }
  } else if (oneOff?.key === week) {
    delete state.weeks[week];
    clearActiveOneOffSession(state);
  } else {
    const replacement = blankProgramDay(state, week, day);
    deleteDayWorkoutData(state.weeks?.[week], day, replacement);
    try {
      await deleteMapFromDB(week, day, { activationId: state.activeActivationId });
    } catch (_) { /* state deletion remains authoritative; route cleanup is best-effort */ }
  }

  stopAndResetWorkoutTimer(workoutSessionKey(state, week, day));
  dismissRestTimer();
  _saveState(true);
  return true;
}

// ==========================================
// PRIVATE HELPERS
// ==========================================
function _buildExerciseCardEl(liftName, loggedLiftsData, weekData, wk, selectedDay, appState, homeBlueprint, isCollapsed, groupId, ssColor) {
  const setsArr = loggedLiftsData[liftName];
  if (!Array.isArray(setsArr)) return null;

  const isCompleted = setsArr.length > 0 && setsArr.every(isCompletedSet);
  const exCard = document.createElement('div');
  exCard.className = `cockpit-exercise${isCollapsed ? ' collapsed' : ''}${isCompleted ? ' completed' : ''}`;
  exCard.setAttribute('data-liftname', liftName);
  exCard.setAttribute('draggable', 'true');

  let displayLiftName;
  if (!isNaN(liftName) && homeBlueprint.lifts?.[parseInt(liftName, 10)]) {
    displayLiftName = homeBlueprint.lifts[parseInt(liftName, 10)];
  } else if (isInternalLiftId(liftName)) {
    // Defense-in-depth: the v2 migration repairs stored data, but an un-migrated
    // key could still arrive from an older device's cloud blob. Never surface a
    // raw internal id as an exercise name — show an honest fallback instead.
    // (The primary fix is the migration; this is not a cosmetic row filter — the
    // row still renders, just with a truthful label.)
    displayLiftName = UNKNOWN_LIFT_NAME;
  } else {
    displayLiftName = liftName;
  }

  let blueprintLabel = 'Target: Working Sets';
  let diagnostic = { isStalled: false, suggestedWeight: '', progression: null };
  // Keep the resolved prescription available while rendering the set rows.
  // The fallback is deliberately blank rather than inventing a numeric target
  // if an old/custom program cannot be resolved.
  let target = { sets: setsArr.length, reps: '' };
  try {
    if (homeBlueprint.oneOff) {
      const reps = setsArr.find((set) => String(set?.r || '').trim())?.r || '';
      target = { sets: setsArr.length, reps };
      blueprintLabel = reps ? `Copied target: ${target.sets} × ${reps}` : 'Your workout';
    } else {
      // Resolve the prescribed target first so the auto-progression engine can
      // judge whether last session actually hit the rep goal.
      const weekModifier = getWeekModifier(getProgramById(appState.activeProgramId), wk);
      target = liftTarget(homeBlueprint.desc, displayLiftName, weekModifier);
      diagnostic = computeDiagnosticForLift(wk, selectedDay, liftName, repGoalFromTarget(target.reps) || 0);
      // Label shows the SAME target we materialise (inline spec or week modifier),
      // so "Target: 4 × 5" always matches the number of set rows populated.
      blueprintLabel = `Target: ${target.sets} × ${target.reps}`;
    }
    // Auto-progression hint: a concrete next move derived from last session.
    const prog = diagnostic.progression;
    if (prog && prog.action !== 'baseline') {
      const icon = { 'load-up': '▲', 'hold': '▬', 'rep-up': '＋', 'deload': '▼' }[prog.action] || '›';
      blueprintLabel += ` · ${icon} ${prog.rationale}`;
    } else if (diagnostic.isStalled) {
      blueprintLabel += ' · ⚠️ plateauing — hold load or add rest';
    }
  } catch(e) { console.warn(e); }

  // #5 single-focus accordion — a finished exercise reads as a one-line achieved
  // summary ("✓ 3 × 5 @ 100kg") instead of its target, so a collapsed card is
  // informative at a glance and the cockpit stays focused on the current lift.
  // Keep the pure target too, so un-checking a set restores the prescription.
  const targetLabel = blueprintLabel;
  if (isCompleted) {
    const wu = appState.settings?.weightUnit || 'kg';
    blueprintLabel = _achievedSummaryFromSets(setsArr, wu) || blueprintLabel;
  }

  // Weights are stored in the user's configured unit — label them with it, not a
  // hardcoded "kg" (which mislabelled every number for lbs users).
  const wUnit = appState.settings?.weightUnit === 'lbs' ? 'lbs' : 'kg';
  const loggerHistory = exerciseLoggerHistory(appState, displayLiftName, {
    weekKey: wk,
    day: selectedDay,
    beforeDate: weekData?.dates?.[selectedDay] || dateKey(),
  });
  const priorPerformance = loggerHistory.latest;
  let historicalLineText = 'First time logging this — today sets your baseline';
  if (priorPerformance) {
    const doneSets = priorPerformance.workingSets;
    historicalLineText = 'Last session: [ ' + doneSets.map((set) => {
      const weight = parseFloat(set?.w) || 0;
      const reps = parseInt(set?.r, 10) || 0;
      return weight > 0
        ? `${escapeHtml(String(weight))}${wUnit} × ${escapeHtml(String(reps))}`
        : `${escapeHtml(String(reps))} reps`;
    }).join(', ') + ' ]';
  } else if (loggerHistory.globalBestEstimated1RM > 0) {
    historicalLineText = `Previous best: ${Math.round(loggerHistory.globalBestEstimated1RM)}${wUnit} (estimated 1RM)`;
  }

  const safeLiftName = escapeHtml(liftName);
  const displaySafeName = escapeHtml(displayLiftName);

  // The auto-progression suggestion becomes the ghost target on every set row.
  // When a numeric progression is not possible (for example bodyweight or
  // max-rep work), preserve the matching set from the latest dated performance
  // across days, programs and archived activations.
  const suggestedGhost = (diagnostic.progression && diagnostic.progression.weight)
    ? { w: diagnostic.progression.weight, r: diagnostic.progression.reps }
    : null;
  const setsMarkup = setsArr.map((sData, sIdx) => {
    let ghostSet = suggestedGhost;
    if (!ghostSet) {
      const hist = priorPerformance?.workingSets?.[sIdx];
      if (hist && (hist.w || hist.r)) ghostSet = hist;
    }
    return buildSetRow(
      sData, sIdx, safeLiftName, ghostSet, wUnit, displayLiftName,
      _currentBodyweight(appState), target.reps, repGoalFromTarget(target.reps),
    );
  }).join('');

  // C4b — per-side plate math for the coach's target weight (barbell lifts only:
  // skip when there's no numeric target). Bodyweight/accessory targets yield '' .
  let plates = '';
  try {
    const tw = diagnostic.progression && diagnostic.progression.weight;
    if (tw && !isNaN(Number(tw)) && Number(tw) > 0) {
      plates = plateHint(Number(tw), appState.settings?.weightUnit || 'kg');
    }
  } catch (_) {}

  try {
    exCard.innerHTML = buildExerciseCard({ displaySafeName, safeLiftName, isCompleted, diagnostic, blueprintLabel, targetLabel, historicalLineText, setsMarkup, groupId, ssColor, plates });
  } catch(e) {
    exCard.innerHTML = `<div class="card-dark p-3 text-inverse">${displaySafeName} (Render Error)</div>`;
  }
  return exCard;
}

// ==========================================
// RENDER
// ==========================================
export function renderWorkout() {
  if (!_getState || !_getSelectedDay) return;
  
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());

  const wk = activeWorkoutWeekKey(appState);
  
  if (!appState.weeks) appState.weeks = {};
  if (!appState.weeks[wk]) appState.weeks[wk] = { runs: {}, lifts: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {} };
  
  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
  if (!appState.weeks[wk].lifts) appState.weeks[wk].lifts = {};
  if (!appState.weeks[wk].notes) appState.weeks[wk].notes = {};
  if (!appState.weeks[wk].gymRpe) appState.weeks[wk].gymRpe = {};
  if (!appState.weeks[wk].bodyWeight) appState.weeks[wk].bodyWeight = {};
  if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
  if (!appState.weeks[wk].liftOrder) appState.weeks[wk].liftOrder = {};

  const weekData = appState.weeks[wk];

  const activeProgram = getProgramById(appState.activeProgramId);
  const oneOff = activeOneOffSession(appState);
  const homeBlueprint = oneOffBlueprint(appState,
    activeProgram?.days?.[selectedDay] || { lifts: [], runs: "Rest" });
  const todayProgramDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  const movedContext = oneOff ? null : rescheduledWorkoutContext(activeProgram, selectedDay, todayProgramDay);
  const cockpitTitle = document.getElementById('cockpitWorkoutTitle');
  const cockpitDayBadge = document.getElementById('cockpitDayBadge');
  const scheduleContext = document.getElementById('cockpitScheduleContext');
  if (cockpitTitle) cockpitTitle.textContent = homeBlueprint.title || 'Workout';
  if (cockpitDayBadge) cockpitDayBadge.textContent = oneOff ? 'One-off' : movedContext ? 'Logging today' : 'Today';
  if (scheduleContext) {
    scheduleContext.hidden = !movedContext;
    scheduleContext.textContent = movedContext
      ? `${movedContext.title} is scheduled ${movedContext.sourceLabel}. This workout will be logged today, ${movedContext.todayLabel}.`
      : '';
  }

  // --- RUN METRICS ---
  const runContext = weekData.runs[selectedDay] || { dist: '', time: '', rpe: '', avgHR: '', maxHR: '', elev: '', cals: '', pace: '', notes: '' };

  const distEl       = document.getElementById('runInputDist');
  const timeEl       = document.getElementById('runInputTime');
  const rpeCockpitEl = document.getElementById('runInputRpeCockpit');
  const paceEl       = document.getElementById('runInputPace');
  const notesRunEl   = document.getElementById('runInputNotes');
  const avgHREl      = document.getElementById('runInputAvgHR');
  const maxHREl      = document.getElementById('runInputMaxHR');
  const elevEl       = document.getElementById('runInputElev');
  const calsEl       = document.getElementById('runInputCals');
  const runExtraStatsRow = document.getElementById('runExtraStats');

  const distUnit = _runDistUnit(appState);
  if (distEl)       distEl.value       = (runContext.dist === '' || runContext.dist == null)
                                           ? '' : _kmToDisplayDist(runContext.dist, distUnit);
  if (timeEl)       timeEl.value       = runContext.time        || '';
  if (rpeCockpitEl) rpeCockpitEl.value = runContext.rpe         || '';
  if (notesRunEl)   notesRunEl.value   = runContext.notes       || '';
  if (avgHREl)      avgHREl.value      = runContext.avgHR       || '';
  if (maxHREl)      maxHREl.value      = runContext.maxHR       || '';
  if (elevEl)       elevEl.value       = runContext.elev        || '';
  if (calsEl)       calsEl.value       = runContext.cals        || '';

  // Restore or compute pace (per the user's display unit)
  if (paceEl) {
    const dispDist = _kmToDisplayDist(runContext.dist, distUnit);
    const computedPace = _paceFromDistTime(dispDist, runContext.time);
    paceEl.value = computedPace || runContext.pace || '';
    paceEl.placeholder = `—:—— /${distUnit}`;
  }
  // Distance + pace unit labels track the configured unit.
  const distLabelEl = document.getElementById('runDistUnitLabel');
  if (distLabelEl) distLabelEl.textContent = distUnit === 'mi' ? 'Dist MI' : 'Dist KM';
  const paceUnitEl = document.getElementById('runPaceUnit');
  if (paceUnitEl) paceUnitEl.textContent = `/${distUnit}`;

  const hasRunExtra = runContext.avgHR || runContext.maxHR || runContext.elev || runContext.cals ||
                      runContext.avgCadence || runContext.descent || runContext.trainingEffect ||
                      weekData.runs[selectedDay]?.splits?.length > 0;
  if (runExtraStatsRow) runExtraStatsRow.style.display = hasRunExtra ? 'block' : 'none';

  // HR Zones strip
  const hrZonesContainer = document.getElementById('runHrZonesContainer');
  const hrZonesBar       = document.getElementById('runHrZonesBar');
  const hrZonesLabels    = document.getElementById('runHrZonesLabels');
  if (hrZonesContainer && hrZonesBar && hrZonesLabels) {
    const zones = runContext.hrZones;
    if (zones && Array.isArray(zones) && zones.some(z => z > 0)) {
      hrZonesContainer.style.display = 'block';
      const zoneColors  = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
      const zoneLabels  = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
      const total       = zones.reduce((s, z) => s + z, 0) || 1;
      hrZonesBar.innerHTML = zones.map((z, i) => {
        const pct = Math.round((z / total) * 100);
        return pct > 0
          ? `<div style="width:${pct}%;background:${zoneColors[i]};height:100%;transition:width 0.4s;"></div>`
          : '';
      }).join('');
      hrZonesLabels.innerHTML = zones.map((z, i) => {
        const m = Math.floor(z / 60);
        const s = Math.round(z % 60).toString().padStart(2, '0');
        return `<span style="color:${zoneColors[i]};">${zoneLabels[i]} ${m}:${s}</span>`;
      }).join('');
    } else {
      hrZonesContainer.style.display = 'none';
    }
  }

  // --- GYM METRICS ---
  const gymContext = weekData.gymStats[selectedDay] || { time: '', avgHR: '', maxHR: '', cals: '' };
  
  const gTimeEl        = document.getElementById('gymInputTime');
  const gAvgHREl       = document.getElementById('gymInputAvgHR');
  const gMaxHREl       = document.getElementById('gymInputMaxHR');
  const gCalsEl        = document.getElementById('gymInputCals');
  const gTEEl          = document.getElementById('gymInputTE');
  const gAerobicTEEl   = document.getElementById('gymInputAerobicTE');
  const gymStatsRow    = document.getElementById('gymStatsRow');

  if (gTimeEl)      gTimeEl.value      = gymContext.time         || '';
  if (gAvgHREl)     gAvgHREl.value     = gymContext.avgHR        || '';
  if (gMaxHREl)     gMaxHREl.value     = gymContext.maxHR        || '';
  if (gCalsEl)      gCalsEl.value      = gymContext.cals         || '';
  if (gTEEl)        gTEEl.value        = gymContext.trainingEffect || '';
  // "Anaerobic TE" field. Read the correctly-named field, falling back to the
  // legacy `aerobicTE` key on sessions saved before the R27 rename.
  if (gAerobicTEEl) gAerobicTEEl.value = (gymContext.anaerobicTE ?? gymContext.aerobicTE) || '';

  const hasGymStats = gymContext.time || gymContext.avgHR || gymContext.maxHR || gymContext.cals ||
                      gymContext.trainingEffect;
  if (gymStatsRow) gymStatsRow.style.display = hasGymStats ? 'block' : 'none';

  // --- MAP GARMIN DATA TO INPUTS ---
  const rStats = appState.weeks[wk].runs?.[selectedDay] || {};

  const cadenceEl = document.getElementById('runInputCadence');
  if (cadenceEl) cadenceEl.value = rStats.avgCadence || '--';

  const descentEl = document.getElementById('runInputDescent');
  if (descentEl) descentEl.value = rStats.descent || '--';

  const teEl = document.getElementById('runInputTE');
  if (teEl) teEl.value = rStats.trainingEffect || '--';

  const splitsContainer = document.getElementById('runSplitsContainer');
  const splitsTable = document.getElementById('runSplitsTable');
  if (splitsContainer && splitsTable) {
      if (rStats.splits && rStats.splits.length > 0) {
          const threshold = appState.thresholdPaceSeconds;
          const zoneColour = (secPerKm) => {
            if (!threshold) return '#f43f5e';
            const d = secPerKm - threshold;
            if (d >  90) return '#22d3ee';
            if (d >  30) return '#10b981';
            if (d > -30) return '#f59e0b';
            if (d > -60) return '#f97316';
            return '#ef4444';
          };
          let html = '<div style="font-size: 0.75rem; color: #fff;">';
          rStats.splits.forEach(s => {
              const min = Math.floor(s.time / 60);
              const sec = Math.floor(s.time % 60).toString().padStart(2, '0');
              const colour = zoneColour(s.time / (s.dist || 1));
              html += `<div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                          <span>Lap ${s.lap}</span>
                          <span>${s.dist.toFixed(2)} km</span>
                          <span style="color:${colour};">${min}:${sec}/km</span>
                          <span style="color:var(--accent-pink);">❤️ ${s.avgHR || '--'}</span>
                       </div>`;
          });
          html += '</div>';
          splitsTable.innerHTML = html;
          splitsContainer.style.display = 'block';
      } else {
          splitsContainer.style.display = 'none';
      }
  }

  const gStats = appState.weeks[wk].gymStats?.[selectedDay] || {};
  const gymSetsContainer = document.getElementById('gymSetsBreakdown');
  const gymSetsTable = document.getElementById('gymSetsTable');
  if (gymSetsContainer && gymSetsTable) {
      if (gStats.gymSets && gStats.gymSets.length > 0) {
          let html = '<div style="font-size: 0.75rem; color: #fff;">';
          gStats.gymSets.forEach(s => {
              html += `<div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                          <span>Set ${s.set}</span>
                          <span>${s.reps} reps</span>
                          <span>${s.weight} kg</span>
                          <span style="color:var(--accent-blue);">${s.category || ''}</span>
                       </div>`;
          });
          html += '</div>';
          gymSetsTable.innerHTML = html;
          gymSetsContainer.style.display = 'block';
          
          if (gymStatsRow) gymStatsRow.style.display = 'block';
      } else {
          gymSetsContainer.style.display = 'none';
      }
  }

  // === RENDER MAP FROM IndexedDB ===
  renderRunMap(wk, selectedDay, runContext.dist, {
    splits: rStats.splits,
    thresholdSec: appState.thresholdPaceSeconds,
    activationId: appState.activeActivationId,
    sessionId: runContext.sessionId,
  });

  const notesEl = document.getElementById('sessionNotesInput');
  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');

  if (notesEl) notesEl.value = weekData.notes[selectedDay] || '';
  if (gymRpeEl) gymRpeEl.value = weekData.gymRpe?.[selectedDay] || '';

  // --- REORDER AEROBIC TILE DYNAMICALLY ---
  const runPanel = document.getElementById('cockpitRunPanel');
  const runSpecsEl = document.getElementById('cockpitRunSpecs');
  const exercisesContainer = document.getElementById('cockpitExercisesContainer');

  const blueprintRun = homeBlueprint.runs || '';
  const isRunScheduled = blueprintRun && !blueprintRun.toLowerCase().includes('no structured') && blueprintRun.toLowerCase() !== 'rest';

  if (runSpecsEl) runSpecsEl.textContent = blueprintRun || 'Rest';

  const runTypeBadgeEl = document.getElementById('runTypeBadge');
  if (runTypeBadgeEl) {
    const runType = isRunScheduled ? detectRunType(blueprintRun) : null;
    if (runType) {
      runTypeBadgeEl.textContent = runType.label;
      runTypeBadgeEl.style.setProperty('--badge-color', runType.color);
      runTypeBadgeEl.style.display = '';
    } else {
      runTypeBadgeEl.style.display = 'none';
    }
  }

  if (runPanel) {
    runPanel.classList.toggle('run-collapsed', !isRunScheduled);
  }

  if (runPanel && exercisesContainer) {
    if (!isRunScheduled) {
      exercisesContainer.after(runPanel);
    } else {
      exercisesContainer.before(runPanel);
    }
  }

  const daySelectorBar = document.getElementById('cockpitDaySelectorBar');
  if (daySelectorBar) {
    daySelectorBar.hidden = !!oneOff;
    const pills = daySelectorBar.querySelectorAll('.day-pill');
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const todayKey = todayProgramDay;
    pills.forEach((pill, idx) => {
      const dayKey = days[idx];
      const dayData = activeProgram.days?.[dayKey];
      const badge = dayData?.badge || dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
      const shortDay = dayKey.charAt(0).toUpperCase() + dayKey.slice(1, 3);
      pill.textContent = `${shortDay} (${badge})`;
      // Mark the real calendar day so the selected chip and today are distinct.
      pill.classList.toggle('day-pill--today', dayKey === todayKey);
    });
    // Centre the selected day in the horizontally-scrolling bar. On Sat/Sun the
    // active pill is otherwise off-screen to the right — the "today" chip was
    // invisible exactly when it mattered.
    const selIdx = days.indexOf(selectedDay);
    const activePill = (selIdx >= 0 && pills[selIdx]) || daySelectorBar.querySelector('.day-pill.active');
    if (activePill && typeof activePill.scrollIntoView === 'function') {
      try { activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (_) {}
    }
  }

  // Day-appropriate primary action: the gym START button only makes sense on a
  // day that actually has lifts. On a run-only or rest day it's hidden (the run
  // panel carries its own Start/Track), so "Start Workout" never sits above
  // "No lifting scheduled today".
  const startBtn = document.getElementById('startWorkoutBtn');
  if (startBtn) {
    const hasGymToday = Array.isArray(homeBlueprint.lifts) && homeBlueprint.lifts.length > 0;
    const timerKey = workoutSessionKey(appState, wk, selectedDay);
    const timerRunning = bindWorkoutTimerSession(timerKey) && getWorkoutElapsedSeconds(timerKey) > 0;
    startBtn.style.display = (hasGymToday && !timerRunning) ? '' : 'none';
  }

  if (!exercisesContainer) return;

  const currentScrollY = window.scrollY;
  const previouslyExpandedLift = document.querySelector('.cockpit-exercise:not(.collapsed)')?.getAttribute('data-liftname');

  const timerBar = document.getElementById('cockpitTimerBar');
  const viewWorkoutEl = document.getElementById('view-workout');
  if (timerBar && viewWorkoutEl && timerBar.parentNode !== viewWorkoutEl) {
    viewWorkoutEl.appendChild(timerBar);
  }

  exercisesContainer.innerHTML = '';

  const loggedLiftsData = weekData.lifts[selectedDay] || {};

  if (Object.keys(loggedLiftsData).length === 0 && selectedDay !== 'sun') {
    exercisesContainer.innerHTML = buildEmptyWorkoutCard();
  }

  // Ensure liftMeta exists
  if (!weekData.liftMeta) weekData.liftMeta = {};
  if (!weekData.liftMeta[selectedDay]) weekData.liftMeta[selectedDay] = {};
  const liftMeta = weekData.liftMeta[selectedDay];

  const orderedNames = activeSessionLiftNames(weekData, selectedDay, homeBlueprint, { oneOff: !!oneOff });
  const activeNames = new Set(orderedNames);

  // Build superset group map only from exercises owned by this live session.
  // Quarantined historical rows remain stored for Activities/analytics but can
  // no longer appear in or count toward today's workout.
  const SS_COLORS = { A: '#3b82f6', B: '#a855f7', C: '#10b981', D: '#f59e0b', E: '#ec4899', F: '#06b6d4' };
  const groupMap = {};
  for (const ln in loggedLiftsData) {
    if (!activeNames.has(ln)) continue;
    const gId = liftMeta[ln]?.groupId;
    if (gId) {
      if (!groupMap[gId]) groupMap[gId] = [];
      if (!groupMap[gId].includes(ln)) groupMap[gId].push(ln);
    }
  }

  const renderedLifts = new Set();
  let isFirstAccordionField = true;

  for (const liftName of orderedNames) {
    if (renderedLifts.has(liftName)) continue;
    const setsArr = loggedLiftsData[liftName];
    if (!Array.isArray(setsArr)) continue;

    const groupId     = liftMeta[liftName]?.groupId;
    const groupMembers = groupId && groupMap[groupId]?.length > 1 ? groupMap[groupId] : null;

    if (groupMembers) {
      const ssColor = SS_COLORS[groupId] || '#3b82f6';
      const wrapper = document.createElement('div');
      wrapper.className = 'superset-group';
      wrapper.style.setProperty('--ss-color', ssColor);
      wrapper.setAttribute('data-group-id', groupId);

      const hdr = document.createElement('div');
      hdr.className = 'superset-group-header';
      hdr.innerHTML = `<span class="superset-badge">SS ${groupId}</span><span class="text-xs text-muted" style="margin-left:8px;">Alternate exercises · rest after both</span>`;
      wrapper.appendChild(hdr);

      groupMembers.forEach((memberLift, mIdx) => {
        if (!Array.isArray(loggedLiftsData[memberLift])) return;
        const memberSets = loggedLiftsData[memberLift];
        const mCompleted = memberSets.length > 0 && memberSets.every(isCompletedSet);

        let mCollapsed = true;
        if (previouslyExpandedLift === memberLift) mCollapsed = false;
        else if (isFirstAccordionField && !mCompleted) { mCollapsed = false; isFirstAccordionField = false; }

        const card = _buildExerciseCardEl(memberLift, loggedLiftsData, weekData, wk, selectedDay, appState, homeBlueprint, mCollapsed, groupId, ssColor);
        if (card) wrapper.appendChild(card);

        if (mIdx < groupMembers.length - 1) {
          const connector = document.createElement('div');
          connector.className = 'superset-connector';
          connector.textContent = `↕ SS ${groupId}`;
          wrapper.appendChild(connector);
        }
        renderedLifts.add(memberLift);
      });

      exercisesContainer.appendChild(wrapper);
    } else {
      const isCompleted = setsArr.length > 0 && setsArr.every(isCompletedSet);
      let isCollapsed = true;
      if (previouslyExpandedLift === liftName) isCollapsed = false;
      else if (isFirstAccordionField && !isCompleted) { isCollapsed = false; isFirstAccordionField = false; }

      const card = _buildExerciseCardEl(liftName, loggedLiftsData, weekData, wk, selectedDay, appState, homeBlueprint, isCollapsed, null, null);
      if (card) exercisesContainer.appendChild(card);
      renderedLifts.add(liftName);
    }
  }

  try {
    window.scrollTo(0, currentScrollY);
    moveRestTimerToActiveExercise();
    mountExerciseDragAndDropSystems();
    _wireDaySwipe();
  } catch(e) { console.warn(e); }

  updateCockpitCoaching(appState, selectedDay, activeProgram);
}

// C4c — swipe left/right on the exercise list to move between workout days, a
// native gesture expectation. Wired once; drives the existing day-pill switcher
// so all the commit/render/state handling is reused. Ignores vertical scrolls
// and short/slow drags so it never fights the list scroll.
function _wireDaySwipe() {
  const view = document.getElementById('cockpitExercisesContainer');
  if (!view || view._swipeWired) return;
  view._swipeWired = true;
  let x0 = null, y0 = null, t0 = 0;
  view.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  view.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0;
    x0 = null;
    if (dt > 600) return;                                  // too slow to be a swipe
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // not clearly horizontal
    _swipeToDay(dx < 0 ? 1 : -1);                          // swipe left → next day
  }, { passive: true });
}

function _swipeToDay(dir) {
  const pills = Array.from(document.querySelectorAll('#cockpitDaySelectorBar .day-pill'));
  const days = pills.map(p => p.getAttribute('data-day'));
  const target = neighborDay(days, _getSelectedDay(), dir);
  if (!target) return;
  const pill = pills.find(p => p.getAttribute('data-day') === target);
  pill?.click();  // routes through the set-day action (commit + render reused)
}

// The cockpit's coaching voice: a decisive, consequence-first intent line (the
// recommendation headline — same voice as the briefing, no mechanism numbers)
// and a live forward hook ("… train and it rises to 85") that recomputes as the
// session is logged. Best-effort: never blocks the cockpit if the engine can't run.
export function updateCockpitCoaching(appState, selectedDay, activeProgram) {
  const statusEl = document.getElementById('cockpitSessionStatus');
  const hookEl   = document.getElementById('cockpitScoreHook');
  if (!statusEl && !hookEl) return;
  if (activeOneOffSession(appState)) {
    if (statusEl) statusEl.textContent = 'One-off strength workout';
    if (hookEl) hookEl.textContent = 'This session stays separate from your program schedule.';
    return;
  }
  try {
    const days    = _getDays ? _getDays() : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const program = activeProgram || getProgramById(appState.activeProgramId);
    const model   = computeDashboardModel(appState, days, program, selectedDay);

    if (statusEl) {
      const rec = generateRecommendation(appState, days, program, selectedDay);
      if (rec?.headline) statusEl.textContent = rec.headline;
    }
    if (hookEl) {
      const line = projectionLine(projectScore(model, appState, days));
      if (line) { hookEl.textContent = line; hookEl.style.display = ''; }
      else { hookEl.style.display = 'none'; }
    }
  } catch (_) { /* coaching is best-effort */ }
}

// Stamp the calendar date the first time a day has a completed set, so the
// workout shows on the activity calendar. Idempotent; covers every completion
// path (manual checkbox, one-tap quick log, commit-on-navigate).
function _ensureWorkoutDateStamp(appState, wk, day) {
  const dayLifts = appState.weeks?.[wk]?.lifts?.[day];
  if (!dayLifts) return;
  const hasCompleted = Object.values(dayLifts).some(sets => Array.isArray(sets) && sets.some(isCompletedSet));
  if (!hasCompleted) return;
  if (!appState.weeks[wk].dates) appState.weeks[wk].dates = {};
  if (!appState.weeks[wk].dates[day]) appState.weeks[wk].dates[day] = dateKey();
}

export function executeOneTapQuickLog(labelNode, liftName, sIdx) {
  if (!labelNode) return;
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  
  const parentRow = labelNode.closest('.cockpit-set-row');
  if (!parentRow) return;

  const wInput = parentRow.querySelector('.input-weight-node');
  const rInput = parentRow.querySelector('.input-reps-node');
  const checkbox = parentRow.querySelector('.gym-check');

  let targetW = wInput.value;
  let targetR = rInput.value;

  // Fall back to the on-screen ghost (the placeholder) — it now carries the
  // auto-progression suggestion, so one-tap logs exactly what the coach shows.
  // The default placeholders ("kg"/"reps") are non-numeric and ignored.
  if (!targetW) {
    const ph = wInput.getAttribute('placeholder');
    if (ph && !isNaN(parseFloat(ph))) targetW = ph;
  }
  if (!targetR) {
    const ph = _numericPlaceholder(rInput);
    if (ph != null) targetR = String(ph);
  }

  if (!targetW || !targetR) {
    const historicalSet = exerciseLoggerHistory(appState, liftName, {
      weekKey: wk,
      day: selectedDay,
      beforeDate: appState.weeks?.[wk]?.dates?.[selectedDay] || dateKey(),
    }).latest?.workingSets?.[sIdx];
    if (historicalSet && historicalSet.w && historicalSet.r) {
      if (!targetW) targetW = historicalSet.w;
      if (!targetR) targetR = historicalSet.r;
    }
  }

  // Carry forward the athlete's own earlier set this session (straight sets), so
  // one-tapping S2–S3 copies S1 instead of inventing numbers.
  if (!targetW || !targetR) {
    const inh = _inheritedSetFromSession(parentRow.closest('.cockpit-exercise'), parentRow);
    if (inh) {
      if (!targetW) targetW = inh.w;
      if (!targetR) targetR = inh.r;
    }
  }

  // Nothing honest to log (no typed value, no ghost, no history, no prior set) —
  // ask for the numbers rather than fabricating a 40×10. Matches the manual-tick
  // path, which bounces the same way instead of inventing a load.
  if (!targetW || !targetR) {
    showToast('Enter weight & reps first', true);
    (!targetW ? wInput : rInput).focus();
    return;
  }

  wInput.value = targetW;
  rInput.value = targetR;
  if (checkbox) checkbox.checked = true;

  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) appState.weeks[wk].lifts[selectedDay][liftName] = [];

  // E5 — record the PRESCRIBED target (the ghost placeholder) distinctly from the
  // actual, so true-adherence is measurable later. Read the placeholder, not the
  // logged value, so it's the coach's prescription even if the athlete typed a
  // different number. Additive + never overwritten: default "kg"/"reps" ghosts are
  // non-numeric and skipped, and an existing target is preserved.
  const _tw = _numericPlaceholder(wInput);
  const _tr = _prescribedRepGoal(rInput);

  // Merge — never replace: preserve any existing set metadata (type, rpe, isPR)
  // so quick-logging a warmup/drop set doesn't silently demote it to a working set.
  const _setArr = appState.weeks[wk].lifts[selectedDay][liftName];
  let _prev = _setArr[sIdx] || {};
  const rowMode = parentRow.dataset?.loadMode;
  // A blank Pull-Up/Dip/Push-Up row defaults visibly to Bodyweight. Persist
  // that same mode when its labelled shortcut is used, so the first tap is
  // honest metadata rather than an untyped numeric weight.
  if (isBodyweightExercise(liftName) && rowMode === 'bodyweight' && !_prev.loadMode && !_prev.bw) {
    _prev = applyLoadMode(_prev, 'bodyweight', {
      bodyweight: _currentBodyweight(appState),
      bandWeights: appState.settings?.bandWeights,
    });
  }
  _setArr[sIdx] = { ..._prev, w: targetW, r: targetR, c: true };
  if (_tw != null && _prev.tw == null) _setArr[sIdx].tw = _tw;
  if (_tr != null && _prev.tr == null) _setArr[sIdx].tr = _tr;
  _ensureWorkoutDateStamp(appState, wk, selectedDay);

  parentRow.classList.add('is-complete');
  hapticTick();

  try {
    const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
    const setRpe = gymRpeEl && gymRpeEl.value ? parseFloat(gymRpeEl.value) : null;
    const setType = appState.weeks[wk].lifts?.[selectedDay]?.[liftName]?.[sIdx]?.type || '';
    triggerRestTimerEngine(liftName, setRpe, setType);
  } catch(e) { console.warn(e); }

  _saveState(true);
  evaluateAccordionAutoFlowTransitions();
}

// Ghost targets #4 — accept the coach's suggestion for the whole exercise in one
// tap: fill + complete every incomplete WORKING set from its ghost target,
// reusing the exact one-tap path (PR detection, prescribed-vs-actual capture,
// rest timer, persistence). Warm-ups and already-logged sets are left alone.
export function logAllAtTarget(liftName) {
  const card = document.querySelector(`.cockpit-exercise[data-liftname="${(window.CSS && CSS.escape) ? CSS.escape(liftName) : liftName}"]`);
  if (!card) return;
  let logged = 0;
  Array.from(card.querySelectorAll('.cockpit-set-row')).forEach(row => {
    if (row.classList.contains('is-complete') || row.classList.contains('type-warmup')) return;
    const label = row.querySelector('.set-num-lbl[data-action="quick-log"]');
    const sIdx = parseInt(row.getAttribute('data-set-index'), 10);
    if (label && !isNaN(sIdx)) { executeOneTapQuickLog(label, liftName, sIdx); logged++; }
  });
  if (logged > 0) { hapticSuccess(); showToast(`Logged ${logged} set${logged > 1 ? 's' : ''} at target ✓`); }
}

export function updateInputState(inputNode) {
  if (!inputNode) return;
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const exCard = inputNode.closest('.cockpit-exercise');
  if (!exCard) return;
  
  const liftName = exCard.getAttribute('data-liftname');
  const row = inputNode.closest('.cockpit-set-row');
  if (!row) return;
  
  const sIdx = Array.from(exCard.querySelectorAll('.cockpit-set-row')).indexOf(row);
  
  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) appState.weeks[wk].lifts[selectedDay][liftName] = [];
  if (!appState.weeks[wk].lifts[selectedDay][liftName][sIdx]) {
    appState.weeks[wk].lifts[selectedDay][liftName][sIdx] = { w: '', r: '', c: false };
  }

  // E5 — capture the prescribed target (ghost placeholder) alongside the actual,
  // additively, so a manually-typed set still records what it was measured against.
  const setObj = appState.weeks[wk].lifts[selectedDay][liftName][sIdx];
  markSessionInProgress(appState.weeks[wk], selectedDay);
  const ph = inputNode.classList.contains('input-reps-node')
    ? _prescribedRepGoal(inputNode)
    : _numericPlaceholder(inputNode);
  if (inputNode.classList.contains('input-weight-node')) {
    setObj.w = inputNode.value;
    if (ph != null && setObj.tw == null) setObj.tw = ph;
  } else {
    setObj.r = inputNode.value;
    if (ph != null && setObj.tr == null) setObj.tr = ph;
  }
  // High-frequency keystroke path: debounce the local write instead of
  // serialising the whole state on every digit. Set-completion, quick-log and
  // finish still persist immediately (they use _saveState). A backgrounded app
  // flushes any pending write (state.js pagehide/visibilitychange).
  _scheduleSave();
}

export function commitWorkoutUIState() {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const weekData = appState.weeks[wk];

  const distEl     = document.getElementById('runInputDist');
  const timeEl     = document.getElementById('runInputTime');
  const rpeRunEl   = document.getElementById('runInputRpeCockpit');
  const paceEl     = document.getElementById('runInputPace');
  const notesRunEl = document.getElementById('runInputNotes');
  const avgHREl    = document.getElementById('runInputAvgHR');
  const maxHREl    = document.getElementById('runInputMaxHR');
  const elevEl     = document.getElementById('runInputElev');
  const calsEl     = document.getElementById('runInputCals');

  if (distEl && distEl.offsetParent !== null) {
    const existing = weekData.runs[selectedDay] || {};
    const distUnit = _runDistUnit(appState);
    const update = {
      ...existing,
      // Convert the entered display-unit distance back to canonical km.
      dist:  distEl.value === '' ? '' : _displayDistToKm(distEl.value, distUnit),
      time:  timeEl.value,
      rpe:   rpeRunEl.value,
      pace:  paceEl   ? paceEl.value   : '',
      notes: notesRunEl ? notesRunEl.value : '',
      avgHR: avgHREl ? avgHREl.value : '',
      maxHR: maxHREl ? maxHREl.value : '',
      elev:  elevEl  ? elevEl.value  : '',
      cals:  calsEl  ? calsEl.value  : '',
    };
    if (hasRunData(update) || existing.sessionId) {
      upsertRunSession(weekData, selectedDay, update, {
        sessionId: existing.sessionId || newRunSessionId(),
        source: existing.source || 'cockpit',
        localDate: existing.localDate || weekData.dates?.[selectedDay] || null,
        startTs: existing.startTs,
      });
    }
  }

  if (!weekData.gymStats) weekData.gymStats = {};
  const gTimeEl = document.getElementById('gymInputTime');
  const gAvgHREl = document.getElementById('gymInputAvgHR');
  const gMaxHREl = document.getElementById('gymInputMaxHR');
  const gCalsEl = document.getElementById('gymInputCals');

  if (gTimeEl && gTimeEl.offsetParent !== null) {
    // Spread existing so .FIT-imported extras (trainingEffect, anaerobicTE,
    // gymSets) survive — they have no inputs here and would otherwise be wiped.
    const existingGym = weekData.gymStats[selectedDay] || {};
    weekData.gymStats[selectedDay] = {
        ...existingGym,
        time: gTimeEl.value,
        avgHR: gAvgHREl ? gAvgHREl.value : '',
        maxHR: gMaxHREl ? gMaxHREl.value : '',
        cals: gCalsEl ? gCalsEl.value : ''
    };
  }

  const notesEl = document.getElementById('sessionNotesInput');
  const rpeGymEl = document.getElementById('sessionGymRpeCockpit');

  if (notesEl && notesEl.offsetParent !== null) weekData.notes[selectedDay] = notesEl.value;
  
  if (rpeGymEl && rpeGymEl.offsetParent !== null) {
    if (!weekData.gymRpe) weekData.gymRpe = {};
    weekData.gymRpe[selectedDay] = rpeGymEl.value;
  }

  const targetCardContainer = document.getElementById('cockpitExercisesContainer');
  if (targetCardContainer) {
    targetCardContainer.querySelectorAll('.cockpit-exercise').forEach(exCard => {
      const liftName = exCard.getAttribute('data-liftname');
      exCard.querySelectorAll('.cockpit-set-row').forEach((row, idx) => {
        if (appState.weeks[wk].lifts[selectedDay]?.[liftName]?.[idx]) {
          const wIn = row.querySelector('.input-weight-node');
          const rIn = row.querySelector('.input-reps-node');
          const cIn = row.querySelector('.gym-check');
          
          if (wIn) appState.weeks[wk].lifts[selectedDay][liftName][idx].w = wIn.value;
          if (rIn) appState.weeks[wk].lifts[selectedDay][liftName][idx].r = rIn.value;
          if (cIn) appState.weeks[wk].lifts[selectedDay][liftName][idx].c = cIn.checked;
          if (row.classList.contains('is-pr')) appState.weeks[wk].lifts[selectedDay][liftName][idx].isPR = true;
        }
      });
    });
  }
  _ensureWorkoutDateStamp(appState, wk, selectedDay);
  if (hasDayWorkoutDraft(weekData, selectedDay)) markSessionInProgress(weekData, selectedDay);
  try { updateExercisePRs(); } catch(e) { console.warn(e); }
  _saveState(true);
}

export function updateExercisePRs() {
  const appState = _getState();
  if (!appState.exerciseStats) appState.exerciseStats = {};
  computeExercisePRs(appState, appState.exerciseStats);
}

export function toggleGymCheckLoggingState(checkboxNode) {
  if (!checkboxNode) return;
  const parentRow = checkboxNode.closest('.cockpit-set-row');
  const exCard = checkboxNode.closest('.cockpit-exercise');
  const lifecycleState = _getState();
  const lifecycleDay = activeWorkoutDay(lifecycleState, _getSelectedDay());
  const lifecycleWeek = activeWorkoutWeekKey(lifecycleState);
  markSessionInProgress(lifecycleState.weeks?.[lifecycleWeek], lifecycleDay);
  
  if (checkboxNode.checked) {
    if (parentRow) parentRow.classList.add('is-complete');
    hapticTick();
    // Auto-start the session clock on the first completed set, so the finish
    // modal has a real duration to confirm even if the user never tapped
    // "Start Workout" (idempotent — no-op once running).
    try { startWorkoutTimer(workoutSessionKey(lifecycleState, lifecycleWeek, lifecycleDay)); } catch (_) {}

    const wInput = parentRow ? parentRow.querySelector('.input-weight-node') : null;
    const rInput = parentRow ? parentRow.querySelector('.input-reps-node') : null;
    
    if (wInput && rInput && (!wInput.value || !rInput.value)) {
      const appState = _getState();
      const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
      const wk = activeWorkoutWeekKey(appState);
      const liftName = exCard ? exCard.getAttribute('data-liftname') : null;
      const sIdx = Array.from(exCard.querySelectorAll('.cockpit-set-row')).indexOf(parentRow);
      
      // 1) Prefer this set's real value from the latest dated performance,
      // even when it belongs to another day, program or archived activation.
      const historicalSet = liftName
        ? exerciseLoggerHistory(appState, liftName, {
            weekKey: wk,
            day: selectedDay,
            beforeDate: appState.weeks?.[wk]?.dates?.[selectedDay] || dateKey(),
          }).latest?.workingSets?.[sIdx]
        : null;
      if (historicalSet && historicalSet.w && historicalSet.r) {
        if (!wInput.value) wInput.value = historicalSet.w;
        if (!rInput.value) rInput.value = historicalSet.r;
      }
      // 2) Otherwise carry forward the athlete's own earlier set this session —
      //    straight-set logging (3×8 at one weight) without re-typing, and the
      //    only fill a brand-new user with no coach target/history can get.
      if (!wInput.value || !rInput.value) {
        const inh = _inheritedSetFromSession(exCard, parentRow);
        if (inh) {
          if (!wInput.value) wInput.value = inh.w;
          if (!rInput.value) rInput.value = inh.r;
        }
      }
      // 3) Otherwise fall back to the visible ghost/target shown in the field —
      //    but only when it's an actual number. Never invent an arbitrary load.
      const wGhost = parseFloat(wInput.placeholder);
      const rGhost = parseInt(rInput.placeholder, 10);
      if (!wInput.value && Number.isFinite(wGhost)) wInput.value = String(wGhost);
      if (!rInput.value && Number.isFinite(rGhost)) rInput.value = String(rGhost);

      // 3) Still blank ⇒ there's nothing honest to log. Bounce the tick and ask
      //    for the numbers rather than silently recording a fabricated 40×10.
      if (!wInput.value || !rInput.value) {
        checkboxNode.checked = false;
        parentRow.classList.remove('is-complete');
        showToast('Enter weight & reps first', true);
        (!wInput.value ? wInput : rInput).focus();
        return;
      }
    }

    try {
      const liftName = exCard ? exCard.getAttribute('data-liftname') : null;
      const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
      const setRpe = gymRpeEl && gymRpeEl.value ? parseFloat(gymRpeEl.value) : null;
      const _appState = _getState();
      const _selDay = _getSelectedDay();
      const _wk = activeWorkoutWeekKey(_appState);
      const _sIdx = exCard ? Array.from(exCard.querySelectorAll('.cockpit-set-row')).indexOf(parentRow) : -1;
      const setType = _appState.weeks[_wk].lifts?.[_selDay]?.[liftName]?.[_sIdx]?.type || '';
      triggerRestTimerEngine(liftName, setRpe, setType);
      // Stamp workout date on first set completion for this day
      if (!_appState.weeks[_wk].dates) _appState.weeks[_wk].dates = {};
      if (!_appState.weeks[_wk].dates[_selDay]) {
        _appState.weeks[_wk].dates[_selDay] = dateKey();
      }

      // PR detection — compare this set's bounded e1RM against prior dated
      // performances (with aggregate stats only as a legacy-history fallback).
      if (liftName && setType !== 'W' && _sIdx >= 0) {
        const wIn = parentRow?.querySelector('.input-weight-node');
        const rIn = parentRow?.querySelector('.input-reps-node');
        const w = parseFloat(wIn?.value) || 0;
        const r = parseInt(rIn?.value, 10) || 0;
        if (w > 0 && r > 0) {
          const storedSet = _appState.weeks?.[_wk]?.lifts?.[_selDay]?.[liftName]?.[_sIdx] || {};
          const e1rm = estimatedE1rmForSet(liftName, { ...storedSet, w, r });
          const prior = exerciseLoggerHistory(_appState, liftName, {
            weekKey: _wk,
            day: _selDay,
            beforeDate: _appState.weeks?.[_wk]?.dates?.[_selDay] || dateKey(),
          });
          const prevMax = Math.max(prior.datedBestEstimated1RM, prior.globalBestEstimated1RM);
          // Only celebrate a PR against *real* prior history. The first-ever log
          // of a lift always beats a 0 baseline, so firing "New PR" then made the
          // trophy noise on every exercise of a new user's first session. No
          // history ⇒ this is a baseline, not a record.
          const hasHistory = prior.hasHistory;
          if (e1rm > 0 && hasHistory && e1rm > prevMax + 0.01) {
            parentRow.classList.add('is-pr');
            hapticSuccess();
            if (!parentRow.querySelector('.pr-badge')) {
              const badge = document.createElement('span');
              badge.className = 'pr-badge';
              badge.textContent = 'PR';
              parentRow.appendChild(badge);
            }
            showToast(`🏆 New PR — ${liftName}!`);
          } else if (e1rm > 0 && !hasHistory) {
            showToast(`Baseline set — ${liftName} ✓`);
          }
        }
      }
    } catch(e) { console.warn(e); }
  } else {
    if (parentRow) parentRow.classList.remove('is-complete');
  }
  commitWorkoutUIState();
  evaluateAccordionAutoFlowTransitions();
}

// Achieved one-line summary (#5). Two readers: from state sets (full render) and
// from the live DOM rows (in-place, the moment an exercise is completed).
function _achievedLabel(n, weights, reps, unit) {
  const sameW = weights.every(x => x === weights[0]);
  const sameR = reps.every(x => x === reps[0]);
  return (sameW && sameR && weights[0] > 0)
    ? `✓ ${n} × ${reps[0]} @ ${weights[0]}${unit}`
    : `✓ ${n} sets · top ${Math.max(...weights)}${unit}`;
}
function _achievedSummaryFromSets(setsArr, unit) {
  const working = (setsArr || []).filter(s => isCompletedSet(s) && !isWarmupSet(s));
  if (!working.length) return '✓ Complete';
  return _achievedLabel(working.length, working.map(s => parseFloat(s.w) || 0), working.map(s => parseInt(s.r, 10) || 0), unit);
}
function _achievedSummaryFromCard(card, unit) {
  const done = Array.from(card.querySelectorAll('.cockpit-set-row'))
    .filter(r => !r.classList.contains('type-warmup') && r.querySelector('.gym-check')?.checked);
  if (!done.length) return '✓ Complete';
  return _achievedLabel(done.length,
    done.map(r => parseFloat(r.querySelector('.input-weight-node')?.value) || 0),
    done.map(r => parseInt(r.querySelector('.input-reps-node')?.value, 10) || 0), unit);
}

export function evaluateAccordionAutoFlowTransitions() {
  const expandedCard = document.querySelector('.cockpit-exercise:not(.collapsed)');
  if (!expandedCard) return;
  const rows = Array.from(expandedCard.querySelectorAll('.cockpit-set-row'));
  if (rows.length === 0) return; // a card with no sets isn't "finished"
  const finished = rows.every(r => r.querySelector('.gym-check')?.checked);
  const statusNode = expandedCard.querySelector('.cockpit-ex-status');
  const targetNode = expandedCard.querySelector('.cockpit-ex-target');
  const unit = _getState?.().settings?.weightUnit || 'kg';

  if (finished) {
    const wasCompleted = expandedCard.classList.contains('completed');
    expandedCard.classList.add('completed');
    if (statusNode) statusNode.textContent = 'DONE';
    // Swap the target line for the achieved summary the instant it's done.
    if (targetNode) targetNode.textContent = _achievedSummaryFromCard(expandedCard, unit);
    // Keep the card expanded after the final set so the per-set RPE pad (which
    // only appears on completed sets) stays reachable — previously the card
    // collapsed and auto-advanced the instant the last set was ticked, hiding
    // RPE before it could be entered. Move on by tapping the next exercise.
    if (!wasCompleted) showToast('Exercise Complete! ✓');
  } else {
    // Unchecking a set after completion re-opens the exercise and restores its
    // prescription line (stashed at build time).
    expandedCard.classList.remove('completed');
    if (statusNode) statusNode.textContent = 'LOG';
    if (targetNode && targetNode.dataset.targetLabel) targetNode.textContent = targetNode.dataset.targetLabel;
  }
}

export function appendCustomSetRow(btnNode, liftName) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  
  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName] = [];
  }
  appState.weeks[wk].lifts[selectedDay][liftName].push({ w: '', r: '', c: false });
  _saveState(true);
  renderWorkout();
}

export function appendWarmupSetRow(btnNode, liftName) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);

  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName] = [];
  }
  const sets = appState.weeks[wk].lifts[selectedDay][liftName];
  // Insert warmup before first working set, or at index 0
  const firstWorkingIdx = sets.findIndex(s => !s.type || s.type !== 'W');
  const newSet = { w: '', r: '', c: false, type: 'W' };
  if (firstWorkingIdx === -1) sets.push(newSet);
  else sets.splice(firstWorkingIdx, 0, newSet);

  _saveState(true);
  renderWorkout();
}

export function removeCustomSetRow(liftName, setIndex) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const dayLifts = appState.weeks[wk]?.lifts?.[selectedDay];
  if (!dayLifts?.[liftName]) return;

  // Snapshot BEFORE mutating so Undo can restore the exact prior state — both a
  // single removed set and the case where removing the last set deletes the
  // whole exercise (and its liftOrder entry). The ✕ sits ~40px from the ✓, so a
  // fat-finger on a logged set must be recoverable, not silent data loss.
  const priorSets  = dayLifts[liftName].map(s => ({ ...s }));
  const priorOrder = Array.isArray(appState.weeks[wk].liftOrder?.[selectedDay])
    ? [...appState.weeks[wk].liftOrder[selectedDay]] : null;

  dayLifts[liftName].splice(setIndex, 1);
  if (dayLifts[liftName].length === 0) {
    delete dayLifts[liftName];
    // Drop the now-empty exercise from the explicit display order too.
    const order = appState.weeks[wk].liftOrder?.[selectedDay];
    if (Array.isArray(order)) {
      appState.weeks[wk].liftOrder[selectedDay] = order.filter(n => n !== liftName);
    }
  }
  _saveState(true);
  renderWorkout();
  _offerSetUndo({ liftName, selectedDay, wk, priorSets, priorOrder });
}

// Restore the pre-delete snapshot captured by removeCustomSetRow.
function _restoreRemovedSet(u) {
  const appState = _getState();
  const week = appState.weeks?.[u.wk];
  if (!week) return;
  if (!week.lifts) week.lifts = {};
  if (!week.lifts[u.selectedDay]) week.lifts[u.selectedDay] = {};
  week.lifts[u.selectedDay][u.liftName] = u.priorSets.map(s => ({ ...s }));
  if (u.priorOrder) {
    if (!week.liftOrder) week.liftOrder = {};
    week.liftOrder[u.selectedDay] = [...u.priorOrder];
  }
  _saveState(true);
  renderWorkout();
  showToast('Set restored ✓');
}

// A tappable Undo snackbar (the plain showToast has no action). Sits above the
// bottom nav, auto-dismisses after 6s.
let _undoSnackTimer = null;
function _offerSetUndo(u) {
  if (typeof document === 'undefined') return;
  document.getElementById('setUndoSnack')?.remove();
  if (_undoSnackTimer) { clearTimeout(_undoSnackTimer); _undoSnackTimer = null; }

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

  const dismiss = () => { snack.remove(); if (_undoSnackTimer) clearTimeout(_undoSnackTimer); _undoSnackTimer = null; };
  snack.querySelector('#setUndoBtn')?.addEventListener('click', () => { _restoreRemovedSet(u); dismiss(); });
  _undoSnackTimer = setTimeout(dismiss, 6000);
}

export function cycleSetType(liftName, sIdx) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const setArr = appState.weeks?.[wk]?.lifts?.[selectedDay]?.[liftName];
  if (!setArr || sIdx >= setArr.length) return;

  const cycle = { '': 'W', 'W': 'D', 'D': 'F', 'F': '' };
  const newType = cycle[setArr[sIdx].type || ''];
  setArr[sIdx].type = newType;

  // Update DOM without full re-render
  const exCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = exCard?.querySelectorAll('.cockpit-set-row')?.[sIdx];
  if (row) {
    row.classList.remove('type-warmup', 'type-dropset', 'type-amrap');
    if (newType === 'W') row.classList.add('type-warmup');
    else if (newType === 'D') row.classList.add('type-dropset');
    else if (newType === 'F') row.classList.add('type-amrap');
    const lbl  = row.querySelector('.set-num-lbl');
    const pill = row.querySelector('.type-pill');
    const numLabels  = { '': `S${sIdx + 1}`, 'W': 'W', 'D': 'D', 'F': 'F' };
    const pillLabels = { '': 'set', 'W': 'warm', 'D': 'drop', 'F': 'amrp' };
    if (lbl)  lbl.textContent  = numLabels[newType];
    if (pill) pill.textContent = pillLabels[newType];
  }
  _saveState(true);
}

// Best-available bodyweight for stamping bodyweight sets: latest logged weight,
// else the settings default, else a neutral fallback.
function _currentBodyweight(appState) {
  const log = appState.bodyWeightLog || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const w = parseFloat(log[i]?.weight);
    if (Number.isFinite(w) && w > 0) return w;
  }
  const dbw = parseFloat(appState.settings?.defaultBodyWeight);
  if (Number.isFinite(dbw) && dbw > 0) return dbw;
  return 75;
}

function _replaceSet(setArr, index, next) {
  // Preserve array identity because other workout consumers can hold the live
  // set list, while still applying the pure load-mode result atomically.
  setArr[index] = next;
}

function _syncLoadModeRow(liftName, sIdx, set) {
  const exCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = exCard?.querySelectorAll('.cockpit-set-row')?.[sIdx];
  if (!row) return;
  const mode = resolvedLoadMode(set, liftName);
  row.dataset.loadMode = mode;
  row.querySelectorAll('.set-load-choice__btn').forEach((button) => {
    const active = button.getAttribute('data-mode') === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const wInput = row.querySelector('.input-weight-node');
  if (wInput) wInput.value = set.w || '';
}

export function setSetLoadMode(liftName, sIdx, mode) {
  if (!['bodyweight', 'weighted', 'assisted'].includes(mode)) return;
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const setArr = appState.weeks?.[wk]?.lifts?.[selectedDay]?.[liftName];
  if (!setArr || sIdx < 0 || sIdx >= setArr.length) return;
  const next = applyLoadMode(setArr[sIdx], mode, {
    bodyweight: _currentBodyweight(appState),
    bandWeights: appState.settings?.bandWeights,
  });
  _replaceSet(setArr, sIdx, next);
  _syncLoadModeRow(liftName, sIdx, next);
  _saveState(true);
}

// The overflow load chip remains the fine-grained band selector. Unlike the
// legacy behavior, band kg is assistance subtracted from body mass, never a
// positive lifted load.
export function cycleSetLoad(liftName, sIdx) {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const setArr = appState.weeks?.[wk]?.lifts?.[selectedDay]?.[liftName];
  if (!setArr || sIdx < 0 || sIdx >= setArr.length) return;
  const set = setArr[sIdx];
  const bands = appState.settings?.bandWeights || { L: 10, M: 20, H: 30 };

  const order = ['', 'BW', 'L', 'M', 'H'];
  const cur = set.bw ? 'BW' : (set.band || '');
  const next = order[(order.indexOf(cur) + 1) % order.length];

  let nextSet;
  if (next === 'BW') {
    nextSet = applyLoadMode(set, 'bodyweight', { bodyweight: _currentBodyweight(appState), bandWeights: bands });
  } else if (next) {
    nextSet = applyBandAssistance(set, next, { bodyweight: _currentBodyweight(appState), bandWeights: bands });
  } else {
    nextSet = applyLoadMode(set, 'weighted', { bodyweight: _currentBodyweight(appState), bandWeights: bands });
  }
  _replaceSet(setArr, sIdx, nextSet);

  // Targeted DOM update (keep the card expanded / scroll position).
  const exCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = exCard?.querySelectorAll('.cockpit-set-row')?.[sIdx];
  if (row) {
    const chip = row.querySelector('.btn-load');
    const labels = { '': 'Weighted', BW: 'Bodyweight', L: '🟢 Light band', M: '🟡 Med band', H: '🔴 Heavy band' };
    const cls = next === '' ? 'weighted' : next === 'BW' ? 'bw' : next;
    if (chip) {
      chip.textContent = labels[next];
      chip.className = 'btn-load tactile-scale load-' + cls;
    }
    const wInput = row.querySelector('.input-weight-node');
    if (wInput) wInput.value = nextSet.w;
  }
  _syncLoadModeRow(liftName, sIdx, nextSet);
  _saveState(true);
}

export function showSupersetLinkPanel(exCard) {
  if (!exCard) return;
  const appState   = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const liftName = exCard.getAttribute('data-liftname');

  document.querySelectorAll('.ss-link-panel').forEach(p => p.remove());

  if (!appState.weeks[wk].liftMeta) appState.weeks[wk].liftMeta = {};
  if (!appState.weeks[wk].liftMeta[selectedDay]) appState.weeks[wk].liftMeta[selectedDay] = {};
  const dayMeta  = appState.weeks[wk].liftMeta[selectedDay];
  const myGroupId = dayMeta[liftName]?.groupId;
  const dayLifts  = Object.keys(appState.weeks[wk]?.lifts?.[selectedDay] || {});
  const others    = dayLifts.filter(n => n !== liftName);

  const panel = document.createElement('div');
  panel.className = 'ss-link-panel';

  if (myGroupId) {
    const partners = Object.keys(dayMeta).filter(n => n !== liftName && dayMeta[n]?.groupId === myGroupId);
    panel.innerHTML = `
      <div class="ss-panel-title">Superset ${escapeHtml(String(myGroupId))} — paired with: ${partners.map(n => escapeHtml(n)).join(', ') || 'none'}</div>
      <button class="btn-pad" style="color:#ef4444;border-color:rgba(239,68,68,0.3);" data-action="unlink-superset" data-liftname="${escapeHtml(liftName)}">Unlink superset</button>`;
  } else if (others.length === 0) {
    panel.innerHTML = `<div class="ss-panel-title" style="color:#94a3b8;">Add more exercises to pair as a superset.</div>`;
  } else {
    let html = '<div class="ss-panel-title">Pair with:</div>';
    others.forEach(name => {
      const safe    = escapeHtml(name);
      const display = name;
      html += `<button class="btn-pad" data-action="link-superset" data-liftname="${escapeHtml(liftName)}" data-partner="${safe}">${escapeHtml(display)}</button>`;
    });
    panel.innerHTML = html;
  }

  exCard.classList.remove('collapsed');
  const header = exCard.querySelector('.cockpit-header');
  if (header) header.after(panel);

  setTimeout(() => {
    const close = (ev) => {
      if (!panel.contains(ev.target) && !ev.target.closest('[data-action="show-ss-panel"]')) {
        panel.remove();
        document.removeEventListener('click', close);
      }
    };
    document.addEventListener('click', close);
  }, 0);
}

export function pairAsSuperset(liftName, partnerName) {
  const appState   = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);

  if (!appState.weeks[wk].liftMeta) appState.weeks[wk].liftMeta = {};
  if (!appState.weeks[wk].liftMeta[selectedDay]) appState.weeks[wk].liftMeta[selectedDay] = {};
  const dayMeta = appState.weeks[wk].liftMeta[selectedDay];

  const used = new Set(Object.values(dayMeta).map(m => m?.groupId).filter(Boolean));
  let letter = 'A';
  while (used.has(letter)) letter = String.fromCharCode(letter.charCodeAt(0) + 1);

  dayMeta[liftName]    = { ...(dayMeta[liftName]    || {}), groupId: letter };
  dayMeta[partnerName] = { ...(dayMeta[partnerName] || {}), groupId: letter };

  _saveState(true);
  renderWorkout();
}

export function unpairSuperset(liftName) {
  const appState   = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);

  const dayMeta = appState.weeks?.[wk]?.liftMeta?.[selectedDay];
  if (!dayMeta) return;
  const groupId = dayMeta[liftName]?.groupId;
  if (!groupId) return;

  Object.keys(dayMeta).forEach(n => { if (dayMeta[n]?.groupId === groupId) delete dayMeta[n].groupId; });
  _saveState(true);
  renderWorkout();
}

export function setPerSetRir(liftName, sIdx, rir) {
  const appState = _getState();
  const day = _getSelectedDay();
  const wk = activeWorkoutWeekKey(appState);
  const sets = appState.weeks[wk].lifts?.[day]?.[liftName];
  if (!sets || !sets[sIdx]) return;
  const cleared = sets[sIdx].rir === rir; // tap the active chip to clear
  sets[sIdx].rir = cleared ? null : rir;
  // Keep a derived RPE (= 10 − RIR) so the progression/fatigue engine, which
  // reasons over per-set RPE, needs no changes. The 4+ bucket maps to RPE 6.
  sets[sIdx].rpe = cleared ? null : 10 - rir;
  _saveState(true);
  // DOM-only update: toggle active class without full re-render
  const rowEl = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"] .cockpit-set-row[data-set-index="${sIdx}"]`);
  if (rowEl) {
    rowEl.querySelectorAll('.btn-rpe').forEach(btn => {
      btn.classList.toggle('rpe-selected', parseInt(btn.getAttribute('data-rir'), 10) === sets[sIdx].rir);
    });
  }
}

// Next unfinished exercise after `fromCard` (wrapping to the top), or null when
// every other exercise is already done.
function _nextIncompleteCard(fromCard) {
  const cards = Array.from(document.querySelectorAll('.cockpit-exercise'));
  const idx = cards.indexOf(fromCard);
  for (let i = idx + 1; i < cards.length; i++) if (!cards[i].classList.contains('completed')) return cards[i];
  for (let i = 0; i < idx; i++) if (!cards[i].classList.contains('completed')) return cards[i];
  return null;
}

export function toggleAccordionManual(elementNode) {
  if (!elementNode) return;
  const wasCollapsed = elementNode.classList.contains('collapsed');
  const wasCompleted = elementNode.classList.contains('completed');
  document.querySelectorAll('.cockpit-exercise').forEach(card => card.classList.add('collapsed'));

  if (wasCollapsed) {
    elementNode.classList.remove('collapsed');
  } else if (wasCompleted) {
    // #5 single-focus auto-advance: collapsing a finished exercise moves focus to
    // the next unfinished one rather than leaving the cockpit with nothing open.
    // (We only advance on a deliberate collapse, never on the final set tick — the
    // per-set RPE pad must stay reachable the moment an exercise is completed.)
    const next = _nextIncompleteCard(elementNode);
    if (next) next.classList.remove('collapsed');
  }
  try { moveRestTimerToActiveExercise(); } catch(e) { console.warn(e); }
}

function _exChip(name, appState) {
  const pr = isE1rmExercise(name)
    ? exerciseStatForName(appState.exerciseStats, name)?.allTimeMax
    : 0;
  const prStr = pr ? `<span class="el-pr">${Math.round(pr)}kg PR</span>` : '';
  return `<button class="el-chip tactile-scale" data-action="el-pick" data-exname="${escapeHtml(name)}">${escapeHtml(name)}${prStr}</button>`;
}

function _renderExerciseLibraryList(query) {
  const container = document.getElementById('elList');
  if (!container) return;
  const appState = _getState();
  const q = (query || '').toLowerCase().trim();
  let html = '';

  if (q) {
    const results = [];
    for (const [cat, exs] of Object.entries(EXERCISE_LIBRARY)) {
      exs.forEach(ex => { if (ex.toLowerCase().includes(q)) results.push({ ex, cat }); });
    }
    (appState.customExercises || []).forEach(ex => {
      if (ex.toLowerCase().includes(q)) results.push({ ex, cat: 'Custom' });
    });
    if (results.length === 0) {
      html = '<div class="el-empty">No matches — type a custom name below</div>';
    } else {
      html = results.map(({ ex }) => _exChip(ex, appState)).join('');
    }
  } else {
    for (const [cat, exs] of Object.entries(EXERCISE_LIBRARY)) {
      html += `<div class="el-cat-label">${cat}</div>`;
      html += [...exs].sort().map(ex => _exChip(ex, appState)).join('');
    }
    if (appState.customExercises?.length) {
      html += `<div class="el-cat-label">⭐ Custom</div>`;
      html += [...appState.customExercises].sort().map(ex => _exChip(ex, appState)).join('');
    }
  }
  container.innerHTML = html;
}

export function handleExerciseSearch(query) {
  _renderExerciseLibraryList(query);
}

export function addExerciseToDayFromLibrary(name) {
  if (!name) return;
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][name]) {
    appState.weeks[wk].lifts[selectedDay][name] = [{ w: '', r: '10', c: false }];
  }
  if (!appState.weeks[wk].liftMeta) appState.weeks[wk].liftMeta = {};
  if (!appState.weeks[wk].liftMeta[selectedDay]) appState.weeks[wk].liftMeta[selectedDay] = {};
  appState.weeks[wk].liftMeta[selectedDay][name] = {
    ...(appState.weeks[wk].liftMeta[selectedDay][name] || {}),
    origin: 'added',
  };
  // Append to the explicit display order so the new exercise lands at the bottom.
  if (!appState.weeks[wk].liftOrder) appState.weeks[wk].liftOrder = {};
  if (!Array.isArray(appState.weeks[wk].liftOrder[selectedDay])) appState.weeks[wk].liftOrder[selectedDay] = [];
  if (!appState.weeks[wk].liftOrder[selectedDay].includes(name)) {
    appState.weeks[wk].liftOrder[selectedDay].push(name);
  }
  _saveState(true);
  closeAddExerciseModal();
  renderWorkout();
  showToast(`Added: ${name}`);
}

// ── Exercise swap (B3) ────────────────────────────────────────────────────────
// Re-keys the day's logged entry from the old exercise to the new one, so the
// prescribed target and any sets already logged carry across intact, and keeps
// the exercise in its original position in the day.
let _swapSourceLift = null;

export function openSwapModal(liftName) {
  if (!liftName) return;
  _swapSourceLift = liftName;
  const modal = document.getElementById('swapExerciseModal');
  if (!modal) return;
  const subtitle = document.getElementById('swapSubtitle');
  if (subtitle) subtitle.textContent = `Swapping "${liftName}" — same movement, kit you have. Your target and logged sets carry over.`;
  _renderSwapList(liftName);
  modal.classList.add('active');
}

export function closeSwapModal() {
  _swapSourceLift = null;
  document.getElementById('swapExerciseModal')?.classList.remove('active');
}

function _renderSwapList(liftName) {
  const list = document.getElementById('swapList');
  if (!list) return;
  const appState = _getState();
  const equipment = appState?.settings?.equipment || {};
  const subs = getSubstitutions(liftName, equipment, 8);

  if (subs.length === 0) {
    list.innerHTML = `<div class="text-sm text-muted" style="padding:16px;">No direct swaps for this movement with your equipment. Use the full list below to pick any exercise.</div>`;
    return;
  }
  list.innerHTML = subs.map(s => `
    <button class="el-chip tactile-scale" data-action="swap-pick" data-exname="${escapeHtml(s.name)}">
      ${escapeHtml(s.name)}<span class="el-pr">${s.bodyweight ? 'Bodyweight' : escapeHtml(s.equip.map(labelEquip).join(' · '))}</span>
    </button>
  `).join('');
}

function labelEquip(k) {
  return ({ barbell: 'Barbell', rack: 'Rack', dumbbells: 'Dumbbells', cables: 'Cables', pullupBar: 'Pull-up bar', bands: 'Bands', kettlebells: 'Kettlebell' })[k] || k;
}

// Perform the swap: old → new, preserving the sets array (target + logged data)
// and the exercise's position in the day. Thin wrapper over the pure
// applyExerciseSwap so the state logic stays unit-testable.
export function executeSwapExercise(newName) {
  const oldName = _swapSourceLift;
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const blueprint = oneOffBlueprint(appState,
    getProgramById(appState.activeProgramId)?.days?.[selectedDay] || {});

  const res = applyExerciseSwap(appState.weeks?.[wk], selectedDay, oldName, newName, blueprint);
  if (!res.ok) {
    if (res.reason === 'duplicate') showToast(`${newName} is already in today's session`, true);
    else closeSwapModal();
    return;
  }
  _saveState(true);
  closeSwapModal();
  renderWorkout();
  showToast(`Swapped to ${newName}`);
}

export function confirmCustomSwap() {
  const input = document.getElementById('swapCustomInput');
  const name = input?.value?.trim();
  if (!name) { showToast('Type an exercise name to swap in'); return; }
  saveNewCustomExerciseToLibrary(name);
  if (input) input.value = '';
  executeSwapExercise(name);
}

export function openAddExerciseModal() {
  const modal = document.getElementById('addExerciseModal');
  if (!modal) return;
  const searchInput = document.getElementById('elSearchInput');
  const customInput = document.getElementById('customExerciseTextInput');
  if (searchInput) searchInput.value = '';
  if (customInput) customInput.value = '';
  _renderExerciseLibraryList('');
  modal.classList.add('active');
  setTimeout(() => searchInput?.focus(), 80);
}

export function closeAddExerciseModal() {
  const modal = document.getElementById('addExerciseModal');
  if (modal) modal.classList.remove('active');
}

export function confirmAddExercise() {
  const customInput = document.getElementById('customExerciseTextInput');
  const name = customInput?.value?.trim();
  if (!name) { showToast('Type a custom exercise name first'); return; }
  saveNewCustomExerciseToLibrary(name);
  addExerciseToDayFromLibrary(name);
}

export function openConfirmResetModal() {
  const modal = document.getElementById('confirmResetModal');
  if (modal) modal.classList.add('active');
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
  /** @type {Record<string, any[]>} */
  const lifts = {};
  const liftOrder = [];

  if (oneOff) {
    for (const liftName of blueprint?.lifts || []) {
      const current = appState.weeks[wk]?.lifts?.[selectedDay]?.[liftName] || [];
      lifts[liftName] = current.map((set) => ({ ...set, w: '', r: '', c: false, isPR: undefined }));
      liftOrder.push(liftName);
    }
  } else if (blueprint && blueprint.lifts) {
    blueprint.lifts.forEach(liftName => {
      try {
        const weekModifier = activeProgram.weeklyVolModifiers?.[wk] || { sets: 4, reps: 5, intensityLabel: "Working Sets" };
        lifts[liftName] = prescribeSetsForLift(wk, selectedDay, liftName, blueprint.desc, weekModifier);
        liftOrder.push(liftName);
      } catch(e) { console.warn(e); }
    });
  }
  // Reset restores the prescribed program order and clears every workout-only
  // field through the same path used by historical-session deletion.
  deleteDayWorkoutData(appState.weeks[wk], selectedDay, { lifts, liftOrder });
  try {
    stopAndResetWorkoutTimer(workoutSessionKey(appState, wk, selectedDay));
    dismissRestTimer();
  } catch(e) { console.warn(e); }
  
  _saveState(true);
  
  deleteMapFromDB(wk, selectedDay, { activationId: oneOff ? null : appState.activeActivationId }).then(() => {
    renderWorkout();
  }).catch(() => renderWorkout());
  
  closeConfirmResetModal();
  showToast('Day Logs Cleared');
}

// Normalise a duration entry to canonical "M:SS" (matching .FIT imports). A
// bare number is treated as minutes ("45" → "45:00"); "" stays "".
function _normalizeDuration(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    return `${parseInt(m, 10) || 0}:${(parseInt(sec, 10) || 0).toString().padStart(2, '0')}`;
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? `${n}:00` : '';
}

export function openFinishSessionModal() {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  let vol = 0, setsDone = 0;
  const activeProgram = getProgramById(appState.activeProgramId);
  const oneOff = activeOneOffSession(appState);
  const blueprint = oneOffBlueprint(appState, activeProgram?.days?.[selectedDay] || {});
  const allLiftsData = appState.weeks[wk]?.lifts?.[selectedDay] || {};
  const activeNames = activeSessionLiftNames(appState.weeks[wk], selectedDay, blueprint, { oneOff: !!oneOff });
  const liftsData = Object.fromEntries(activeNames.map((name) => [name, allLiftsData[name]]));
  
  for (let lift in liftsData) {
    if (Array.isArray(liftsData[lift])) {
      liftsData[lift].forEach(s => {
        // Exclude warmups so the summary tonnage/sets match home & analytics.
        if (isCompletedSet(s) && !isWarmupSet(s)) { vol += setVolume(s); setsDone++; }
      });
    }
  }
  
  const sumVolEl = document.getElementById('summaryVolume');
  const sumSetsEl = document.getElementById('summarySets');
  const sumDurEl = document.getElementById('summaryDuration');
  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  const sumModalEl = document.getElementById('summaryModal');
  const titleEl = document.getElementById('summaryModalTitle');
  const copyEl = document.getElementById('summaryModalCopy');
  const actionEl = document.getElementById('summarySaveAction');
  const discardEl = document.getElementById('summaryDiscardAction');
  const progressEl = document.getElementById('summaryCompletionProgress');
  const completion = evaluateSessionCompletion(appState, activeProgram, wk, selectedDay);
  const presentation = completionPresentation(completion);
  if (sumModalEl) sumModalEl.dataset.outcome = completion.outcome;
  if (progressEl) progressEl.textContent = completion.progressLabel;
  if (titleEl) titleEl.textContent = presentation.title;
  if (copyEl) copyEl.textContent = presentation.body;
  if (actionEl) {
    actionEl.textContent = presentation.action || 'Finish Workout';
    actionEl.hidden = !presentation.action;
  }
  if (discardEl) discardEl.hidden = false;

  if (sumVolEl) sumVolEl.textContent = vol + ' kg';
  if (sumSetsEl) sumSetsEl.textContent = setsDone;
  // Prefill duration with an already-logged value (e.g. .FIT import), else the
  // session timer's elapsed — surfaced here so it's confirmed/corrected at the
  // moment of finishing rather than silently logged.
  if (sumDurEl) {
    const existing = appState.weeks[wk].gymStats?.[selectedDay]?.time;
    if (existing) {
      sumDurEl.value = existing;
    } else {
      const elapsed = getWorkoutElapsedSeconds(workoutSessionKey(appState, wk, selectedDay));
      sumDurEl.value = elapsed > 0 ? _normalizeDuration(`${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`) : '';
    }
  }
  if (sumGymRpeEl) sumGymRpeEl.value = appState.weeks[wk].gymRpe?.[selectedDay] || '';
  if (sumRunRpeEl) sumRunRpeEl.value = appState.weeks[wk].runs?.[selectedDay]?.rpe || '';

  // Only ask for the RPE that matches what was actually done today: a run RPE
  // prompt on a lift-only day (and vice versa) is a question with no answer.
  // Fall back to showing both if the day is somehow empty of both signals.
  const hasLifts = Object.values(liftsData).some(a => Array.isArray(a) && a.length > 0);
  const runCtx = appState.weeks[wk].runs?.[selectedDay] || {};
  const hasRun = !!(runCtx.dist || runCtx.time || runCtx.pace || runCtx.rpe);
  const gymBlock = document.getElementById('summaryGymRpeBlock');
  const runBlock = document.getElementById('summaryRunRpeBlock');
  if (gymBlock && runBlock) {
    if (hasLifts || hasRun) {
      gymBlock.style.display = hasLifts ? '' : 'none';
      runBlock.style.display = hasRun ? '' : 'none';
    } else {
      gymBlock.style.display = '';
      runBlock.style.display = '';
    }
  }

  if (sumModalEl) sumModalEl.classList.add('active');
}

// Dismiss the finish modal WITHOUT saving/leaving — the finish flow otherwise
// had a single "Save & Return Home" action, so an accidental Finish tap had no
// way out. The typed values persist in the fields for when they reopen it.
export function cancelFinishSessionModal() {
  document.getElementById('summaryModal')?.classList.remove('active');
}

export function discardFinishWorkout() {
  cancelFinishSessionModal();
  openConfirmResetModal();
}

export function closeFinishSessionModal() {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const completion = evaluateSessionCompletion(appState, getProgramById(appState.activeProgramId), wk, selectedDay);
  if (!completion.anyLogged) {
    showToast('No working sets or run recorded');
    return;
  }
  if (!appState.weeks[wk].gymRpe) appState.weeks[wk].gymRpe = {};

  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  
  if (sumGymRpeEl) appState.weeks[wk].gymRpe[selectedDay] = sumGymRpeEl.value;
  if (sumRunRpeEl && appState.weeks[wk].runs[selectedDay]) {
    const existingRun = appState.weeks[wk].runs[selectedDay];
    existingRun.rpe = sumRunRpeEl.value;
    if (existingRun.sessionId || hasRunData(existingRun)) {
      upsertRunSession(appState.weeks[wk], selectedDay, existingRun, {
        sessionId: existingRun.sessionId || newRunSessionId(),
        source: existingRun.source || 'cockpit',
        localDate: existingRun.localDate || appState.weeks[wk].dates?.[selectedDay] || null,
        startTs: existingRun.startTs,
      });
    }
  }
  
  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
  const runRpeEl = document.getElementById('runInputRpeCockpit');
  if (gymRpeEl) gymRpeEl.value = appState.weeks[wk].gymRpe[selectedDay] || '';
  if (runRpeEl) runRpeEl.value = appState.weeks[wk].runs[selectedDay]?.rpe || '';

  // Persist the confirmed session duration from the summary field (prefilled
  // from the timer in openFinishSessionModal, editable by the user).
  const sumDurEl = document.getElementById('summaryDuration');
  if (sumDurEl) {
    const normalized = _normalizeDuration(sumDurEl.value);
    if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
    if (!appState.weeks[wk].gymStats[selectedDay]) {
      appState.weeks[wk].gymStats[selectedDay] = { time: '', avgHR: '', maxHR: '', cals: '' };
    }
    appState.weeks[wk].gymStats[selectedDay].time = normalized;
  }

  try { updateExercisePRs(); } catch(e) { console.warn(e); }
  // Safety net: a deliberately finished workout must carry its local calendar
  // date so it can never sink into the undated bucket (excluded from calendar
  // analytics + sorted to the bottom of history). Logging normally stamps this on
  // the first completed set; this also covers completed sets that arrived via a
  // sync/import that never ran the local stamp. Idempotent — never overwrites an
  // existing date, so a workout logged on an earlier day keeps that day.
  _ensureWorkoutDateStamp(appState, wk, selectedDay);
  const finishResult = finishSession(appState.weeks[wk], selectedDay, completion);
  const oneOff = activeOneOffSession(appState);
  if (oneOff?.key === wk) {
    clearActiveOneOffSession(appState);
  }
  _saveState(true);
  
  const sumModalEl = document.getElementById('summaryModal');
  if (sumModalEl) sumModalEl.classList.remove('active');
  
  try {
    stopAndResetWorkoutTimer(workoutSessionKey(appState, wk, selectedDay));
    dismissRestTimer();
  } catch(e) { console.warn(e); }
  
  if (_switchTab) _switchTab('home');

  // Finishing is a lifecycle choice, independent of perfect prescription
  // adherence. Repeated taps remain idempotent and do not duplicate recaps.
  if (finishResult.ok && !finishResult.alreadyFinished) {
    try {
      document.dispatchEvent(new CustomEvent('session:finished', {
        detail: { week: wk, day: selectedDay, outcome: 'finished', adherence: completion.outcome },
      }));
    } catch (_) {}
  } else if (finishResult.alreadyFinished) {
    showToast('Workout already finished');
  }
}

// ==========================================
// EVENT DELEGATION ROUTER
// ==========================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  
  // Context extractors
  const exCard = target.closest('.cockpit-exercise');
  const liftName = exCard ? exCard.getAttribute('data-liftname') : target.getAttribute('data-liftname');
  const sIdx = parseInt(target.getAttribute('data-sidx'), 10);

  if (action === 'quick-log') executeOneTapQuickLog(target, liftName, sIdx);
  else if (action === 'log-all-target') logAllAtTarget(liftName);
  else if (action === 'append-set') appendCustomSetRow(target, liftName);
  else if (action === 'append-warmup-set') appendWarmupSetRow(target, liftName);
  else if (action === 'remove-set') removeCustomSetRow(liftName, sIdx);
  else if (action === 'toggle-set-adv') target.closest('.cockpit-set-row')?.classList.toggle('adv-open');
  else if (action === 'cycle-set-type') cycleSetType(liftName, sIdx);
  else if (action === 'set-load-mode') setSetLoadMode(liftName, sIdx, target.getAttribute('data-mode'));
  else if (action === 'cycle-load') cycleSetLoad(liftName, sIdx);
  else if (action === 'show-ss-panel') showSupersetLinkPanel(exCard);
  else if (action === 'link-superset') pairAsSuperset(liftName, target.getAttribute('data-partner'));
  else if (action === 'unlink-superset') unpairSuperset(liftName);
  else if (action === 'toggle-accordion') toggleAccordionManual(exCard);
  else if (action === 'set-rir') setPerSetRir(liftName, sIdx, parseInt(target.getAttribute('data-rir'), 10));
  else if (action === 'rest-adjust') adjustRestDuration(parseInt(target.getAttribute('data-delta'), 10));
  else if (action === 'open-add-exercise') openAddExerciseModal();
  else if (action === 'close-add-exercise') closeAddExerciseModal();
  else if (action === 'el-pick') addExerciseToDayFromLibrary(e.target.closest('[data-action="el-pick"]')?.getAttribute('data-exname'));
  else if (action === 'confirm-add-exercise') confirmAddExercise();
  else if (action === 'swap-exercise') openSwapModal(liftName);
  else if (action === 'close-swap-exercise') closeSwapModal();
  else if (action === 'swap-pick') executeSwapExercise(target.getAttribute('data-exname'));
  else if (action === 'swap-confirm-custom') confirmCustomSwap();
  else if (action === 'open-reset-modal') openConfirmResetModal();
  else if (action === 'close-reset-modal') closeConfirmResetModal();
  else if (action === 'execute-reset') executeResetActiveDayMetrics();
  else if (action === 'open-finish-modal') openFinishSessionModal();
  else if (action === 'close-finish-modal') closeFinishSessionModal();
  else if (action === 'cancel-finish-modal') cancelFinishSessionModal();
  else if (action === 'discard-finish-workout') discardFinishWorkout();
  else if (action === 'expand-run') document.getElementById('cockpitRunPanel')?.classList.remove('run-collapsed');
});

document.addEventListener('change', (e) => {
  const target = e.target;
  if (target.classList.contains('input-weight-node') || target.classList.contains('input-reps-node')) {
    updateInputState(target);
  } else if (target.classList.contains('gym-check')) {
    toggleGymCheckLoggingState(target);
  }
});

document.addEventListener('focusout', (e) => {
  const target = e.target;
  if (target.matches('.input-weight-node, .input-reps-node, #sessionNotesInput, #sessionGymRpeCockpit, #runInputDist, #runInputTime, #runInputRpeCockpit, #runInputPace, #runInputNotes')) {
    commitWorkoutUIState();
  }
});

document.addEventListener('input', (e) => {
  const target = e.target;
  if (target.matches('#runInputDist, #runInputTime, #runInputRpeCockpit, #runInputPace, #runInputNotes')) {
    const state = _getState();
    const day = activeWorkoutDay(state, _getSelectedDay());
    markSessionInProgress(state.weeks?.[activeWorkoutWeekKey(state)], day);
  }
  const distEl  = document.getElementById('runInputDist');
  const timeEl  = document.getElementById('runInputTime');
  const paceEl  = document.getElementById('runInputPace');
  if (!distEl || !timeEl || !paceEl) return;

  if (target.id === 'runInputDist' || target.id === 'runInputTime') {
    // dist + time → derive pace
    const computed = _paceFromDistTime(distEl.value, timeEl.value);
    if (computed) paceEl.value = computed;
  } else if (target.id === 'runInputPace') {
    // pace + dist → derive time
    const derived = _timeFromPaceDist(paceEl.value, distEl.value);
    if (derived) timeEl.value = derived;
  }
});
