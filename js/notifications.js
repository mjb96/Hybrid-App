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

// ── Daily Workout Reminder ─────────────────────────────────────────────────────

function _getReminderTime() {
  const rt = _getState?.()?.settings?.reminderTime;
  return { hour: rt?.hour ?? 7, minute: rt?.minute ?? 30 };
}

function _armDailyReminder() {
  if (_reminderTimer) clearTimeout(_reminderTimer);
  const { hour, minute } = _getReminderTime();
  const now    = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  _reminderTimer = setTimeout(() => {
    _fireWorkoutReminder();
    _armDailyReminder();
  }, msUntil);
}

function _fireWorkoutReminder() {
  if (Notification.permission !== 'granted') return;
  const messages = [
    "Time to train. Your future self will thank you. 💪",
    "Consistency beats perfection. Session time. 🏋️",
    "Log your workout — stay on track with your program.",
    "Your training plan is waiting. Let's go. ⚡",
  ];
  const body = messages[Math.floor(Math.random() * messages.length)];
  try {
    new Notification('Hybrid Training', { body, icon: './icon-512.png', badge: './icon-512.png', tag: 'training-reminder' });
  } catch (_) {}
}

// ── Weekly Summary (Sunday 18:00) ──────────────────────────────────────────────

function _armWeeklySummary() {
  if (_weeklySummaryTimer) clearTimeout(_weeklySummaryTimer);
  if (!_getState?.()?.settings?.notifWeeklySummary) return;

  const now    = new Date();
  const target = new Date(now);
  const daysUntilSunday = ((7 - now.getDay()) % 7) || 7;
  target.setDate(now.getDate() + daysUntilSunday);
  target.setHours(18, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 7);

  const msUntil = target - now;
  _weeklySummaryTimer = setTimeout(() => {
    _fireWeeklySummary();
    _armWeeklySummary();
  }, msUntil);
}

function _fireWeeklySummary() {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Weekly Training Summary', {
      body: 'Your weekly training report is ready — check your progress and plan the week ahead.',
      icon: './icon-512.png',
      badge: './icon-512.png',
      tag: 'weekly-summary',
    });
  } catch (_) {}
}

// ── Streak Alert (fires at 20:00 if no activity logged today) ─────────────────

function _armStreakCheck() {
  if (_streakTimer) clearTimeout(_streakTimer);
  if (!_getState?.()?.settings?.notifStreak) return;

  const now    = new Date();
  const target = new Date(now);
  target.setHours(20, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const msUntil = target - now;
  _streakTimer = setTimeout(() => {
    _fireStreakAlert();
    _armStreakCheck();
  }, msUntil);
}

function _fireStreakAlert() {
  if (Notification.permission !== 'granted') return;
  const state  = _getState?.();
  if (!state) return;

  const today      = new Date().toISOString().slice(0, 10);
  const lastActive = state.streakData?.lastActivityDate;
  if (lastActive === today) return; // already trained today

  const streak = state.streakData?.current || 0;
  const body   = streak > 0
    ? `Don't break your ${streak}-day streak! Log something today to keep it alive. 🔥`
    : "No activity yet today — even a short session counts. Let's go! ⚡";

  try {
    new Notification('Streak Alert', { body, icon: './icon-512.png', badge: './icon-512.png', tag: 'streak-alert' });
  } catch (_) {}
}
