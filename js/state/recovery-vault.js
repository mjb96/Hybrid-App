// @ts-check
// =============================================================================
// SYNC RECOVERY VAULT
//
// The cloud store is a single last-write-wins JSON blob. Before this device is
// allowed to replace a newer cloud blob, retain that exact cloud state locally
// so an accidental conflict choice is reversible. This is deliberately a
// single rolling recovery point: bounded storage is more reliable than an
// unbounded journal in localStorage, and an empty candidate may never replace a
// useful snapshot.
// =============================================================================

export const CLOUD_OVERWRITE_BACKUP_KEY = 'hybrid_engine_v2_state_cloud_overwrite_backup';

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** Return true when the blob contains training history worth protecting. */
export function hasTrainingHistory(state) {
  return !!(state && typeof state === 'object' && state.weeks &&
    typeof state.weeks === 'object' && Object.keys(state.weeks).length > 0);
}

/** Small, non-sensitive summary for recovery copy and conflict UI. */
export function trainingStateSummary(state) {
  const summary = { weeks: 0, datedDays: 0, strengthDays: 0, runs: 0, latestDate: null };
  if (!hasTrainingHistory(state)) return summary;
  const seenDates = new Set();
  for (const week of Object.values(state.weeks)) {
    if (!week || typeof week !== 'object') continue;
    summary.weeks++;
    const dates = week.dates || {};
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      const date = typeof dates[day] === 'string' ? dates[day] : null;
      if (date) {
        seenDates.add(date);
        if (!summary.latestDate || date > summary.latestDate) summary.latestDate = date;
      }
      const lifts = week.lifts?.[day] || {};
      const hasStrength = Object.values(lifts).some((sets) => Array.isArray(sets) &&
        sets.some((set) => set && (set.c === true || set.c === 'true' || set.c === 'on' || set.c === 1)));
      if (hasStrength) summary.strengthDays++;
      const sessions = Array.isArray(week.runSessions?.[day])
        ? week.runSessions[day]
        : (week.runs?.[day] && (week.runs[day].dist || week.runs[day].time) ? [week.runs[day]] : []);
      summary.runs += sessions.filter((run) => run && (run.dist || run.time)).length;
    }
  }
  summary.datedDays = seenDates.size;
  return summary;
}

/**
 * Save the exact newer cloud blob before this device can overwrite it.
 * Returns false when no useful history exists or storage could not preserve it.
 */
export function snapshotCloudBeforeOverwrite(state, {
  serverUpdatedAt = null,
  storage = defaultStorage(),
  now = () => new Date().toISOString(),
} = {}) {
  if (!storage || !hasTrainingHistory(state)) return false;
  try {
    storage.setItem(CLOUD_OVERWRITE_BACKUP_KEY, JSON.stringify({
      savedAt: now(),
      serverUpdatedAt,
      source: 'cloud-before-device-overwrite',
      summary: trainingStateSummary(state),
      state,
    }));
    return true;
  } catch (error) {
    console.warn('Pre-overwrite cloud recovery snapshot failed:', error);
    return false;
  }
}

export function getCloudOverwriteBackup(storage = defaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLOUD_OVERWRITE_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && hasTrainingHistory(parsed.state) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearCloudOverwriteBackup(storage = defaultStorage()) {
  try { storage?.removeItem(CLOUD_OVERWRITE_BACKUP_KEY); } catch { /* best effort */ }
}
