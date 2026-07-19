// =============================================================================
// DATA IMPORT / EXPORT — JSON snapshot + CSV export, JSON import
// init() must be called with live accessors before use.
// =============================================================================
import { showToast } from '../toast.js';
import { isStateMigrationError, CURRENT_SCHEMA_VERSION } from './migrations.js';
import { validateImport, importReasonMessage } from './import-validate.js';
import { buildTrainingCsv } from '../portability/csv-export.js';
import { exportResultMessage, saveTextExport } from '../portability/export-service.js';

let _getState       = null;
let _setState       = null;
let _saveState      = null;
let _DEFAULT_DAYS   = null;
let _onImportSuccess = null;
let _migrate        = (s) => s;
let _storageKey     = 'hybrid_engine_v2_state';
let _getCloudBackup   = () => null;
let _clearCloudBackup = () => {};
let _getCloudOverwriteBackup   = () => null;
let _clearCloudOverwriteBackup = () => {};

export function initImportExport({
  getState, setState, saveState, defaultDays, migrate, storageKey,
  getCloudBackup, clearCloudBackup, getCloudOverwriteBackup, clearCloudOverwriteBackup,
}) {
  _getState     = getState;
  _setState     = setState;
  _saveState    = saveState;
  _DEFAULT_DAYS = defaultDays;
  if (typeof migrate === 'function') _migrate = migrate;
  if (storageKey) _storageKey = storageKey;
  if (typeof getCloudBackup === 'function')   _getCloudBackup = getCloudBackup;
  if (typeof clearCloudBackup === 'function') _clearCloudBackup = clearCloudBackup;
  if (typeof getCloudOverwriteBackup === 'function')   _getCloudOverwriteBackup = getCloudOverwriteBackup;
  if (typeof clearCloudOverwriteBackup === 'function') _clearCloudOverwriteBackup = clearCloudOverwriteBackup;
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

export function hasCloudOverwriteSnapshot() {
  const backup = _getCloudOverwriteBackup();
  return !!(backup && backup.state && backup.state.weeks && Object.keys(backup.state.weeks).length > 0);
}

export function cloudOverwriteSnapshotInfo() {
  const backup = _getCloudOverwriteBackup();
  return backup ? {
    savedAt: backup.savedAt || null,
    serverUpdatedAt: backup.serverUpdatedAt || null,
    summary: backup.summary || null,
  } : null;
}

async function _recoverSnapshot(backup, clearSnapshot, successMessage) {
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
  _backupCurrentState();
  if (!merged.customExercises) merged.customExercises = [];
  if (!merged.customPrograms)  merged.customPrograms  = [];
  _setState(merged);
  await Promise.resolve(_saveState(false));
  // Keep the recovery point if persistence throws. Once the normal save path
  // accepts the recovered state, removing it prevents a stale restore offer;
  // the save layer itself retains failed cloud writes for reconnect retry.
  clearSnapshot();
  if (_onImportSuccess) _onImportSuccess();
  showToast(successMessage);
  return true;
}

// Restore the pre-sync snapshot over the current (cloud-loaded) state. Same
// migrate → setState → save → rerender path as a file import, so the recovered
// data is upgraded and immediately pushed back up to the cloud.
export async function recoverCloudPullSnapshot() {
  return _recoverSnapshot(_getCloudBackup(), _clearCloudBackup, 'Recovered this device’s data ✓');
}

export async function recoverCloudOverwriteSnapshot() {
  return _recoverSnapshot(
    _getCloudOverwriteBackup(),
    _clearCloudOverwriteBackup,
    'Recovered the protected cloud copy ✓',
  );
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

export async function triggerEngineExport() {
  const appState = _getState();
  const result = await saveTextExport({
    filename: `helyx-snapshot-wk${appState.currentWeek}.json`,
    content: JSON.stringify(appState),
    mime: 'application/json',
  });
  const copy = exportResultMessage(result, 'Snapshot');
  showToast(copy.message, copy.error);
}

export async function triggerCSVExport() {
  const appState = _getState();
  const result = await saveTextExport({
    filename: 'helyx-data-export.csv',
    content: buildTrainingCsv(appState, _DEFAULT_DAYS),
    mime: 'text/csv',
  });
  const copy = exportResultMessage(result, 'CSV');
  showToast(copy.message, copy.error);
}

export function triggerEngineImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const rawText = e.target.result;
      const parsedData = JSON.parse(rawText);
      // Deep-validate + sanitize in memory BEFORE anything can replace live state.
      // A malformed/oversized/future-schema/hostile file is refused here, with
      // current data left completely untouched.
      const check = validateImport(parsedData, { currentSchemaVersion: CURRENT_SCHEMA_VERSION, rawText });
      if (!check.ok) {
        showToast(importReasonMessage(check.reason), true);
        return;
      }
      const base = { activeProgramId: 'hybrid_engine', weekStartedAt: null, exerciseStats: {}, customExercises: [], customPrograms: [] };
      // Run the same versioned migrations the load path uses so an older
      // export is upgraded (and stamped) instead of silently half-broken.
      const merged = _migrate({ ...base, ...check.state });
      _backupCurrentState(); // undo point only after the import upgrades safely
      if (!merged.customExercises) merged.customExercises = [];
      if (!merged.customPrograms)  merged.customPrograms  = [];
      _setState(merged);
      _saveState(true);
      if (_onImportSuccess) _onImportSuccess();
      const c = check.counts;
      const parts = [`${c.weeks} week${c.weeks === 1 ? '' : 's'}`];
      if (c.programs) parts.push(`${c.programs} program${c.programs === 1 ? '' : 's'}`);
      if (c.runs) parts.push(`${c.runs} run${c.runs === 1 ? '' : 's'}`);
      showToast(`Imported ${parts.join(' · ')} ✓`);
    } catch (err) {
      showToast(isStateMigrationError(err)
        ? 'Import stopped safely: this file could not be upgraded.'
        : 'Error parsing storage file.', true);
    }
  };
  reader.readAsText(file);
}
