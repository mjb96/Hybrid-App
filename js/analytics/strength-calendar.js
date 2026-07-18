// @ts-check
// =============================================================================
// STRENGTH — CALENDAR-WEEK estimated 1RM (analytics/strength-calendar.js)
//
// The calendar-correct "this week" strength engine. Every working set is
// attributed to the CALENDAR week it was performed in (its real stamped date),
// reusing the canonical bucketing + deduplication in weekly-aggregate.js. This
// module is a program-week-FREE zone (enforced by tests/analytics_calendar_guard):
// it never reads state.currentWeek and never indexes weeks[N] as "this week".
//
// Stored lift keys remain untouched, but explicit catalogue aliases resolve to
// one canonical display name for comparisons. Unknown custom names stay exact.
// =============================================================================
import { isValidWorkingSet } from '../set-utils.js';
import { indexSlotsByDate, weekStartOf, addDaysISO, localDayKey } from './weekly-aggregate.js';
import { resolveExercise } from '../exercises/catalog.js';

const isWorkingSet = isValidWorkingSet;

/**
 * The app's canonical estimated 1RM (Epley: weight × (1 + reps/30)). One formula
 * for every strength surface — coerces string inputs and never returns NaN.
 * @returns {number} estimated 1RM, or 0 for invalid/zero input.
 */
export function estimatedE1rm(weight, reps) {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  if (w <= 0 || r <= 0) return 0;
  const e = w * (1 + r / 30);
  return Number.isFinite(e) ? e : 0;
}

/**
 * Best working-set estimated 1RM for every lift, grouped by CALENDAR week.
 * Warm-ups / incompletes / zero-rep sets excluded; same-date duplicate slots
 * (cloud/local copies) are deduplicated upstream, so a lift is never counted
 * twice on one day.
 * @param {object} state
 * @param {{tz?:string}} [opts]
 * @returns {Record<string, Map<string, {best:number,bestSet:object,validSetCount:number,programWeeks:Set<number>}>>}
 *          liftName → (weekKey → record)
 */
export function liftE1rmByCalendarWeek(state, opts = {}) {
  const { byDate } = indexSlotsByDate(state, { tz: opts.tz });
  /** @type {Record<string, Map<string, any>>} */
  const out = {};
  for (const [date, slot] of byDate) {
    const wk = weekStartOf(date);
    for (const lift in (slot.lifts || {})) {
      const identity = resolveExercise(lift)?.name || lift;
      const sets = slot.lifts[lift];
      if (!Array.isArray(sets)) continue;
      for (const s of sets) {
        if (!isWorkingSet(s)) continue;
        const e = estimatedE1rm(s.w, s.r);
        if (e <= 0) continue; // unsupported set (zero reps/weight) — never a false 0
        const m = out[identity] || (out[identity] = new Map());
        let rec = m.get(wk);
        if (!rec) { rec = { best: 0, bestSet: null, validSetCount: 0, programWeeks: new Set() }; m.set(wk, rec); }
        rec.validSetCount++;
        rec.programWeeks.add(slot.weekNum);
        if (e > rec.best) { rec.best = e; rec.bestSet = { weight: parseFloat(s.w) || 0, reps: parseInt(s.r, 10) || 0, date }; }
      }
    }
  }
  return out;
}

/**
 * Per-lift best e1RM within ONE calendar week (the shape the brief asks for).
 * @param {object} state
 * @param {{weekStart?:string, today?:string, tz?:string}} [opts]
 * @returns {Record<string, {exerciseName:string, weekKey:string, bestEstimated1RM:number,
 *   bestSet:object|null, validSetCount:number, sourceProgramWeeks:number[]}>}
 */
export function bestE1rmByLiftForWeek(state, opts = {}) {
  const weekStart = opts.weekStart || weekStartOf(opts.today || localDayKey(new Date(), opts.tz));
  const byLift = liftE1rmByCalendarWeek(state, { tz: opts.tz });
  /** @type {Record<string, any>} */
  const out = {};
  for (const lift in byLift) {
    const rec = byLift[lift].get(weekStart);
    if (!rec) continue;
    out[lift] = {
      exerciseName: lift,
      weekKey: weekStart,
      bestEstimated1RM: rec.best,
      bestSet: rec.bestSet,
      validSetCount: rec.validSetCount,
      sourceProgramWeeks: [...rec.programWeeks].sort((a, b) => a - b),
    };
  }
  return out;
}

/**
 * The Strength-overview "this week" summary, calendar-correct. Every comparison
 * is same-exercise. Returns an honest no-data shape when the selected calendar
 * week has no comparable strength work.
 * @param {object} state
 * @param {{today?:string, weekStart?:string, tz?:string}} [opts]
 */
export function calendarStrengthSummary(state, opts = {}) {
  const weekKey = opts.weekStart || weekStartOf(opts.today || localDayKey(new Date(), opts.tz));
  const prevWeekKey = addDaysISO(weekKey, -7);
  const byLift = liftE1rmByCalendarWeek(state, { tz: opts.tz });

  let bestThisWeek = null;      // strongest e1RM logged this week (any lift)
  let topChange = null;         // biggest SAME-exercise gain vs its own last-week best
  let improvedCount = 0;        // exercises up vs their own last week
  const prLifts = [];           // exercises at a new all-time best this week (had prior history)

  for (const lift in byLift) {
    const weeksMap = byLift[lift];
    const cur = weeksMap.get(weekKey);
    if (!cur) continue;         // not trained this calendar week
    const curE = cur.best;

    if (!bestThisWeek || curE > bestThisWeek.e1rm) {
      bestThisWeek = { exerciseName: lift, e1rm: curE, bestSet: cur.bestSet };
    }

    const prev = weeksMap.get(prevWeekKey);
    const prevE = prev ? prev.best : 0;
    if (prevE > 0) {
      const delta = curE - prevE;
      if (delta > 0.01) improvedCount++;
      // "Most useful change" = the biggest same-exercise movement (prefer gains).
      if (!topChange || delta > topChange.deltaKg) {
        topChange = { exerciseName: lift, currentE1rm: curE, prevE1rm: prevE, deltaKg: delta };
      }
    }

    // Calendar-week PR: this week's best ties/beats every PRIOR calendar week's
    // best for this lift AND prior history exists (a first-ever log is a baseline).
    let priorBest = 0;
    for (const [wk, rec] of weeksMap) { if (wk < weekKey && rec.best > priorBest) priorBest = rec.best; }
    if (priorBest > 0 && curE >= priorBest - 0.01) prLifts.push(lift);
  }

  return {
    weekKey, prevWeekKey,
    hasCurrentWork: bestThisWeek !== null,
    bestThisWeek,
    topChange,
    improvedCount,
    prCount: prLifts.length,
    prLifts,
  };
}

/**
 * Last `weeks` calendar weeks of best e1RM for one lift (trailing trend spark).
 * Zero-fills weeks with no logged data for that lift, ending on the current week.
 * @returns {number[]} oldest → newest
 */
export function calendarWeekE1rmSeriesForLift(state, liftName, opts = {}) {
  const weeks = opts.weeks || 12;
  const curMon = weekStartOf(opts.today || localDayKey(new Date(), opts.tz));
  const identity = resolveExercise(liftName)?.name || liftName;
  const byWeek = (liftE1rmByCalendarWeek(state, { tz: opts.tz })[identity]) || new Map();
  const series = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wk = addDaysISO(curMon, -i * 7);
    series.push(byWeek.get(wk)?.best || 0);
  }
  return series;
}
