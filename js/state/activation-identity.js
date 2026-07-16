// @ts-check
// =============================================================================
// PROGRAM ACTIVATION IDENTITY (js/state/activation-identity.js)
//
// Helyx stores logged training under `state.weeks["N"].lifts[dayKey]`, keyed
// ONLY by program-week number + weekday. Nothing in that key names the program
// run it belongs to, so two different programs — or two runs of the SAME program
// — that both touch "Week 1 / Monday" share one physical storage slot. When the
// user switched programs, the previous program's *logged* lifts stayed in that
// slot and were appended, with their DONE styling, underneath the new program's
// prescription (the "completed exercises from the previous program leak into the
// new workout" bug). Same-slot reuse would ALSO overwrite the previous run's
// stamped date once the new run logged over it — corrupting history.
//
// This module adds an explicit ACTIVATION IDENTITY: a stable id for one run of a
// program. Every active week is stamped with the activation that owns it, and a
// program switch/restart begins a NEW activation. Weeks owned by a previous
// activation are moved out of the numeric slots into namespaced ARCHIVE keys
// (`arch:<oldActivationId>:<weekNum>`) that live in the same `state.weeks` map:
//
//   • Date-bucketed / all-time analytics iterate every `state.weeks` entry and
//     attribute by the stamped date, so archived weeks STILL count toward
//     history, PRs, volume, the calendar, etc. — no data is lost.
//   • Program-week-indexed reads (`for (w=1; w<=maxWeek; w++)` on `weeks[String(w)]`)
//     and the week navigator (`1..totalWeeks`) only ever touch numeric keys, so
//     an archived run never appears in the ACTIVE program's weeks or workout.
//
// Pure — no DOM, no module state, unit-tested in tests/program_isolation.test.js.
// =============================================================================
import { runDaySummary } from './run-sessions.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ARCHIVE_PREFIX = 'arch:';

/** A short, collision-resistant id for one program run. */
export function newActivationId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `act_${Date.now().toString(36)}_${rand}`;
}

/** True for a namespaced archived-week key (a previous activation's stored week). */
export function isArchivedWeekKey(key) {
  return typeof key === 'string' && key.startsWith(ARCHIVE_PREFIX);
}

/** True for a live numeric program-week key ("1", "2", …). */
export function isNumericWeekKey(key) {
  return typeof key === 'string' && /^\d+$/.test(key);
}

/** Build the archive key for `weekNum` owned by `activationId`. */
export function archiveWeekKey(activationId, weekNum) {
  return `${ARCHIVE_PREFIX}${activationId || 'legacy'}:${weekNum}`;
}

function archivedWeekNumber(key) {
  const match = String(key || '').match(/:(\d+)(?:#\d+)?$/);
  return match ? match[1] : null;
}

/** Pick an archive key that doesn't clobber an existing archived slot. */
function uniqueArchiveKey(weeks, activationId, weekNum) {
  const base = archiveWeekKey(activationId, weekNum);
  if (!(base in weeks)) return base;
  let i = 2;
  while (`${base}#${i}` in weeks) i++;
  return `${base}#${i}`;
}

// A set counts as real, keepable history once it's completed or carries an
// entered weight (mirrors state.liftHasLoggedData / migrations.hasLoggedSets).
function setIsLogged(s) {
  return !!s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1 ||
    (s.w !== '' && s.w != null));
}

/**
 * Does a week object hold ANY history worth preserving — a completed/weighted
 * lift set, or a logged run/gym session? Pure scaffolding (prescribed-but-untouched
 * rows) returns false so an empty foreign week is dropped, not archived.
 * @param {any} week
 * @returns {boolean}
 */
export function weekHasLoggedData(week) {
  if (!week || typeof week !== 'object') return false;
  const lifts = week.lifts || {};
  for (const day of DAY_KEYS) {
    const dayLifts = lifts[day];
    if (!dayLifts || typeof dayLifts !== 'object') continue;
    for (const lift of Object.keys(dayLifts)) {
      const sets = dayLifts[lift];
      if (Array.isArray(sets) && sets.some(setIsLogged)) return true;
    }
  }
  for (const day of DAY_KEYS) {
    const r = runDaySummary(week, day);
    if (r && ((parseFloat(r.dist) || 0) > 0 || (r.time != null && r.time !== ''))) return true;
  }
  const gym = week.gymStats || {};
  for (const day of DAY_KEYS) {
    const g = gym[day];
    if (g && g.time != null && g.time !== '') return true;
  }
  return false;
}

/**
 * Begin a new program activation on `state`: mint an id, record it, and stamp it
 * as the active run. Does NOT touch week storage — the caller reseeds/archives.
 * @param {any} state  appState
 * @param {string} programId
 * @param {number|string} startWeek
 * @returns {string} the new activation id
 */
export function beginActivation(state, programId, startWeek = 1) {
  pauseActiveActivation(state);
  const id = newActivationId();
  state.activeActivationId = id;
  if (!Array.isArray(state.activations)) state.activations = [];
  state.activations.push({
    id,
    programId: programId || state.activeProgramId || null,
    startWeek: Math.max(1, parseInt(String(startWeek), 10) || 1),
    startedAt: new Date().toISOString(),
    status: 'active',
  });
  return id;
}

/**
 * Mark the current activation as paused before another run becomes active.
 * Optional metadata is additive so legacy activation records remain valid.
 * @param {any} state
 * @param {string} [pausedAt]
 * @returns {any|null}
 */
export function pauseActiveActivation(state, pausedAt = new Date().toISOString()) {
  const id = state?.activeActivationId;
  if (!id) return null;
  if (!Array.isArray(state.activations)) state.activations = [];
  let record = state.activations.find((activation) => activation?.id === id);
  if (!record) {
    record = {
      id,
      programId: state.activeProgramId || null,
      startWeek: Math.max(1, parseInt(String(state.currentWeek), 10) || 1),
      startedAt: null,
    };
    state.activations.push(record);
  }
  record.lastWeek = Math.max(1, parseInt(String(state.currentWeek), 10) || record.startWeek || 1);
  record.pausedAt = pausedAt;
  record.status = 'paused';
  return record;
}

/**
 * Restore a previous program run into the live numeric week slots. The current
 * run is paused and archived first; the target activation keeps its original id
 * so history and routes retain stable attribution.
 * @param {any} state
 * @param {string} activationId
 * @param {string} [resumedAt]
 * @returns {{ok:true, activation:any, restored:string[]} | {ok:false, reason:string}}
 */
export function resumeActivation(state, activationId, resumedAt = new Date().toISOString()) {
  if (!state || !activationId) return { ok: false, reason: 'missing-activation' };
  if (activationId === state.activeActivationId) return { ok: false, reason: 'already-active' };
  const target = Array.isArray(state.activations)
    ? state.activations.find((activation) => activation?.id === activationId)
    : null;
  if (!target?.programId) return { ok: false, reason: 'unknown-activation' };

  pauseActiveActivation(state, resumedAt);
  state.activeActivationId = activationId;
  // With the target id active, every numeric week from the run being paused is
  // moved aside before target weeks are restored. Logged history is never
  // overwritten; empty scaffolding may be regenerated by the caller.
  archiveForeignWeeks(state);

  const restored = [];
  for (const key of Object.keys(state.weeks || {})) {
    if (!isArchivedWeekKey(key)) continue;
    const week = state.weeks[key];
    if (!week || week.activationId !== activationId) continue;
    const weekNum = archivedWeekNumber(key);
    if (!weekNum || state.weeks[weekNum]) continue;
    state.weeks[weekNum] = week;
    delete state.weeks[key];
    restored.push(weekNum);
  }

  target.status = 'active';
  target.resumedAt = resumedAt;
  target.resumeCount = Math.max(0, Number(target.resumeCount) || 0) + 1;
  state.activeProgramId = target.programId;
  state.currentWeek = String(Math.max(1, parseInt(String(target.lastWeek || target.startWeek), 10) || 1));
  state.weekStartedAt = resumedAt;
  return { ok: true, activation: target, restored };
}

/**
 * Previous program runs, newest first, with enough durable metadata for the
 * Programs UI. Logged-week counts include archived records only for that exact
 * activation; they never infer from the active numeric week counter.
 * @param {any} state
 */
export function priorActivationSummaries(state) {
  const activeId = state?.activeActivationId;
  const records = Array.isArray(state?.activations) ? state.activations : [];
  return records
    .filter((record) => record?.id && record.id !== activeId && record.programId)
    .map((record) => {
      const ownedWeeks = Object.values(state?.weeks || {}).filter((week) =>
        week && typeof week === 'object' && week.activationId === record.id
      );
      return {
        id: record.id,
        programId: record.programId,
        startWeek: Math.max(1, parseInt(String(record.startWeek), 10) || 1),
        lastWeek: Math.max(1, parseInt(String(record.lastWeek || record.startWeek), 10) || 1),
        startedAt: record.startedAt || null,
        pausedAt: record.pausedAt || null,
        loggedWeeks: ownedWeeks.filter(weekHasLoggedData).length,
      };
    })
    .sort((a, b) => Date.parse(b.pausedAt || b.startedAt || '') - Date.parse(a.pausedAt || a.startedAt || ''));
}

/**
 * Guarantee `state` has an active activation. Legacy/boot states that already
 * carry weeks get an activation without minting a fresh RUN each load (the v3
 * migration stamps those explicitly); this only backfills a missing id.
 * @param {any} state
 * @returns {string} the active activation id
 */
export function ensureActivation(state) {
  if (!state.activeActivationId) {
    beginActivation(state, state.activeProgramId, parseInt(state.currentWeek, 10) || 1);
  }
  return state.activeActivationId;
}

/**
 * Move every numeric week NOT owned by the active activation out of the live
 * program-week slots and into archive keys, preserving all logged history for
 * analytics. Empty foreign scaffolding is dropped (nothing to keep). Idempotent:
 * weeks already owned by the active activation, and already-archived keys, are
 * left untouched.
 * @param {any} state  appState (must have state.activeActivationId)
 * @returns {{ archived: string[], dropped: string[] }}
 */
export function archiveForeignWeeks(state) {
  const result = { archived: [], dropped: [] };
  const actId = state.activeActivationId;
  const weeks = state.weeks;
  if (!actId || !weeks || typeof weeks !== 'object') return result;

  for (const key of Object.keys(weeks)) {
    if (isArchivedWeekKey(key)) continue;      // a prior run's stored week — leave it
    if (!isNumericWeekKey(key)) continue;      // ignore anything non-week-shaped
    const week = weeks[key];
    if (!week || typeof week !== 'object') continue;
    if (week.activationId === actId) continue; // owned by the active run — keep live

    if (weekHasLoggedData(week)) {
      const ak = uniqueArchiveKey(weeks, week.activationId, key);
      weeks[ak] = week;                        // preserved (dates intact) for history
      result.archived.push(ak);
    } else {
      result.dropped.push(key);                // pure scaffolding — safe to discard
    }
    delete weeks[key];                         // vacate the numeric slot for the new run
  }
  return result;
}
