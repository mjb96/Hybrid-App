// @ts-check
// =============================================================================
// RUN SESSION IDENTITY (js/state/run-sessions.js)
//
// Legacy Helyx state stores one run at `week.runs[day]`. That object remains the
// editable cockpit projection for backward compatibility, while the canonical
// history now lives at `week.runSessions[day]` as an appendable list. Every
// session has a stable `sessionId`, so two runs on the same calendar day do not
// overwrite each other and a GPS route can point at the exact session.
// =============================================================================

const RUN_VALUE_KEYS = [
  'dist', 'time', 'rpe', 'pace', 'avgHR', 'maxHR', 'elev', 'descent', 'cals',
  'avgCadence', 'trainingEffect', 'aerobicTE', 'hrZones', 'splits', 'notes',
];

/** True when a run object carries user/imported activity rather than scaffold. */
export function hasRunData(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return false;
  return RUN_VALUE_KEYS.some((key) => {
    const value = run[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== '' && value != null;
  });
}

/** Collision-resistant id for one run/walk session. */
export function newRunSessionId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `run_${crypto.randomUUID()}`;
    }
  } catch (_) { /* fall through */ }
  const rand = Math.random().toString(36).slice(2, 10);
  return `run_${Date.now().toString(36)}_${rand}`;
}

/** Deterministic identity used when adopting one legacy week/day run object. */
export function legacyRunSessionId(activationId, weekKey, day) {
  return `run_legacy_${encodeURIComponent(activationId || 'legacy')}_${encodeURIComponent(String(weekKey))}_${day}`;
}

function finiteTs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalize one session without dropping imported metrics. */
export function normalizeRunSession(run, meta = {}) {
  const source = run && typeof run === 'object' && !Array.isArray(run) ? run : {};
  const now = finiteTs(meta.updatedTs ?? source.updatedTs) || Date.now();
  const sessionId = String(meta.sessionId || source.sessionId || newRunSessionId());
  return {
    ...source,
    sessionId,
    source: meta.source || source.source || 'manual',
    localDate: meta.localDate || source.localDate || null,
    startTs: finiteTs(meta.startTs ?? source.startTs),
    updatedTs: now,
  };
}

/** Return the canonical sessions for a day, falling back to one legacy object. */
export function runSessionsForDay(week, day) {
  const stored = week?.runSessions?.[day];
  if (Array.isArray(stored)) return stored.filter(hasRunData);
  const legacy = week?.runs?.[day];
  return hasRunData(legacy) ? [legacy] : [];
}

/** Latest editable session for the cockpit/recap compatibility projection. */
export function latestRunSession(week, day) {
  const sessions = runSessionsForDay(week, day);
  let latest = null;
  for (let i = 0; i < sessions.length; i++) {
    const candidate = sessions[i];
    const candidateTs = finiteTs(candidate.updatedTs) || finiteTs(candidate.startTs) || i + 1;
    const latestTs = latest && (finiteTs(latest.updatedTs) || finiteTs(latest.startTs));
    if (!latest || candidateTs >= (latestTs || 0)) latest = candidate;
  }
  return latest;
}

function ensureDayList(week, day, meta = {}) {
  if (!week.runSessions || typeof week.runSessions !== 'object') week.runSessions = {};
  if (!week.runs || typeof week.runs !== 'object') week.runs = {};
  if (!Array.isArray(week.runSessions[day])) {
    const legacy = week.runs[day];
    week.runSessions[day] = hasRunData(legacy)
      ? [normalizeRunSession(legacy, {
          sessionId: legacy.sessionId || meta.legacySessionId,
          source: legacy.source || 'legacy',
          localDate: legacy.localDate || meta.localDate,
          startTs: legacy.startTs,
          updatedTs: legacy.updatedTs,
        })]
      : [];
  }
  return week.runSessions[day];
}

function syncProjection(week, day) {
  const latest = latestRunSession(week, day);
  week.runs[day] = latest ? { ...latest } : { dist: '', time: '', rpe: '' };
}

/** Append a new session or update the exact sessionId, then refresh projection. */
export function upsertRunSession(week, day, run, meta = {}) {
  if (!week || typeof week !== 'object' || !day) return null;
  const list = ensureDayList(week, day, meta);
  const requestedId = String(meta.sessionId || run?.sessionId || newRunSessionId());
  const index = list.findIndex((entry) => entry?.sessionId === requestedId);
  const existing = index >= 0 ? list[index] : null;
  const normalized = normalizeRunSession({ ...(existing || {}), ...(run || {}) }, {
    sessionId: requestedId,
    source: meta.source || run?.source || existing?.source,
    localDate: meta.localDate || run?.localDate || existing?.localDate,
    startTs: meta.startTs ?? run?.startTs ?? existing?.startTs,
    updatedTs: meta.updatedTs ?? run?.updatedTs,
  });
  if (index >= 0) {
    list[index] = normalized;
  } else {
    list.push(normalized);
  }
  syncProjection(week, day);
  return index >= 0 ? list[index] : list[list.length - 1];
}

/** Remove one exact session, or every run session for the day when id is absent. */
export function clearRunSessions(week, day, sessionId = null) {
  if (!week || typeof week !== 'object' || !day) return 0;
  const list = ensureDayList(week, day);
  const before = list.length;
  week.runSessions[day] = sessionId
    ? list.filter((entry) => entry?.sessionId !== sessionId)
    : [];
  syncProjection(week, day);
  return before - week.runSessions[day].length;
}

function parseDurationSeconds(value) {
  if (value == null || value === '') return 0;
  const parts = String(value).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return (parts[0] || 0) * 60;
}

function formatDurationSeconds(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Aggregate all same-day sessions for analytics without changing cockpit state. */
export function runDaySummary(week, day) {
  const sessions = runSessionsForDay(week, day);
  if (!sessions.length) return {};
  const latest = latestRunSession(week, day) || {};
  let dist = 0, seconds = 0, elev = 0, descent = 0, cals = 0;
  let weightedRpe = 0, weightedRpeMinutes = 0, rpeSum = 0, rpeCount = 0;
  let weightedHr = 0, weightedHrSeconds = 0, hrSum = 0, hrCount = 0, maxHR = 0;
  const hrZones = [0, 0, 0, 0, 0];
  for (const session of sessions) {
    const sessionSeconds = parseDurationSeconds(session.time);
    const rpe = parseFloat(session.rpe) || 0;
    const avgHR = parseFloat(session.avgHR) || 0;
    dist += parseFloat(session.dist) || 0;
    seconds += sessionSeconds;
    elev += parseFloat(session.elev) || 0;
    descent += parseFloat(session.descent) || 0;
    cals += parseFloat(session.cals) || 0;
    maxHR = Math.max(maxHR, parseFloat(session.maxHR) || 0);
    if (rpe > 0) {
      rpeSum += rpe; rpeCount++;
      if (sessionSeconds > 0) { weightedRpe += rpe * sessionSeconds; weightedRpeMinutes += sessionSeconds; }
    }
    if (avgHR > 0) {
      hrSum += avgHR; hrCount++;
      if (sessionSeconds > 0) { weightedHr += avgHR * sessionSeconds; weightedHrSeconds += sessionSeconds; }
    }
    if (Array.isArray(session.hrZones)) {
      session.hrZones.forEach((value, i) => { if (i < 5) hrZones[i] += parseFloat(value) || 0; });
    }
  }
  return {
    ...latest,
    dist,
    time: seconds > 0 ? formatDurationSeconds(seconds) : '',
    rpe: weightedRpeMinutes > 0 ? weightedRpe / weightedRpeMinutes : (rpeCount ? rpeSum / rpeCount : ''),
    avgHR: weightedHrSeconds > 0 ? weightedHr / weightedHrSeconds : (hrCount ? hrSum / hrCount : ''),
    maxHR: maxHR || '',
    elev: elev || '',
    descent: descent || '',
    cals: cals || '',
    hrZones: hrZones.some(Boolean) ? hrZones : null,
    type: sessions.every((session) => session.type === 'walk') ? 'walk' : 'run',
    sessionCount: sessions.length,
  };
}

/** Exact same-day running sRPE; never averages two sessions into one load. */
export function runLoadForDay(week, day) {
  return runSessionsForDay(week, day).reduce((total, session) => {
    const rpe = parseFloat(session.rpe) || 0;
    const minutes = parseDurationSeconds(session.time) / 60;
    return total + (rpe > 0 && minutes > 0 ? rpe * minutes : 0);
  }, 0);
}

/** Adopt legacy `runs[day]` objects into stable, deterministic sessions. */
export function migrateLegacyRunSessions(state, days) {
  let migrated = 0;
  for (const weekKey of Object.keys(state?.weeks || {})) {
    const week = state.weeks[weekKey];
    if (!week || typeof week !== 'object') continue;
    if (!week.runSessions || typeof week.runSessions !== 'object') week.runSessions = {};
    for (const day of days) {
      const legacy = week.runs?.[day];
      const deterministicId = legacyRunSessionId(week.activationId, weekKey, day);
      const stored = week.runSessions[day];

      if (Array.isArray(stored)) {
        const seen = new Set();
        let changed = false;
        week.runSessions[day] = stored.map((entry, index) => {
          if (!hasRunData(entry)) return entry;
          let sessionId = typeof entry.sessionId === 'string' && entry.sessionId
            ? entry.sessionId
            : deterministicId;
          if (seen.has(sessionId)) sessionId = `${deterministicId}_${index + 1}`;
          while (seen.has(sessionId)) sessionId += '_dup';
          seen.add(sessionId);
          if (entry.sessionId === sessionId) return entry;
          changed = true;
          migrated++;
          return normalizeRunSession(entry, {
            sessionId,
            source: entry.source || 'legacy',
            localDate: entry.localDate || week.dates?.[day] || null,
            startTs: entry.startTs,
            updatedTs: entry.updatedTs || 1,
          });
        });

        // A prematurely-created empty canonical list must not hide real legacy
        // data. Adopt it exactly once, using the same deterministic identity.
        if (!week.runSessions[day].some(hasRunData) && hasRunData(legacy)) {
          week.runSessions[day].push(normalizeRunSession(legacy, {
            sessionId: legacy.sessionId || deterministicId,
            source: legacy.source || 'legacy',
            localDate: legacy.localDate || week.dates?.[day] || null,
            startTs: legacy.startTs,
            updatedTs: legacy.updatedTs || 1,
          }));
          changed = true;
          migrated++;
        }
        if (changed) {
          if (!week.runs || typeof week.runs !== 'object') week.runs = {};
          syncProjection(week, day);
        }
        continue;
      }

      if (!hasRunData(legacy)) { week.runSessions[day] = []; continue; }
      const session = normalizeRunSession(legacy, {
        sessionId: legacy.sessionId || deterministicId,
        source: legacy.source || 'legacy',
        localDate: legacy.localDate || week.dates?.[day] || null,
        startTs: legacy.startTs,
        updatedTs: legacy.updatedTs || 1,
      });
      week.runSessions[day] = [session];
      if (!week.runs || typeof week.runs !== 'object') week.runs = {};
      week.runs[day] = { ...session };
      migrated++;
    }
  }
  return migrated;
}
