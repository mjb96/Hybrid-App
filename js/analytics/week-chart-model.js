// @ts-check
// =============================================================================
// WEEK CHART MODEL — analytics/week-chart-model.js
//
// The SINGLE source of truth for the home-screen "In Focus" weekly bar graph.
// Pure, DOM-free, and side-effect-free so it is unit-testable and cheap.
//
// It reads the SAME stored structures the analytics detail views read
// (`state.weeks[N].lifts` / `.runs` / `.gymStats` / `.dates`) and reuses the
// canonical set predicates from set-utils, so the graph can never diverge from
// the numbers a detail view shows.
//
// A Helyx "week" is program-week N (state.weeks["N"]), whose day keys mon..sun
// are anchored to real calendar dates via `weeks[N].dates`. That IS a Monday-
// first calendar week in local time — the whole app is built on it — so this
// model works within that architecture rather than inventing a parallel one.
//
// Comparison rules (deliberate + clearly labelled):
//   • Current week  → "live" comparison: this week's ELAPSED days (Mon..today)
//     vs the SAME elapsed days of the previous week. Label: "vs same point last
//     week". Never compares a partial week against a full previous week.
//   • Past week     → "completed" comparison: the full selected week vs the full
//     week immediately before it. Label: "vs previous week".
//   • No previous week, or a zero denominator → NOT reported as a percentage
//     (no Infinity / NaN); an honest message is returned instead.
// =============================================================================
import { isCompletedSet, isWarmupSet, setVolume } from '../set-utils.js';
import { comparisonLabel } from './comparison.js';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };
const DAY_FULL  = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

// ---- metric catalogue -------------------------------------------------------
// Each metric knows how to extract its per-day value from a week's stored data.
// `unit` is a formatting hint consumed by the view (which resolves user units).

/** @type {Record<string, {key:string,label:string,short:string,unit:string,decimals?:number}>} */
export const STRENGTH_METRICS = {
  sets:     { key: 'sets',     label: 'Working Sets', short: 'Sets',   unit: 'sets' },
  volume:   { key: 'volume',   label: 'Volume',       short: 'Volume', unit: 'weight' },
  duration: { key: 'duration', label: 'Time',         short: 'Time',   unit: 'duration' },
};

/** @type {Record<string, {key:string,label:string,short:string,unit:string,decimals?:number}>} */
export const RUNNING_METRICS = {
  distance: { key: 'distance', label: 'Distance', short: 'Dist', unit: 'distance', decimals: 1 },
  duration: { key: 'duration', label: 'Time',     short: 'Time', unit: 'duration' },
};

// ---- small pure helpers -----------------------------------------------------

// Parse "MM:SS" / "HH:MM:SS" (or a bare seconds number) to whole seconds.
export function parseDurationSecs(str) {
  if (str == null || str === '') return 0;
  const parts = String(str).split(':').map(Number);
  if (parts.some(n => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseInt(String(str), 10) || 0;
}

// Count completed WORKING sets (warm-ups + incomplete excluded) in a day's lifts.
function countWorkingSets(dayLifts) {
  let n = 0;
  for (const lift in (dayLifts || {})) {
    const sets = dayLifts[lift];
    if (!Array.isArray(sets)) continue;
    for (const s of sets) if (isCompletedSet(s) && !isWarmupSet(s)) n++;
  }
  return n;
}

// Sum completed working-set tonnage (weight × reps), warm-ups excluded.
// Kept local (not imported from set-utils dayVolume) only so the loop can also
// report whether any working set existed; the numeric result is identical.
function dayTonnage(dayLifts) {
  let vol = 0;
  for (const lift in (dayLifts || {})) {
    const sets = dayLifts[lift];
    if (!Array.isArray(sets)) continue;
    for (const s of sets) if (isCompletedSet(s) && !isWarmupSet(s)) vol += setVolume(s);
  }
  return vol;
}

// ---- per-day extraction -----------------------------------------------------

// Returns { value, activityCount, hasData } for one day + metric.
function dayCell(weekData, dayKey, type, metric) {
  if (type === 'strength') {
    const lifts = weekData?.lifts?.[dayKey] || {};
    const gs    = weekData?.gymStats?.[dayKey];
    const sets  = countWorkingSets(lifts);
    const gymDurationSecs = gs ? parseDurationSecs(gs.time) : 0;
    // A day "has a session" if any working set was logged OR imported FIT stats
    // carry a real duration — so the bar honestly reflects a trained day even
    // when the chosen metric happens to be 0 for it.
    const hasData = sets > 0 || gymDurationSecs > 0;
    let value = 0;
    if (metric === 'sets')          value = sets;
    else if (metric === 'volume')   value = dayTonnage(lifts);
    else if (metric === 'duration') value = gymDurationSecs;
    return { value, activityCount: hasData ? 1 : 0, hasData };
  }
  // running
  const run  = weekData?.runs?.[dayKey];
  const dist = parseFloat(run?.dist) || 0;
  const secs = parseDurationSecs(run?.time);
  const hasData = !!run && (dist > 0 || secs > 0);
  let value = 0;
  if (metric === 'distance')      value = dist;      // km (canonical)
  else if (metric === 'duration') value = secs;      // seconds
  return { value, activityCount: hasData ? 1 : 0, hasData };
}

// ---- main builder -----------------------------------------------------------

/**
 * Build the week-chart model for the In Focus graph.
 * @param {object} state          appState (reads state.weeks / state.currentWeek)
 * @param {object} [opts]
 * @param {'strength'|'running'} [opts.type='strength']
 * @param {string} [opts.metric]  metric key; defaults to the type's first metric
 * @param {number} [opts.weekOffset=0]  0 = current program week, -1 = previous, …
 * @param {string} [opts.today]   'YYYY-MM-DD' local today (injected for tests)
 * @returns {object} week-chart model (see file header for shape)
 */
export function buildWeekChart(state, opts = {}) {
  const type   = opts.type === 'running' ? 'running' : 'strength';
  const catalog = type === 'strength' ? STRENGTH_METRICS : RUNNING_METRICS;
  const metric = (opts.metric && catalog[opts.metric]) ? opts.metric : Object.keys(catalog)[0];
  const weekOffset = opts.weekOffset || 0;
  const today = opts.today || todayLocalKey();

  const weeks = state?.weeks || {};
  const currentWeekNum = parseInt(state?.currentWeek, 10) || 1;
  const weekNum = Math.max(1, currentWeekNum + weekOffset);
  const isCurrentWeek = weekNum === currentWeekNum;

  const weekData = weeks[String(weekNum)];
  const prevWeekData = weeks[String(weekNum - 1)];
  const dates = weekData?.dates || {};

  // Build the 7 day cells.
  const days = DAY_KEYS.map(dayKey => {
    const cell = dayCell(weekData, dayKey, type, metric);
    const date = dates[dayKey] || null;
    return {
      dayKey,
      date,
      dayLabel: DAY_SHORT[dayKey],
      dayFull:  DAY_FULL[dayKey],
      value:    cell.value,
      activityCount: cell.activityCount,
      hasData:  cell.hasData,
      isToday:  !!date && date === today,
      isFuture: !!date && date > today,
    };
  });

  const total = days.reduce((s, d) => s + d.value, 0);

  // Elapsed portion of the CURRENT week: days whose date is on/before today.
  // When dates are missing (older data), fall back to "every day that has data"
  // so the comparison still lines up sensibly.
  const elapsedKeys = isCurrentWeek
    ? DAY_KEYS.filter((dayKey, i) => {
        const date = days[i].date;
        if (date) return date <= today;
        return days[i].hasData;
      })
    : DAY_KEYS;

  const elapsedTotal = isCurrentWeek
    ? days.reduce((s, d) => s + (elapsedKeys.includes(d.dayKey) ? d.value : 0), 0)
    : total;

  const comparison = buildComparison({
    type, metric, isCurrentWeek,
    currentValue: isCurrentWeek ? elapsedTotal : total,
    prevWeekData, elapsedKeys,
  });

  const nonNullDates = days.map(d => d.date).filter(Boolean).sort();

  return {
    type,
    metric,
    metricInfo: catalog[metric],
    weekNum,
    weekKey: `W${weekNum}`,
    isCurrentWeek,
    startDate: nonNullDates[0] || null,
    endDate:   nonNullDates[nonNullDates.length - 1] || null,
    days,
    total,
    elapsedTotal,
    comparison,
  };
}

// ---- comparison -------------------------------------------------------------

function buildComparison({ type, metric, isCurrentWeek, currentValue, prevWeekData, elapsedKeys }) {
  const kind = isCurrentWeek ? 'live' : 'completed';
  const label = comparisonLabel(isCurrentWeek);

  // No previous week at all → nothing honest to compare against.
  if (!prevWeekData) {
    return {
      type: kind,
      previousTotal: null,
      absoluteChange: null,
      percentageChange: null,
      direction: 'none',
      comparisonLabel: label,
      isComparable: false,
      message: 'Not enough previous data to compare',
    };
  }

  const keys = isCurrentWeek ? elapsedKeys : DAY_KEYS;
  const previousTotal = keys.reduce(
    (s, dayKey) => s + dayCell(prevWeekData, dayKey, type, metric).value, 0,
  );

  const absoluteChange = currentValue - previousTotal;
  const direction = absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat';

  // Zero denominator: a percentage would be Infinity/undefined — report honestly.
  if (previousTotal === 0) {
    if (currentValue === 0) {
      return {
        type: kind, previousTotal: 0, absoluteChange: 0,
        percentageChange: null, direction: 'flat',
        comparisonLabel: label, isComparable: false,
        message: 'No activity to compare',
      };
    }
    return {
      type: kind, previousTotal: 0, absoluteChange,
      percentageChange: null, direction: 'up',
      comparisonLabel: label, isComparable: false,
      message: isCurrentWeek ? 'None at this point last week' : 'None last week',
    };
  }

  const percentageChange = Math.round((absoluteChange / previousTotal) * 100);
  return {
    type: kind,
    previousTotal,
    absoluteChange,
    percentageChange,
    direction,
    comparisonLabel: label,
    isComparable: true,
    message: null,
  };
}

// ---- today key (local) ------------------------------------------------------
// Mirrors dates.js todayKey but inlined so this module stays a leaf with no
// dependency on the display-timezone helpers (tests inject `today` directly).
function todayLocalKey() {
  try {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}
