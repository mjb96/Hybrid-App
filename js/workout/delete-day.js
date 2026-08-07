// @ts-check
import { clearRunSessions, hasRunData } from '../state/run-sessions.js';
import { clearSessionStatus, explicitSessionStatus, SESSION_STATUS } from './session-status.js';
import { isCompletedSet } from '../set-utils.js';

const hasCompletedSet = (sets) => Array.isArray(sets) && sets.some(isCompletedSet);

const hasUnfinishedEditedSet = (sets) => Array.isArray(sets) && sets.some((set) =>
  set && !hasCompletedSet([set]) && (
    String(set.w ?? '').trim() || String(set.r ?? '').trim() || set.type ||
    set.rpe != null || set.rir != null || set.bw || set.band || set.loadMode
  )
);

/** Any user-entered workout draft, including an unchecked weight/rep edit. */
export function hasDayWorkoutDraft(week, day) {
  if (!week || typeof week !== 'object' || !day) return false;
  if (explicitSessionStatus(week, day) === SESSION_STATUS.FINISHED) return false;
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
/**
 * Every per-day field `deleteDayWorkoutData` overwrites, deep-cloned.
 *
 * Kept beside the delete so the two can never fall out of step: a field added to
 * the clear list but not to this snapshot would be silently unrecoverable, which
 * is the worst possible way for an Undo to fail — it would look like it worked.
 *
 * @returns {any} an opaque snapshot for `restoreDayWorkoutData`
 */
export function snapshotDayWorkoutData(week, day) {
  if (!week || typeof week !== 'object' || !day) return null;
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  return {
    day,
    lifts: clone(week.lifts?.[day]),
    liftOrder: clone(week.liftOrder?.[day]),
    liftMeta: clone(week.liftMeta?.[day]),
    notes: clone(week.notes?.[day]),
    gymRpe: clone(week.gymRpe?.[day]),
    gymStats: clone(week.gymStats?.[day]),
    runSessions: clone(week.runSessions?.[day]),
    runs: clone(week.runs?.[day]),
    sessionStatus: clone(week.sessionStatus?.[day]),
    sessionSummary: clone(week.sessionSummary?.[day]),
  };
}

/**
 * Put a snapshot back exactly as it was. A field that was absent before is
 * deleted rather than written as undefined, so a restore cannot leave a key the
 * original state never had.
 */
export function restoreDayWorkoutData(week, snapshot) {
  if (!week || typeof week !== 'object' || !snapshot?.day) return false;
  const day = snapshot.day;
  const put = (bucket, value) => {
    if (value === undefined) {
      if (week[bucket] && typeof week[bucket] === 'object') delete week[bucket][day];
      return;
    }
    if (!week[bucket] || typeof week[bucket] !== 'object') week[bucket] = {};
    week[bucket][day] = value;
  };
  put('lifts', snapshot.lifts);
  put('liftOrder', snapshot.liftOrder);
  put('liftMeta', snapshot.liftMeta);
  put('notes', snapshot.notes);
  put('gymRpe', snapshot.gymRpe);
  put('gymStats', snapshot.gymStats);
  put('runSessions', snapshot.runSessions);
  put('runs', snapshot.runs);
  put('sessionStatus', snapshot.sessionStatus);
  put('sessionSummary', snapshot.sessionSummary);
  return true;
}

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
  clearSessionStatus(week, day);

  return hadData;
}
