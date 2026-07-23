// @ts-check
// =============================================================================
// RECOVERY PERFORMANCE — the recovery counterpart to Gym/Run Performance.
//
// Same Garmin-style 7D / 4W / 1Y period view on the shared period-totals engine,
// but the honest aggregate for recovery is an AVERAGE, not a sum (you do not add
// up sleep or soreness). Source is the manually-logged wellness check-in
// (state.wellnessLog: { date, sleep, mood, soreness }) so it works offline with
// no Health Connect. Each metric is pre-filtered to entries that actually carry
// it, so an empty period is a true "no check-ins", never a misleading zero.
// =============================================================================
import { localDayKey, todayKey } from '../dates.js';
import { buildPeriodTotals, PERIOD_RANGES } from './period-totals.js';

export const RECOVERY_PERFORMANCE_RANGES = PERIOD_RANGES;

export const RECOVERY_PERFORMANCE_METRICS = Object.freeze([
  { id: 'sleep', label: 'Sleep', field: 'sleep', inverse: false },
  { id: 'mood', label: 'Mood', field: 'mood', inverse: false },
  { id: 'soreness', label: 'Soreness', field: 'soreness', inverse: true },
]);

function metricDef(id) {
  return RECOVERY_PERFORMANCE_METRICS.find((item) => item.id === id) || RECOVERY_PERFORMANCE_METRICS[0];
}

function mean(records, field) {
  if (!records.length) return 0;
  const sum = records.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  return sum / records.length;
}

function formatValue(metric, value) {
  if (metric === 'sleep') return `${value.toFixed(1)} h`;
  return `${value.toFixed(1)} / 5`;
}

/**
 * @param {any} state
 * @param {{range?:'7d'|'4w'|'1y', metric?:'sleep'|'mood'|'soreness', offset?:number, today?:string}} [options]
 */
export function buildRecoveryPerformance(state, options = {}) {
  const def = metricDef(RECOVERY_PERFORMANCE_METRICS.some((item) => item.id === options.metric) ? options.metric : 'sleep');
  const today = localDayKey(options.today || todayKey()) || todayKey();

  const log = Array.isArray(state?.wellnessLog) ? state.wellnessLog : [];
  const seen = new Set();
  const eligible = [];
  let undated = 0;
  let future = 0;
  for (const entry of log) {
    const date = localDayKey(entry?.date);
    const value = Number(entry?.[def.field]) || 0;
    if (value <= 0) continue;            // this metric was not recorded that day
    if (!date) { undated++; continue; }
    if (date > today) { future++; continue; }
    if (seen.has(date)) continue;        // one check-in per day owns the date
    seen.add(date);
    eligible.push({ localDate: date, sleep: Number(entry.sleep) || 0, mood: Number(entry.mood) || 0, soreness: Number(entry.soreness) || 0 });
  }

  const core = buildPeriodTotals({
    records: eligible, today, range: options.range, offset: options.offset,
    aggregate: (records) => mean(records, def.field),
    format: (value) => formatValue(def.id, value),
    inverse: def.inverse,
  });

  return {
    ...core,
    metric: def.id,
    metricLabel: def.label,
    inverse: def.inverse,
    exclusions: { future, undated },
  };
}
