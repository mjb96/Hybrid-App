// ==========================================
// TRAINING REMINDERS (js/notifications.js)
//
// Daily/weekly/streak/missed reminders. Two delivery backends:
//   • Android WebView → native bridge (window.HybridNotifyBridge). The Web
//     Notifications API is NOT implemented by Android System WebView, so the
//     bridge handles both the POST_NOTIFICATIONS permission and display.
//   • Browser / PWA → Web Notifications API.
//
// NOTE: reminders are still scheduled with setTimeout, which the Android
// WebView freezes while backgrounded (onPause → pauseTimers). So timed
// reminders fire reliably only while the app is foregrounded; true background
// delivery needs native AlarmManager/WorkManager scheduling (follow-up).
// ==========================================

let _reminderTimer = null;
let _weeklySummaryTimer = null;
let _streakTimer = null;
let _getState = null;

// ── Delivery backend (native bridge vs Web Notifications) ──────────────────────

function _notifyBridge() {
  return (typeof window !== 'undefined' && window.HybridNotifyBridge) || null;
}

function _hasWebNotif() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Unified permission check across native + web.
export function notificationsGranted() {
  const b = _notifyBridge();
  if (b && typeof b.hasPermission === 'function') {
    try { return b.hasPermission() === true; } catch { return false; }
  }
  if (_hasWebNotif()) return Notification.permission === 'granted';
  return false;
}

// Unified display. Prefers the native bridge; falls back to the Web API.
function notify(title, body, tag) {
  const b = _notifyBridge();
  if (b && typeof b.showNotification === 'function') {
    try { b.showNotification(title, body, tag); } catch (_) {}
    return;
  }
  if (_hasWebNotif() && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: './icon-512.png', badge: './icon-512.png', tag });
    } catch (_) {}
  }
}

function _armAll() {
  _armDailyReminder();
  _armWeeklySummary();
  _armStreakCheck();
}

export function initNotifications(getStateFn) {
  _getState = getStateFn;
  if (!notificationsGranted()) return;
  _armAll();
  checkMissedWorkout();
}

export function requestNotificationPermission() {
  const b = _notifyBridge();
  if (b && typeof b.requestPermission === 'function') {
    return new Promise((resolve) => {
      if (!window.__notifCB) window.__notifCB = {};
      const id = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      const timer = setTimeout(() => {
        if (window.__notifCB[id]) { delete window.__notifCB[id]; resolve({ granted: notificationsGranted() }); }
      }, 120000);
      window.__notifCB[id] = (res) => {
        clearTimeout(timer);
        const granted = res === 'true';
        if (granted) _armAll();
        resolve({ granted, reason: granted ? undefined : 'denied' });
      };
      try { b.requestPermission(id); }
      catch { clearTimeout(timer); delete window.__notifCB[id]; resolve({ granted: false, reason: 'error' }); }
    });
  }

  // Web path.
  if (!_hasWebNotif()) return Promise.resolve({ granted: false, reason: 'unsupported' });
  if (Notification.permission === 'granted') { _armAll(); return Promise.resolve({ granted: true }); }
  return Notification.requestPermission().then((result) => {
    if (result === 'granted') { _armAll(); return { granted: true }; }
    return { granted: false, reason: result };
  });
}

export function cancelReminders() {
  const b = _notifyBridge();
  if (b && typeof b.cancelDailyReminder === 'function') {
    try { b.cancelDailyReminder(); } catch (_) {}
  }
  if (_reminderTimer)      { clearTimeout(_reminderTimer);      _reminderTimer = null; }
  if (_weeklySummaryTimer) { clearTimeout(_weeklySummaryTimer); _weeklySummaryTimer = null; }
  if (_streakTimer)        { clearTimeout(_streakTimer);        _streakTimer = null; }
}

export function rearmReminder() {
  if (notificationsGranted()) _armAll();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _settings() { return _getState?.()?.settings || {}; }

function _dayKey(date) {
  return ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
}

// ms from `now` until the next occurrence of hour:minute (today if still ahead,
// else tomorrow). Exported for testing.
export function msUntilNextDaily(now, hour, minute) {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

function _isProgramRestDay(dayKey) {
  const state = _getState?.();
  if (!state) return false;
  const program = window._hybridGetProgram?.();
  if (!program?.days) return false;
  const day = program.days[dayKey];
  if (!day) return true;
  const hasLifts = Array.isArray(day.lifts) && day.lifts.length > 0;
  const hasRun   = day.runs && day.runs !== 'Rest' && day.runs !== '';
  return !hasLifts && !hasRun;
}

function _hasLoggedToday(dayKey) {
  const state = _getState?.();
  if (!state) return false;
  const wk = state.weeks?.[state.currentWeek || '1'];
  if (!wk) return false;
  const hasLifts = Object.keys(wk.lifts?.[dayKey] || {}).some(l => {
    const sets = wk.lifts[dayKey][l];
    return Array.isArray(sets) && sets.some(s => s?.c);
  });
  const hasRun = parseFloat(wk.runs?.[dayKey]?.dist) > 0;
  return hasLifts || hasRun;
}

// ── Daily Workout Reminder ─────────────────────────────────────────────────────

function _getReminderTime() {
  const rt = _settings().reminderTime;
  return { hour: rt?.hour ?? 7, minute: rt?.minute ?? 30 };
}

function _armDailyReminder() {
  if (_reminderTimer) clearTimeout(_reminderTimer);
  const { hour, minute } = _getReminderTime();

  // Prefer the native OS alarm (fires when the app is closed / screen off).
  // The JS setTimeout below only fires while foregrounded, so it's the
  // browser/PWA fallback — never both, to avoid duplicate notifications.
  const b = _notifyBridge();
  if (b && typeof b.scheduleDailyReminder === 'function') {
    try { b.scheduleDailyReminder(hour, minute); return; } catch (_) {}
  }

  _reminderTimer = setTimeout(() => {
    _fireWorkoutReminder();
    _armDailyReminder();
  }, msUntilNextDaily(new Date(), hour, minute));
}

function _fireWorkoutReminder() {
  if (!notificationsGranted()) return;
  const todayKey = _dayKey(new Date());

  // Rest day → send a recovery message instead of a training prompt
  if (_isProgramRestDay(todayKey)) {
    notify('Recovery Day',
      'Rest day on the program. Focus on sleep, nutrition, and mobility. You\'ve earned it.',
      'training-reminder');
    return;
  }

  const messages = [
    "Time to train. Your future self will thank you. 💪",
    "Consistency beats perfection. Session time. 🏋️",
    "Log your workout — stay on track with your program.",
    "Your training plan is waiting. Let's go. ⚡",
  ];
  const body = messages[Math.floor(Math.random() * messages.length)];
  notify('Helyx', body, 'training-reminder');
}

// ── Missed Workout Check (fires on app open, not on a timer) ──────────────────

export function checkMissedWorkout() {
  if (!notificationsGranted()) return;
  if (!_settings().notifMissedWorkout) return;

  const yesterday    = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = _dayKey(yesterday);

  if (_isProgramRestDay(yesterdayKey)) return;

  // Check yesterday's logs
  const state = _getState?.();
  if (!state) return;
  const wk = state.weeks?.[state.currentWeek || '1'];
  if (!wk) return;
  const hasLifts = Object.keys(wk.lifts?.[yesterdayKey] || {}).some(l => {
    const sets = wk.lifts[yesterdayKey][l];
    return Array.isArray(sets) && sets.some(s => s?.c);
  });
  const hasRun = parseFloat(wk.runs?.[yesterdayKey]?.dist) > 0;

  if (!hasLifts && !hasRun) {
    const dayLabel = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][yesterday.getDay()];
    notify('Missed Session',
      `Looks like ${dayLabel}'s session wasn't logged. Still time to catch up or log it manually.`,
      'missed-workout');
  }
}

// ── Weekly Summary (Sunday 18:00) ──────────────────────────────────────────────

function _armWeeklySummary() {
  if (_weeklySummaryTimer) clearTimeout(_weeklySummaryTimer);
  if (!_settings().notifWeeklySummary) return;

  const now    = new Date();
  const target = new Date(now);
  const daysUntilSunday = ((7 - now.getDay()) % 7) || 7;
  target.setDate(now.getDate() + daysUntilSunday);
  target.setHours(18, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 7);

  _weeklySummaryTimer = setTimeout(() => {
    _fireWeeklySummary();
    _armWeeklySummary();
  }, target - now);
}

function _fireWeeklySummary() {
  if (!notificationsGranted()) return;
  notify('Weekly Training Summary',
    'Your weekly training report is ready — check your progress and plan the week ahead.',
    'weekly-summary');
}

// ── Streak Alert ───────────────────────────────────────────────────────────────

function _getStreakAlertTime() {
  const t = _settings().streakAlertTime;
  return { hour: t?.hour ?? 20, minute: t?.minute ?? 0 };
}

function _armStreakCheck() {
  if (_streakTimer) clearTimeout(_streakTimer);
  if (!_settings().notifStreak) return;

  const { hour, minute } = _getStreakAlertTime();
  _streakTimer = setTimeout(() => {
    _fireStreakAlert();
    _armStreakCheck();
  }, msUntilNextDaily(new Date(), hour, minute));
}

function _fireStreakAlert() {
  if (!notificationsGranted()) return;
  const todayKey = _dayKey(new Date());
  if (_hasLoggedToday(todayKey)) return; // already trained — no nag

  const streak = _getState?.()?.streakData?.current || 0;
  const body   = streak > 0
    ? `Don't break your ${streak}-day streak! Log something today to keep it alive. 🔥`
    : "No activity yet today — even a short session counts. Let's go! ⚡";

  notify('Streak Alert', body, 'streak-alert');
}
