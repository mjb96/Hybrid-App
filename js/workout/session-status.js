// @ts-check
// Session lifecycle is separate from prescription adherence. A deliberately
// finished workout can contain skipped sets and still be finished.

export const SESSION_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  FINISHED: 'finished',
});

export function explicitSessionStatus(week, day) {
  const value = week?.sessionStatus?.[day];
  return value === SESSION_STATUS.FINISHED || value === SESSION_STATUS.IN_PROGRESS
    ? value
    : null;
}

/** Mark edited/new work resumable without reopening an already finished log. */
export function markSessionInProgress(week, day) {
  if (!week || typeof week !== 'object' || !day) return false;
  if (!week.sessionStatus || typeof week.sessionStatus !== 'object') week.sessionStatus = {};
  if (week.sessionStatus[day] === SESSION_STATUS.FINISHED) return false;
  week.sessionStatus[day] = SESSION_STATUS.IN_PROGRESS;
  return true;
}

/**
 * Persist a finished lifecycle record and a compact adherence snapshot.
 * Repeating the same finish is idempotent: `finishedAt` is retained.
 */
export function finishSession(week, day, completion, now = Date.now()) {
  if (!week || typeof week !== 'object' || !day || !completion?.anyLogged) {
    return { ok: false, alreadyFinished: false };
  }
  if (!week.sessionStatus || typeof week.sessionStatus !== 'object') week.sessionStatus = {};
  if (!week.sessionSummary || typeof week.sessionSummary !== 'object') week.sessionSummary = {};

  const alreadyFinished = week.sessionStatus[day] === SESSION_STATUS.FINISHED;
  const prior = week.sessionSummary[day] || {};
  const plannedSets = Math.max(0, Number(completion.planned?.sets) || 0);
  const completedSets = Math.max(0, Number(completion.actual?.sets) || 0);
  week.sessionStatus[day] = SESSION_STATUS.FINISHED;
  week.sessionSummary[day] = {
    plannedSets,
    completedSets,
    skippedSets: Math.max(0, plannedSets - completedSets),
    plannedRun: !!completion.planned?.run,
    runLogged: !!completion.actual?.run,
    adherencePct: plannedSets > 0
      ? Math.min(100, Math.round((completedSets / plannedSets) * 100))
      : completion.actual?.run ? 100 : null,
    modified: !!completion.modified,
    finishedAt: prior.finishedAt || new Date(now).toISOString(),
  };
  return { ok: true, alreadyFinished };
}

export function clearSessionStatus(week, day) {
  if (week?.sessionStatus) delete week.sessionStatus[day];
  if (week?.sessionSummary) delete week.sessionSummary[day];
}
