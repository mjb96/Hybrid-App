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

import { computeDashboardModel } from './home/dashboard-model.js';
import { computeHybridScore } from './brain/hybrid-score/hybrid-score.js';
import { projectScore } from './brain/hybrid-score/project.js';
import { buildMorningBriefing, briefingToText } from './brain/morning-briefing.js';
import { buildWeeklyReview, reviewToText } from './brain/weekly-review.js';
import { maybePushFastingNudge } from './fasting/fasting-nudge.js';
import { makeBridgeCallbackId } from './util/bridge-callback-id.js';
import { isCompletedSet } from './set-utils.js';
import { runDaySummary } from './state/run-sessions.js';

let _reminderTimer = null;
let _weeklySummaryTimer = null;
let _streakTimer = null;
let _getState = null;

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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
      const id = makeBridgeCallbackId('n');
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
    return Array.isArray(sets) && sets.some(isCompletedSet);
  });
  const hasRun = (parseFloat(runDaySummary(wk, dayKey).dist) || 0) > 0;
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

// Compose the personalised morning reminder from the athlete's actual day:
// Hybrid Score + today's session + the mission, via the Morning Briefing
// engine. Pure (no DOM) so it is unit-testable; the score computed here uses
// yesterday's recorded history for the delta — exactly the right semantics
// for a pre-open morning push. Exported for testing.
export function composeMorningReminder(state, program, now = new Date()) {
  const selectedDay = _dayKey(now);
  const model = computeDashboardModel(state, WEEK_DAYS, program, selectedDay);
  const score = computeHybridScore(model, state, WEEK_DAYS, program);
  const projection = projectScore(model, state, WEEK_DAYS, { program });
  const briefing = buildMorningBriefing({ state, model, score, projection, program, selectedDay, now });
  return { title: 'Morning Briefing', body: briefingToText(briefing) };
}

function _fireWorkoutReminder() {
  if (!notificationsGranted()) return;

  // Preferred: the real briefing (score · session · mission). Falls back to
  // the generic copy below if composition fails for any reason.
  try {
    const state = _getState?.();
    if (state) {
      const program = (typeof window !== 'undefined' && window._hybridGetProgram?.()) || null;
      const { title, body } = composeMorningReminder(state, program);
      notify(title, body, 'training-reminder');
      return;
    }
  } catch (_) {}

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

// ── Overtraining warning (R10 — fired from Home when risk is high) ────────────
// Best-effort: returns true only if a notification was actually sent, so the
// caller can record the once-per-day guard. Never throws.
export function pushOvertrainingWarning(assessment) {
  try {
    if (!assessment || assessment.level !== 'high') return false;
    if (!notificationsGranted()) return false;
    notify(assessment.headline || 'Overtraining risk',
      assessment.advice || 'Fatigue signals are stacking up — take a deload and protect recovery.',
      'overtraining-risk');
    return true;
  } catch { return false; }
}

// ── Fasting stage / goal nudges (S1d — fired on home render / app open) ───────
// Best-effort: delivers a nudge when an active fast has crossed into a new
// metabolic stage or hit its goal since the last check. Gated on granted +
// (not explicitly disabled). `saveFn` persists the once-per-stage marker.
export function pushFastingStageNudge(state, saveFn) {
  try {
    if (!state || state.settings?.notifFastingStage === false) return null;
    return maybePushFastingNudge(state, { notifyFn: notify, granted: notificationsGranted(), saveFn });
  } catch { return null; }
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
    return Array.isArray(sets) && sets.some(isCompletedSet);
  });
  const hasRun = (parseFloat(runDaySummary(wk, yesterdayKey).dist) || 0) > 0;

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
  // Prefer the athlete's real Week in Review (totals · PRs · score · focus);
  // fall back to the generic prompt if composition fails.
  try {
    const state = _getState?.();
    if (state) {
      const program = (typeof window !== 'undefined' && window._hybridGetProgram?.()) || null;
      const review = buildWeeklyReview(state, WEEK_DAYS, program);
      if (review.hasData) {
        notify('Week in Review', reviewToText(review, state.settings?.distanceUnit || 'km'), 'weekly-summary');
        return;
      }
    }
  } catch (_) {}
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
