// @ts-check
// =============================================================================
// RUN PERFORMANCE — the running counterpart to Gym Performance. Same Garmin-
// style 7D / 4W / 1Y period totals and exact activity evidence, built on the
// shared period-totals engine and the same date-strict record collector every
// other running surface uses (collectRunningHistory), so exclusions and
// eligibility can never disagree between screens.
//
// Metrics are deliberately the summable, "more-is-more" quantities that a totals
// bar chart represents honestly: Distance, Time and Sessions. Pace is a distance-
// weighted average where lower is better, so it stays in the per-metric Running
// detail rather than being forced into a totals chart.
// =============================================================================
import { localDayKey, todayKey } from '../dates.js';
import { collectRunningHistory } from './running-detail.js';
import { buildPeriodTotals, PERIOD_RANGES } from './period-totals.js';

export const RUN_PERFORMANCE_RANGES = PERIOD_RANGES;

export const RUN_PERFORMANCE_METRICS = Object.freeze([
  { id: 'distance', label: 'Distance' },
  { id: 'time', label: 'Time' },
  { id: 'sessions', label: 'Sessions' },
]);

function distanceUnit(state) {
  const raw = String(state?.settings?.distanceUnit || 'km').toLowerCase();
  return raw === 'mi' || raw === 'miles' ? 'mi' : 'km';
}

function totalFor(records, metric) {
  if (metric === 'distance') return records.reduce((sum, row) => sum + (Number(row.distanceKm) || 0), 0);
  if (metric === 'time') return records.reduce((sum, row) => sum + (Number(row.durationSec) || 0), 0);
  return records.length;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.round(total / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${minutes}m`;
}

function formatValue(metric, value, unit) {
  if (metric === 'distance') {
    const distance = unit === 'mi' ? value * 0.621371 : value;
    return `${distance.toFixed(distance >= 100 ? 0 : 1)} ${unit}`;
  }
  if (metric === 'time') return formatDuration(value);
  return `${Math.round(value)} ${Math.round(value) === 1 ? 'run' : 'runs'}`;
}

/**
 * @param {any} state
 * @param {{range?:'7d'|'4w'|'1y', metric?:'distance'|'time'|'sessions', offset?:number, today?:string}} [options]
 */
export function buildRunPerformance(state, options = {}) {
  const metric = RUN_PERFORMANCE_METRICS.some((item) => item.id === options.metric) ? options.metric : 'distance';
  const today = localDayKey(options.today || todayKey()) || todayKey();
  const unit = distanceUnit(state);

  // collectRunningHistory is already date-strict: it drops undated and future
  // sessions (counted in exclusions) and dedupes by activity id, so its records
  // are exactly the eligible set. Alias .date to the .localDate the core keys on.
  const history = collectRunningHistory(state, { today });
  const eligible = history.records.map((record) => ({ ...record, localDate: record.date }));

  const core = buildPeriodTotals({
    records: eligible, today, range: options.range, offset: options.offset,
    aggregate: (records) => totalFor(records, metric),
    format: (value) => formatValue(metric, value, unit),
  });

  const durationKnown = core.records.filter((record) => Number(record.durationSec) > 0).length;
  return {
    ...core,
    metric,
    durationKnown,
    durationMissing: core.records.length - durationKnown,
    exclusions: { future: history.exclusions.future, undated: history.exclusions.undated },
    unit,
  };
}
