// @ts-check
// =============================================================================
// COCKPIT RUN LOGGING — render, unit conversion, persistence and live input.
//
// Split out of js/workout.js while its event routers stay there.  Run logging is
// one cohesive seam: the same card renders values in an athlete's unit, accepts
// edits in that unit, writes canonical kilometres, and keeps its live GPS map
// safe during a rerender.  It reaches no symbols through workout.js; callers
// pass the active state and day explicitly, so the module graph stays a tree.
// =============================================================================
import { renderRunMap } from '../workout-map.js';
import { hasRunData, newRunSessionId, upsertRunSession } from '../state/run-sessions.js';
import { detectRunType } from './run-type.js';
import { hasActiveRunSession } from '../gps-tracker.js';
import { markSessionInProgress } from './session-status.js';

// Distance is stored canonically in km everywhere. The cockpit run panel accepts
// and displays the user's configured unit (km|mi) and converts on the boundary.
const KM_TO_MI = 0.621371;

/** @returns {HTMLInputElement|null} */
function _input(id) {
  return /** @type {HTMLInputElement|null} */ (document.getElementById(id));
}

function _runDistUnit(appState) {
  return appState?.settings?.distanceUnit === 'mi' ? 'mi' : 'km';
}

function _kmToDisplayDist(km, unit) {
  const n = parseFloat(km);
  if (!isFinite(n)) return '';
  const v = unit === 'mi' ? n * KM_TO_MI : n;
  return String(Math.round(v * 100) / 100);
}

function _displayDistToKm(value, unit) {
  const n = parseFloat(value);
  if (!isFinite(n)) return '';
  const km = unit === 'mi' ? n / KM_TO_MI : n;
  return String(Math.round(km * 1000) / 1000);
}

// _paceFromDistTime divides by whichever distance it receives, so passing a
// display-unit distance yields a pace per configured unit.
function _paceFromDistTime(distance, timeStr) {
  const dist = parseFloat(distance);
  if (!dist || dist <= 0 || !timeStr) return '';
  const parts = String(timeStr).trim().split(':');
  let seconds = 0;
  if (parts.length === 3) seconds = +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2]);
  else if (parts.length === 2) seconds = +parts[0] * 60 + parseFloat(parts[1]);
  if (!seconds) return '';
  const secPerUnit = seconds / dist;
  const minutes = Math.floor(secPerUnit / 60);
  const secs = Math.round(secPerUnit % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
}

function _timeFromPaceDist(paceStr, distance) {
  const dist = parseFloat(distance);
  if (!dist || dist <= 0 || !paceStr) return '';
  const parts = String(paceStr).trim().replace(/\/km.*/i, '').trim().split(':');
  if (parts.length !== 2) return '';
  const secPerUnit = +parts[0] * 60 + parseFloat(parts[1]);
  if (!secPerUnit) return '';
  const totalSecs = secPerUnit * dist;
  const minutes = Math.floor(totalSecs / 60);
  const secs = Math.round(totalSecs % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
}

/** Render the editable cockpit run fields and HR-zone strip. */
export function renderRunInputs({ appState, weekData, selectedDay }) {
  const runContext = weekData.runs[selectedDay]
    || { dist: '', time: '', rpe: '', avgHR: '', maxHR: '', elev: '', cals: '', pace: '', notes: '' };

  const distEl = _input('runInputDist');
  const timeEl = _input('runInputTime');
  const rpeEl = _input('runInputRpeCockpit');
  const paceEl = _input('runInputPace');
  const notesEl = _input('runInputNotes');
  const avgHREl = _input('runInputAvgHR');
  const maxHREl = _input('runInputMaxHR');
  const elevEl = _input('runInputElev');
  const calsEl = _input('runInputCals');
  const runExtraStatsRow = document.getElementById('runExtraStats');

  const distUnit = _runDistUnit(appState);
  if (distEl) distEl.value = (runContext.dist === '' || runContext.dist == null)
    ? '' : _kmToDisplayDist(runContext.dist, distUnit);
  if (timeEl) timeEl.value = runContext.time || '';
  if (rpeEl) rpeEl.value = runContext.rpe || '';
  if (notesEl) notesEl.value = runContext.notes || '';
  if (avgHREl) avgHREl.value = runContext.avgHR || '';
  if (maxHREl) maxHREl.value = runContext.maxHR || '';
  if (elevEl) elevEl.value = runContext.elev || '';
  if (calsEl) calsEl.value = runContext.cals || '';

  if (paceEl) {
    const displayDistance = _kmToDisplayDist(runContext.dist, distUnit);
    const computedPace = _paceFromDistTime(displayDistance, runContext.time);
    paceEl.value = computedPace || runContext.pace || '';
    paceEl.placeholder = `—:—— /${distUnit}`;
  }

  const distLabelEl = document.getElementById('runDistUnitLabel');
  if (distLabelEl) distLabelEl.textContent = distUnit === 'mi' ? 'Dist MI' : 'Dist KM';
  const paceUnitEl = document.getElementById('runPaceUnit');
  if (paceUnitEl) paceUnitEl.textContent = `/${distUnit}`;

  const hasRunExtra = runContext.avgHR || runContext.maxHR || runContext.elev || runContext.cals
    || runContext.avgCadence || runContext.descent || runContext.trainingEffect
    || weekData.runs[selectedDay]?.splits?.length > 0;
  if (runExtraStatsRow) runExtraStatsRow.style.display = hasRunExtra ? 'block' : 'none';

  const hrZonesContainer = document.getElementById('runHrZonesContainer');
  const hrZonesBar = document.getElementById('runHrZonesBar');
  const hrZonesLabels = document.getElementById('runHrZonesLabels');
  if (hrZonesContainer && hrZonesBar && hrZonesLabels) {
    const zones = runContext.hrZones;
    if (zones && Array.isArray(zones) && zones.some((zone) => zone > 0)) {
      hrZonesContainer.style.display = 'block';
      const zoneColors = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
      const zoneLabels = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
      const total = zones.reduce((sum, zone) => sum + zone, 0) || 1;
      hrZonesBar.innerHTML = zones.map((zone, index) => {
        const pct = Math.round((zone / total) * 100);
        return pct > 0
          ? `<div style="width:${pct}%;background:${zoneColors[index]};height:100%;transition:width 0.4s;"></div>`
          : '';
      }).join('');
      hrZonesLabels.innerHTML = zones.map((zone, index) => {
        const minutes = Math.floor(zone / 60);
        const seconds = Math.round(zone % 60).toString().padStart(2, '0');
        return `<span style="color:${zoneColors[index]};">${zoneLabels[index]} ${minutes}:${seconds}</span>`;
      }).join('');
    } else {
      hrZonesContainer.style.display = 'none';
    }
  }
}

/** Render imported cadence, elevation, training-effect and split evidence. */
export function renderImportedRunDetails({ appState, weekData, selectedDay }) {
  const runStats = weekData.runs?.[selectedDay] || {};

  const cadenceEl = _input('runInputCadence');
  if (cadenceEl) cadenceEl.value = runStats.avgCadence || '--';
  const descentEl = _input('runInputDescent');
  if (descentEl) descentEl.value = runStats.descent || '--';
  const trainingEffectEl = _input('runInputTE');
  if (trainingEffectEl) trainingEffectEl.value = runStats.trainingEffect || '--';

  const splitsContainer = document.getElementById('runSplitsContainer');
  const splitsTable = document.getElementById('runSplitsTable');
  if (!splitsContainer || !splitsTable) return;
  if (!runStats.splits || runStats.splits.length === 0) {
    splitsContainer.style.display = 'none';
    return;
  }

  const threshold = appState.thresholdPaceSeconds;
  const zoneColour = (secondsPerKm) => {
    if (!threshold) return '#f43f5e';
    const difference = secondsPerKm - threshold;
    if (difference > 90) return '#22d3ee';
    if (difference > 30) return '#10b981';
    if (difference > -30) return '#f59e0b';
    if (difference > -60) return '#f97316';
    return '#ef4444';
  };
  let html = '<div style="font-size: 0.75rem; color: #fff;">';
  runStats.splits.forEach((split) => {
    const minutes = Math.floor(split.time / 60);
    const seconds = Math.floor(split.time % 60).toString().padStart(2, '0');
    const colour = zoneColour(split.time / (split.dist || 1));
    html += `<div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
      <span>Lap ${split.lap}</span>
      <span>${split.dist.toFixed(2)} km</span>
      <span style="color:${colour};">${minutes}:${seconds}/km</span>
      <span style="color:var(--accent-pink);">❤️ ${split.avgHR || '--'}</span>
    </div>`;
  });
  splitsTable.innerHTML = `${html}</div>`;
  splitsContainer.style.display = 'block';
}

/** Render the stored route after the card's imported evidence is refreshed. */
export function renderCockpitRunMap({ appState, weekData, weekKey, selectedDay }) {
  const runContext = weekData.runs[selectedDay] || {};
  renderRunMap(weekKey, selectedDay, runContext.dist, {
    splits: runContext.splits,
    thresholdSec: appState.thresholdPaceSeconds,
    activationId: appState.activeActivationId,
    sessionId: runContext.sessionId,
  });
}

/** Place or collapse the run card without ever disturbing an active GPS run. */
export function positionRunPanel({ homeBlueprint, exercisesContainer }) {
  const runPanel = document.getElementById('cockpitRunPanel');
  const runSpecsEl = document.getElementById('cockpitRunSpecs');
  const blueprintRun = homeBlueprint.runs || '';
  const isRunScheduled = blueprintRun && !blueprintRun.toLowerCase().includes('no structured')
    && blueprintRun.toLowerCase() !== 'rest';

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

  // A live run owns the card. Collapsing or reparenting it would hide the live
  // surface or detach its Leaflet map during an unrelated cockpit rerender.
  const runSessionLive = hasActiveRunSession();
  if (runPanel) runPanel.classList.toggle('run-collapsed', !isRunScheduled && !runSessionLive);
  if (runPanel && exercisesContainer && !runSessionLive) {
    if (!isRunScheduled) exercisesContainer.after(runPanel);
    else exercisesContainer.before(runPanel);
  }
}

/** Persist visible cockpit run fields, converting display distance to km. */
export function commitRunLogging({ appState, weekData, selectedDay }) {
  const distEl = _input('runInputDist');
  const timeEl = _input('runInputTime');
  const rpeEl = _input('runInputRpeCockpit');
  const paceEl = _input('runInputPace');
  const notesEl = _input('runInputNotes');
  const avgHREl = _input('runInputAvgHR');
  const maxHREl = _input('runInputMaxHR');
  const elevEl = _input('runInputElev');
  const calsEl = _input('runInputCals');
  if (!distEl || distEl.offsetParent === null) return;

  const existing = weekData.runs[selectedDay] || {};
  const distanceUnit = _runDistUnit(appState);
  const update = {
    ...existing,
    dist: distEl.value === '' ? '' : _displayDistToKm(distEl.value, distanceUnit),
    time: timeEl?.value || '',
    rpe: rpeEl?.value || '',
    pace: paceEl?.value || '',
    notes: notesEl?.value || '',
    avgHR: avgHREl?.value || '',
    maxHR: maxHREl?.value || '',
    elev: elevEl?.value || '',
    cals: calsEl?.value || '',
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

/**
 * Mark manual run edits as in progress and derive pace/time from the visible
 * display-unit inputs. Returns false for every other input event.
 */
export function handleRunLoggingInput(target, { appState, weekKey, selectedDay }) {
  if (!target.matches('#runInputDist, #runInputTime, #runInputRpeCockpit, #runInputPace, #runInputNotes')) {
    return false;
  }
  markSessionInProgress(appState.weeks?.[weekKey], selectedDay);

  const distEl = _input('runInputDist');
  const timeEl = _input('runInputTime');
  const paceEl = _input('runInputPace');
  if (!distEl || !timeEl || !paceEl) return true;
  if (target.id === 'runInputDist' || target.id === 'runInputTime') {
    const computed = _paceFromDistTime(distEl.value, timeEl.value);
    if (computed) paceEl.value = computed;
  } else if (target.id === 'runInputPace') {
    const derived = _timeFromPaceDist(paceEl.value, distEl.value);
    if (derived) timeEl.value = derived;
  }
  return true;
}
