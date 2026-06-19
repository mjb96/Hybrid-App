// ==========================================
// SETTINGS
// ==========================================
import { saveStateToLocalStorage } from './state.js';
import { setRestDuration } from './timers.js';
import { showToast } from './state.js';

let _getState;

export function initSettings(getStateFn) {
  _getState = getStateFn;
}

// ==========================================
// OPEN / CLOSE
// ==========================================
export function openSettings() {
  const overlay = document.getElementById('settingsOverlay');
  const panel   = document.getElementById('settingsPanel');
  if (!overlay || !panel) return;
  _syncSettingsUI();
  overlay.classList.add('active');
  panel.classList.add('active');
  overlay.removeAttribute('aria-hidden');
}

export function closeSettings() {
  const overlay = document.getElementById('settingsOverlay');
  const panel   = document.getElementById('settingsPanel');
  overlay?.classList.remove('active');
  panel?.classList.remove('active');
  overlay?.setAttribute('aria-hidden', 'true');
}

// ==========================================
// SYNC UI → STATE
// ==========================================
function _syncSettingsUI() {
  if (!_getState) return;
  const appState = _getState();
  const s = appState.settings || {};

  const nameInput = document.getElementById('settingsNameInput');
  if (nameInput) nameInput.value = s.name || '';

  const bwInput = document.getElementById('settingsBodyWeight');
  if (bwInput) bwInput.value = s.defaultBodyWeight || '';

  const bwUnit = document.getElementById('settingsBodyWeightUnit');
  if (bwUnit) bwUnit.textContent = s.weightUnit || 'kg';

  _setToggleActive('[data-action="set-unit"]', `[data-unit="${s.weightUnit || 'kg'}"]`);
  _setToggleActive('[data-action="set-rest-default"]', `[data-secs="${s.restTimerDefault || 90}"]`);
  _setToggleActive('[data-action="set-progression"]', `[data-kg="${s.progressionIncrement || 2.5}"]`);

  const threshEl = document.getElementById('settingsThresholdPace');
  if (threshEl && appState.thresholdPaceSeconds) {
    const total = appState.thresholdPaceSeconds;
    threshEl.value = Math.floor(total / 60) + ':' + (total % 60).toString().padStart(2, '0');
  }

  _refreshAvatar();
}

function _setToggleActive(groupSelector, activeSelector) {
  document.querySelectorAll(groupSelector).forEach(b => b.classList.remove('active'));
  document.querySelector(activeSelector)?.classList.add('active');
}

// ==========================================
// AVATAR
// ==========================================
function _refreshAvatar() {
  if (!_getState) return;
  const name = _getState().settings?.name || '';
  const initials = name.trim()
    ? name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : '?';

  const btnEl   = document.getElementById('profileAvatarInitials');
  const largeEl = document.getElementById('settingsAvatarLarge');
  const nameEl  = document.getElementById('settingsNameDisplay');

  if (btnEl)   btnEl.textContent   = initials;
  if (largeEl) largeEl.textContent = initials;
  if (nameEl)  nameEl.textContent  = name.trim() || 'Athlete';
}

// ==========================================
// SAVE HANDLERS
// ==========================================
function _ensureSettings() {
  const appState = _getState();
  if (!appState.settings) appState.settings = {};
  return appState;
}

export function saveName() {
  const val = document.getElementById('settingsNameInput')?.value?.trim() || '';
  const appState = _ensureSettings();
  appState.settings.name = val;
  saveStateToLocalStorage(true);
  _refreshAvatar();
}

export function saveBodyWeight() {
  const val = parseFloat(document.getElementById('settingsBodyWeight')?.value);
  if (isNaN(val)) return;
  const appState = _ensureSettings();
  appState.settings.defaultBodyWeight = val;
  saveStateToLocalStorage(true);
}

export function setWeightUnit(unit) {
  const appState = _ensureSettings();
  appState.settings.weightUnit = unit;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-unit"]', `[data-unit="${unit}"]`);
  const bwUnit = document.getElementById('settingsBodyWeightUnit');
  if (bwUnit) bwUnit.textContent = unit;
  showToast(`Weight unit: ${unit}`);
}

export function setRestDefault(secs) {
  const appState = _ensureSettings();
  appState.settings.restTimerDefault = secs;
  saveStateToLocalStorage(true);
  setRestDuration(secs);
  _setToggleActive('[data-action="set-rest-default"]', `[data-secs="${secs}"]`);
  showToast(`Default rest: ${secs >= 60 ? Math.floor(secs / 60) + 'm' + (secs % 60 ? (secs % 60) + 's' : '') : secs + 's'}`);
}

export function setProgressionIncrement(kg) {
  const appState = _ensureSettings();
  appState.settings.progressionIncrement = kg;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-progression"]', `[data-kg="${kg}"]`);
  showToast(`Progression step: ${kg}kg`);
}

export function saveThresholdPace() {
  const val = document.getElementById('settingsThresholdPace')?.value?.trim() || '';
  const parts = val.split(':');
  if (parts.length !== 2) return;
  const mins = parseInt(parts[0], 10);
  const secs = parseInt(parts[1], 10);
  if (isNaN(mins) || isNaN(secs)) return;
  const appState = _getState();
  appState.thresholdPaceSeconds = mins * 60 + secs;
  saveStateToLocalStorage(true);
  showToast('Threshold pace saved');
}

// ==========================================
// DATA EXPORT / IMPORT / RESET
// ==========================================
export function exportData() {
  const appState = _getState();
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `hybrid-training-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported ✓');
}

export function triggerImport() {
  document.getElementById('settingsImportFile')?.click();
}

export function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      localStorage.setItem('hybridAppState', JSON.stringify(imported));
      showToast('Import successful — reloading…');
      setTimeout(() => location.reload(), 1200);
    } catch {
      showToast('Import failed: invalid file');
    }
  };
  reader.readAsText(file);
}

export function confirmResetAllData() {
  if (!confirm('Reset ALL training data? This cannot be undone.')) return;
  localStorage.removeItem('hybridAppState');
  showToast('Data cleared — reloading…');
  setTimeout(() => location.reload(), 1200);
}

// ==========================================
// BOOT: apply saved settings on load
// ==========================================
export function applySettingsOnBoot(appState) {
  const s = appState.settings || {};
  if (s.restTimerDefault) setRestDuration(s.restTimerDefault);
  _refreshAvatar();
}
