// @ts-check
// =============================================================================
// WEEKLY AGGREGATE — analytics/weekly-aggregate.js
//
// The canonical CALENDAR-week analytics source. Helyx stores logged training by
// PROGRAM week (`state.weeks["N"]`) + weekday key (mon..sun), each anchored to a
// real calendar date via `weeks[N].dates[day]` (stamped at log time). A program
// week is NOT the same thing as a calendar week: `state.currentWeek` only
// advances on an explicit step / confirmed auto-advance, so the "current"
// program week can keep pointing at a slot whose dates fall in a PRIOR calendar
// week. Reading `weeks[currentWeek]` as "this week" is exactly the attribution
// bug this module exists to kill.
//
// Here we bucket every logged day by its REAL stamped date into Monday-based
// calendar weeks, so:
//   • "this week" means the actual current calendar week (empty stays empty),
//   • prior training only ever appears in its own calendar week / the comparison,
//   • a legacy day with no recoverable date is preserved + reported, never
//     silently attributed to today.
//
// Pure, DOM-free, side-effect-free. Shares the set predicates from set-utils so
// it can never diverge from the detail views.
// =============================================================================
import { isCompletedSet, isWarmupSet, setVolume } from '../set-utils.js';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// ---- canonical local-date resolution ----------------------------------------

/**
 * Canonical local calendar-day key (YYYY-MM-DD) for a stored date/timestamp.
 *   • A date-only 'YYYY-MM-DD' is an INTENTIONAL local calendar day — returned
 *     verbatim (never re-parsed through `new Date(str)`, which would read it as
 *     UTC and can shift it a day for anyone west of GMT).
 *   • A full timestamp / Date is converted to the LOCAL calendar day.
 *   • Anything missing or unparseable → null. A bad date NEVER becomes "today".
 * @param {unknown} value
 * @param {string} [tz]  IANA tz for timestamp→day (defaults to the runtime tz)
 * @returns {string|null}
 */
export function localDayKey(value, tz) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    // Reject impossible calendar dates (e.g. 2026-02-31, 2026-13-01).
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
      return null;
    }
    return value;
  }
  const dt = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(dt.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', tz ? { timeZone: tz } : undefined).format(dt);
  } catch (_) {
    return dt.toISOString().slice(0, 10);
  }
}

/**
 * Monday (YYYY-MM-DD) of the calendar week containing `dateISO`. Uses noon-UTC
 * math on the date-only key so it's timezone/DST-independent — the Monday of a
 * given calendar day never drifts. Monday-based per the app's week model.
 * @param {string} dateISO
 * @returns {string|null}
 */
export function weekStartOf(dateISO) {
  const key = localDayKey(dateISO);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const back = (dt.getUTCDay() + 6) % 7; // days since Monday (0=Sun..6=Sat)
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

/** The canonical week key IS the Monday date string — one value, no ambiguity. */
export function weekKeyOf(dateISO) {
  return weekStartOf(dateISO);
}

/** Add `n` whole days to a YYYY-MM-DD key (noon-UTC math, DST-safe). */
export function addDaysISO(dateISO, n) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ---- per-day strength stats --------------------------------------------------

/**
 * Completed WORKING-set stats for a day's lifts (warm-ups + incompletes excluded).
 * @param {Record<string, any[]>} dayLifts
 * @returns {{ workingSets:number, reps:number, volumeKg:number }}
 */
export function strengthDayStats(dayLifts) {
  let workingSets = 0, reps = 0, volumeKg = 0;
  for (const lift in (dayLifts || {})) {
    const sets = dayLifts[lift];
    if (!Array.isArray(sets)) continue;
    for (const s of sets) {
      if (!isCompletedSet(s) || isWarmupSet(s)) continue;
      workingSets++;
      reps += parseInt(s?.r, 10) || 0;
      volumeKg += setVolume(s);
    }
  }
  return { workingSets, reps, volumeKg };
}

// ---- slot indexing by real date ---------------------------------------------

/**
 * @typedef {Object} DatedSlot
 * @property {number} weekNum      program week the slot lives in
 * @property {string} day          weekday key (mon..sun)
 * @property {string} dateISO      resolved local calendar date
 * @property {Record<string, any[]>|undefined} lifts
 * @property {object|undefined} run
 * @property {object|undefined} gymStats
 * @property {{workingSets:number,reps:number,volumeKg:number}} stats
 */

/**
 * Index every stored (program-week, weekday) slot that carries real activity by
 * its authoritative local calendar date. DATE-STRICT: only a slot with a valid
 * stored `dates[day]` is bucketed; a slot with no recoverable date is collected
 * into `undated` (preserved, never invented onto today).
 *
 * Dedup: if two slots resolve to the SAME date (a cloud/local duplicate, or a
 * program re-activation that reused week numbers), ONE canonical slot wins — the
 * one with the most working sets, tie-broken by volume then lowest weekNum. We
 * never sum colliding slots, so a duplicate can't double-count.
 *
 * @param {object} state  appState (reads state.weeks)
 * @param {{ tz?: string }} [opts]
 * @returns {{ byDate: Map<string, DatedSlot>, undated: DatedSlot[] }}
 */
export function indexSlotsByDate(state, opts = {}) {
  const weeks = state?.weeks || {};
  /** @type {Map<string, DatedSlot>} */
  const byDate = new Map();
  /** @type {DatedSlot[]} */
  const undated = [];

  for (const w of Object.keys(weeks)) {
    const wd = weeks[w];
    if (!wd) continue;
    const weekNum = parseInt(w, 10) || 0;
    const storedDates = wd.dates || {};

    DAY_KEYS.forEach((day) => {
      const lifts = wd.lifts?.[day];
      const run = wd.runs?.[day];
      const gymStats = wd.gymStats?.[day];
      const stats = strengthDayStats(lifts);
      const runDist = parseFloat(run?.dist) || 0;
      const runTime = run && run.time ? String(run.time) : '';
      const gymTime = gymStats && gymStats.time ? String(gymStats.time) : '';
      const hasActivity =
        stats.workingSets > 0 || runDist > 0 || runTime !== '' || gymTime !== '';
      if (!hasActivity) return; // scaffolding / rest day — nothing to attribute

      const slot = {
        weekNum, day, lifts, run, gymStats, stats,
        dateISO: /** @type {string} */ (localDayKey(storedDates[day], opts.tz)),
      };

      if (!slot.dateISO) { undated.push(slot); return; }

      const existing = byDate.get(slot.dateISO);
      if (!existing || _preferSlot(slot, existing)) byDate.set(slot.dateISO, slot);
    });
  }

  return { byDate, undated };
}

// Deterministic winner between two slots that claim the same calendar date.
function _preferSlot(a, b) {
  if (a.stats.workingSets !== b.stats.workingSets) return a.stats.workingSets > b.stats.workingSets;
  if (a.stats.volumeKg !== b.stats.volumeKg) return a.stats.volumeKg > b.stats.volumeKg;
  return a.weekNum < b.weekNum;
}

/**
 * Assemble a synthetic `weekData`-shaped object for the calendar week that
 * STARTS on `weekStartISO` (a Monday), pulling each of the 7 days from whichever
 * stored slot owns that real date. Shape matches `state.weeks[N]` so existing
 * per-day extraction (week-chart-model's dayCell) can consume it unchanged.
 *
 * @param {object} state
 * @param {string} weekStartISO  Monday YYYY-MM-DD
 * @param {{ tz?: string, index?: {byDate: Map<string, DatedSlot>} }} [opts]
 * @returns {{ lifts:object, runs:object, gymStats:object, dates:object, sourceSlots:Array }}
 */
export function collectCalendarWeek(state, weekStartISO, opts = {}) {
  const index = opts.index || indexSlotsByDate(state, { tz: opts.tz });
  const lifts = {}, runs = {}, gymStats = {}, dates = {};
  const sourceSlots = [];

  DAY_KEYS.forEach((day, i) => {
    const dateISO = addDaysISO(weekStartISO, i);
    dates[day] = dateISO;
    const slot = index.byDate.get(dateISO);
    if (!slot) return;
    if (slot.lifts) lifts[day] = slot.lifts;
    if (slot.run) runs[day] = slot.run;
    if (slot.gymStats) gymStats[day] = slot.gymStats;
    sourceSlots.push({ date: dateISO, day, weekNum: slot.weekNum });
  });

  return { lifts, runs, gymStats, dates, sourceSlots };
}

// ---- canonical strength aggregate -------------------------------------------

/**
 * The single verified weekly STRENGTH aggregate every strength surface should
 * consume. Buckets by real calendar date, so an empty current week is genuinely
 * zero and last week's work lives only in last week's aggregate.
 *
 * @param {object} state
 * @param {{ weekStart?: string, today?: string, tz?: string,
 *           index?: {byDate: Map<string, DatedSlot>} }} [opts]
 * @returns {{
 *   weekKey:string, startDate:string, endDate:string,
 *   days: Array<{date:string, dayKey:string, workingSets:number, reps:number, volumeKg:number, sourceWeekNum:number|null}>,
 *   totalWorkingSets:number, totalReps:number, totalVolumeKg:number,
 *   sourceWeekNums:number[], elapsedWorkingSets:number, elapsedReps:number, elapsedVolumeKg:number
 * }}
 */
export function buildCalendarWeekStrength(state, opts = {}) {
  const today = opts.today || localDayKey(new Date(), opts.tz);
  const weekStart = opts.weekStart || weekStartOf(today);
  const index = opts.index || indexSlotsByDate(state, { tz: opts.tz });

  const days = DAY_KEYS.map((dayKey, i) => {
    const date = addDaysISO(weekStart, i);
    const slot = index.byDate.get(date);
    const s = slot ? slot.stats : { workingSets: 0, reps: 0, volumeKg: 0 };
    return {
      date, dayKey,
      workingSets: s.workingSets, reps: s.reps, volumeKg: s.volumeKg,
      sourceWeekNum: slot ? slot.weekNum : null,
    };
  });

  const isCurrentCalWeek = weekStart === weekStartOf(today);
  const sum = (arr, k) => arr.reduce((t, d) => t + d[k], 0);
  const elapsed = isCurrentCalWeek ? days.filter((d) => d.date <= today) : days;

  return {
    weekKey: weekStart,
    startDate: weekStart,
    endDate: addDaysISO(weekStart, 6),
    days,
    totalWorkingSets: sum(days, 'workingSets'),
    totalReps: sum(days, 'reps'),
    totalVolumeKg: sum(days, 'volumeKg'),
    elapsedWorkingSets: sum(elapsed, 'workingSets'),
    elapsedReps: sum(elapsed, 'reps'),
    elapsedVolumeKg: sum(elapsed, 'volumeKg'),
    sourceWeekNums: [...new Set(days.filter((d) => d.sourceWeekNum != null).map((d) => d.sourceWeekNum))],
  };
}

// ---- dev-only diagnostic trace ----------------------------------------------

/**
 * DEVELOPMENT/TEST diagnostic — explains WHY each stored session is (or is not)
 * attributed to a given calendar week. Not wired to any production UI; a tool to
 * name the exact records behind a weekly total. Never logs raw health/GPS data.
 *
 * @param {object} state
 * @param {{ today?: string, tz?: string, weekStart?: string }} [opts]
 */
export function explainWeeklyMetric(state, opts = {}) {
  const tz = opts.tz;
  const now = new Date();
  const today = opts.today || localDayKey(now, tz);
  const weekStart = opts.weekStart || weekStartOf(today);
  const weekEnd = addDaysISO(weekStart, 6);
  const { byDate, undated } = indexSlotsByDate(state, { tz });

  const sessions = [];
  for (const slot of [...byDate.values(), ...undated]) {
    const wd = (state?.weeks || {})[String(slot.weekNum)] || {};
    const rawStored = wd.dates?.[slot.day];
    const resolvedLocalDate = slot.dateISO || null;
    const resolvedWeekKey = resolvedLocalDate ? weekKeyOf(resolvedLocalDate) : null;
    const included = resolvedWeekKey === weekStart;
    let inclusionReason;
    if (!resolvedLocalDate) inclusionReason = 'excluded: no recoverable date (undated legacy slot)';
    else if (included) inclusionReason = `included: real date ${resolvedLocalDate} falls in week ${weekStart}`;
    else inclusionReason = `excluded: real date ${resolvedLocalDate} belongs to week ${resolvedWeekKey}, not ${weekStart}`;

    sessions.push({
      slotId: `week${slot.weekNum}/${slot.day}`,
      workoutName: slot.stats.workingSets > 0 ? 'Gym session' : (slot.run ? 'Run session' : 'Session'),
      rawDateFields: {
        storedDate: rawStored ?? null,
        weekNum: slot.weekNum,
        dayKey: slot.day,
      },
      resolvedLocalDate,
      resolvedWeekKey,
      workingSets: slot.stats.workingSets,
      reps: slot.stats.reps,
      volumeKg: slot.stats.volumeKg,
      included,
      inclusionReason,
    });
  }
  sessions.sort((a, b) => String(a.resolvedLocalDate).localeCompare(String(b.resolvedLocalDate)));

  return {
    now: now.toISOString(),
    timezone: tz || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })(),
    today,
    selectedWeekKey: weekStart,
    currentWeekStart: weekStart,
    currentWeekEnd: weekEnd,
    undatedCount: undated.length,
    sessions,
  };
}
