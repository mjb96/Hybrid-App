// @ts-check
// =============================================================================
// GYM PERFORMANCE — Garmin-inspired period totals with exact workout evidence.
//
// The activity model owns what constitutes a real strength/gym activity. This
// module only groups those exact records into fixed calendar periods (via the
// shared period-totals engine) and never invents dates or durations for older
// data.
// =============================================================================
import { buildActivityHistory } from '../activities/model.js';
import { localDayKey, todayKey } from '../dates.js';
import { formatStrengthDuration } from '../strength/duration.js';
import { buildPeriodTotals, PERIOD_RANGES } from './period-totals.js';

export const GYM_PERFORMANCE_RANGES = PERIOD_RANGES;

export const GYM_PERFORMANCE_METRICS = Object.freeze([
  { id: 'time', label: 'Time' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'sets', label: 'Sets' },
  { id: 'volume', label: 'Volume' },
]);

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

/**
 * @param {any} state
 * @param {{range?:'7d'|'4w'|'1y', metric?:'time'|'sessions'|'sets'|'volume', offset?:number, today?:string}} [options]
 */
export function buildGymPerformance(state, options = {}) {
  const metric = GYM_PERFORMANCE_METRICS.some((item) => item.id === options.metric) ? options.metric : 'time';
  const today = localDayKey(options.today || todayKey()) || todayKey();
  const unit = state?.settings?.weightUnit === 'lbs' ? 'lbs' : 'kg';

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

  const core = buildPeriodTotals({
    records: eligible, today, range: options.range, offset: options.offset,
    aggregate: (records) => totalFor(records, metric),
    format: (value) => formatValue(metric, value, unit),
  });

  const durationKnown = core.records.filter((record) => Number(record.durationSeconds) > 0).length;
  return {
    ...core,
    metric,
    durationKnown,
    durationMissing: core.records.length - durationKnown,
    exclusions: { future, undated: all.length - dated.length },
    unit,
  };
}
