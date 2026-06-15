// ==========================================
// DATE HELPERS (dates.js)
// ==========================================
// All functions default to Australia/Sydney so date keys match the user's
// local calendar day rather than UTC (which can be a day behind for AEST/AEDT).
// ==========================================
export const DEFAULT_TZ = 'Australia/Sydney';

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
