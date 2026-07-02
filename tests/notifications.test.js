// ==========================================
// NOTIFICATIONS TEST (tests/notifications.test.js)
// Phase 2 notification flow: the daily/streak fire-time math, and the
// unified permission check that prefers the native Android bridge over the
// (WebView-absent) Web Notifications API. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { msUntilNextDaily, notificationsGranted, initNotifications, cancelReminders } from '../js/notifications.js';

const HOUR = 3600 * 1000;
const MIN  = 60 * 1000;

test('msUntilNextDaily: later today → same-day delay', () => {
  const now = new Date(2026, 0, 1, 12, 0, 0, 0);
  assert.equal(msUntilNextDaily(now, 12, 30), 30 * MIN);
});

test('msUntilNextDaily: earlier today → rolls to tomorrow', () => {
  const now = new Date(2026, 0, 1, 12, 0, 0, 0);
  assert.equal(msUntilNextDaily(now, 11, 30), 23 * HOUR + 30 * MIN);
});

test('msUntilNextDaily: exactly now → tomorrow (never fires immediately)', () => {
  const now = new Date(2026, 0, 1, 12, 0, 0, 0);
  assert.equal(msUntilNextDaily(now, 12, 0), 24 * HOUR);
});

test('notificationsGranted: false when no window (Node/SSR)', () => {
  const saved = globalThis.window;
  delete globalThis.window;
  assert.equal(notificationsGranted(), false);
  if (saved !== undefined) globalThis.window = saved;
});

test('notificationsGranted: uses the native bridge when present', () => {
  const saved = globalThis.window;
  globalThis.window = { HybridNotifyBridge: { hasPermission: () => true } };
  assert.equal(notificationsGranted(), true);
  globalThis.window = { HybridNotifyBridge: { hasPermission: () => false } };
  assert.equal(notificationsGranted(), false);
  // A throwing bridge must not crash the check.
  globalThis.window = { HybridNotifyBridge: { hasPermission: () => { throw new Error('x'); } } };
  assert.equal(notificationsGranted(), false);
  if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
});

test('daily reminder schedules via the native alarm when the bridge is present', () => {
  const saved = globalThis.window;
  let scheduled = null;
  globalThis.window = { HybridNotifyBridge: {
    hasPermission: () => true,
    scheduleDailyReminder: (h, m) => { scheduled = [h, m]; },
  } };
  // Default reminder time (07:30) when settings omit it.
  initNotifications(() => ({ settings: {} }));
  assert.deepEqual(scheduled, [7, 30]);
  // Reads the configured reminder time.
  scheduled = null;
  initNotifications(() => ({ settings: { reminderTime: { hour: 6, minute: 15 } } }));
  assert.deepEqual(scheduled, [6, 15]);
  cancelReminders();
  if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
});

test('cancelReminders cancels the native alarm', () => {
  const saved = globalThis.window;
  let cancelled = false;
  globalThis.window = { HybridNotifyBridge: {
    hasPermission: () => true,
    cancelDailyReminder: () => { cancelled = true; },
  } };
  cancelReminders();
  assert.equal(cancelled, true);
  if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
});

test('notificationsGranted: falls back to Web Notification permission', () => {
  const savedWin = globalThis.window;
  const savedNotif = globalThis.Notification;
  // In a browser the global Notification IS window.Notification; mirror that.
  globalThis.Notification = { permission: 'granted' };
  globalThis.window = { Notification: globalThis.Notification };
  assert.equal(notificationsGranted(), true);
  globalThis.Notification = { permission: 'denied' };
  globalThis.window = { Notification: globalThis.Notification };
  assert.equal(notificationsGranted(), false);
  if (savedWin === undefined) delete globalThis.window; else globalThis.window = savedWin;
  if (savedNotif === undefined) delete globalThis.Notification; else globalThis.Notification = savedNotif;
});
