// @ts-check
// Date-strict Strength metric details. Program week remains plan metadata;
// persisted local dates decide chronology and every point retains exact workout
// evidence. Only valid completed working sets contribute.
import { addDaysISO, localDayKey, todayKey } from '../dates.js';
import { isValidWorkingSet, setVolume } from '../set-utils.js';
import { muscleCreditsForExercise } from '../exercises/catalog.js';
import { indexSlotsByDate, weekStartOf } from './weekly-aggregate.js';
import { comparePeriodValues } from './period-comparison.js';

const RANGE_WEEKS = Object.freeze({ '4w': 4, '12w': 12, '6m': 26, '1y': 52 });
export const STRENGTH_RANGE_OPTIONS = Object.freeze([
  { id: '4w', label: '4 weeks' }, { id: '12w', label: '12 weeks' },
  { id: '6m', label: '6 months' }, { id: '1y', label: '1 year' },
  { id: 'all', label: 'All time' },
]);

function metric(id, label, unit, scope, calculation, options = {}) {
  return Object.freeze({
    id, label, unit, scope, calculation,
    color: options.color || '#3b82f6',
    source: 'Dated strength workouts with valid completed working sets',
    empty: options.empty || `Log dated strength workouts to build ${label.toLowerCase()} history.`,
    limitations: options.limitations || [],
  });
}

export const STRENGTH_METRICS = Object.freeze([
  metric('strength.four-week-volume', '4-Week Volume', 'weight-volume', 'rolling-28d',
    'Sum of weight × reps from valid completed working sets over the trailing 28 calendar days.', {
      color: '#8b5cf6',
      limitations: ['Tonnage measures mechanical work, not effort, technique or training quality.'],
    }),
  metric('strength.volume-progression', 'Volume Progression', 'percent', 'rolling-28d-comparison',
    'Percentage change in trailing 28-day tonnage versus the immediately preceding 28 days. A higher value is descriptive, not automatically better.', {
      color: '#3b82f6',
      limitations: ['More tonnage is not automatically productive; exercise selection, effort and recovery still matter.'],
    }),
  metric('strength.muscle-set-credits', 'Muscle Set Credits', 'set-credits', 'calendar-week',
    'Sum of estimated muscle credits in the current Monday–Sunday calendar week: dominant muscles receive 1.0, meaningful secondary muscles 0.5 and minor contributors 0.25 per valid set.', {
      color: '#10b981',
      limitations: ['Credits are a transparent exercise-classification estimate, not measured muscle stimulus.', 'General ranges are not personal recovery limits.'],
    }),
]);

const METRIC_BY_ID = new Map(STRENGTH_METRICS.map((entry) => [entry.id, entry]));
export function strengthMetricById(id) { return METRIC_BY_ID.get(String(id || '')) || null; }

function durationSeconds(value) {
  const parts = String(value || '').split(':').map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 60;
}

function activityId(slot) {
  return slot.sessionId
    ? `strength:${slot.sessionId}`
    : `strength:${encodeURIComponent(slot.weekKey)}:${slot.day}`;
}

export function collectStrengthHistory(state, options = {}) {
  const throughDate = localDayKey(options.today || todayKey(options.tz), options.tz);
  const index = indexSlotsByDate(state, { tz: options.tz });
  const records = [];
  let future = 0;
  for (const [date, slots] of index.allByDate.entries()) {
    for (const slot of slots) {
      let volumeKg = 0, workingSets = 0, reps = 0, muscleSetCredits = 0;
      for (const [name, sets] of Object.entries(slot.lifts || {})) {
        if (!Array.isArray(sets)) continue;
        const valid = sets.filter(isValidWorkingSet);
        if (!valid.length) continue;
        const creditsPerSet = Object.values(muscleCreditsForExercise(name) || {})
          .reduce((total, credit) => total + (Number(credit) || 0), 0);
        for (const set of valid) {
          workingSets++;
          reps += parseInt(set?.r, 10) || 0;
          volumeKg += setVolume(set);
          muscleSetCredits += creditsPerSet;
        }
      }
      if (!workingSets) continue;
      if (throughDate && date > throughDate) { future++; continue; }
      records.push({
        activityId: activityId(slot), date, weekKey: slot.weekKey, day: slot.day,
        title: slot.sessionTitle || state?.weeks?.[slot.weekKey]?.sessionTitle || 'Strength Workout',
        volumeKg, workingSets, reps, muscleSetCredits,
        durationSeconds: durationSeconds(slot.gymStats?.time),
      });
    }
  }
  records.sort((a, b) => a.date.localeCompare(b.date) || a.activityId.localeCompare(b.activityId));
  return {
    records,
    throughDate,
    exclusions: {
      future,
      undated: index.undated.filter((slot) => Number(slot?.stats?.workingSets) > 0).length,
    },
  };
}

function within(records, start, end) {
  return records.filter((record) => (!start || record.date >= start) && (!end || record.date <= end));
}
function sum(records, field) { return records.reduce((total, record) => total + (Number(record[field]) || 0), 0); }

function aggregate(metricId, records, allRecords, endDate) {
  if (metricId === 'strength.four-week-volume') return sum(records, 'volumeKg');
  if (metricId === 'strength.muscle-set-credits') return sum(records, 'muscleSetCredits');
  if (metricId === 'strength.volume-progression') {
    const current = sum(records, 'volumeKg');
    const previousEnd = addDaysISO(endDate, -28);
    const previousStart = addDaysISO(previousEnd, -27);
    const previous = sum(within(allRecords, previousStart, previousEnd), 'volumeKg');
    return previous > 0 ? ((current - previous) / previous) * 100 : null;
  }
  return null;
}

function periodFor(definition, today) {
  if (definition.scope === 'calendar-week') {
    const start = weekStartOf(today);
    return { start, end: today, label: `${start} – ${addDaysISO(start, 6)}`, status: 'Live calendar week' };
  }
  return { start: addDaysISO(today, -27), end: today, label: `Trailing 28 days · through ${today}`, status: 'Rolling window' };
}

function rangeWeekStarts(records, rangeId, currentWeek) {
  let first = currentWeek;
  if (rangeId === 'all') first = records[0]?.date ? weekStartOf(records[0].date) : currentWeek;
  else first = addDaysISO(currentWeek, -7 * ((RANGE_WEEKS[rangeId] || 12) - 1));
  const starts = [];
  for (let value = first; value <= currentWeek; value = addDaysISO(value, 7)) starts.push(value);
  return starts;
}

function seriesFor(definition, records, rangeId, today) {
  return rangeWeekStarts(records, rangeId, weekStartOf(today)).map((weekStart) => {
    const weekEnd = addDaysISO(weekStart, 6);
    const end = weekEnd > today ? today : weekEnd;
    const start = definition.scope === 'calendar-week' ? weekStart : addDaysISO(end, -27);
    const evidence = within(records, start, end);
    return { key: weekStart, weekStart, weekEnd, value: aggregate(definition.id, evidence, records, end), evidence };
  });
}

export function formatStrengthMetricValue(definition, value, state) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const unit = state?.settings?.weightUnit || 'kg';
  if (definition.unit === 'weight-volume') return `${Math.round(number).toLocaleString()} ${unit}`;
  if (definition.unit === 'percent') return `${number > 0 ? '+' : ''}${Math.round(number)}%`;
  if (definition.unit === 'set-credits') return `${number.toFixed(number % 1 ? 1 : 0)} credits`;
  return String(Math.round(number));
}

export function buildStrengthMetricDetail(state, metricId, options = {}) {
  const definition = strengthMetricById(metricId);
  if (!definition) return null;
  const history = options.history || collectStrengthHistory(state, options);
  const records = history.records || [];
  const today = history.throughDate || localDayKey(options.today || todayKey(options.tz), options.tz);
  const period = periodFor(definition, today);
  const currentRecords = within(records, period.start, period.end);
  const value = aggregate(definition.id, currentRecords, records, period.end);
  let previous = null;
  if (definition.scope === 'calendar-week') {
    const elapsed = Math.max(0, Math.min(6, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${period.start}T12:00:00Z`)) / 86400000)));
    const start = addDaysISO(period.start, -7);
    const end = addDaysISO(start, elapsed);
    const hasPreviousHistory = records.some((record) => record.date < period.start);
    previous = { start, end, value: hasPreviousHistory ? aggregate(definition.id, within(records, start, end), records, end) : null, live: true };
  } else if (definition.id === 'strength.four-week-volume') {
    const end = addDaysISO(period.start, -1);
    const start = addDaysISO(end, -27);
    const hasPreviousHistory = records.some((record) => record.date < period.start);
    previous = { start, end, value: hasPreviousHistory ? aggregate(definition.id, within(records, start, end), records, end) : null, live: false };
  }
  const compared = previous && value != null
    ? comparePeriodValues({ currentValue: Number(value), previousValue: previous.value == null ? null : Number(previous.value), isCurrentWeek: previous.live })
    : null;
  const comparison = compared && previous
    ? {
      ...compared,
      comparisonLabel: previous.live ? compared.comparisonLabel : 'vs previous 28 days',
      previousStart: previous.start,
      previousEnd: previous.end,
      favorable: null,
    }
    : null;
  const range = STRENGTH_RANGE_OPTIONS.some((entry) => entry.id === options.range) ? options.range : '12w';
  const series = seriesFor(definition, records, range, today).map((point) => ({
    ...point, formatted: formatStrengthMetricValue(definition, point.value, state),
  }));
  const hasEvidence = currentRecords.length > 0;
  const empty = value == null || (!hasEvidence && Number(value) === 0);
  let interpretation = `${currentRecords.length} contributing strength ${currentRecords.length === 1 ? 'workout' : 'workouts'} in the current scope.`;
  if (definition.id === 'strength.volume-progression' && value != null) {
    interpretation = Math.abs(value) < 2 ? 'Trailing 28-day tonnage is broadly unchanged.' : value > 0
      ? 'Trailing 28-day tonnage is higher than the preceding 28 days.'
      : 'Trailing 28-day tonnage is lower than the preceding 28 days.';
  }
  return {
    definition, metricId, range, rangeOptions: STRENGTH_RANGE_OPTIONS, value,
    formattedValue: empty ? '—' : formatStrengthMetricValue(definition, value, state),
    period, comparison, series, contributing: currentRecords, empty,
    interpretation: empty ? definition.empty : interpretation,
    exclusions: history.exclusions, recordCount: records.length,
  };
}
