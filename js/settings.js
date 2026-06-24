// ==========================================
// SETTINGS
// ==========================================
import { saveStateToLocalStorage } from './state.js';
import { setRestDuration } from './timers.js';
import { showToast } from './state.js';
import { rearmReminder } from './notifications.js';
import { getCloudUser, signOutSupabase } from './state/auth.js';

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
  if (bwInput) {
    const bwLog = appState.bodyWeightLog || [];
    const latest = bwLog.length > 0 ? bwLog[bwLog.length - 1].weight : null;
    bwInput.value = latest ?? (s.defaultBodyWeight || '');
  }

  const bwUnit = document.getElementById('settingsBodyWeightUnit');
  if (bwUnit) bwUnit.textContent = s.weightUnit || 'kg';

  _setToggleActive('[data-action="set-unit"]',        `[data-unit="${s.weightUnit || 'kg'}"]`);
  _setToggleActive('[data-action="set-dist-unit"]',   `[data-unit="${s.distanceUnit || 'km'}"]`);
  _setToggleActive('[data-action="set-rest-default"]',`[data-secs="${s.restTimerDefault || 90}"]`);
  _setToggleActive('[data-action="set-progression"]', `[data-kg="${s.progressionIncrement || 2.5}"]`);
  _setToggleActive('[data-action="set-theme"]',       `[data-theme-val="${s.theme || 'dark'}"]`);
  _setToggleActive('[data-action="set-fitness-goal"]',`[data-goal="${s.fitnessGoal || 'hybrid'}"]`);
  _setToggleActive('[data-action="set-fitness-level"]',`[data-level="${s.fitnessLevel || 'intermediate'}"]`);
  _setToggleActive('[data-action="set-week-start"]',  `[data-day="${s.weekStartDay || 'mon'}"]`);
  _setToggleActive('[data-action="set-fasting-default"]',`[data-hours="${s.fastingDefault || 16}"]`);

  const weekEl = document.getElementById('settingsCurrentWeek');
  if (weekEl) weekEl.textContent = _getState().currentWeek || '1';

  const autoAdv = document.getElementById('settingsAutoAdvance');
  if (autoAdv) autoAdv.checked = s.autoAdvanceWeek !== false;

  const threshEl = document.getElementById('settingsThresholdPace');
  if (threshEl && appState.thresholdPaceSeconds) {
    const total = appState.thresholdPaceSeconds;
    threshEl.value = Math.floor(total / 60) + ':' + (total % 60).toString().padStart(2, '0');
  }

  // Equipment checkboxes
  const eq = s.equipment || {};
  ['barbell','rack','dumbbells','cables','pullupBar','bands','kettlebells','treadmill'].forEach(key => {
    const el = document.querySelector(`[data-equipment="${key}"]`);
    if (el) el.checked = eq[key] !== false && (eq[key] === true || ['barbell','rack','dumbbells','cables','pullupBar'].includes(key));
  });

  // Notification toggles
  const notifCheckbox = document.getElementById('settingsNotifications');
  if (notifCheckbox) notifCheckbox.checked = ('Notification' in window) && Notification.permission === 'granted';

  const notifWeekly   = document.getElementById('settingsNotifWeeklySummary');
  const notifStreak   = document.getElementById('settingsNotifStreak');
  const notifMissed   = document.getElementById('settingsNotifMissedWorkout');
  if (notifWeekly) notifWeekly.checked = !!s.notifWeeklySummary;
  if (notifStreak)  notifStreak.checked  = !!s.notifStreak;
  if (notifMissed)  notifMissed.checked  = !!s.notifMissedWorkout;

  // Reminder time picker
  const rtEl = document.getElementById('settingsReminderTime');
  if (rtEl) {
    const rt = s.reminderTime || { hour: 7, minute: 30 };
    rtEl.value = `${String(rt.hour).padStart(2, '0')}:${String(rt.minute).padStart(2, '0')}`;
  }

  // Streak alert time picker
  const satEl = document.getElementById('settingsStreakAlertTime');
  if (satEl) {
    const sat = s.streakAlertTime || { hour: 20, minute: 0 };
    satEl.value = `${String(sat.hour).padStart(2, '0')}:${String(sat.minute).padStart(2, '0')}`;
  }

  // Account / cloud sync status
  _syncAccountUI();

  // Notification status text
  const notifStatusEl = document.getElementById('settingsNotifStatus');
  if (notifStatusEl) {
    if (('Notification' in window) && Notification.permission === 'granted') {
      const rt = s.reminderTime || { hour: 7, minute: 30 };
      const display = `${String(rt.hour).padStart(2, '0')}:${String(rt.minute).padStart(2, '0')}`;
      notifStatusEl.textContent = `Reminders active — you'll be notified at ${display}.`;
    } else {
      notifStatusEl.textContent = 'Enable to receive daily training reminders.';
    }
  }

  _refreshAvatar();
  _syncHealthConnectUI();
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
  const s    = _getState().settings || {};
  const name = s.name || '';
  const initials = name.trim()
    ? name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : '?';
  const avatarUrl = s.avatarDataUrl || null;

  const imgTag      = avatarUrl ? `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : null;
  const imgTagRound = avatarUrl ? `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : null;

  const btnEl   = document.getElementById('profileAvatarInitials');
  const largeEl = document.getElementById('settingsAvatarLarge');
  const nameEl  = document.getElementById('settingsNameDisplay');

  if (btnEl)   btnEl.innerHTML  = imgTagRound || initials;
  if (largeEl) largeEl.innerHTML = (imgTag || initials) + '<div class="settings-avatar-camera-overlay">📷</div>';
  if (nameEl)  nameEl.textContent = name.trim() || 'Athlete';
}

export function openAvatarPicker() {
  document.getElementById('avatarFilePicker')?.click();
}

export function handleAvatarFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 320;
      const scale  = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const appState = _ensureSettings();
      appState.settings.avatarDataUrl = dataUrl;
      saveStateToLocalStorage(true);
      _refreshAvatar();
      showToast('Profile photo updated ✓');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
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
  if (!appState.bodyWeightLog) appState.bodyWeightLog = [];
  const today = new Date().toISOString().slice(0, 10);
  const idx = appState.bodyWeightLog.findIndex(l => l.date === today);
  if (idx >= 0) appState.bodyWeightLog[idx].weight = val;
  else appState.bodyWeightLog.push({ date: today, weight: val });
  saveStateToLocalStorage(true);
  showToast(`Body weight saved: ${val} ${appState.settings.weightUnit || 'kg'}`);
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

export function setTheme(mode) {
  const appState = _ensureSettings();
  appState.settings.theme = mode;
  saveStateToLocalStorage(true);
  _applyTheme(mode);
  _setToggleActive('[data-action="set-theme"]', `[data-theme-val="${mode}"]`);
  const label = mode === 'light' ? 'Light' : mode === 'system' ? 'System' : 'Dark';
  showToast(`${label} mode`);
}

function _applyTheme(mode) {
  if (mode === 'system') {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = mode;
  }
}

export function setDistanceUnit(unit) {
  const appState = _ensureSettings();
  appState.settings.distanceUnit = unit;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-dist-unit"]', `[data-unit="${unit}"]`);
  showToast(`Distance unit: ${unit}`);
  document.dispatchEvent(new Event('app:storage-loaded')); // refresh tiles
}

export function stepCurrentWeek(delta) {
  const appState = _getState();
  const activeProgram = window._hybridGetProgram?.();
  const maxWeek = activeProgram?.totalWeeks || 12;
  const current = parseInt(appState.currentWeek, 10);
  const next = Math.max(1, Math.min(maxWeek, current + delta));
  if (next === current) return;
  appState.currentWeek = next.toString();
  appState.weekStartedAt = new Date().toISOString();
  saveStateToLocalStorage(true);
  const el = document.getElementById('settingsCurrentWeek');
  if (el) el.textContent = next;
  showToast(`Week ${next}`);
  document.dispatchEvent(new Event('app:storage-loaded'));
}

export function setAutoAdvanceWeek(enabled) {
  const appState = _ensureSettings();
  appState.settings.autoAdvanceWeek = enabled;
  saveStateToLocalStorage(true);
}

export function setFitnessGoal(goal) {
  const appState = _ensureSettings();
  appState.settings.fitnessGoal = goal;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-fitness-goal"]', `[data-goal="${goal}"]`);
  const labels = { strength: 'Strength First', hybrid: 'True Hybrid', endurance: 'Run-Focused' };
  showToast(`Goal: ${labels[goal] || goal}`);
}

export function setFitnessLevel(level) {
  const appState = _ensureSettings();
  appState.settings.fitnessLevel = level;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-fitness-level"]', `[data-level="${level}"]`);
  const labels = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
  showToast(`Level: ${labels[level] || level}`);
}

export function setWeekStartDay(day) {
  const appState = _ensureSettings();
  appState.settings.weekStartDay = day;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-week-start"]', `[data-day="${day}"]`);
  showToast(`Week starts on ${day === 'mon' ? 'Monday' : 'Sunday'}`);
}

export function setFastingDefault(hours) {
  const appState = _ensureSettings();
  appState.settings.fastingDefault = hours;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-fasting-default"]', `[data-hours="${hours}"]`);
  showToast(`Default fast: ${hours}h`);
  document.dispatchEvent(new Event('app:storage-loaded'));
}

export function saveReminderTime() {
  const val = document.getElementById('settingsReminderTime')?.value;
  if (!val) return;
  const [hourStr, minuteStr] = val.split(':');
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);
  if (isNaN(hour) || isNaN(minute)) return;
  const appState = _ensureSettings();
  appState.settings.reminderTime = { hour, minute };
  saveStateToLocalStorage(true);
  rearmReminder();
  const display = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  showToast(`Reminder set for ${display}`);
  const statusEl = document.getElementById('settingsNotifStatus');
  if (statusEl) statusEl.textContent = `Reminders active — you'll be notified at ${display}.`;
}

export function setNotifToggle(type, enabled) {
  const appState = _ensureSettings();
  if (type === 'weeklySummary')   appState.settings.notifWeeklySummary = enabled;
  else if (type === 'streak')     appState.settings.notifStreak = enabled;
  else if (type === 'missed')     appState.settings.notifMissedWorkout = enabled;
  saveStateToLocalStorage(true);
  rearmReminder();
}

export function saveStreakAlertTime() {
  const val = document.getElementById('settingsStreakAlertTime')?.value;
  if (!val) return;
  const [hourStr, minuteStr] = val.split(':');
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);
  if (isNaN(hour) || isNaN(minute)) return;
  const appState = _ensureSettings();
  appState.settings.streakAlertTime = { hour, minute };
  saveStateToLocalStorage(true);
  rearmReminder();
  showToast(`Streak alert set for ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
}

export function toggleEquipment(key, enabled) {
  const appState = _ensureSettings();
  if (!appState.settings.equipment) appState.settings.equipment = {};
  appState.settings.equipment[key] = enabled;
  saveStateToLocalStorage(true);
}

export function signOut() {
  signOutSupabase();
}

// ── Account / cloud status UI ─────────────────────────────────────────────────
async function _syncAccountUI() {
  const emailEl   = document.getElementById('settingsAccountEmail');
  const signOutBtn = document.getElementById('settingsSignOutBtn');
  if (!emailEl) return;

  const user = await getCloudUser();
  if (user?.email) {
    emailEl.textContent = user.email;
    if (signOutBtn) signOutBtn.style.display = 'block';
  } else {
    emailEl.textContent = 'Local only — not signed in';
    if (signOutBtn) signOutBtn.style.display = 'none';
  }
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
// HEALTH CONNECT
// ==========================================
function _syncHealthConnectUI() {
  if (!_getState) return;
  const hc = _getState().healthConnect || {};

  const statusCard      = document.getElementById('hcStatusCard');
  const indicator       = document.getElementById('hcStatusIndicator');
  const statusLabel     = document.getElementById('hcStatusLabel');
  const lastSync        = document.getElementById('hcLastSync');
  const connectBtn      = document.getElementById('hcConnectBtn');
  const syncNowBtn      = document.getElementById('hcSyncNowBtn');
  const dataTypes       = document.getElementById('hcDataTypes');
  const stepGoalInput   = document.getElementById('settingsStepGoal');
  const noteEl          = document.getElementById('hcNote');

  const connected = !!hc.connected;

  if (indicator) {
    indicator.className = 'hc-status-indicator ' + (connected ? 'hc-connected' : 'hc-disconnected');
  }
  if (statusLabel) statusLabel.textContent = connected ? 'Connected' : 'Not connected';
  if (lastSync) {
    lastSync.textContent = hc.lastSync
      ? 'Last sync: ' + new Date(hc.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
  }
  if (connectBtn) connectBtn.textContent = connected ? 'Disconnect' : 'Connect';
  if (syncNowBtn) syncNowBtn.style.display = connected ? 'block' : 'none';
  if (dataTypes) dataTypes.style.opacity = connected ? '1' : '0.45';
  if (stepGoalInput) stepGoalInput.value = hc.stepGoal || 10000;
  if (noteEl) noteEl.style.display = connected ? 'none' : 'block';

  // Sync field toggles
  if (connected) {
    ['hrv','restingHR','sleep','steps','vo2max'].forEach(field => {
      const el = document.querySelector(`[data-hc-field="${field}"]`);
      if (el) el.checked = hc.syncFields ? (hc.syncFields[field] !== false) : true;
    });
  }
}

export function hcToggleConnect() {
  if (!_getState) return;
  const appState = _getState();
  const hc = appState.healthConnect;
  if (hc.connected) {
    hc.connected = false;
    hc.lastSync  = null;
    saveStateToLocalStorage(true);
    _syncHealthConnectUI();
    showToast('Health Connect disconnected');
  } else {
    // On a real Android app, this would call the native bridge.
    // For now, simulate a successful connection with demo data.
    _requestHealthConnectOrDemo(appState);
  }
}

function _requestHealthConnectOrDemo(appState) {
  // Try native Android bridge first
  if (window.HybridAndroidBridge?.requestHealthConnect) {
    window.HybridAndroidBridge.requestHealthConnect();
    showToast('Opening Health Connect…');
    return;
  }
  // No bridge — mark connected with placeholder data so tiles activate
  const hc = appState.healthConnect;
  hc.connected = true;
  hc.lastSync  = Date.now();
  if (!hc.syncFields) hc.syncFields = { hrv: true, restingHR: true, sleep: true, steps: true, vo2max: true };
  saveStateToLocalStorage(true);
  _syncHealthConnectUI();
  showToast('Health Connect ready — sync via Android app');
}

export function hcSyncNow() {
  if (window.HybridAndroidBridge?.syncHealthConnect) {
    window.HybridAndroidBridge.syncHealthConnect();
    showToast('Syncing…');
  } else {
    showToast('Sync requires the Android app');
  }
}

export function saveStepGoal() {
  const val = parseInt(document.getElementById('settingsStepGoal')?.value, 10);
  if (isNaN(val) || val < 1000) return;
  const appState = _getState();
  appState.healthConnect.stepGoal = val;
  saveStateToLocalStorage(true);
  showToast(`Step goal: ${val.toLocaleString()}`);
}

export function hcToggleSyncField(field, enabled) {
  const appState = _getState();
  if (!appState.healthConnect.syncFields) appState.healthConnect.syncFields = {};
  appState.healthConnect.syncFields[field] = enabled;
  saveStateToLocalStorage(true);
}

// Called from Android native layer via window.onHealthConnectData(payload)
window.onHealthConnectData = function(payload) {
  try {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const appState = window._hybridGetState?.();
    if (!appState) return;
    const hc = appState.healthConnect;
    if (data.hrv)       hc.hrv       = data.hrv;
    if (data.restingHR) hc.restingHR = data.restingHR;
    if (data.sleep)     hc.sleep     = data.sleep;
    if (data.steps)     hc.steps     = data.steps;
    if (data.vo2max)    hc.vo2max    = data.vo2max;
    hc.connected = true;
    hc.lastSync  = Date.now();
    saveStateToLocalStorage(true);
    _syncHealthConnectUI();
    document.dispatchEvent(new Event('app:storage-loaded'));
  } catch(e) { console.warn('Health Connect data error', e); }
};

// ==========================================
// BOOT: apply saved settings on load
// ==========================================
export function applySettingsOnBoot(appState) {
  const s = appState.settings || {};
  if (s.restTimerDefault) setRestDuration(s.restTimerDefault);
  _applyTheme(s.theme || 'dark');

  // Re-apply system theme if OS preference changes at runtime
  if (s.theme === 'system') {
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (_getState?.()?.settings?.theme === 'system') {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
      }
    });
  }

  _refreshAvatar();
  window._hybridGetState = _getState;
}
