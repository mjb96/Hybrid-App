// =============================================================================
// DATA IMPORT / EXPORT — JSON snapshot + CSV export, JSON import
// init() must be called with live accessors before use.
// =============================================================================
import { showToast } from '../toast.js';

let _getState       = null;
let _setState       = null;
let _saveState      = null;
let _DEFAULT_DAYS   = null;
let _onImportSuccess = null;
let _migrate        = (s) => s;
let _storageKey     = 'hybrid_engine_v2_state';

export function initImportExport({ getState, setState, saveState, defaultDays, migrate, storageKey }) {
  _getState     = getState;
  _setState     = setState;
  _saveState    = saveState;
  _DEFAULT_DAYS = defaultDays;
  if (typeof migrate === 'function') _migrate = migrate;
  if (storageKey) _storageKey = storageKey;
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
  a.setAttribute('download', 'hybrid_v2_meso_snapshot_wk' + appState.currentWeek + '.json');
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function triggerCSVExport() {
  const appState = _getState();
  let csv = 'Week,Day,Exercise,Set,Weight,Reps,Completed,RunDist,RunTime,RunRPE,AvgHR,MaxHR,ElevGain,Calories,BodyWeight,GymRPE,Notes\n';
  const loggedWeeks = Object.keys(appState.weeks).map(Number).sort((a, b) => a - b);
  loggedWeeks.forEach(w => {
    if (!appState.weeks[w]) return;
    _DEFAULT_DAYS.forEach(d => {
      const dayNotes = (appState.weeks[w].notes?.[d] || '').replace(/,/g, ' ').replace(/\n/g, ' ');
      const run = appState.weeks[w].runs?.[d] || {};
      const bw     = appState.weeks[w].bodyWeight?.[d] || '';
      const gymRpe = appState.weeks[w].gymRpe?.[d] || '';

      const runDist = run.dist || '';
      const runTime = run.time || '';
      const runRpe  = run.rpe  || '';
      const runAvgHR = run.avgHR || '';
      const runMaxHR = run.maxHR || '';
      const runElev  = run.elev  || '';
      const runCals  = run.cals  || '';

      const lifts    = appState.weeks[w].lifts?.[d] || {};
      const liftKeys = Object.keys(lifts);

      if (liftKeys.length === 0) {
        if (runDist || runTime) {
          csv += `${w},${d},,,,,,${runDist},${runTime},${runRpe},${runAvgHR},${runMaxHR},${runElev},${runCals},${bw},${gymRpe},${dayNotes}\n`;
        }
      } else {
        liftKeys.forEach((lift, liftIdx) => {
          lifts[lift].forEach((s, idx) => {
            const isFirstRow = liftIdx === 0 && idx === 0;
            const runCols = isFirstRow
              ? `${runDist},${runTime},${runRpe},${runAvgHR},${runMaxHR},${runElev},${runCals}`
              : ',,,,,,,';
            csv += `${w},${d},${lift},${idx + 1},${s.w},${s.r},${s.c},${runCols},${bw},${gymRpe},${dayNotes}\n`;
          });
        });
      }
    });
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hybrid_data_export.csv';
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
        _backupCurrentState(); // undo point before we overwrite live data
        const base = { activeProgramId: 'hybrid_engine', weekStartedAt: null, exerciseStats: {}, customExercises: [], customPrograms: [] };
        // Run the same versioned migrations the load path uses so an older
        // export is upgraded (and stamped) instead of silently half-broken.
        const merged = _migrate({ ...base, ...parsedData });
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
      showToast('Error parsing storage file.', true);
    }
  };
  reader.readAsText(file);
}
