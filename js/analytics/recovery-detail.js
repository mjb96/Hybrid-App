// @ts-check
// =============================================================================
// RECOVERY METRIC DETAIL MODEL (js/analytics/recovery-detail.js) — roadmap 3D
//
// Recovery was the only analytics domain with NO inspectable metrics: Running
// had 30 detail screens, Strength 3, Recovery zero. Every recovery number was
// `static` or `domain-only` in the inventory, so the Progress hub's Recovery
// card drilled into a screen where nothing could be examined.
//
// This gives sleep, HRV, resting HR, soreness, mood and readiness the same
// treatment the other domains already have: a dated series, an honest
// period comparison, exact contributing entries, and stated confidence.
//
// Two things this domain must get right that the others do not face:
//
//   1. LOWER IS BETTER for several metrics (resting HR, soreness, sleep debt).
//      Direction alone is meaningless, so each definition declares `inverse`
//      and the model reports whether a change is favourable rather than
//      leaving the view to guess.
//
//   2. SELF-REPORTED vs DEVICE-MEASURED. Sleep/mood/soreness are typed by the
//      athlete; HRV/resting HR come from Health Connect. Those deserve
//      different confidence language, and the detail says which it is instead
//      of presenting both as equally objective.
//
// PURE. No DOM, no state mutation.
// =============================================================================

import { addDaysISO, localDayKey, todayKey } from '../dates.js';
import { comparePeriodValues } from './period-comparison.js';

export const RECOVERY_RANGE_OPTIONS = Object.freeze([
  { id: '4w', label: '4 weeks' },
  { id: '12w', label: '12 weeks' },
  { id: '6m', label: '6 months' },
]);

const RANGE_DAYS = Object.freeze({ '4w': 28, '12w': 84, '6m': 182 });

/** Where a recovery reading comes from — this decides its confidence wording. */
export const SOURCE_KIND = Object.freeze({
  SELF: 'self-reported',
  DEVICE: 'device',
  DERIVED: 'derived',
});

const CONFIDENCE = Object.freeze({
  [SOURCE_KIND.SELF]: 'Self-reported — depends on you logging honestly and consistently.',
  [SOURCE_KIND.DEVICE]: 'Device-measured via Health Connect — accuracy depends on the wearable and its wear time.',
  [SOURCE_KIND.DERIVED]: 'Derived from your other logged signals; it is an estimate, not a measurement.',
});

function metric(id, label, unit, sourceKind, calculation, options = {}) {
  return Object.freeze({
    id,
    label,
    unit,                                   // 'hours'|'ms'|'bpm'|'score'|'rating'
    sourceKind,
    calculation,
    // True when a LOWER reading is the better one. Resting HR and soreness
    // both improve downwards; treating every rise as progress would invert
    // the meaning of half this domain.
    inverse: !!options.inverse,
    color: options.color || '#10b981',
    source: options.source || (sourceKind === SOURCE_KIND.DEVICE
      ? 'Health Connect daily readings'
      : 'Daily wellness check-ins'),
    confidence: CONFIDENCE[sourceKind],
    empty: options.empty || `Log ${label.toLowerCase()} to build its history.`,
    limitations: options.limitations || [],
    // Readings outside this range are almost certainly typos or bad syncs and
    // are excluded rather than allowed to distort a baseline.
    plausible: options.plausible || null,   // [min, max]
  });
}

export const RECOVERY_METRICS = Object.freeze([
  metric('recovery.sleep', 'Sleep', 'hours', SOURCE_KIND.SELF,
    'Mean logged sleep duration across the days in the selected period that have an entry. Days without an entry are skipped, never counted as zero.', {
      color: '#6366f1',
      plausible: [0.5, 18],
      limitations: ['Duration is not sleep quality; a long night of poor sleep still reads as a long night.'],
    }),
  metric('recovery.hrv', 'HRV', 'ms', SOURCE_KIND.DEVICE,
    'Mean heart-rate variability (RMSSD) across the days in the selected period with a reading.', {
      color: '#22d3ee',
      plausible: [1, 300],
      limitations: [
        'HRV is highly individual — your own trend matters, comparison with other people does not.',
        'Readings taken at inconsistent times of day are not comparable with each other.',
      ],
    }),
  metric('recovery.resting-hr', 'Resting Heart Rate', 'bpm', SOURCE_KIND.DEVICE,
    'Mean resting heart rate across the days in the selected period with a reading.', {
      color: '#f59e0b',
      inverse: true,
      plausible: [25, 140],
      limitations: ['A single elevated morning can reflect illness, alcohol or a late meal rather than training load.'],
    }),
  metric('recovery.soreness', 'Soreness', 'rating', SOURCE_KIND.SELF,
    'Mean self-rated soreness (1–5) across the days in the selected period with an entry.', {
      color: '#ef4444',
      inverse: true,
      plausible: [1, 5],
      limitations: ['Soreness is a poor proxy for adaptation — its absence does not mean a session was ineffective.'],
    }),
  metric('recovery.mood', 'Mood', 'rating', SOURCE_KIND.SELF,
    'Mean self-rated mood (1–5) across the days in the selected period with an entry.', {
      color: '#a855f7',
      plausible: [1, 5],
      limitations: ['Mood reflects far more than training; read it alongside the rest, not on its own.'],
    }),
]);

const METRIC_BY_ID = new Map(RECOVERY_METRICS.map((entry) => [entry.id, entry]));

/** @param {string} id */
export function recoveryMetricById(id) {
  return METRIC_BY_ID.get(String(id || '')) || null;
}

/** Read one metric's raw dated readings out of state, unfiltered. */
function rawReadings(state, definition) {
  const out = [];
  if (definition.sourceKind === SOURCE_KIND.SELF) {
    const field = { 'recovery.sleep': 'sleep', 'recovery.soreness': 'soreness', 'recovery.mood': 'mood' }[definition.id];
    for (const entry of Array.isArray(state?.wellnessLog) ? state.wellnessLog : []) {
      const value = Number(entry?.[field]);
      const date = localDayKey(entry?.date);
      if (!date || !Number.isFinite(value)) continue;
      out.push({ date, value, sourceLabel: 'Wellness check-in' });
    }
    return out;
  }
  const bucket = definition.id === 'recovery.hrv' ? state?.healthConnect?.hrv : state?.healthConnect?.restingHR;
  for (const entry of Array.isArray(bucket) ? bucket : []) {
    // Health Connect rows have used different value keys across versions.
    const value = Number(entry?.rmssd ?? entry?.bpm ?? entry?.value);
    const date = localDayKey(entry?.date);
    if (!date || !Number.isFinite(value)) continue;
    out.push({ date, value, sourceLabel: 'Health Connect' });
  }
  return out;
}

const mean = (rows) => (rows.length
  ? Math.round((rows.reduce((sum, row) => sum + row.value, 0) / rows.length) * 10) / 10
  : null);

/**
 * Build one recovery metric's detail model.
 *
 * @param {any} state
 * @param {string} metricId
 * @param {{range?:string, today?:string, tz?:string}} [options]
 */
export function buildRecoveryMetricDetail(state, metricId, options = {}) {
  const definition = recoveryMetricById(metricId);
  if (!definition) return null;

  const today = options.today || todayKey(options.tz);
  const range = RECOVERY_RANGE_OPTIONS.some((entry) => entry.id === options.range) ? options.range : '4w';
  const days = RANGE_DAYS[range];

  const raw = rawReadings(state, definition);

  // Exclusions, counted rather than silently dropped — the detail states them.
  const future = raw.filter((row) => row.date > today).length;
  const [lo, hi] = definition.plausible || [-Infinity, Infinity];
  const implausible = raw.filter((row) => row.date <= today && (row.value < lo || row.value > hi)).length;

  const usable = raw
    .filter((row) => row.date <= today && row.value >= lo && row.value <= hi)
    .sort((a, b) => a.date.localeCompare(b.date));

  const periodStart = /** @type {string} */ (addDaysISO(today, -(days - 1)));
  const previousEnd = /** @type {string} */ (addDaysISO(periodStart, -1));
  const previousStart = /** @type {string} */ (addDaysISO(previousEnd, -(days - 1)));

  const current = usable.filter((row) => row.date >= periodStart);
  const previous = usable.filter((row) => row.date >= previousStart && row.date <= previousEnd);

  const value = mean(current);
  const previousValue = mean(previous);

  const comparison = value != null
    ? {
      ...comparePeriodValues({
        currentValue: value,
        previousValue: previous.length ? previousValue : null,
        // Rolling windows are always full-vs-full, never elapsed-matched.
        isCurrentWeek: false,
      }),
      previousStart,
      previousEnd,
      // Direction alone does not say whether things improved: for resting HR
      // and soreness, down IS the good direction.
      favourable: previousValue == null || value === previousValue
        ? null
        : (definition.inverse ? value < previousValue : value > previousValue),
    }
    : null;

  return {
    definition,
    metricId: definition.id,
    range,
    rangeOptions: RECOVERY_RANGE_OPTIONS,
    value,
    period: { start: periodStart, end: today, label: `${days} days to ${today}` },
    comparison,
    // Oldest → newest, one point per real reading. No zero-filling: a day
    // without a reading is missing data, not a zero-hour night.
    series: current.map((row) => ({ key: row.date, date: row.date, value: row.value })),
    contributing: [...current].reverse(),
    readingCount: current.length,
    recordCount: usable.length,
    empty: value == null,
    exclusions: { future, implausible },
    interpretation: interpretationFor(definition, value, current.length, comparison),
  };
}

/**
 * One plain sentence. States the reading, then whether it moved in the
 * direction that counts as better FOR THIS METRIC, and never issues medical
 * advice or a training instruction.
 */
function interpretationFor(definition, value, count, comparison) {
  if (value == null) return definition.empty;
  if (count < 3) {
    return `Only ${count} reading${count === 1 ? '' : 's'} in this period — too few to read as a trend yet.`;
  }
  // Quote the SAME formatted value the headline shows. Using the raw mean here
  // printed "54.6 bpm" under a "55 bpm" headline — one number, two answers.
  const shown = formatRecoveryValue(definition, value);
  if (!comparison || !comparison.isComparable || comparison.favourable == null) {
    return `Averaging ${shown} across ${count} readings. No comparable previous period yet.`;
  }
  const direction = comparison.favourable ? 'better' : 'worse';
  return `Averaging ${shown} across ${count} readings — ${Math.abs(comparison.percentageChange)}% ${direction} than the previous period.`;
}

/** @param {any} definition */
export function unitWord(definition) {
  if (definition.unit === 'hours') return 'hours';
  if (definition.unit === 'ms') return 'ms';
  if (definition.unit === 'bpm') return 'bpm';
  return 'out of 5';
}

/** Format a recovery value for display. */
export function formatRecoveryValue(definition, value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (definition.unit === 'hours') return `${number.toFixed(1)} h`;
  if (definition.unit === 'ms') return `${Math.round(number)} ms`;
  if (definition.unit === 'bpm') return `${Math.round(number)} bpm`;
  return `${number.toFixed(1)} / 5`;
}
