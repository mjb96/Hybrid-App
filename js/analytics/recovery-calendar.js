// @ts-check
// Calendar-week perceived-effort aggregation. Recovery is a rolling view, but
// any card labelled "this week" must follow real workout dates rather than the
// active program-week counter.

import { addDaysISO, indexSlotsByDate, localDayKey, weekStartOf } from './weekly-aggregate.js';
import { runSessionsForDay } from '../state/run-sessions.js';

/** @param {any} state @param {{today?:string,tz?:string}} [options] */
export function calendarWeekRpe(state, options = {}) {
  const today = options.today || localDayKey(new Date(), options.tz);
  const weekStart = weekStartOf(today);
  const index = indexSlotsByDate(state, { tz: options.tz });
  let total = 0;
  let count = 0;
  for (let offset = 0; offset < 7; offset++) {
    const date = addDaysISO(weekStart, offset);
    if (date > today) break;
    const slots = index.allByDate.get(date) || [];
    for (const slot of slots) {
      const week = state?.weeks?.[slot.weekKey];
      const gymRpe = parseFloat(week?.gymRpe?.[slot.day]) || 0;
      if (gymRpe > 0) { total += gymRpe; count++; }
      runSessionsForDay(week, slot.day).forEach((run) => {
        const runRpe = parseFloat(run?.rpe) || 0;
        if (runRpe > 0) { total += runRpe; count++; }
      });
    }
  }
  return { weekStart, weekEnd: addDaysISO(weekStart, 6), total, count, average: count ? total / count : 0 };
}
