// @ts-check
// =============================================================================
// PERIOD TOTALS — the shared 7D / 4W / 1Y engine behind Gym Performance and Run
// Performance. It owns the calendar arithmetic that both surfaces need to get
// right and only get right once: fixed 7-day / 4-week / calendar-year periods,
// per-bin evidence, and — the subtle part — an honest partial-period comparison
// that pits the current elapsed portion against the SAME elapsed portion of the
// previous period, so an in-progress week/month/year never reads as a decline.
//
// Domain modules inject two pure functions:
//   aggregate(recordsInPeriod) -> number   (sum tonnage, count sessions, weighted pace…)
//   format(value)              -> string   (how that number reads to the athlete)
// and a metric may be `inverse` (lower is better, e.g. pace) so the comparison
// can report favourability without the caller re-deriving direction.
//
// Records are plain objects carrying a `localDate` (YYYY-MM-DD, already
// date-eligible: no future, no undated). Everything else stays domain-specific.
// =============================================================================
import { addDaysISO, daysBetween, localDayKey, todayKey } from '../dates.js';
import { weekStartOf } from './weekly-aggregate.js';

export const PERIOD_RANGES = Object.freeze([
  { id: '7d', label: '7D' },
  { id: '4w', label: '4W' },
  { id: '1y', label: '1Y' },
]);

function shiftYear(date, delta) {
  const year = Number(String(date).slice(0, 4));
  return Number.isFinite(year) ? year + delta : year;
}

function periodFor(range, offset, today) {
  const safeOffset = Math.min(0, Number.isInteger(offset) ? offset : 0);
  if (range === '1y') {
    const year = shiftYear(today, safeOffset);
    return { start: `${year}-01-01`, end: `${year}-12-31`, isCurrent: safeOffset === 0 };
  }
  const currentMonday = weekStartOf(today);
  if (range === '4w') {
    const endWeek = addDaysISO(currentMonday, safeOffset * 28);
    return {
      start: addDaysISO(endWeek, -21),
      end: addDaysISO(endWeek, 6),
      isCurrent: safeOffset === 0,
    };
  }
  const start = addDaysISO(currentMonday, safeOffset * 7);
  return { start, end: addDaysISO(start, 6), isCurrent: safeOffset === 0 };
}

function previousPeriod(range, period) {
  if (range === '1y') {
    const year = shiftYear(period.start, -1);
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  const days = range === '4w' ? 28 : 7;
  return { start: addDaysISO(period.start, -days), end: addDaysISO(period.end, -days) };
}

function inPeriod(records, start, end) {
  return records.filter((record) => record.localDate >= start && record.localDate <= end);
}

function buildBins(range, period, through, records, aggregate, format) {
  const bins = [];
  if (range === '1y') {
    const year = String(period.start).slice(0, 4);
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, '0');
      const next = month === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const start = `${year}-${mm}-01`;
      const end = addDaysISO(next, -1);
      const evidence = start > through ? [] : inPeriod(records, start, end > through ? through : end);
      const value = aggregate(evidence);
      bins.push({ key: start, start, end, value, formatted: format(value), records: evidence, isFuture: start > through });
    }
    return bins;
  }
  const count = range === '4w' ? 4 : 7;
  const span = range === '4w' ? 7 : 1;
  for (let index = 0; index < count; index++) {
    const start = addDaysISO(period.start, index * span);
    const end = addDaysISO(start, span - 1);
    const evidence = start > through ? [] : inPeriod(records, start, end > through ? through : end);
    const value = aggregate(evidence);
    bins.push({ key: start, start, end, value, formatted: format(value), records: evidence, isFuture: start > through });
  }
  return bins;
}

function compare(current, previous, isCurrent, inverse) {
  const absoluteChange = current - previous;
  const rawDirection = absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat';
  const comparisonLabel = isCurrent ? 'vs same point in previous period' : 'vs previous period';
  // Favourability only has meaning once there is a comparable previous total.
  // For an inverse metric (pace) a smaller value is the improvement.
  const favorable = rawDirection === 'flat' ? null
    : inverse ? rawDirection === 'down' : rawDirection === 'up';
  if (previous === 0) {
    return {
      current, previous, absoluteChange, percentageChange: null, direction: rawDirection,
      favorable: current === previous ? null : favorable,
      comparisonLabel, isComparable: false,
      message: current === 0 ? 'No activity in either period' : 'No activity in the previous period',
    };
  }
  return {
    current, previous, absoluteChange, direction: rawDirection, favorable, comparisonLabel,
    percentageChange: Math.round((absoluteChange / previous) * 100),
    isComparable: true, message: null,
  };
}

/**
 * Assemble the generic period model. Domain modules add their own fields
 * (unit, exclusions, coverage…) around this core.
 *
 * @param {{
 *   records: Array<{localDate:string}>,   // date-eligible (no future / undated)
 *   today: string,
 *   range?: '7d'|'4w'|'1y',
 *   offset?: number,
 *   aggregate: (records:Array<any>) => number,
 *   format: (value:number) => string,
 *   inverse?: boolean,
 * }} input
 */
export function buildPeriodTotals(input) {
  const range = PERIOD_RANGES.some((item) => item.id === input.range) ? input.range : '7d';
  const today = localDayKey(input.today || todayKey()) || todayKey();
  const offset = Math.min(0, Number.isInteger(input.offset) ? input.offset : 0);
  const { aggregate, format, inverse = false } = input;
  const eligible = input.records || [];

  const period = periodFor(range, offset, today);
  const through = period.isCurrent && today < period.end ? today : period.end;
  const records = inPeriod(eligible, period.start, through);

  const previous = previousPeriod(range, period);
  const elapsedDays = period.isCurrent
    ? (daysBetween(period.start, through) ?? 0) + 1
    : (daysBetween(period.start, period.end) ?? 0) + 1;
  const previousThrough = addDaysISO(previous.start, Math.max(0, elapsedDays - 1));
  const previousRecords = inPeriod(eligible, previous.start, previousThrough < previous.end ? previousThrough : previous.end);

  const total = aggregate(records);
  const previousTotal = aggregate(previousRecords);

  return {
    range, offset,
    period: { ...period, through },
    total, formattedTotal: format(total),
    records, recordCount: records.length,
    comparison: compare(total, previousTotal, period.isCurrent, inverse),
    bins: buildBins(range, period, through, records, aggregate, format),
    canGoNext: offset < 0,
  };
}
