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
// The week identity is the REAL calendar week, resolved via analytics/
// weekly-aggregate.js: every logged day is bucketed by its stamped `.dates[day]`
// into a Monday-based calendar week. It deliberately does NOT trust the
// program-week counter (`state.currentWeek`) as "this week" — that counter only
// advances on an explicit step, so a frozen program week used to attribute a
// PRIOR calendar week's training to "this week" (the bug this model now fixes).
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
import { isValidWorkingSet, setVolume } from '../set-utils.js';
import { comparePeriodValues } from './period-comparison.js';
import { collectCalendarWeek, indexSlotsByDate, weekStartOf, addDaysISO, localDayKey } from './weekly-aggregate.js';
import { todayKey } from '../dates.js';

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
    for (const s of sets) if (isValidWorkingSet(s)) n++;
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
    for (const s of sets) if (isValidWorkingSet(s)) vol += setVolume(s);
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
 * Build the week-chart model for the In Focus graph, keyed on the REAL CALENDAR
 * week (Monday-based) rather than the program-week counter. `weekOffset` shifts
 * by whole calendar weeks from today's week, so offset 0 is always the actual
 * current calendar week — an empty current week is genuinely empty, and stale
 * program-week data can no longer masquerade as "this week".
 * @param {object} state          appState (reads state.weeks; program week is NOT used)
 * @param {object} [opts]
 * @param {'strength'|'running'} [opts.type='strength']
 * @param {string} [opts.metric]  metric key; defaults to the type's first metric
 * @param {number} [opts.weekOffset=0]  0 = current calendar week, -1 = previous, …
 * @param {string} [opts.today]   'YYYY-MM-DD' local today (injected for tests)
 * @param {string} [opts.tz]      IANA tz for timestamp→day resolution (tests)
 * @returns {object} week-chart model (see file header for shape)
 */
export function buildWeekChart(state, opts = {}) {
  const type   = opts.type === 'running' ? 'running' : 'strength';
  const catalog = type === 'strength' ? STRENGTH_METRICS : RUNNING_METRICS;
  const metric = (opts.metric && catalog[opts.metric]) ? opts.metric : Object.keys(catalog)[0];
  const weekOffset = opts.weekOffset || 0;
  const today = opts.today || todayLocalKey();

  const currentMonday = weekStartOf(today);
  const targetMonday  = addDaysISO(currentMonday, weekOffset * 7);
  const isCurrentWeek = weekOffset === 0;

  // Bucket every logged day by its real stamped date, then assemble THIS
  // calendar week and the one before it from those buckets (synthetic weekData
  // objects the existing per-day extraction consumes unchanged).
  const index = indexSlotsByDate(state, { tz: opts.tz });
  const weekData     = collectCalendarWeek(state, targetMonday, { index });
  const prevWeekData = collectCalendarWeek(state, addDaysISO(targetMonday, -7), { index });
  const dates = weekData.dates;

  // Any logged activity strictly before this week's Monday? Gates both the
  // comparison (the very first week has nothing honest to compare to) and
  // whether "previous week" navigation should be offered.
  let earliestDate = null;
  for (const date of index.byDate.keys()) {
    if (earliestDate === null || date < earliestDate) earliestDate = date;
  }
  const hasOlderData = !!earliestDate && earliestDate < targetMonday;

  // Build the 7 day cells against the REAL calendar dates of this week.
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
      hasFutureData: !!date && date > today && cell.hasData,
      futureValue: !!date && date > today ? cell.value : 0,
    };
  });

  // A future-stamped completed record is invalid evidence for a live period.
  // Keep its day visible (and marked future) but never include it in a current
  // week's bar, total, or comparison.
  if (isCurrentWeek) {
    days.forEach((day) => {
      if (!day.isFuture) return;
      day.value = 0;
      day.activityCount = 0;
      day.hasData = false;
    });
  }

  const total = days.reduce((s, d) => s + d.value, 0);

  // Elapsed portion of the CURRENT week: days whose date is on/before today.
  const elapsedKeys = isCurrentWeek
    ? DAY_KEYS.filter((dayKey, i) => days[i].date <= today)
    : DAY_KEYS;

  const elapsedTotal = isCurrentWeek
    ? days.reduce((s, d) => s + (elapsedKeys.includes(d.dayKey) ? d.value : 0), 0)
    : total;

  const comparison = buildComparison({
    type, metric, isCurrentWeek,
    currentValue: isCurrentWeek ? elapsedTotal : total,
    prevWeekData: hasOlderData ? prevWeekData : null, elapsedKeys,
  });

  return {
    type,
    metric,
    metricInfo: catalog[metric],
    weekKey: targetMonday,
    weekStart: targetMonday,
    isCurrentWeek,
    // The label describes the REAL calendar week (Mon..Sun), never the range of
    // whatever activity happens to be present.
    startDate: targetMonday,
    endDate:   addDaysISO(targetMonday, 6),
    days,
    total,
    elapsedTotal,
    comparison,
    weekData,               // synthetic calendar week — the tap-to-detail modal reads this
    hasOlderData,
    canGoBack: !!earliestDate && targetMonday > earliestDate,
  };
}

// ---- comparison -------------------------------------------------------------

function buildComparison({ type, metric, isCurrentWeek, currentValue, prevWeekData, elapsedKeys }) {
  const keys = isCurrentWeek ? elapsedKeys : DAY_KEYS;
  const previousTotal = prevWeekData ? keys.reduce(
    (s, dayKey) => s + dayCell(prevWeekData, dayKey, type, metric).value, 0,
  ) : null;
  return comparePeriodValues({ currentValue, previousValue: previousTotal, isCurrentWeek });
}

// ---- today key (local) ------------------------------------------------------
const todayLocalKey = () => todayKey();
