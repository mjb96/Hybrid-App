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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');

function validDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * Canonical local calendar-day key (YYYY-MM-DD) for a stored date/timestamp.
 * Date-only strings are intentional calendar days and are never reparsed through
 * UTC. Timestamps and Date objects are converted in `tz` (the device timezone by
 * default). Invalid input returns null; it never silently becomes "today".
 * @param {unknown} value
 * @param {string} [tz]
 * @returns {string|null}
 */
export function localDayKey(value, tz = DEFAULT_TZ) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    return validDateOnly(value) ? value : null;
  }

  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const part = (type) => parts.find(p => p.type === type)?.value;
    const year = part('year'), month = part('month'), day = part('day');
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch (_) {
    // `DEFAULT_TZ` is the runtime timezone, so local getters remain an honest
    // fallback when Intl is unavailable. An explicit unsupported timezone must
    // fail closed rather than falling back to UTC and shifting the day.
    if (tz !== DEFAULT_TZ) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
}

// Returns YYYY-MM-DD for today in the given timezone.
export function todayKey(tz = DEFAULT_TZ, now = new Date()) {
  const key = localDayKey(now, tz);
  if (!key) throw new RangeError(`Unable to resolve calendar day for timezone: ${tz}`);
  return key;
}

// Returns YYYY-MM-DD for any Date object (or ISO string) in the given timezone.
export function dateKey(date = new Date(), tz = DEFAULT_TZ) {
  const key = localDayKey(date, tz);
  if (!key) throw new RangeError('Invalid date');
  return key;
}

// Add whole calendar days to a YYYY-MM-DD key. Noon-UTC arithmetic is immune to
// local DST gaps/folds because the input/output are calendar keys, not instants.
export function addDaysISO(dateISO, n) {
  const key = localDayKey(dateISO);
  const amount = Number(n);
  if (!key || !Number.isInteger(amount)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + amount);
  return dt.toISOString().slice(0, 10);
}

// Returns 'D/M' for an intentional calendar key. No timezone conversion is
// involved: 2026-07-14 must display as 14/7 everywhere.
export function formatDayMonth(dateStr) {
  const key = localDayKey(dateStr);
  if (!key) return '';
  const [, month, day] = key.split('-').map(Number);
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
