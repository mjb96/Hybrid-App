// ==========================================
// MANUAL RUN LOGGER
// ==========================================
import { saveStateToLocalStorage, showToast, verifyWeekStorageSchema } from './state.js';
import { todayKey } from './dates.js';
import { resolveDateToSlot } from './analytics/logged-days.js';

let _getState;

// When Save would overwrite a run already logged for the chosen date, we require a
// second tap to confirm. Keyed by the resolved slot ("week:day") so switching the
// date re-arms the guard.
let _pendingOverwriteSlot = null;

function _resetOverwriteGuard() {
  _pendingOverwriteSlot = null;
  const btn = document.querySelector('#runLoggerModal [data-action="save-run-log"]');
  if (btn) btn.textContent = 'Save Run';
}

export function initRunLogger(getStateFn) {
  _getState = getStateFn;
}

export function openRunLogger() {
  const modal = document.getElementById('runLoggerModal');
  if (!modal) return;

  // Log against a real calendar date (defaults to today, capped at today — no
  // future runs). The date maps to the correct program week + weekday on save,
  // so a run can never silently land in the wrong week.
  const today = todayKey();
  const dateEl = document.getElementById('rlDate');
  if (dateEl) {
    dateEl.max = today;
    dateEl.value = today;
  }

  ['rlDist', 'rlTime', 'rlRpe', 'rlAvgHR', 'rlElev', 'rlNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _resetOverwriteGuard();

  const unit = _getState?.().settings?.distanceUnit || 'km';
  const badge = document.getElementById('rlDistUnit');
  if (badge) badge.textContent = unit;

  modal.classList.add('active');
  setTimeout(() => document.getElementById('rlDist')?.focus(), 80);
}

export function closeRunLogger() {
  document.getElementById('runLoggerModal')?.classList.remove('active');
}

export function saveManualRun() {
  const modal = document.getElementById('runLoggerModal');
  const appState = _getState();

  const dateISO = document.getElementById('rlDate')?.value || '';
  if (!dateISO) {
    showToast('Pick a date for this run');
    return;
  }
  if (dateISO > todayKey()) {
    showToast("Can't log a run in the future");
    return;
  }

  const slot = resolveDateToSlot(appState, dateISO);
  if (!slot) {
    showToast('That date is before your program started');
    return;
  }
  const { weekNum, day } = slot;
  const wk = String(weekNum);

  const distRaw = parseFloat(document.getElementById('rlDist')?.value) || 0;
  const time    = document.getElementById('rlTime')?.value?.trim() || '';
  const rpe      = document.getElementById('rlRpe')?.value?.trim() || '';
  const avgHR   = document.getElementById('rlAvgHR')?.value?.trim() || '';
  const elev    = document.getElementById('rlElev')?.value?.trim() || '';
  const notes   = document.getElementById('rlNotes')?.value?.trim() || '';

  if (distRaw <= 0 && !time) {
    showToast('Add distance or time first');
    return;
  }

  const unit = appState.settings?.distanceUnit || 'km';
  const distKm = unit === 'mi' ? distRaw / 0.621371 : distRaw;

  // Ensure the target week bucket exists and carries the full schema before we
  // write into it (past weeks with no logged activity may not exist yet).
  verifyWeekStorageSchema(wk);
  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};

  // Don't silently clobber a run already logged for this date — confirm with a
  // second tap first.
  const slotKey = `${wk}:${day}`;
  const existing = appState.weeks[wk].runs[day];
  const existingHasData = existing && (existing.dist || existing.time || existing.pace || existing.rpe);
  if (existingHasData && _pendingOverwriteSlot !== slotKey) {
    _pendingOverwriteSlot = slotKey;
    showToast('A run is already logged for that date — tap again to replace it', true);
    const btn = modal?.querySelector('[data-action="save-run-log"]');
    if (btn) btn.textContent = 'Replace existing run';
    return;
  }

  appState.weeks[wk].runs[day] = {
    dist: distKm.toFixed(2),
    time,
    rpe,
    avgHR,
    maxHR: '',
    elev,
    cals: '',
    notes,
  };

  // Stamp the slot with the run's ACTUAL calendar date (not "today"), so the
  // activity calendar, streaks and analytics all place it correctly.
  if (!appState.weeks[wk].dates) appState.weeks[wk].dates = {};
  appState.weeks[wk].dates[day] = dateISO;

  saveStateToLocalStorage(true);
  document.dispatchEvent(new Event('app:storage-loaded'));
  _resetOverwriteGuard();
  closeRunLogger();
  showToast('Run logged ✓');
}
