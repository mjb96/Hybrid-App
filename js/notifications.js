// ==========================================
// TRAINING REMINDERS (js/notifications.js)
// Uses Web Notifications API for daily training reminders.
// No server required — scheduled via setTimeout to fire each day.
// ==========================================

let _reminderTimer = null;
let _weeklySummaryTimer = null;
let _streakTimer = null;
let _getState = null;

export function initNotifications(getStateFn) {
  _getState = getStateFn;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    _armDailyReminder();
    _armWeeklySummary();
    _armStreakCheck();
    checkMissedWorkout();
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return { granted: false, reason: 'unsupported' };
  }
  if (Notification.permission === 'granted') {
    _armDailyReminder();
    _armWeeklySummary();
    _armStreakCheck();
    return { granted: true };
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    _armDailyReminder();
    _armWeeklySummary();
    _armStreakCheck();
    return { granted: true };
  }
  return { granted: false, reason: result };
}

export function cancelReminders() {
  if (_reminderTimer)      { clearTimeout(_reminderTimer);      _reminderTimer = null; }
  if (_weeklySummaryTimer) { clearTimeout(_weeklySummaryTimer); _weeklySummaryTimer = null; }
  if (_streakTimer)        { clearTimeout(_streakTimer);        _streakTimer = null; }
}

export function rearmReminder() {
  if (Notification.permission === 'granted') {
    _armDailyReminder();
    _armWeeklySummary();
    _armStreakCheck();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _settings() { return _getState?.()?.settings || {}; }

function _dayKey(date) {
  return ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
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
  const now    = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  _reminderTimer = setTimeout(() => {
    _fireWorkoutReminder();
    _armDailyReminder();
  }, target - now);
}

function _fireWorkoutReminder() {
  if (Notification.permission !== 'granted') return;
  const todayKey = _dayKey(new Date());

  // Rest day → send a recovery message instead of a training prompt
  if (_isProgramRestDay(todayKey)) {
    try {
      new Notification('Recovery Day', {
        body: 'Rest day on the program. Focus on sleep, nutrition, and mobility. You\'ve earned it.',
        icon: './icon-512.png', badge: './icon-512.png', tag: 'training-reminder',
      });
    } catch (_) {}
    return;
  }

  const messages = [
    "Time to train. Your future self will thank you. 💪",
    "Consistency beats perfection. Session time. 🏋️",
    "Log your workout — stay on track with your program.",
    "Your training plan is waiting. Let's go. ⚡",
  ];
  const body = messages[Math.floor(Math.random() * messages.length)];
  try {
    new Notification('Helyx', { body, icon: './icon-512.png', badge: './icon-512.png', tag: 'training-reminder' });
  } catch (_) {}
}

// ── Missed Workout Check (fires on app open, not on a timer) ──────────────────

export function checkMissedWorkout() {
  if (Notification.permission !== 'granted') return;
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
    try {
      new Notification('Missed Session', {
        body: `Looks like ${dayLabel}'s session wasn't logged. Still time to catch up or log it manually.`,
        icon: './icon-512.png', badge: './icon-512.png', tag: 'missed-workout',
      });
    } catch (_) {}
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
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Weekly Training Summary', {
      body: 'Your weekly training report is ready — check your progress and plan the week ahead.',
      icon: './icon-512.png', badge: './icon-512.png', tag: 'weekly-summary',
    });
  } catch (_) {}
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
  const now    = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  _streakTimer = setTimeout(() => {
    _fireStreakAlert();
    _armStreakCheck();
  }, target - now);
}

function _fireStreakAlert() {
  if (Notification.permission !== 'granted') return;
  const todayKey = _dayKey(new Date());
  if (_hasLoggedToday(todayKey)) return; // already trained — no nag

  const streak = _getState?.()?.streakData?.current || 0;
  const body   = streak > 0
    ? `Don't break your ${streak}-day streak! Log something today to keep it alive. 🔥`
    : "No activity yet today — even a short session counts. Let's go! ⚡";

  try {
    new Notification('Streak Alert', { body, icon: './icon-512.png', badge: './icon-512.png', tag: 'streak-alert' });
  } catch (_) {}
}

