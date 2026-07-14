// =============================================================================
// DATA IMPORT / EXPORT — JSON snapshot + CSV export, JSON import
// init() must be called with live accessors before use.
// =============================================================================
import { showToast } from '../toast.js';
import { runSessionsForDay } from './run-sessions.js';
import { isStateMigrationError } from './migrations.js';

let _getState       = null;
let _setState       = null;
let _saveState      = null;
let _DEFAULT_DAYS   = null;
let _onImportSuccess = null;
let _migrate        = (s) => s;
let _storageKey     = 'hybrid_engine_v2_state';
let _getCloudBackup   = () => null;
let _clearCloudBackup = () => {};

export function initImportExport({ getState, setState, saveState, defaultDays, migrate, storageKey, getCloudBackup, clearCloudBackup }) {
  _getState     = getState;
  _setState     = setState;
  _saveState    = saveState;
  _DEFAULT_DAYS = defaultDays;
  if (typeof migrate === 'function') _migrate = migrate;
  if (storageKey) _storageKey = storageKey;
  if (typeof getCloudBackup === 'function')   _getCloudBackup = getCloudBackup;
  if (typeof clearCloudBackup === 'function') _clearCloudBackup = clearCloudBackup;
}

// True when a pre-sync (pre-cloud-pull) local snapshot exists and holds real
// training history — i.e. this device's data was overwritten by the cloud copy
// on a login/load and is recoverable.
export function hasCloudPullSnapshot() {
  const b = _getCloudBackup();
  return !!(b && b.state && b.state.weeks && Object.keys(b.state.weeks).length > 0);
}

export function cloudPullSnapshotSavedAt() {
  return _getCloudBackup()?.savedAt || null;
}

// Restore the pre-sync snapshot over the current (cloud-loaded) state. Same
// migrate → setState → save → rerender path as a file import, so the recovered
// data is upgraded and immediately pushed back up to the cloud.
export function recoverCloudPullSnapshot() {
  const backup = _getCloudBackup();
  const snap = backup?.state;
  if (!snap || !snap.weeks || Object.keys(snap.weeks).length === 0) {
    showToast('No recoverable snapshot found.', true);
    return false;
  }
  const base = { activeProgramId: 'hybrid_engine', weekStartedAt: null, exerciseStats: {}, customExercises: [], customPrograms: [] };
  let merged;
  try {
    merged = _migrate({ ...base, ...snap });
  } catch (error) {
    showToast(isStateMigrationError(error)
      ? 'Recovery stopped safely: this snapshot could not be upgraded.'
      : 'Recovery stopped safely. Your current data was not replaced.', true);
    return false;
  }
  _backupCurrentState(); // undo point only after the snapshot upgrades safely
  if (!merged.customExercises) merged.customExercises = [];
  if (!merged.customPrograms)  merged.customPrograms  = [];
  _setState(merged);
  _saveState(false); // not suppressed: pushes the recovered data to the cloud
  _clearCloudBackup();
  if (_onImportSuccess) _onImportSuccess();
  showToast('Recovered this device’s data ✓');
  return true;
}

// Snapshot the current persisted state before a destructive import/restore so a
// bad file can be undone. Keeps a single rolling backup.
function _backupCurrentState() {
  try {
    const current = localStorage.getItem(_storageKey);
    if (current) localStorage.setItem(_storageKey + '_backup', current);
  } catch (e) {
    console.warn('Pre-import backup failed:', e);
  }
}

export function setImportSuccessCallback(fn) {
  _onImportSuccess = fn;
}

export function triggerEngineExport() {
  const appState = _getState();
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', 'helyx-snapshot-wk' + appState.currentWeek + '.json');
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function triggerCSVExport() {
  const appState = _getState();
  let csv = 'Week,Day,Exercise,Set,Weight,Reps,Completed,RunSessionId,RunDist,RunTime,RunRPE,AvgHR,MaxHR,ElevGain,Calories,BodyWeight,GymRPE,Notes\n';
  const loggedWeeks = Object.keys(appState.weeks).map(Number).sort((a, b) => a - b);
  loggedWeeks.forEach(w => {
    if (!appState.weeks[w]) return;
    _DEFAULT_DAYS.forEach(d => {
      const dayNotes = (appState.weeks[w].notes?.[d] || '').replace(/,/g, ' ').replace(/\n/g, ' ');
      const runs = runSessionsForDay(appState.weeks[w], d);
      const bw     = appState.weeks[w].bodyWeight?.[d] || '';
      const gymRpe = appState.weeks[w].gymRpe?.[d] || '';

      const runCols = (run) => `${run?.sessionId || ''},${run?.dist || ''},${run?.time || ''},${run?.rpe || ''},${run?.avgHR || ''},${run?.maxHR || ''},${run?.elev || ''},${run?.cals || ''}`;
      const emptyRunCols = Array(8).fill('').join(',');

      const lifts    = appState.weeks[w].lifts?.[d] || {};
      const liftKeys = Object.keys(lifts);

      if (liftKeys.length === 0) {
        runs.forEach(run => {
          csv += `${w},${d},,,,,,${runCols(run)},${bw},${gymRpe},${dayNotes}\n`;
        });
      } else {
        liftKeys.forEach((lift, liftIdx) => {
          lifts[lift].forEach((s, idx) => {
            const isFirstRow = liftIdx === 0 && idx === 0;
            csv += `${w},${d},${lift},${idx + 1},${s.w},${s.r},${s.c},${isFirstRow && runs[0] ? runCols(runs[0]) : emptyRunCols},${bw},${gymRpe},${dayNotes}\n`;
          });
        });
        runs.slice(1).forEach(run => {
          csv += `${w},${d},,,,,,${runCols(run)},${bw},${gymRpe},${dayNotes}\n`;
        });
      }
    });
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'helyx-data-export.csv';
  a.click();
}

export function triggerEngineImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsedData = JSON.parse(e.target.result);
      if (parsedData.currentWeek && parsedData.weeks && Object.keys(parsedData.weeks).length > 0) {
        const base = { activeProgramId: 'hybrid_engine', weekStartedAt: null, exerciseStats: {}, customExercises: [], customPrograms: [] };
        // Run the same versioned migrations the load path uses so an older
        // export is upgraded (and stamped) instead of silently half-broken.
        const merged = _migrate({ ...base, ...parsedData });
        _backupCurrentState(); // undo point only after the import upgrades safely
        if (!merged.customExercises) merged.customExercises = [];
        if (!merged.customPrograms)  merged.customPrograms  = [];
        _setState(merged);
        _saveState(true);
        if (_onImportSuccess) _onImportSuccess();
        showToast('Data snapshot mounted successfully.');
      } else {
        showToast('File structure failed validation.', true);
      }
    } catch (err) {
      showToast(isStateMigrationError(err)
        ? 'Import stopped safely: this file could not be upgraded.'
        : 'Error parsing storage file.', true);
    }
  };
  reader.readAsText(file);
}
