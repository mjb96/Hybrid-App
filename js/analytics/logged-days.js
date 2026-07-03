// @ts-check
// =============================================================================
// LOGGED DAYS (js/analytics/logged-days.js) — roadmap R18
//
// One definition of "walk every day that has logged training, with its real
// calendar date". The week→date resolution (prefer the stored date, else
// reconstruct from weekStartedAt) was duplicated across the streak, monthly
// and dashboard code; this centralises it so they can't drift.
// =============================================================================
import { dayVolume, isCompletedSet } from '../set-utils.js';

const num = (v) => parseFloat(v) || 0;

// A day "has training" if any set was completed (matching the streak/calendar
// definition) or a run distance was logged. Warm-up-only completions still
// count as showing up — same as the existing streak logic.
function completedSetCount(lifts) {
  let n = 0;
  for (const lift in (lifts || {})) {
    const sets = lifts[lift];
    if (Array.isArray(sets)) n += sets.filter(isCompletedSet).length;
  }
  return n;
}

// Resolve the ISO date for a (week, dayIndex) slot: the stored date when the
// day was actually logged, else reconstructed relative to the current week.
export function resolveSlotDate(state, weekNum, dayIdx, storedDate) {
  if (storedDate) return storedDate;
  const base = state?.weekStartedAt ? new Date(state.weekStartedAt) : new Date();
  const curWk = parseInt(state?.currentWeek, 10) || 1;
  const approx = new Date(base);
  approx.setDate(base.getDate() - ((curWk - (weekNum || 1)) * 7) + dayIdx);
  return approx.toISOString().slice(0, 10);
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
      const run = wd.runs?.[day];
      const distance = num(run?.dist);
      if (completedSetCount(lifts) <= 0 && distance <= 0) return;
      const volume = dayVolume(lifts);
      cb({
        weekNum, day, dayIdx,
        dateISO: resolveSlotDate(state, weekNum, dayIdx, stored[day]),
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
