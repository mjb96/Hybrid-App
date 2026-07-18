// @ts-check
// =============================================================================
// TRAINING LOAD — canonical sRPE calculation and explicit time scopes.
//
// Program-week series power plan/block charts. Calendar-dated history powers
// rolling ATL/CTL. Both scopes share the same day formula so they cannot drift:
// strength RPE × minutes + the sum of every run session's RPE × minutes.
// =============================================================================
import { addDaysISO, localDayKey, todayKey } from '../dates.js';
import { indexSlotsByDate } from '../analytics/weekly-aggregate.js';
import { runLoadForDay } from '../state/run-sessions.js';

export const TRAINING_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export function dayTrainingLoad(week, day) {
  const gymRpe = parseFloat(week?.gymRpe?.[day]) || 0;
  const gymMins = parseFloat(week?.gymStats?.[day]?.time) || 0;
  const strength = gymRpe > 0 && gymMins > 0 ? gymRpe * gymMins : 0;
  const endurance = runLoadForDay(week, day);
  return { strength, endurance, total: strength + endurance };
}

/** sRPE split for numeric program-week slots only. */
export function programWeekLoadBreakdown(state, days, maxWeek) {
  const strength = [], endurance = [], total = [];
  for (let weekNum = 1; weekNum <= maxWeek; weekNum++) {
    const week = state?.weeks?.[String(weekNum)];
    let strengthLoad = 0, enduranceLoad = 0;
    if (week) {
      for (const day of days) {
        const load = dayTrainingLoad(week, day);
        strengthLoad += load.strength;
        enduranceLoad += load.endurance;
      }
    }
    strength.push(strengthLoad);
    endurance.push(enduranceLoad);
    total.push(strengthLoad + enduranceLoad);
  }
  return { strength, endurance, total };
}

/** Seven daily sRPE values for one numeric program week. */
export function programWeekDailyLoads(state, days, weekNum) {
  const week = state?.weeks?.[String(weekNum)];
  return days.map((day) => week ? dayTrainingLoad(week, day).total : 0);
}

/** Rolling prior-program-week baseline over up to `window` loaded weeks. */
export function programWeekLoadBalance(state, days, currentWeek, maxWeek, window = 4) {
  const weekNum = parseInt(currentWeek, 10) || 1;
  if (maxWeek < 2 || weekNum < 2) return { hasData: false, acwr: 0, acute: 0, chronic: 0 };
  const costs = programWeekLoadBreakdown(state, days, maxWeek).total;
  const index = weekNum - 1;
  if (index >= costs.length) return { hasData: false, acwr: 0, acute: 0, chronic: 0 };
  const acute = costs[index];
  const prior = costs.slice(Math.max(0, index - window), index).filter((load) => load > 0);
  const chronic = prior.length ? prior.reduce((sum, load) => sum + load, 0) / prior.length : 0;
  if (acute === 0 && chronic === 0) return { hasData: false, acwr: 0, acute, chronic };
  const acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0;
  return { hasData: true, acwr, acute, chronic };
}

/**
 * Calendar-contiguous daily sRPE across every dated stored session, including
 * archived activations and independent one-off workouts. Duplicate legacy
 * slots use the same canonical identity/dedup rules as calendar analytics.
 * Undated slots are preserved in state but intentionally excluded.
 *
 * @param {any} state
 * @param {{throughDate?:string|Date, tz?:string}} [options]
 */
export function dailyTrainingLoadTimeline(state, options = {}) {
  const throughDate = localDayKey(options.throughDate || todayKey(options.tz), options.tz);
  if (!throughDate) return [];
  const index = indexSlotsByDate(state, { tz: options.tz });
  const loadByDate = new Map();

  for (const [date, slots] of index.allByDate.entries()) {
    if (date > throughDate) continue;
    let load = 0;
    for (const slot of slots) {
      const week = state?.weeks?.[slot.weekKey];
      load += dayTrainingLoad(week, slot.day).total;
    }
    loadByDate.set(date, (loadByDate.get(date) || 0) + load);
  }

  const dates = [...loadByDate.keys()].sort();
  if (!dates.length) return [];
  const rows = [];
  for (let date = dates[0]; date && date <= throughDate; date = addDaysISO(date, 1)) {
    rows.push({ date, load: loadByDate.get(date) || 0 });
  }
  return rows;
}
