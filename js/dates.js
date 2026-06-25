// @ts-check
// ==========================================
// DATE HELPERS (dates.js)
// ==========================================
// Two sets of helpers live here:
//
//   DISPLAY helpers (todayKey, dateKey, formatDayMonth) — Sydney-local calendar
//   SCHEDULE helpers (slotDate, slotDateISO, estimateWeekStart, daysBetween,
//     weekRangeLabel) — UTC-based so week slot maths is timezone-independent
// ==========================================
// DISPLAY helpers default to the *device* timezone so date keys match whatever
// calendar day the user is actually on, anywhere in the world. Previously this
// was hardcoded to Australia/Sydney, which mis-dated "today", streaks and the
// activity calendar for every user outside AEST/AEDT.
// ==========================================
function resolveDeviceTz() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch (_) { /* Intl unavailable (very old WebView / test shim) */ }
  return 'Australia/Sydney';
}
export const DEFAULT_TZ = resolveDeviceTz();

// Returns YYYY-MM-DD for today in the given timezone.
export function todayKey(tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

// Returns YYYY-MM-DD for any Date object (or ISO string) in the given timezone.
export function dateKey(date = new Date(), tz = DEFAULT_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
}

// Returns a new Date offset by `days` from `base`.
export function shiftDate(base, days) {
  const d = new Date(base instanceof Date ? base : new Date(base));
  d.setDate(d.getDate() + days);
  return d;
}

// Returns 'D/M' label for a YYYY-MM-DD string, interpreted in the given timezone.
export function formatDayMonth(dateStr, tz = DEFAULT_TZ) {
  const d = new Date(dateStr + 'T00:00:00');
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(d);
  const day   = parts.find((p) => p.type === 'day').value;
  const month = parts.find((p) => p.type === 'month').value;
  return `${day}/${month}`;
}

// ==========================================
// SCHEDULE HELPERS (UTC-based)
// ==========================================
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Returns a Date offset from the week-start ISO string by the day-key's slot index.
// Returns null for missing or invalid inputs.
export function slotDate(weekStartISO, dayKey) {
  if (!weekStartISO) return null;
  const base = new Date(weekStartISO);
  if (isNaN(base.getTime())) return null;
  const offset = DAY_ORDER.indexOf(dayKey);
  if (offset === -1) return null;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

// Returns YYYY-MM-DD for a given weekday slot within a week.
export function slotDateISO(weekStartISO, dayKey) {
  const d = slotDate(weekStartISO, dayKey);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

// Returns the ISO start of `targetWeekNum` given the known start of `currentWeekNum`.
export function estimateWeekStart(weekStartISO, currentWeekNum, targetWeekNum) {
  const base = new Date(weekStartISO);
  base.setUTCDate(base.getUTCDate() + (targetWeekNum - currentWeekNum) * 7);
  return base.toISOString();
}

// Returns the signed whole-day difference (b − a) between two YYYY-MM-DD strings.
// Returns null if either string is invalid.
export function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// Returns a human-readable week range like 'Jun 8–14' from a UTC week-start ISO string.
export function weekRangeLabel(weekStartISO) {
  const start = new Date(weekStartISO);
  const end = new Date(weekStartISO);
  end.setUTCDate(end.getUTCDate() + 6);
  const m = MONTH_ABBR[start.getUTCMonth()];
  return `${m} ${start.getUTCDate()}–${end.getUTCDate()}`;
}
