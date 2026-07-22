// @ts-check
// =============================================================================
// GYM PERFORMANCE — Garmin-inspired period totals with exact workout evidence.
//
// The activity model owns what constitutes a real strength/gym activity. This
// module only groups those exact records into fixed calendar periods and never
// invents dates or durations for older data.
// =============================================================================
import { buildActivityHistory } from '../activities/model.js';
import { addDaysISO, daysBetween, localDayKey, todayKey } from '../dates.js';
import { formatStrengthDuration } from '../strength/duration.js';
import { weekStartOf } from './weekly-aggregate.js';

export const GYM_PERFORMANCE_RANGES = Object.freeze([
  { id: '7d', label: '7D' },
  { id: '4w', label: '4W' },
  { id: '1y', label: '1Y' },
]);

export const GYM_PERFORMANCE_METRICS = Object.freeze([
  { id: 'time', label: 'Time' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'sets', label: 'Sets' },
  { id: 'volume', label: 'Volume' },
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

function totalFor(records, metric) {
  if (metric === 'time') return records.reduce((sum, row) => sum + (Number(row.durationSeconds) || 0), 0);
  if (metric === 'sessions') return records.length;
  if (metric === 'sets') return records.reduce((sum, row) => sum + (Number(row.workingSets) || 0), 0);
  return records.reduce((sum, row) => sum + (Number(row.volume) || 0), 0);
}

function formatValue(metric, value, unit) {
  if (metric === 'time') return formatStrengthDuration(value);
  if (metric === 'sessions') return `${Math.round(value)} ${Math.round(value) === 1 ? 'workout' : 'workouts'}`;
  if (metric === 'sets') return `${Math.round(value)} ${Math.round(value) === 1 ? 'set' : 'sets'}`;
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

function buildBins(range, period, through, records, metric, unit) {
  const bins = [];
  if (range === '1y') {
    const year = String(period.start).slice(0, 4);
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, '0');
      const next = month === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const start = `${year}-${mm}-01`;
      const end = addDaysISO(next, -1);
      const evidence = start > through ? [] : inPeriod(records, start, end > through ? through : end);
      const value = totalFor(evidence, metric);
      bins.push({ key: start, start, end, value, formatted: formatValue(metric, value, unit), records: evidence, isFuture: start > through });
    }
    return bins;
  }
  const count = range === '4w' ? 4 : 7;
  const span = range === '4w' ? 7 : 1;
  for (let index = 0; index < count; index++) {
    const start = addDaysISO(period.start, index * span);
    const end = addDaysISO(start, span - 1);
    const evidence = start > through ? [] : inPeriod(records, start, end > through ? through : end);
    const value = totalFor(evidence, metric);
    bins.push({ key: start, start, end, value, formatted: formatValue(metric, value, unit), records: evidence, isFuture: start > through });
  }
  return bins;
}

function compare(current, previous, isCurrent) {
  const absoluteChange = current - previous;
  const direction = absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat';
  const comparisonLabel = isCurrent ? 'vs same point in previous period' : 'vs previous period';
  if (previous === 0) {
    return {
      current, previous, absoluteChange, percentageChange: null, direction,
      comparisonLabel, isComparable: false,
      message: current === 0 ? 'No activity in either period' : 'No activity in the previous period',
    };
  }
  return {
    current, previous, absoluteChange, direction, comparisonLabel,
    percentageChange: Math.round((absoluteChange / previous) * 100),
    isComparable: true, message: null,
  };
}

/**
 * @param {any} state
 * @param {{range?:'7d'|'4w'|'1y', metric?:'time'|'sessions'|'sets'|'volume', offset?:number, today?:string}} [options]
 */
export function buildGymPerformance(state, options = {}) {
  const range = GYM_PERFORMANCE_RANGES.some((item) => item.id === options.range) ? options.range : '7d';
  const metric = GYM_PERFORMANCE_METRICS.some((item) => item.id === options.metric) ? options.metric : 'time';
  const today = localDayKey(options.today || todayKey()) || todayKey();
  const offset = Math.min(0, Number.isInteger(options.offset) ? options.offset : 0);
  const period = periodFor(range, offset, today);
  const through = period.isCurrent && today < period.end ? today : period.end;
  // A gym "workout" here means real trained work: at least one valid working
  // set, or a recorded session duration (FIT/manual imports carry time without
  // per-set data). The activity model also keeps note- or RPE-only days for the
  // history list, but counting those as workouts inflated the Sessions total and
  // the "N workouts" evidence while contributing nothing to Sets/Volume/Time.
  const all = buildActivityHistory(state)
    .filter((record) => record.kind === 'strength')
    .filter((record) => (Number(record.workingSets) || 0) > 0 || (Number(record.durationSeconds) || 0) > 0);
  const dated = all.filter((record) => localDayKey(record.localDate));
  const future = dated.filter((record) => record.localDate > today).length;
  const eligible = dated.filter((record) => record.localDate <= today);
  const records = inPeriod(eligible, period.start, through);
  const previous = previousPeriod(range, period);
  const elapsedDays = period.isCurrent ? (daysBetween(period.start, through) ?? 0) + 1 : (daysBetween(period.start, period.end) ?? 0) + 1;
  const previousThrough = addDaysISO(previous.start, Math.max(0, elapsedDays - 1));
  const previousRecords = inPeriod(eligible, previous.start, previousThrough < previous.end ? previousThrough : previous.end);
  const unit = state?.settings?.weightUnit === 'lbs' ? 'lbs' : 'kg';
  const total = totalFor(records, metric);
  const previousTotal = totalFor(previousRecords, metric);
  const durationKnown = records.filter((record) => Number(record.durationSeconds) > 0).length;
  return {
    range, metric, offset, period: { ...period, through },
    total, formattedTotal: formatValue(metric, total, unit),
    records, recordCount: records.length,
    durationKnown,
    durationMissing: records.length - durationKnown,
    comparison: compare(total, previousTotal, period.isCurrent),
    bins: buildBins(range, period, through, records, metric, unit),
    canGoNext: offset < 0,
    exclusions: { future, undated: all.length - dated.length },
    unit,
  };
}
