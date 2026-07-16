// @ts-check
// =============================================================================
// ACTIVITY HISTORY MODEL
// One row per real activity. Strength and every run session remain independent,
// even when they share a calendar day.
// =============================================================================
import { isCompletedSet, isWarmupSet, setVolume } from '../set-utils.js';
import { runSessionsForDay } from '../state/run-sessions.js';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function dateStamp(localDate, startTs, fallbackIndex) {
  const explicit = Number(startTs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (localDate) {
    const parsed = Date.parse(`${localDate}T12:00:00`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackIndex;
}

function strengthSummary(week, day) {
  const lifts = week?.lifts?.[day] || {};
  let workingSets = 0;
  let totalReps = 0;
  let volume = 0;
  const exercises = [];
  for (const [name, sets] of Object.entries(lifts)) {
    if (!Array.isArray(sets)) continue;
    const done = sets.filter((set) => isCompletedSet(set) && !isWarmupSet(set));
    if (!done.length) continue;
    exercises.push(name);
    workingSets += done.length;
    for (const set of done) {
      totalReps += parseInt(set.r, 10) || 0;
      volume += setVolume(set);
    }
  }
  return { exercises, workingSets, totalReps, volume: Math.round(volume) };
}

export function hasStrengthActivity(week, day) {
  const summary = strengthSummary(week, day);
  if (summary.workingSets > 0) return true;
  const stats = week?.gymStats?.[day] || {};
  return !!String(week?.notes?.[day] || '').trim()
    || !!String(week?.gymRpe?.[day] || '').trim()
    || Object.values(stats).some((value) => value != null && String(value).trim() !== '');
}

function activityDateLabel(localDate) {
  if (!localDate) return 'Date unavailable';
  const parsed = new Date(`${localDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return localDate;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function runName(run) {
  if (String(run?.name || '').trim()) return String(run.name).trim();
  return run?.type === 'walk' ? 'Walk' : 'Run';
}

/**
 * Flatten persisted training into Garmin-style activity rows.
 * @param {any} state
 * @returns {Array<any>}
 */
export function buildActivityHistory(state) {
  const rows = [];
  let fallbackIndex = 0;
  for (const [weekKey, week] of Object.entries(state?.weeks || {})) {
    if (!week || typeof week !== 'object') continue;
    const days = new Set([
      ...DAY_ORDER,
      ...Object.keys(week.lifts || {}),
      ...Object.keys(week.runSessions || {}),
      ...Object.keys(week.runs || {}),
    ]);
    for (const day of days) {
      const localDate = week.dates?.[day] || null;
      if (hasStrengthActivity(week, day)) {
        const summary = strengthSummary(week, day);
        const duration = week.gymStats?.[day]?.time || '';
        rows.push({
          id: `strength:${encodeURIComponent(weekKey)}:${day}`,
          kind: 'strength', week: weekKey, day, sessionId: null,
          localDate, dateLabel: activityDateLabel(localDate),
          timestamp: dateStamp(localDate, null, ++fallbackIndex),
          title: 'Strength Workout',
          subtitle: summary.exercises.slice(0, 2).join(', ') + (summary.exercises.length > 2 ? ` +${summary.exercises.length - 2}` : ''),
          metrics: [
            summary.workingSets ? `${summary.workingSets} sets` : '',
            summary.volume ? `${summary.volume.toLocaleString()} ${state?.settings?.weightUnit || 'kg'}` : '',
            duration,
          ].filter(Boolean),
          ...summary,
        });
      }

      const sessions = runSessionsForDay(week, day);
      sessions.forEach((run, index) => {
        const dist = parseFloat(run.dist) || 0;
        const localRunDate = run.localDate || localDate;
        rows.push({
          id: `run:${run.sessionId || `${encodeURIComponent(weekKey)}:${day}:${index}`}`,
          kind: 'run', week: weekKey, day,
          sessionId: run.sessionId || null,
          localDate: localRunDate,
          dateLabel: activityDateLabel(localRunDate),
          timestamp: dateStamp(localRunDate, run.startTs || run.updatedTs, ++fallbackIndex),
          title: runName(run),
          subtitle: run.source === 'garmin' || run.source === 'fit' ? 'Imported activity' : run.source === 'gps' ? 'GPS activity' : 'Logged activity',
          metrics: [dist > 0 ? `${dist.toFixed(2)} km` : '', run.time || '', run.pace ? `${run.pace} /km` : ''].filter(Boolean),
          run: { ...run },
        });
      });
    }
  }
  return rows.sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
}

export function filterActivityHistory(rows, kind = 'all', localDate = null) {
  return (rows || []).filter((row) =>
    (kind === 'all' || row.kind === kind) && (!localDate || row.localDate === localDate)
  );
}
