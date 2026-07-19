// @ts-check
// =============================================================================
// LOGGED DAYS (js/analytics/logged-days.js) — roadmap R18
//
// One date-strict definition of "walk every day that has logged training, with
// its real calendar date". Legacy undated activity is preserved in storage but
// excluded from calendar analytics rather than guessed into a modern week.
// =============================================================================
import { dayVolume, isValidWorkingSet } from '../set-utils.js';
import { runDaySummary } from '../state/run-sessions.js';
import { addDaysISO, localDayKey } from '../dates.js';

const num = (v) => parseFloat(v) || 0;
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A day "has training" if any set was completed (matching the streak/calendar
// definition) or a run distance was logged. Warm-up-only completions still
// count as showing up — same as the existing streak logic.
function completedSetCount(lifts) {
  let n = 0;
  for (const lift in (lifts || {})) {
    const sets = lifts[lift];
    if (Array.isArray(sets)) n += sets.filter(isValidWorkingSet).length;
  }
  return n;
}

// Resolve the ISO date for a (week, dayIndex) slot: the stored date when the
// day was actually logged, else reconstructed relative to the current week.
//
// The reconstruction anchors on the LOCAL calendar day of the week's start
// instant and then does whole-day arithmetic on that date-only key. It must NOT
// serialize a Date via `toISOString()`: that resolves in UTC, so for anyone
// ahead of (or behind) UTC an evening/morning session — e.g. a Sydney workout
// logged at 9pm — would reconstruct one day off, misfiling the activity onto the
// wrong calendar day and hiding it from "today"/"this week". Returns null only
// when the anchor instant itself is unreadable.
export function resolveSlotDate(state, weekNum, dayIdx, storedDate) {
  if (storedDate) return storedDate;
  const baseKey = localDayKey(state?.weekStartedAt || new Date());
  if (!baseKey) return null;
  const curWk = parseInt(state?.currentWeek, 10) || 1;
  const offset = -((curWk - (weekNum || 1)) * 7) + dayIdx;
  return addDaysISO(baseKey, offset);
}

// Inverse of resolveSlotDate: map a real calendar date (YYYY-MM-DD) back to the
// program slot it belongs to → { weekNum, dayIdx, day }. Implemented as a bounded
// search over resolveSlotDate (current week down to week 1) so it stays exactly
// consistent with the canonical resolver regardless of timezone/DST math. Returns
// null when the date falls before the program's first week (or is invalid), so
// callers can reject it instead of writing to a phantom week.
export function resolveDateToSlot(state, dateISO) {
  if (!dateISO) return null;
  const curWk = parseInt(state?.currentWeek, 10) || 1;
  for (let weekNum = curWk; weekNum >= 1; weekNum--) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      if (resolveSlotDate(state, weekNum, dayIdx, null) === dateISO) {
        return { weekNum, dayIdx, day: DAY_ORDER[dayIdx] };
      }
    }
  }
  return null;
}

// Invoke `cb` once per day that has completed lifting OR a logged run, with a
// small record: { weekNum, day, dayIdx, dateISO, volume, distance, lifts, run }.
export function forEachLoggedDay(state, days, cb) {
  const weeks = state?.weeks || {};
  for (const w in weeks) {
    const wd = weeks[w];
    if (!wd) continue;
    const weekNum = parseInt(w, 10) || 1;
    const stored = wd.dates || {};
    days.forEach((day, dayIdx) => {
      const lifts = wd.lifts?.[day];
      const run = runDaySummary(wd, day);
      const distance = num(run?.dist);
      if (completedSetCount(lifts) <= 0 && distance <= 0) return;
      const dateISO = localDayKey(stored[day]);
      if (!dateISO) return;
      const volume = dayVolume(lifts);
      cb({
        weekNum, day, dayIdx,
        dateISO,
        volume, distance, lifts, run,
      });
    });
  }
}

// Convenience: the set of ISO dates with any logged training.
export function loggedDateSet(state, days) {
  const set = new Set();
  forEachLoggedDay(state, days, (d) => set.add(d.dateISO));
  return set;
}
