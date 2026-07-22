// @ts-check
// =============================================================================
// EXERCISE HISTORY — one chronological, date-strict progression query.
//
// Storage is organised by program week/day, but progression belongs to an
// exercise across real sessions. This query therefore scans every stored week
// key (numeric, archived and one-off), attributes a performance only by its
// persisted local date, and resolves only explicit catalogue aliases. Unknown
// custom exercises retain exact-name identity. Dates are never invented.
// =============================================================================
import { localDayKey } from '../dates.js';
import { isValidWorkingSet } from '../set-utils.js';
import { canonicalExerciseId, exerciseStatForName } from '../exercises/catalog.js';
import { estimatedE1rmForSet, isE1rmExercise } from '../strength/e1rm.js';

export const EXERCISE_HISTORY_SCOPE = Object.freeze({
  ALL: 'all',
  ACTIVATION: 'activation',
  PROGRAM: 'program',
});

function explicitSessionTimestamp(week, day) {
  const candidates = [
    week?.gymStats?.[day]?.startedAt,
    week?.gymStats?.[day]?.startTs,
    week?.startedAt,
  ];
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function bestSet(exerciseName, sets) {
  let e1rm = 0, weight = 0, reps = 0;
  let fallbackWeight = 0, fallbackReps = 0;
  for (const set of sets) {
    const w = parseFloat(set?.w) || 0;
    const r = parseInt(set?.r, 10) || 0;
    if (w > fallbackWeight || (w === fallbackWeight && r > fallbackReps)) {
      fallbackWeight = w;
      fallbackReps = r;
    }
    const estimate = estimatedE1rmForSet(exerciseName, set);
    if (estimate > e1rm) {
      e1rm = estimate;
      weight = w;
      reps = r;
    }
  }
  return {
    e1rm,
    weight: e1rm > 0 ? weight : fallbackWeight,
    reps: e1rm > 0 ? reps : fallbackReps,
  };
}

function inScope(state, week, scope, activationId, programId) {
  if (scope === EXERCISE_HISTORY_SCOPE.ACTIVATION) {
    return !!activationId && week?.activationId === activationId;
  }
  if (scope === EXERCISE_HISTORY_SCOPE.PROGRAM) {
    return !!programId && week?.programId === programId;
  }
  return true;
}

/**
 * Return completed working-set performances for one exercise identity, newest
 * first. Explicit catalogue aliases merge; unknown custom names stay exact.
 * Same-day sessions use an explicit persisted start timestamp when one exists;
 * otherwise their storage identity provides a stable tie-break only.
 *
 * @param {any} state
 * @param {string} exerciseName
 * @param {{
 *   scope?: 'all'|'activation'|'program',
 *   activationId?: string|null,
 *   programId?: string|null,
 *   exclude?: {weekKey?:string|number, day?:string},
 *   beforeDate?: string|Date,
 *   days?: string[],
 * }} [options]
 */
export function exercisePerformanceHistory(state, exerciseName, options = {}) {
  if (typeof exerciseName !== 'string' || exerciseName === '') return [];
  const requestedId = canonicalExerciseId(exerciseName);
  const scope = options.scope || EXERCISE_HISTORY_SCOPE.ALL;
  const activationId = options.activationId ?? state?.activeActivationId ?? null;
  const programId = options.programId ?? state?.activeProgramId ?? null;
  const beforeDate = options.beforeDate ? localDayKey(options.beforeDate) : null;
  const excludedWeek = options.exclude?.weekKey == null ? null : String(options.exclude.weekKey);
  const excludedDay = options.exclude?.day;
  const dayFilter = Array.isArray(options.days) && options.days.length
    ? new Set(options.days)
    : null;
  const rows = [];

  for (const [weekKey, week] of Object.entries(state?.weeks || {})) {
    if (!week || typeof week !== 'object') continue;
    if (!inScope(state, week, scope, activationId, programId)) continue;
    const dayKeys = Object.keys(week.lifts || {});
    for (const day of dayKeys) {
      if (dayFilter && !dayFilter.has(day)) continue;
      if (weekKey === excludedWeek && (!excludedDay || day === excludedDay)) continue;
      const date = localDayKey(week.dates?.[day]);
      if (!date || (beforeDate && date > beforeDate)) continue;
      const matchingEntries = Object.entries(week.lifts?.[day] || {}).filter(([storedName, sets]) =>
        Array.isArray(sets) && (requestedId
          ? canonicalExerciseId(storedName) === requestedId
          : storedName === exerciseName)
      );
      if (!matchingEntries.length) continue;
      const sets = matchingEntries.flatMap(([, values]) => values);
      const workingSets = sets.filter(isValidWorkingSet);
      if (!workingSets.length) continue;
      const best = bestSet(exerciseName, workingSets);
      rows.push({
        exerciseName,
        canonicalExerciseId: requestedId,
        storedExerciseNames: matchingEntries.map(([storedName]) => storedName),
        weekKey,
        day,
        date,
        activationId: week.activationId || null,
        programId: week.programId || null,
        sessionId: week.sessionId || null,
        activityId: week.sessionId
          ? `strength:${week.sessionId}`
          : `strength:${encodeURIComponent(weekKey)}:${day}`,
        sessionTimestamp: explicitSessionTimestamp(week, day),
        workingSets,
        ...best,
      });
    }
  }

  return rows.sort((a, b) =>
    b.date.localeCompare(a.date)
    || (b.sessionTimestamp || 0) - (a.sessionTimestamp || 0)
    || `${b.weekKey}:${b.day}`.localeCompare(`${a.weekKey}:${a.day}`)
  );
}

/** Most recent eligible exact-name performance, or null. */
export function latestExercisePerformance(state, exerciseName, options = {}) {
  return exercisePerformanceHistory(state, exerciseName, options)[0] || null;
}

/**
 * One source for the workout logger's history line and per-set ghosts. Dated
 * history wins; a legacy aggregate stat still prevents a false "first time"
 * claim when the underlying session predates reliable date stamps.
 *
 * @param {any} state
 * @param {string} exerciseName
 * @param {{weekKey?:string|number, day?:string, beforeDate?:string|Date}} [options]
 */
export function exerciseLoggerHistory(state, exerciseName, options = {}) {
  const performances = exercisePerformanceHistory(state, exerciseName, {
    scope: EXERCISE_HISTORY_SCOPE.ALL,
    exclude: options.weekKey == null
      ? undefined
      : { weekKey: options.weekKey, day: options.day },
    beforeDate: options.beforeDate,
  });
  const latest = performances[0] || null;
  const aggregate = exerciseStatForName(state?.exerciseStats, exerciseName);
  const globalBestEstimated1RM = isE1rmExercise(exerciseName)
    ? (Number(aggregate?.allTimeMax) || 0)
    : 0;
  const datedBestEstimated1RM = Math.max(0, ...performances.map((row) => row.e1rm));
  return {
    latest,
    datedBestEstimated1RM,
    globalBestEstimated1RM,
    hasHistory: !!latest || globalBestEstimated1RM > 0,
  };
}
