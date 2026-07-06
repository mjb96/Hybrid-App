// ==========================================
// MANUAL RUN LOGGER
// ==========================================
import { saveStateToLocalStorage, showToast } from './state.js';
import { dateKey } from './dates.js';

let _getState;

// When Save would overwrite a run already logged for the chosen day, we require a
// second tap to confirm. Keyed by day so switching days re-arms the guard.
let _pendingOverwriteDay = null;

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function _resetOverwriteGuard() {
  _pendingOverwriteDay = null;
  const btn = document.querySelector('#runLoggerModal [data-action="save-run-log"]');
  if (btn) btn.textContent = 'Save Run';
}

export function initRunLogger(getStateFn) {
  _getState = getStateFn;
}

export function openRunLogger() {
  const modal = document.getElementById('runLoggerModal');
  if (!modal) return;

  const todayIdx = (new Date().getDay() + 6) % 7; // 0=Mon
  const todayDay = DAY_ORDER[todayIdx];

  modal.querySelectorAll('[data-action="rl-day"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.day === todayDay);
  });

  ['rlDist', 'rlTime', 'rlAvgHR', 'rlElev', 'rlNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('[data-action="rl-rpe"]').forEach(b => b.classList.remove('active'));
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
  const activeDay = modal?.querySelector('[data-action="rl-day"].active')?.dataset.day;
  if (!activeDay) return;

  const distRaw = parseFloat(document.getElementById('rlDist')?.value) || 0;
  const time    = document.getElementById('rlTime')?.value?.trim() || '';
  const avgHR   = document.getElementById('rlAvgHR')?.value?.trim() || '';
  const elev    = document.getElementById('rlElev')?.value?.trim() || '';
  const notes   = document.getElementById('rlNotes')?.value?.trim() || '';
  const rpe     = document.querySelector('[data-action="rl-rpe"].active')?.dataset.rpe || '';

  if (distRaw <= 0 && !time) {
    showToast('Add distance or time first');
    return;
  }

  const appState = _getState();
  const unit = appState.settings?.distanceUnit || 'km';
  const distKm = unit === 'mi' ? distRaw / 0.621371 : distRaw;

  const wk = appState.currentWeek;
  if (!appState.weeks[wk]) return;
  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};

  // Don't silently clobber a run already logged for this day — confirm with a
  // second tap first.
  const existing = appState.weeks[wk].runs[activeDay];
  const existingHasData = existing && (existing.dist || existing.time || existing.pace || existing.rpe);
  if (existingHasData && _pendingOverwriteDay !== activeDay) {
    _pendingOverwriteDay = activeDay;
    showToast('A run is already logged for this day — tap again to replace it', true);
    const btn = modal?.querySelector('[data-action="save-run-log"]');
    if (btn) btn.textContent = 'Replace existing run';
    return;
  }

  appState.weeks[wk].runs[activeDay] = {
    dist: distKm.toFixed(2),
    time,
    rpe,
    avgHR,
    maxHR: '',
    elev,
    cals: '',
    notes,
  };

  if (!appState.weeks[wk].dates) appState.weeks[wk].dates = {};
  if (!appState.weeks[wk].dates[activeDay]) {
    appState.weeks[wk].dates[activeDay] = dateKey();
  }

  saveStateToLocalStorage(true);
  document.dispatchEvent(new Event('app:storage-loaded'));
  _resetOverwriteGuard();
  closeRunLogger();
  showToast('Run logged ✓');
}

export function handleRunLoggerRpeClick(btn) {
  document.querySelectorAll('[data-action="rl-rpe"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
