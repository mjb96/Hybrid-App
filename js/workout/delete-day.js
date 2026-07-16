// @ts-check
import { clearRunSessions, hasRunData } from '../state/run-sessions.js';

const hasCompletedSet = (sets) => Array.isArray(sets) && sets.some((set) =>
  set && (set.c === true || set.c === 'true' || set.c === 'on' || set.c === 1)
);

const hasUnfinishedEditedSet = (sets) => Array.isArray(sets) && sets.some((set) =>
  set && !hasCompletedSet([set]) && (
    String(set.w ?? '').trim() || String(set.r ?? '').trim() || set.type ||
    set.rpe != null || set.rir != null || set.bw || set.band || set.loadMode
  )
);

/** Any user-entered workout draft, including an unchecked weight/rep edit. */
export function hasDayWorkoutDraft(week, day) {
  if (!week || typeof week !== 'object' || !day) return false;
  const lifts = week.lifts?.[day] || {};
  const setGroups = Object.values(lifts);
  if (setGroups.some(hasUnfinishedEditedSet)) return true;

  // A partly ticked prescription is still in progress unless the athlete has
  // already confirmed a session duration in Finish Workout. A fully completed
  // or explicitly saved historical workout is resolved data, not a forever-
  // pending draft every time Programs is opened later.
  const hasCompleted = setGroups.some(hasCompletedSet);
  const hasIncompleteWorkingSet = setGroups.some((sets) => Array.isArray(sets) && sets.some((set) =>
    set && set.type !== 'W' && !hasCompletedSet([set])
  ));
  const savedDuration = !!String(week.gymStats?.[day]?.time || '').trim();
  if (hasCompleted && hasIncompleteWorkingSet && !savedDuration) return true;

  const run = week.runs?.[day];
  const hasRun = hasRunData(run);
  const runComplete = hasRun && (parseFloat(run.dist) || 0) > 0 && !!String(run.time || '').trim();
  if (hasRun && !runComplete) return true;

  const hasLooseMetadata = !!String(week.notes?.[day] || '').trim()
    || !!String(week.gymRpe?.[day] || '').trim()
    || Object.entries(week.gymStats?.[day] || {}).some(([key, value]) =>
      key !== 'time' && value != null && String(value).trim() !== ''
    );
  return !hasCompleted && !runComplete && hasLooseMetadata;
}

/**
 * Whether a slot contains workout data worth presenting as deletable. Body
 * weight is deliberately excluded: it is a daily measurement, not workout
 * content, and survives a workout deletion.
 * @param {any} week
 * @param {string} day
 */
export function hasDayWorkoutData(week, day) {
  if (!week || typeof week !== 'object' || !day) return false;
  const lifts = week.lifts?.[day] || {};
  return Object.values(lifts).some(hasCompletedSet) ||
    (Array.isArray(week.runSessions?.[day]) && week.runSessions[day].some(hasRunData)) ||
    hasRunData(week.runs?.[day]) ||
    !!String(week.notes?.[day] || '').trim() ||
    !!String(week.gymRpe?.[day] || '').trim() ||
    Object.values(week.gymStats?.[day] || {}).some((value) =>
      Array.isArray(value) ? value.length > 0 : value != null && String(value).trim() !== ''
    );
}

/**
 * Delete one exact day's workout content while preserving date attribution and
 * body-weight history. `replacement` lets an active program restore its blank
 * prescribed scaffold; historical/free-log slots can pass the empty default.
 * @param {any} week
 * @param {string} day
 * @param {{lifts?:Record<string, any[]>, liftOrder?:string[]}} [replacement]
 */
export function deleteDayWorkoutData(week, day, replacement = {}) {
  if (!week || typeof week !== 'object' || !day) return false;
  const hadData = hasDayWorkoutData(week, day);

  if (!week.lifts || typeof week.lifts !== 'object') week.lifts = {};
  if (!week.notes || typeof week.notes !== 'object') week.notes = {};
  if (!week.gymRpe || typeof week.gymRpe !== 'object') week.gymRpe = {};
  if (!week.gymStats || typeof week.gymStats !== 'object') week.gymStats = {};
  if (!week.liftMeta || typeof week.liftMeta !== 'object') week.liftMeta = {};
  if (!week.liftOrder || typeof week.liftOrder !== 'object') week.liftOrder = {};

  clearRunSessions(week, day);
  week.lifts[day] = { ...(replacement.lifts || {}) };
  week.liftOrder[day] = [...(replacement.liftOrder || [])];
  week.liftMeta[day] = {};
  week.notes[day] = '';
  week.gymRpe[day] = '';
  week.gymStats[day] = { time: '', avgHR: '', maxHR: '', cals: '' };

  return hadData;
}
