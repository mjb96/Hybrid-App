// ==========================================
// SETTINGS
// ==========================================
import { saveStateToLocalStorage } from './state.js';
import { setRestTiers, setRestTimerEnabled, setRestOverrides, initRestPersistence } from './timers.js';

// Rest tier <-> "m:ss" helpers. Inputs accept "2:30", "150", or "2".
const _fmtRest = (sec) => {
  const n = parseInt(sec, 10) || 0;
  return `${Math.floor(n / 60)}:${(n % 60).toString().padStart(2, '0')}`;
};
const _parseRest = (str) => {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    return (parseInt(m, 10) || 0) * 60 + (parseInt(sec, 10) || 0);
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};
const REST_PRESETS = {
  strength:    { compound: 240, accessory: 180, isolation: 120 },
  hypertrophy: { compound: 180, accessory: 120, isolation: 90 },
  efficient:   { compound: 120, accessory: 90,  isolation: 60 },
};
import { showToast } from './state.js';
import { rearmReminder, notificationsGranted } from './notifications.js';
import { getCloudUser, signOutSupabase, deleteAccount as authDeleteAccount } from './state/auth.js';
import { confirmModal } from './ui/confirm-modal.js';
import { hasCloudPullSnapshot, recoverCloudPullSnapshot } from './state/import-export.js';
import { isHealthBridgeAvailable, getHealthAvailability, connectAndSync, syncHealthConnect } from './health/health-bridge.js';

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

  // Show the pre-sync recovery affordance only when a recoverable snapshot of
  // this device's data exists (i.e. a cloud copy overwrote it on sign-in).
  const recoverBtn  = document.getElementById('settingsRecoverSnapshotBtn');
  const recoverHint = document.getElementById('settingsRecoverSnapshotHint');
  const canRecover  = hasCloudPullSnapshot();
  if (recoverBtn)  recoverBtn.style.display  = canRecover ? '' : 'none';
  if (recoverHint) recoverHint.style.display = canRecover ? '' : 'none';

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
  _setToggleActive('[data-action="set-progression"]', `[data-kg="${s.progressionIncrement || 2.5}"]`);
  _setToggleActive('[data-action="set-theme"]',       `[data-theme-val="${s.theme || 'dark'}"]`);
  _setToggleActive('[data-action="set-fitness-goal"]',`[data-goal="${s.fitnessGoal || 'hybrid'}"]`);
  _setToggleActive('[data-action="set-weight-goal"]',`[data-weight-goal="${s.weightGoal || 'maintain'}"]`);
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

  // Resistance band weights (≈ kg used for volume)
  const bw = s.bandWeights || { L: 10, M: 20, H: 30 };
  const bl = document.getElementById('settingsBandLight');
  const bm = document.getElementById('settingsBandMed');
  const bh = document.getElementById('settingsBandHeavy');
  if (bl) bl.value = bw.L ?? '';
  if (bm) bm.value = bw.M ?? '';
  if (bh) bh.value = bw.H ?? '';

  // Rest tiers + auto-timer toggle
  const rp = s.restPeriods || { compound: 180, accessory: 120, isolation: 90 };
  const rc = document.getElementById('settingsRestCompound');
  const ra = document.getElementById('settingsRestAccessory');
  const ri = document.getElementById('settingsRestIsolation');
  if (rc) rc.value = _fmtRest(rp.compound);
  if (ra) ra.value = _fmtRest(rp.accessory);
  if (ri) ri.value = _fmtRest(rp.isolation);
  const rEnabled = document.getElementById('settingsRestEnabled');
  if (rEnabled) rEnabled.checked = s.restTimerEnabled !== false;

  // Notification toggles
  const notifCheckbox = document.getElementById('settingsNotifications');
  if (notifCheckbox) notifCheckbox.checked = notificationsGranted();

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
    if (notificationsGranted()) {
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
  // Scope the value match to the group: several data-* values (data-day, data-goal,
  // data-level, data-unit) also exist in the cockpit/onboarding, which appear earlier
  // in the DOM, so an unscoped querySelector would highlight the wrong element (or
  // nothing in this group). Compound the selectors so we always hit this group's button.
  document.querySelector(groupSelector + activeSelector)?.classList.add('active');
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

// Clear all remembered per-exercise rest adjustments.
export function resetRestOverrides() {
  const appState = _ensureSettings();
  appState.settings.restOverrides = {};
  setRestOverrides({});
  saveStateToLocalStorage(true);
  showToast('Remembered rests cleared');
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

export function setWeightGoal(goal) {
  const appState = _ensureSettings();
  appState.settings.weightGoal = goal;
  saveStateToLocalStorage(true);
  _setToggleActive('[data-action="set-weight-goal"]', `[data-weight-goal="${goal}"]`);
  const labels = { cut: 'Cutting', maintain: 'Maintaining', bulk: 'Bulking' };
  showToast(`Weight goal: ${labels[goal] || goal}`);
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

// Persist the nominal kg-equivalent for each resistance band. These feed the
// cockpit's per-set band selector so band work still contributes to volume.
// Persist the three rest tiers from the Settings inputs (clamped 30–600s).
export function saveRestPeriods() {
  const appState = _ensureSettings();
  const cur = appState.settings.restPeriods || { compound: 180, accessory: 120, isolation: 90 };
  const read = (id, fallback) => {
    const sec = _parseRest(document.getElementById(id)?.value);
    return sec != null ? Math.min(600, Math.max(30, sec)) : fallback;
  };
  appState.settings.restPeriods = {
    compound:  read('settingsRestCompound',  cur.compound),
    accessory: read('settingsRestAccessory', cur.accessory),
    isolation: read('settingsRestIsolation', cur.isolation),
  };
  setRestTiers(appState.settings.restPeriods);
  saveStateToLocalStorage(true);
}

// Apply a preset to the three tiers and reflect it in the inputs.
export function applyRestPreset(name) {
  const preset = REST_PRESETS[name];
  if (!preset) return;
  const appState = _ensureSettings();
  appState.settings.restPeriods = { ...preset };
  setRestTiers(preset);
  const rc = document.getElementById('settingsRestCompound');
  const ra = document.getElementById('settingsRestAccessory');
  const ri = document.getElementById('settingsRestIsolation');
  if (rc) rc.value = _fmtRest(preset.compound);
  if (ra) ra.value = _fmtRest(preset.accessory);
  if (ri) ri.value = _fmtRest(preset.isolation);
  saveStateToLocalStorage(true);
}

// Toggle the auto rest timer on/off.
export function setRestTimerEnabledSetting(enabled) {
  const appState = _ensureSettings();
  appState.settings.restTimerEnabled = !!enabled;
  setRestTimerEnabled(!!enabled);
  saveStateToLocalStorage(true);
}

export function saveBandWeights() {
  const appState = _ensureSettings();
  const read = (id, fallback) => {
    const el = document.getElementById(id);
    const v = el ? parseFloat(el.value) : NaN;
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  appState.settings.bandWeights = {
    L: read('settingsBandLight', 10),
    M: read('settingsBandMed', 20),
    H: read('settingsBandHeavy', 30),
  };
  saveStateToLocalStorage(true);
}

export function signOut() {
  signOutSupabase();
}

// Guard against a double-tap firing two deletions concurrently.
let _deleteInFlight = false;

export async function deleteAccount() {
  if (_deleteInFlight) return;

  const ok = await confirmModal({
    title: 'Delete your account?',
    message: 'This permanently deletes your account and ALL synced data. It cannot be undone.\n\nConsider exporting your data first (Settings → Export).',
    confirmLabel: 'Delete account', danger: true,
  });
  if (!ok) return;

  _deleteInFlight = true;
  const btn = document.getElementById('settingsDeleteAccountBtn');
  if (btn) btn.disabled = true;

  showToast('Deleting account…');
  try {
    const res = await authDeleteAccount();
    if (res.ok) {
      // Only reached when the auth identity is confirmed removed.
      showToast('Account and all data deleted.');
      setTimeout(() => { try { window.location.reload(); } catch (_) {} }, 900);
      return; // keep the button disabled through the reload
    }

    // Honest, non-technical messaging for each partial/failed outcome. When the
    // login still exists we keep the user signed in so a retry can finish.
    const msg =
      res.reason === 'not-signed-in' ? 'You are not signed in.'
      : res.reason === 'offline' ? 'You are offline. Reconnect and try again to delete your account.'
      : res.reason === 'function-unavailable'
        ? (res.dataDeleted
            ? 'Your data was removed, but your account login could not be deleted yet. Please try again shortly.'
            : 'Account deletion is temporarily unavailable. Please try again shortly.')
      : /* auth-delete-failed */
        (res.dataDeleted
          ? 'Your data was removed, but we could not fully delete your account. Please try again.'
          : 'We could not delete your account. Please try again.');
    showToast(msg, true);
  } catch (_) {
    showToast('We could not delete your account. Please try again.', true);
  } finally {
    _deleteInFlight = false;
    if (btn) btn.disabled = false;
  }
}

// ── Account / cloud status UI ─────────────────────────────────────────────────
async function _syncAccountUI() {
  const emailEl   = document.getElementById('settingsAccountEmail');
  const signOutBtn = document.getElementById('settingsSignOutBtn');
  if (!emailEl) return;

  const deleteBtn = document.getElementById('settingsDeleteAccountBtn');
  const signInBtn = document.getElementById('settingsSignInBtn');
  const user = await getCloudUser();
  if (user?.email) {
    emailEl.textContent = user.email;
    if (signInBtn)  signInBtn.style.display  = 'none';
    if (signOutBtn) signOutBtn.style.display = 'block';
    if (deleteBtn)  deleteBtn.style.display  = 'block';
  } else {
    emailEl.textContent = 'Local only — not signed in';
    if (signInBtn)  signInBtn.style.display  = 'block';
    if (signOutBtn) signOutBtn.style.display = 'none';
    if (deleteBtn)  deleteBtn.style.display  = 'none';
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
  a.download = `helyx-training-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported ✓');
}

export function triggerImport() {
  document.getElementById('settingsImportFile')?.click();
}

// Recover the pre-sync snapshot of this device's data (see import-export.js).
// Confirmed because it overwrites the currently-loaded (cloud) state.
export async function recoverPreSyncSnapshot() {
  if (!hasCloudPullSnapshot()) { showToast('No recoverable snapshot found.', true); return; }
  const ok = await confirmModal({
    title: 'Recover this device’s data?',
    message: 'This replaces the currently loaded data with what was on this device before it last synced from the cloud, and pushes it back up.',
    confirmLabel: 'Recover',
  });
  if (!ok) return;
  if (recoverCloudPullSnapshot()) _syncSettingsUI();
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

export async function confirmResetAllData() {
  const ok = await confirmModal({
    title: 'Reset all training data?',
    message: 'Every logged workout, run and setting on this device will be cleared. This cannot be undone.',
    confirmLabel: 'Reset everything', danger: true,
  });
  if (!ok) return;
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

export async function hcToggleConnect() {
  if (!_getState) return;
  const appState = _getState();
  const hc = appState.healthConnect;

  if (hc.connected) {
    hc.connected = false;
    hc.lastSync  = null;
    saveStateToLocalStorage(true);
    _syncHealthConnectUI();
    showToast('Health Connect disconnected');
    return;
  }

  // Real native bridge only — no phantom "connected" state on the web/PWA.
  if (!isHealthBridgeAvailable()) {
    showToast('Health Connect is only available in the Android app.', true);
    return;
  }
  const status = getHealthAvailability();
  if (status === 'NOT_INSTALLED') {
    showToast('Install/update Health Connect to continue.', true);
    return;
  }
  if (status !== 'AVAILABLE') {
    showToast('Health Connect is not supported on this device.', true);
    return;
  }

  if (!hc.syncFields) hc.syncFields = { hrv: true, restingHR: true, sleep: true, steps: true, vo2max: true };
  showToast('Opening Health Connect…');
  try {
    const { dayCount } = await connectAndSync(appState, saveStateToLocalStorage, { days: 90 });
    _syncHealthConnectUI();
    showToast(dayCount > 0 ? `Health Connect synced (${dayCount} days) ✓` : 'Connected — no recent data found.');
  } catch (err) {
    if (err?.message !== 'bridge-timeout') console.warn('Health Connect connect failed:', err);
    showToast('Could not connect to Health Connect.', true);
  }
}

export async function hcSyncNow() {
  if (!_getState) return;
  if (!isHealthBridgeAvailable()) { showToast('Sync requires the Android app.', true); return; }
  const appState = _getState();
  showToast('Syncing…');
  try {
    const { dayCount } = await syncHealthConnect(appState, saveStateToLocalStorage, { days: 90 });
    _syncHealthConnectUI();
    showToast(dayCount > 0 ? `Synced ${dayCount} days ✓` : 'No new data to sync.');
  } catch (err) {
    if (err?.message !== 'bridge-timeout') console.warn('Health Connect sync failed:', err);
    showToast('Sync failed.', true);
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
  // Push rest config into the (state-free) timers module, and give it a
  // callback so a live ± adjustment persists back into settings.restOverrides.
  setRestTiers(s.restPeriods);
  setRestTimerEnabled(s.restTimerEnabled);
  setRestOverrides(s.restOverrides || {});
  initRestPersistence((overrides) => {
    const st = _getState?.();
    if (!st) return;
    if (!st.settings) st.settings = {};
    st.settings.restOverrides = overrides;
    saveStateToLocalStorage(true);
  });
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
