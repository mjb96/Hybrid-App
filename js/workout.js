// ==========================================
// WORKOUT VIEW
// ==========================================
import { getProgramById } from './state.js';
import { EXERCISE_LIBRARY } from './constants.js';
import { computeDiagnosticForLift, parseTargetFromDescription, prescribeSetsForLift, computeExercisePRs } from './engine.js';
import { isCompletedSet, isWarmupSet, setVolume } from './set-utils.js';
import { triggerRestTimerEngine, adjustRestDuration, moveRestTimerToActiveExercise, dismissRestTimer, stopAndResetWorkoutTimer, getWorkoutElapsedSeconds } from './timers.js';
import { mountExerciseDragAndDropSystems } from './dragdrop.js';
import { showToast, saveNewCustomExerciseToLibrary } from './state.js';
import { escapeHtml } from './util.js';
import { buildEmptyWorkoutCard, buildSetRow, buildExerciseCard } from './templates.js';
import { orderedLiftNames } from './workout-order.js';
import { deleteMapFromDB } from './db.js';
import { renderRunMap } from './workout-map.js';
import { hapticTick, hapticSuccess } from './haptics.js';
import { dateKey } from './dates.js';

let _getState;
let _getSelectedDay;

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

function _detectRunType(str) {
  if (!str) return null;
  const s = str.toLowerCase();
  if (/recovery|shakeout|very easy/.test(s))
    return { label: 'Recovery', color: '#10b981' };
  if (/zone 2|z2|easy run|easy pace|aerobic base|conversational|low heart/.test(s))
    return { label: 'Zone 2', color: '#22d3ee' };
  if (/long run|lsd|long slow|long aerobic/.test(s))
    return { label: 'Long Run', color: '#8b5cf6' };
  if (/tempo|threshold|comfortably hard|lactate/.test(s))
    return { label: 'Tempo', color: '#f59e0b' };
  if (/interval|repeat|×|\bx\b|\d+m\b|fartlek|speed work/.test(s))
    return { label: 'Intervals', color: '#ef4444' };
  if (/race pace|5k pace|10k pace|half marathon pace|marathon pace/.test(s))
    return { label: 'Race Pace', color: '#ec4899' };
  if (/hill|strides/.test(s))
    return { label: 'Hills', color: '#f97316' };
  if (/conditioning|amrap|emom|metcon|circuit/.test(s))
    return { label: 'Conditioning', color: '#a855f7' };
  return null;
}
let _getDays;
let _saveState;
let _switchTab;

export function initWorkout(getStateFn, getSelectedDayFn, getDaysFn, saveStateFn, switchTabFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
  _saveState = saveStateFn;
  _switchTab = switchTabFn;
}

// ==========================================
// PRIVATE HELPERS
// ==========================================
function _buildExerciseCardEl(liftName, loggedLiftsData, weekData, wk, selectedDay, appState, homeBlueprint, isCollapsed, groupId, ssColor) {
  const setsArr = loggedLiftsData[liftName];
  if (!Array.isArray(setsArr)) return null;

  const isCompleted = setsArr.length > 0 && setsArr.every(s => s?.c);
  const exCard = document.createElement('div');
  exCard.className = `cockpit-exercise${isCollapsed ? ' collapsed' : ''}${isCompleted ? ' completed' : ''}`;
  exCard.setAttribute('data-liftname', liftName);
  exCard.setAttribute('draggable', 'true');

  let displayLiftName;
  if (!isNaN(liftName) && homeBlueprint.lifts?.[parseInt(liftName, 10)]) {
    displayLiftName = homeBlueprint.lifts[parseInt(liftName, 10)];
  } else {
    displayLiftName = liftName;
  }

  let blueprintLabel = 'Target: Working Sets';
  let diagnostic = { isStalled: false, suggestedWeight: '' };
  try {
    diagnostic = computeDiagnosticForLift(wk, selectedDay, liftName);
    const parsedTarget = parseTargetFromDescription(homeBlueprint.desc, displayLiftName);
    blueprintLabel = `Target: ${parsedTarget.sets} × ${parsedTarget.reps}`;
    if (diagnostic.isStalled) {
      blueprintLabel = '⚠️ DE-LOAD: Slashed Sets (-20%)';
    } else if (diagnostic.suggestedWeight !== '') {
      blueprintLabel = `💡 Suggested: ${diagnostic.suggestedWeight}kg × ${parsedTarget.reps}`;
    }
  } catch(e) { console.warn(e); }

  let historicalLineText = 'Baseline Loading Profile Verified';
  if (appState.exerciseStats?.[displayLiftName]) {
    historicalLineText = 'Global PR: ' + Math.round(appState.exerciseStats[displayLiftName].allTimeMax || 0) + 'kg (Est. 1RM)';
  }

  const pastWkNum = parseInt(wk, 10) - 1;
  if (pastWkNum >= 1 && appState.weeks) {
    const pastWkData = appState.weeks[pastWkNum.toString()];
    if (pastWkData?.lifts?.[selectedDay]?.[liftName]) {
      const doneSets = pastWkData.lifts[selectedDay][liftName].filter(s => s?.c && s.w && s.r);
      if (doneSets.length > 0) {
        historicalLineText = 'Last Session: [ ' + doneSets.map(s => escapeHtml(String(s.w)) + 'kg × ' + escapeHtml(String(s.r))).join(', ') + ' ]';
      }
    }
  }

  const safeLiftName   = liftName.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const displaySafeName = displayLiftName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const setsMarkup = setsArr.map((sData, sIdx) => {
    let ghostSet = null;
    if (pastWkNum >= 1 && appState.weeks) {
      const hist = appState.weeks[pastWkNum.toString()]?.lifts?.[selectedDay]?.[liftName];
      if (hist?.[sIdx]?.w && hist[sIdx].r) ghostSet = hist[sIdx];
    }
    return buildSetRow(sData, sIdx, safeLiftName, ghostSet);
  }).join('');

  try {
    exCard.innerHTML = buildExerciseCard({ displaySafeName, safeLiftName, isCompleted, diagnostic, blueprintLabel, historicalLineText, setsMarkup, groupId, ssColor });
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
  const selectedDay = _getSelectedDay();

  const wk = appState.currentWeek || "1";
  
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
  const homeBlueprint = activeProgram.days?.[selectedDay] || { lifts: [], runs: "Rest" };

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
  if (gAerobicTEEl) gAerobicTEEl.value = gymContext.aerobicTE   || '';

  const hasGymStats = gymContext.time || gymContext.avgHR || gymContext.maxHR || gymContext.cals ||
                      gymContext.trainingEffect;
  if (gymStatsRow) gymStatsRow.style.display = hasGymStats ? 'block' : 'none';

  // --- MAP GARMIN DATA TO INPUTS ---
  const rStats = appState.weeks[appState.currentWeek].runs?.[selectedDay] || {};

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

  const gStats = appState.weeks[appState.currentWeek].gymStats?.[selectedDay] || {};
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
    const runType = isRunScheduled ? _detectRunType(blueprintRun) : null;
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
    const pills = daySelectorBar.querySelectorAll('.day-pill');
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    pills.forEach((pill, idx) => {
      const dayKey = days[idx];
      const dayData = activeProgram.days?.[dayKey];
      const badge = dayData?.badge || dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
      const shortDay = dayKey.charAt(0).toUpperCase() + dayKey.slice(1, 3);
      pill.textContent = `${shortDay} (${badge})`;
    });
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

  // Build superset group map
  const SS_COLORS = { A: '#3b82f6', B: '#a855f7', C: '#10b981', D: '#f59e0b', E: '#ec4899', F: '#06b6d4' };
  const groupMap = {};
  for (const ln in loggedLiftsData) {
    const gId = liftMeta[ln]?.groupId;
    if (gId) {
      if (!groupMap[gId]) groupMap[gId] = [];
      if (!groupMap[gId].includes(ln)) groupMap[gId].push(ln);
    }
  }

  const renderedLifts = new Set();
  let isFirstAccordionField = true;

  const orderedNames = orderedLiftNames(weekData, selectedDay, homeBlueprint);

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
        const mCompleted = memberSets.length > 0 && memberSets.every(s => s?.c);

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
      const isCompleted = setsArr.length > 0 && setsArr.every(s => s?.c);
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
  } catch(e) { console.warn(e); }
}

// Stamp the calendar date the first time a day has a completed set, so the
// workout shows on the activity calendar. Idempotent; covers every completion
// path (manual checkbox, one-tap quick log, commit-on-navigate).
function _ensureWorkoutDateStamp(appState, wk, day) {
  const dayLifts = appState.weeks?.[wk]?.lifts?.[day];
  if (!dayLifts) return;
  const hasCompleted = Object.values(dayLifts).some(sets => Array.isArray(sets) && sets.some(s => s?.c));
  if (!hasCompleted) return;
  if (!appState.weeks[wk].dates) appState.weeks[wk].dates = {};
  if (!appState.weeks[wk].dates[day]) appState.weeks[wk].dates[day] = dateKey();
}

export function executeOneTapQuickLog(labelNode, liftName, sIdx) {
  if (!labelNode) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  
  const parentRow = labelNode.closest('.cockpit-set-row');
  if (!parentRow) return;

  const wInput = parentRow.querySelector('.input-weight-node');
  const rInput = parentRow.querySelector('.input-reps-node');
  const checkbox = parentRow.querySelector('.gym-check');

  let targetW = wInput.value;
  let targetR = rInput.value;

  if (!targetW || !targetR) {
    const pastWkNum = parseInt(wk, 10) - 1;
    if (pastWkNum >= 1 && appState.weeks) {
      const historicalSet = appState.weeks[pastWkNum.toString()]?.lifts?.[selectedDay]?.[liftName]?.[sIdx];
      if (historicalSet && historicalSet.w && historicalSet.r) {
        targetW = historicalSet.w;
        targetR = historicalSet.r;
      }
    }
  }

  if (!targetW) targetW = "40";
  if (!targetR) targetR = "10";

  wInput.value = targetW;
  rInput.value = targetR;
  if (checkbox) checkbox.checked = true;

  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) appState.weeks[wk].lifts[selectedDay][liftName] = [];

  // Merge — never replace: preserve any existing set metadata (type, rpe, isPR)
  // so quick-logging a warmup/drop set doesn't silently demote it to a working set.
  const _setArr = appState.weeks[wk].lifts[selectedDay][liftName];
  _setArr[sIdx] = { ...(_setArr[sIdx] || {}), w: targetW, r: targetR, c: true };
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

export function updateInputState(inputNode) {
  if (!inputNode) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
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

  if (inputNode.classList.contains('input-weight-node')) {
    appState.weeks[wk].lifts[selectedDay][liftName][sIdx].w = inputNode.value;
  } else {
    appState.weeks[wk].lifts[selectedDay][liftName][sIdx].r = inputNode.value;
  }
  _saveState(true);
}

export function commitWorkoutUIState() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
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
    weekData.runs[selectedDay] = {
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
  }

  if (!weekData.gymStats) weekData.gymStats = {};
  const gTimeEl = document.getElementById('gymInputTime');
  const gAvgHREl = document.getElementById('gymInputAvgHR');
  const gMaxHREl = document.getElementById('gymInputMaxHR');
  const gCalsEl = document.getElementById('gymInputCals');

  if (gTimeEl && gTimeEl.offsetParent !== null) {
    // Spread existing so .FIT-imported extras (trainingEffect, aerobicTE,
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
  
  if (checkboxNode.checked) {
    if (parentRow) parentRow.classList.add('is-complete');
    hapticTick();
    
    const wInput = parentRow ? parentRow.querySelector('.input-weight-node') : null;
    const rInput = parentRow ? parentRow.querySelector('.input-reps-node') : null;
    
    if (wInput && rInput && (!wInput.value || !rInput.value)) {
      const appState = _getState();
      const selectedDay = _getSelectedDay();
      const wk = appState.currentWeek;
      const liftName = exCard ? exCard.getAttribute('data-liftname') : null;
      const sIdx = Array.from(exCard.querySelectorAll('.cockpit-set-row')).indexOf(parentRow);
      
      const pastWkNum = parseInt(wk, 10) - 1;
      if (pastWkNum >= 1 && appState.weeks && liftName) {
        const historicalSet = appState.weeks[pastWkNum.toString()]?.lifts?.[selectedDay]?.[liftName]?.[sIdx];
        if (historicalSet && historicalSet.w && historicalSet.r) {
          if (!wInput.value) wInput.value = historicalSet.w;
          if (!rInput.value) rInput.value = historicalSet.r;
        }
      }
      if (!wInput.value) wInput.value = "40";
      if (!rInput.value) rInput.value = "10";
    }

    try {
      const liftName = exCard ? exCard.getAttribute('data-liftname') : null;
      const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
      const setRpe = gymRpeEl && gymRpeEl.value ? parseFloat(gymRpeEl.value) : null;
      const _appState = _getState();
      const _selDay = _getSelectedDay();
      const _wk = _appState.currentWeek;
      const _sIdx = exCard ? Array.from(exCard.querySelectorAll('.cockpit-set-row')).indexOf(parentRow) : -1;
      const setType = _appState.weeks[_wk].lifts?.[_selDay]?.[liftName]?.[_sIdx]?.type || '';
      triggerRestTimerEngine(liftName, setRpe, setType);
      // Stamp workout date on first set completion for this day
      if (!_appState.weeks[_wk].dates) _appState.weeks[_wk].dates = {};
      if (!_appState.weeks[_wk].dates[_selDay]) {
        _appState.weeks[_wk].dates[_selDay] = dateKey();
      }

      // PR detection — compare this set's e1RM against stored all-time max
      if (liftName && setType !== 'W' && _sIdx >= 0) {
        const wIn = parentRow?.querySelector('.input-weight-node');
        const rIn = parentRow?.querySelector('.input-reps-node');
        const w = parseFloat(wIn?.value) || 0;
        const r = parseInt(rIn?.value, 10) || 0;
        if (w > 0 && r > 0) {
          const e1rm = w * (1 + r / 30);
          const prevMax = _appState.exerciseStats?.[liftName]?.allTimeMax || 0;
          if (e1rm > prevMax + 0.01) {
            parentRow.classList.add('is-pr');
            hapticSuccess();
            if (!parentRow.querySelector('.pr-badge')) {
              const badge = document.createElement('span');
              badge.className = 'pr-badge';
              badge.textContent = 'PR';
              parentRow.appendChild(badge);
            }
            showToast(`🏆 New PR — ${liftName}!`);
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

export function evaluateAccordionAutoFlowTransitions() {
  const expandedCard = document.querySelector('.cockpit-exercise:not(.collapsed)');
  if (!expandedCard) return;
  const rows = Array.from(expandedCard.querySelectorAll('.cockpit-set-row'));
  if (rows.length === 0) return; // a card with no sets isn't "finished"
  const finished = rows.every(r => r.querySelector('.gym-check')?.checked);
  const statusNode = expandedCard.querySelector('.cockpit-ex-status');

  if (finished) {
    const wasCompleted = expandedCard.classList.contains('completed');
    expandedCard.classList.add('completed');
    if (statusNode) statusNode.textContent = 'DONE';
    // Keep the card expanded after the final set so the per-set RPE pad (which
    // only appears on completed sets) stays reachable — previously the card
    // collapsed and auto-advanced the instant the last set was ticked, hiding
    // RPE before it could be entered. Move on by tapping the next exercise.
    if (!wasCompleted) showToast('Exercise Complete! ✓');
  } else {
    // Unchecking a set after completion re-opens the exercise.
    expandedCard.classList.remove('completed');
    if (statusNode) statusNode.textContent = 'LOG';
  }
}

export function appendCustomSetRow(btnNode, liftName) {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  
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
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;

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
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  if (appState.weeks[wk].lifts?.[selectedDay]?.[liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName].splice(setIndex, 1);
    if (appState.weeks[wk].lifts[selectedDay][liftName].length === 0) {
      delete appState.weeks[wk].lifts[selectedDay][liftName];
      // Drop the now-empty exercise from the explicit display order too.
      const order = appState.weeks[wk].liftOrder?.[selectedDay];
      if (Array.isArray(order)) {
        appState.weeks[wk].liftOrder[selectedDay] = order.filter(n => n !== liftName);
      }
    }
    _saveState(true);
    renderWorkout();
    showToast('Set Removed');
  }
}

export function cycleSetType(liftName, sIdx) {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
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

// Cycle a set's resistance band: None → Light → Medium → Heavy. Selecting a
// band stamps the set's weight with the configured nominal kg for that band
// (settings.bandWeights) so it still contributes to volume / e1RM / the
// summary; clearing it removes the auto weight. A band and bodyweight are
// mutually exclusive.
export function cycleSetBand(liftName, sIdx) {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  const setArr = appState.weeks?.[wk]?.lifts?.[selectedDay]?.[liftName];
  if (!setArr || sIdx < 0 || sIdx >= setArr.length) return;

  const order = ['', 'L', 'M', 'H'];
  const cur = setArr[sIdx].band || '';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  const bw = appState.settings?.bandWeights || { L: 10, M: 20, H: 30 };

  if (next) {
    setArr[sIdx].band = next;
    delete setArr[sIdx].bw; // a band replaces bodyweight as the load source
    setArr[sIdx].w = String(bw[next] ?? '');
  } else {
    delete setArr[sIdx].band;
    setArr[sIdx].w = '';
  }

  // Targeted DOM update (keep the card expanded / scroll position).
  const exCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = exCard?.querySelectorAll('.cockpit-set-row')?.[sIdx];
  if (row) {
    const chip = row.querySelector('.btn-band');
    const labels = { '': '— None', L: '🟢 Light', M: '🟡 Medium', H: '🔴 Heavy' };
    if (chip) {
      chip.textContent = labels[next];
      chip.className = 'btn-band tactile-scale' + (next ? ' band-' + next : '');
    }
    const bwBtn = row.querySelector('.btn-bw');
    if (bwBtn) bwBtn.className = 'btn-bw tactile-scale';
    const wInput = row.querySelector('.input-weight-node');
    if (wInput) wInput.value = setArr[sIdx].w;
  }
  _saveState(true);
}

// Toggle a set as bodyweight: stamps your bodyweight as the load so the set
// counts as bodyweight×reps toward volume/e1RM. Edit the weight afterwards to
// add load (weighted) or reduce it (assisted). Mutually exclusive with a band.
export function toggleSetBodyweight(liftName, sIdx) {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  const setArr = appState.weeks?.[wk]?.lifts?.[selectedDay]?.[liftName];
  if (!setArr || sIdx < 0 || sIdx >= setArr.length) return;
  const set = setArr[sIdx];
  const turningOn = !set.bw;

  if (turningOn) {
    set.bw = true;
    delete set.band;
    set.w = String(_currentBodyweight(appState));
  } else {
    delete set.bw;
    set.w = '';
  }

  const exCard = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"]`);
  const row = exCard?.querySelectorAll('.cockpit-set-row')?.[sIdx];
  if (row) {
    const bwBtn = row.querySelector('.btn-bw');
    if (bwBtn) bwBtn.className = 'btn-bw tactile-scale' + (turningOn ? ' bw-on' : '');
    const bandBtn = row.querySelector('.btn-band');
    if (bandBtn) { bandBtn.textContent = '— None'; bandBtn.className = 'btn-band tactile-scale'; }
    const wInput = row.querySelector('.input-weight-node');
    if (wInput) wInput.value = set.w;
  }
  _saveState(true);
}

export function showSupersetLinkPanel(exCard) {
  if (!exCard) return;
  const appState   = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
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
      <button class="btn-pad" style="color:#ef4444;border-color:rgba(239,68,68,0.3);" data-action="unlink-superset" data-liftname="${liftName}">Unlink superset</button>`;
  } else if (others.length === 0) {
    panel.innerHTML = `<div class="ss-panel-title" style="color:#94a3b8;">Add more exercises to pair as a superset.</div>`;
  } else {
    let html = '<div class="ss-panel-title">Pair with:</div>';
    others.forEach(name => {
      const safe    = name.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      const display = name;
      html += `<button class="btn-pad" data-action="link-superset" data-liftname="${liftName}" data-partner="${safe}">${escapeHtml(display)}</button>`;
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
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;

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
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;

  const dayMeta = appState.weeks?.[wk]?.liftMeta?.[selectedDay];
  if (!dayMeta) return;
  const groupId = dayMeta[liftName]?.groupId;
  if (!groupId) return;

  Object.keys(dayMeta).forEach(n => { if (dayMeta[n]?.groupId === groupId) delete dayMeta[n].groupId; });
  _saveState(true);
  renderWorkout();
}

export function setPerSetRpe(liftName, sIdx, rpe) {
  const appState = _getState();
  const day = _getSelectedDay();
  const wk = appState.currentWeek;
  const sets = appState.weeks[wk].lifts?.[day]?.[liftName];
  if (!sets || !sets[sIdx]) return;
  sets[sIdx].rpe = (sets[sIdx].rpe === rpe) ? null : rpe; // toggle off if same
  _saveState(true);
  // DOM-only update: toggle active class without full re-render
  const rowEl = document.querySelector(`.cockpit-exercise[data-liftname="${CSS.escape(liftName)}"] .cockpit-set-row[data-set-index="${sIdx}"]`);
  if (rowEl) {
    rowEl.querySelectorAll('.btn-rpe').forEach(btn => {
      btn.classList.toggle('rpe-selected', parseInt(btn.getAttribute('data-rpe'), 10) === sets[sIdx].rpe);
    });
  }
}

export function toggleAccordionManual(elementNode) {
  if (!elementNode) return;
  const wasCollapsed = elementNode.classList.contains('collapsed');
  document.querySelectorAll('.cockpit-exercise').forEach(card => card.classList.add('collapsed'));

  if (wasCollapsed) {
    elementNode.classList.remove('collapsed');
  }
  try { moveRestTimerToActiveExercise(); } catch(e) { console.warn(e); }
}

function _exChip(name, appState) {
  const pr = appState.exerciseStats?.[name]?.allTimeMax;
  const prStr = pr ? `<span class="el-pr">${Math.round(pr)}kg PR</span>` : '';
  return `<button class="el-chip tactile-scale" data-action="el-pick" data-exname="${name.replace(/"/g, '&quot;')}">${escapeHtml(name)}${prStr}</button>`;
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
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][name]) {
    appState.weeks[wk].lifts[selectedDay][name] = [{ w: '', r: '10', c: false }];
  }
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
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  
  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
  if (!appState.weeks[wk].lifts) appState.weeks[wk].lifts = {};
  if (!appState.weeks[wk].notes) appState.weeks[wk].notes = {};
  if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
  
  appState.weeks[wk].runs[selectedDay] = { dist: '', time: '', rpe: '', avgHR: '', maxHR: '', elev: '', cals: '' };
  appState.weeks[wk].gymStats[selectedDay] = { time: '', avgHR: '', maxHR: '', cals: '' };
  appState.weeks[wk].lifts[selectedDay] = {};
  appState.weeks[wk].notes[selectedDay] = '';
  if (!appState.weeks[wk].liftOrder) appState.weeks[wk].liftOrder = {};
  appState.weeks[wk].liftOrder[selectedDay] = [];

  const activeProgram = getProgramById(appState.activeProgramId);
  const blueprint = activeProgram.days?.[selectedDay];

  if (blueprint && blueprint.lifts) {
    blueprint.lifts.forEach(liftName => {
      try {
        const weekModifier = activeProgram.weeklyVolModifiers?.[wk] || { sets: 4, reps: 5, intensityLabel: "Working Sets" };
        appState.weeks[wk].lifts[selectedDay][liftName] =
          prescribeSetsForLift(wk, selectedDay, liftName, blueprint.desc, weekModifier);
      } catch(e) { console.warn(e); }
    });
    // Reset restores the prescribed program order.
    appState.weeks[wk].liftOrder[selectedDay] = [...blueprint.lifts];
  }
  try {
    stopAndResetWorkoutTimer();
    dismissRestTimer();
  } catch(e) { console.warn(e); }
  
  _saveState(true);
  
  deleteMapFromDB(wk, selectedDay).then(() => {
    renderWorkout();
  }).catch(() => renderWorkout());
  
  closeConfirmResetModal();
  showToast('Day Logs Cleared');
}

export function openFinishSessionModal() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  let vol = 0, setsDone = 0;
  const liftsData = appState.weeks[wk]?.lifts?.[selectedDay] || {};
  
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
  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  const sumModalEl = document.getElementById('summaryModal');

  if (sumVolEl) sumVolEl.textContent = vol + ' kg';
  if (sumSetsEl) sumSetsEl.textContent = setsDone;
  if (sumGymRpeEl) sumGymRpeEl.value = appState.weeks[wk].gymRpe?.[selectedDay] || '';
  if (sumRunRpeEl) sumRunRpeEl.value = appState.weeks[wk].runs?.[selectedDay]?.rpe || '';
  if (sumModalEl) sumModalEl.classList.add('active');
}

export function closeFinishSessionModal() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  if (!appState.weeks[wk].gymRpe) appState.weeks[wk].gymRpe = {};

  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  
  if (sumGymRpeEl) appState.weeks[wk].gymRpe[selectedDay] = sumGymRpeEl.value;
  if (sumRunRpeEl && appState.weeks[wk].runs[selectedDay]) {
    appState.weeks[wk].runs[selectedDay].rpe = sumRunRpeEl.value;
  }
  
  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
  const runRpeEl = document.getElementById('runInputRpeCockpit');
  if (gymRpeEl) gymRpeEl.value = appState.weeks[wk].gymRpe[selectedDay] || '';
  if (runRpeEl) runRpeEl.value = appState.weeks[wk].runs[selectedDay]?.rpe || '';

  // Capture the in-app session timer as this day's gym duration (so it's
  // actually logged), but never clobber a value already set — a .FIT import or
  // a manual edit wins. Read elapsed before stopAndResetWorkoutTimer clears it.
  const elapsedSec = getWorkoutElapsedSeconds();
  if (elapsedSec > 0) {
    if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
    if (!appState.weeks[wk].gymStats[selectedDay]) {
      appState.weeks[wk].gymStats[selectedDay] = { time: '', avgHR: '', maxHR: '', cals: '' };
    }
    const g = appState.weeks[wk].gymStats[selectedDay];
    if (!g.time) {
      const m = Math.floor(elapsedSec / 60);
      const s = elapsedSec % 60;
      g.time = `${m}:${s.toString().padStart(2, '0')}`;
    }
  }

  try { updateExercisePRs(); } catch(e) { console.warn(e); }
  _saveState(true);
  
  const sumModalEl = document.getElementById('summaryModal');
  if (sumModalEl) sumModalEl.classList.remove('active');
  
  try {
    stopAndResetWorkoutTimer();
    dismissRestTimer();
  } catch(e) { console.warn(e); }
  
  if (_switchTab) _switchTab('home');
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
  else if (action === 'append-set') appendCustomSetRow(target, liftName);
  else if (action === 'append-warmup-set') appendWarmupSetRow(target, liftName);
  else if (action === 'remove-set') removeCustomSetRow(liftName, sIdx);
  else if (action === 'cycle-set-type') cycleSetType(liftName, sIdx);
  else if (action === 'cycle-band') cycleSetBand(liftName, sIdx);
  else if (action === 'toggle-bodyweight') toggleSetBodyweight(liftName, sIdx);
  else if (action === 'show-ss-panel') showSupersetLinkPanel(exCard);
  else if (action === 'link-superset') pairAsSuperset(liftName, target.getAttribute('data-partner'));
  else if (action === 'unlink-superset') unpairSuperset(liftName);
  else if (action === 'toggle-accordion') toggleAccordionManual(exCard);
  else if (action === 'set-rpe') setPerSetRpe(liftName, sIdx, parseInt(target.getAttribute('data-rpe'), 10));
  else if (action === 'rest-adjust') adjustRestDuration(parseInt(target.getAttribute('data-delta'), 10));
  else if (action === 'open-add-exercise') openAddExerciseModal();
  else if (action === 'close-add-exercise') closeAddExerciseModal();
  else if (action === 'el-pick') addExerciseToDayFromLibrary(e.target.closest('[data-action="el-pick"]')?.getAttribute('data-exname'));
  else if (action === 'confirm-add-exercise') confirmAddExercise();
  else if (action === 'open-reset-modal') openConfirmResetModal();
  else if (action === 'close-reset-modal') closeConfirmResetModal();
  else if (action === 'execute-reset') executeResetActiveDayMetrics();
  else if (action === 'open-finish-modal') openFinishSessionModal();
  else if (action === 'close-finish-modal') closeFinishSessionModal();
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