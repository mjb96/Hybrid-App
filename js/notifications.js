// ==========================================
// TRAINING REMINDERS (js/notifications.js)
// Uses Web Notifications API for daily training reminders.
// No server required — scheduled via setTimeout to fire each day.
// ==========================================

let _reminderTimer = null;

export function initNotifications() {
  if (!('Notification' in window)) return;
  // Re-arm on load if permission already granted
  if (Notification.permission === 'granted') {
    _armDailyReminder();
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return { granted: false, reason: 'unsupported' };
  }
  if (Notification.permission === 'granted') {
    _armDailyReminder();
    return { granted: true };
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    _armDailyReminder();
    return { granted: true };
  }
  return { granted: false, reason: result };
}

export function cancelReminders() {
  if (_reminderTimer) { clearTimeout(_reminderTimer); _reminderTimer = null; }
}

function _armDailyReminder() {
  if (_reminderTimer) clearTimeout(_reminderTimer);
  const now     = new Date();
  const target  = new Date(now);
  // Fire at 07:30 each day
  target.setHours(7, 30, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  _reminderTimer = setTimeout(() => {
    _fireReminder();
    _armDailyReminder(); // re-arm for next day
  }, msUntil);
}

function _fireReminder() {
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
