// @ts-check
// ==========================================
// STATE MANAGER — core state + sub-module wiring.
// Auth lives in ./state/auth.js
// Import/Export lives in ./state/import-export.js
// ==========================================
import { PROGRAMS } from './constants.js';
import { getCatalogEntry } from './programs/catalog.js';
import { liftTarget, prescribeSetsForLift, reconcilePrescribedSets } from './engine.js';
import { getWeekModifier } from './schema.js';
export { showToast } from './toast.js';
import { showToast } from './toast.js';
import { recomputeLoadMetrics } from './brain/load_models.js';
import { getSupabaseClient } from './state/supabase.js';
import { initAuth, loginToSupabase, signUpToSupabase, checkActiveSession } from './state/auth.js';
import { initImportExport, triggerEngineExport, triggerCSVExport, triggerEngineImport, setImportSuccessCallback } from './state/import-export.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from './state/migrations.js';
import { showMigrationRecovery } from './state/migration-recovery-ui.js';
import { getStoredCloudVersion, setStoredCloudVersion, isServerNewer } from './state/sync-guard.js';
import {
  ensureActivation, beginActivation, archiveForeignWeeks,
} from './state/activation-identity.js';
import { migrateLegacyRunSessions, runSessionsForDay } from './state/run-sessions.js';

export { loginToSupabase, signUpToSupabase, checkActiveSession };
export { triggerEngineExport, triggerCSVExport, triggerEngineImport, setImportSuccessCallback };

export const STORAGE_KEY = 'hybrid_engine_v2_state';

// Recovery point written just before a cloud pull overwrites local state. The
// cloud sync is last-write-wins with no merge, so a stale/empty device could
// otherwise clobber real history on load. This snapshot lets that be undone.
export const CLOUD_BACKUP_KEY = STORAGE_KEY + '_cloud_backup';

function _defaultStorage() {
  return (typeof localStorage !== 'undefined') ? localStorage : null;
}

// Snapshot the pre-pull local state so a bad/stale cloud pull can be recovered.
// Rolling single backup, timestamp-wrapped. Returns true if a snapshot was
// written. Only snapshots states that actually carry logged history, so a fresh
// or empty install can't overwrite a previously-good recovery point.
export function snapshotLocalBeforeCloudPull(rawLocal, storage = _defaultStorage()) {
  if (!storage || !rawLocal) return false;
  try {
    const parsed = JSON.parse(rawLocal);
    const hasHistory = parsed && parsed.weeks && Object.keys(parsed.weeks).length > 0;
    if (!hasHistory) return false;
    storage.setItem(CLOUD_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), state: parsed }));
    return true;
  } catch (e) {
    console.warn('Pre-cloud-pull backup failed:', e);
    return false;
  }
}

// Read back the last pre-cloud-pull snapshot (parsed { savedAt, state }) or null.
export function getCloudPullBackup(storage = _defaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLOUD_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Drop the pre-cloud-pull snapshot (after the user recovers or dismisses it).
export function clearCloudPullBackup(storage = _defaultStorage()) {
  try { storage?.removeItem(CLOUD_BACKUP_KEY); } catch { /* ignore */ }
}

// Base state configuration
/** @type {import('./types').AppState} */
export let appState = {
  currentWeek: "1",
  activeProgramId: "hybrid_engine",
  weekStartedAt: null,
  weeks: {},
  exerciseStats: {},
  customExercises: [],
  customPrograms: [],
  bodyWeightLog: [],
  thresholdPaceSeconds: null,
  deloadApplied: null,
  _deloadDismissedWeek: null,
  streakData: { current: 0, longest: 0, lastActivityDate: null },
  goalData: { milestones: [], completedCount: 0 },
  prGoals: {},
  loadMetrics: { atl: 0, ctl: 0 },
  healthConnect: { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [], stepGoal: 10000, syncFields: { steps: true, restingHR: true, hrv: true, sleep: true }, fieldStatus: {} },
  wellnessLog: [],
  fastingSession: { active: false, startTime: null, goal: 16, history: [] },
  programLibrary: {
    bookmarks: [],           // array of program IDs
    completions: [],         // array of { programId, completedAt, weeksCompleted }
    recentlyViewed: [],      // array of { programId, viewedAt } — capped at 20
    personalRatings: {},     // map of programId → { rating, review, ratedAt }
    activeFilters: {},       // persisted filter panel state
  },
};

export let activeTab = 'home';
export let selectedDay = 'mon';

export const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function setActiveTab(tab) { activeTab = tab; }
export function setSelectedDay(day) { selectedDay = day; }
export function setAppState(newState) { appState = newState; }

export function emitStorageLoadedEvent() {
  document.dispatchEvent(
    new CustomEvent('app:storage-loaded', {
      detail: { 
        week: appState.currentWeek, 
        activeProgramId: appState.activeProgramId 
      }
    })
  );
}

// ==========================================
// UNIVERSAL PROGRAM RESOLVER
// ==========================================
export function getProgramById(id) {
  return resolveProgramForState(appState, id);
}

export function isUsableProgram(program) {
  if (!program || typeof program !== 'object') return false;
  if (!program.days || typeof program.days !== 'object' || Array.isArray(program.days)) return false;
  const weeks = Number(program.totalWeeks ?? program.durationWeeks);
  return Number.isInteger(weeks) && weeks > 0 && weeks <= 104;
}

export function resolveProgramForState(state, id) {
  if (typeof id !== 'string' || !id.trim()) return null;
  const custom = Array.isArray(state?.customPrograms)
    ? state.customPrograms.find(p => p?.id === id)
    : null;
  // A matching custom record owns its ID. If it is corrupt, fail closed rather
  // than silently rendering a catalog/system program that happens to share it.
  if (custom) return isUsableProgram(custom) ? custom : null;
  if (PROGRAMS[id]) return isUsableProgram(PROGRAMS[id]) ? PROGRAMS[id] : null;
  // Catalog-only programs — normalize to workout-compatible shape
  const catalogEntry = getCatalogEntry(id);
  if (catalogEntry) {
    const normalized = {
      ...catalogEntry,
      totalWeeks: catalogEntry.durationWeeks || 12,
      weeklyVolModifiers: catalogEntry.weeklyVolModifiers || {},
      dossier: catalogEntry.dossier || {
        creator: catalogEntry.author?.name || 'Helyx',
        focus:   catalogEntry.tagline || '',
        philosophy: catalogEntry.description || '',
      },
    };
    return isUsableProgram(normalized) ? normalized : null;
  }
  return null;
}

export function getActiveProgramIssue(state = appState) {
  const id = state?.activeProgramId;
  if (!id || resolveProgramForState(state, id)) return null;
  const customRecordExists = Array.isArray(state?.customPrograms)
    && state.customPrograms.some(program => program?.id === id);
  return {
    id,
    reason: customRecordExists ? 'corrupt' : 'missing',
    title: 'Program unavailable',
    message: 'The saved program could not be loaded. Your logged history is still safe. Choose a replacement below or create a new program.',
  };
}

// ==========================================
// PROGRAM LIBRARY — Bookmarks, Completions, Ratings
// ==========================================

function ensureProgramLibrary() {
  if (!appState.programLibrary) {
    appState.programLibrary = { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} };
  }
}

export function toggleBookmark(programId) {
  ensureProgramLibrary();
  const lib = appState.programLibrary;
  const idx = lib.bookmarks.indexOf(programId);
  if (idx === -1) {
    lib.bookmarks.push(programId);
  } else {
    lib.bookmarks.splice(idx, 1);
  }
  saveStateToLocalStorage(true);
  return lib.bookmarks.includes(programId);
}

export function isBookmarked(programId) {
  return appState.programLibrary?.bookmarks?.includes(programId) ?? false;
}

export function markProgramCompleted(programId, weeksCompleted) {
  ensureProgramLibrary();
  const existing = appState.programLibrary.completions.find(c => c.programId === programId);
  if (existing) {
    existing.completedAt = new Date().toISOString();
    existing.weeksCompleted = weeksCompleted;
  } else {
    appState.programLibrary.completions.push({ programId, completedAt: new Date().toISOString(), weeksCompleted });
  }
  saveStateToLocalStorage(true);
}

export function isProgramCompleted(programId) {
  return appState.programLibrary?.completions?.some(c => c.programId === programId) ?? false;
}

export function recordRecentlyViewed(programId) {
  ensureProgramLibrary();
  const lib = appState.programLibrary;
  lib.recentlyViewed = lib.recentlyViewed.filter(v => v.programId !== programId);
  lib.recentlyViewed.unshift({ programId, viewedAt: new Date().toISOString() });
  if (lib.recentlyViewed.length > 20) lib.recentlyViewed.length = 20;
  // Autosave (debounced, no toast): viewing a program shouldn't fire a
  // "Saved" toast or an immediate cloud round-trip on every detail open.
  saveStateToLocalStorage(true);
}

export function savePersonalRating(programId, rating, review = '') {
  ensureProgramLibrary();
  appState.programLibrary.personalRatings[programId] = { rating, review, ratedAt: new Date().toISOString() };
  saveStateToLocalStorage(true);
}

export function getPersonalRating(programId) {
  return appState.programLibrary?.personalRatings?.[programId] ?? null;
}

// ==========================================
// PROGRAM LIBRARY CRUD LOGIC
// ==========================================
export function createCustomProgram(name, totalWeeks, focus, philosophy) {
  const id = 'prog_' + Date.now();
  const newProg = {
    id,
    name: name || "New Custom Program",
    totalWeeks: parseInt(totalWeeks, 10) || 12,
    dossier: { creator: "You", focus: focus || "Custom Focus", philosophy: philosophy || "A custom built training block." },
    days: {},
    weeklyVolModifiers: {}
  };
  
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(d => {
    newProg.days[d] = { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "", runs: "Rest", lifts: [] };
  });
  
  for(let i = 1; i <= newProg.totalWeeks; i++) {
    // Empty label → the builder shows the "Phase label (e.g. Build, Peak)"
    // placeholder instead of a meaningless "Custom Block" repeated down every
    // week (which read as "why are all 12 rows identical?").
    newProg.weeklyVolModifiers[i.toString()] = { sets: 3, reps: 10, intensityLabel: "" };
  }
  
  if (!appState.customPrograms) appState.customPrograms = [];
  appState.customPrograms.push(newProg);
  saveStateToLocalStorage(true);
  return id;
}

export function duplicateCustomProgram(id) {
  const source = getProgramById(id);
  if (!source) return null;
  const newProg = JSON.parse(JSON.stringify(source));
  newProg.id = 'prog_' + Date.now();
  newProg.name = newProg.name + " (Copy)";
  // A fork is authored by the user, not the original coach — keep it honest
  // ("by You") and out of the verified-author UI.
  if (newProg.dossier) newProg.dossier.creator = "You";
  if (newProg.author) newProg.author = { name: "You", type: "custom", verified: false };

  if (!appState.customPrograms) appState.customPrograms = [];
  appState.customPrograms.push(newProg);
  saveStateToLocalStorage(true);
  return newProg.id;
}

export function deleteCustomProgram(id) {
  if (appState.activeProgramId === id) {
    return { success: false, message: "Cannot delete the currently active program." };
  }
  if (!appState.customPrograms) return { success: false, message: "No custom programs found." };
  
  appState.customPrograms = appState.customPrograms.filter(p => p.id !== id);
  saveStateToLocalStorage(true);
  return { success: true };
}

// ==========================================
// DELOAD WEEK
// ==========================================

// Dismiss the deload suggestion for the current week (won't show again this week).
export function dismissDeloadSuggestion() {
  appState._deloadDismissedWeek = appState.currentWeek;
  saveStateToLocalStorage(true);
}

// Apply a deload to the current week: halve the *incomplete* working sets of
// each lift (keeping at least one). Completed sets and warm-ups are never
// touched, so no logged work is lost. Marks the week as deloaded.
export function applyDeloadToCurrentWeek() {
  const wk   = appState.currentWeek;
  const week = appState.weeks?.[wk];
  if (week && week.lifts) {
    for (const day in week.lifts) {
      const dayLifts = week.lifts[day];
      for (const lift in dayLifts) {
        const sets = dayLifts[lift];
        if (!Array.isArray(sets)) continue;
        const incompleteCount = sets.filter(s => !(s?.c || s?.type === 'W')).length;
        const keepN = Math.max(1, Math.ceil(incompleteCount / 2));
        let seen = 0;
        dayLifts[lift] = sets.filter(s => {
          if (s?.c || s?.type === 'W') return true; // keep all logged sets + warm-ups
          seen++;
          return seen <= keepN;                      // keep the first N incomplete, drop the rest
        });
      }
    }
  }
  appState.deloadApplied = wk;
  saveStateToLocalStorage(true);
}

// ==========================================
// INIT & SCHEMA
// ==========================================
export function determineDefaultCalendarDay() {
  const idx = new Date().getDay();
  const crossMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  selectedDay = crossMap[idx];
}

export function verifyWeekStorageSchema(wk) {
  const activeProgram = getProgramById(appState.activeProgramId);
  // An unknown/deleted/corrupt active ID is a recovery state, not permission to
  // seed the default plan into that ID's week. Leave state untouched until the
  // user explicitly chooses a replacement from Programs.
  if (!activeProgram) return false;
  if (!appState.weeks) appState.weeks = {};
  // Every seeded/edited week belongs to the current program run, so make sure one
  // exists to stamp ownership with (backfills legacy/boot states harmlessly).
  const activationId = ensureActivation(appState);

  if (!appState.weeks[wk]) {
    appState.weeks[wk] = { runs: {}, runSessions: {}, lifts: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {}, liftOrder: {}, dates: {},
      activationId, programId: appState.activeProgramId };
    DEFAULT_DAYS.forEach(d => {
      appState.weeks[wk].runs[d] = { dist: '', time: '', rpe: '' };
      appState.weeks[wk].runSessions[d] = [];
      appState.weeks[wk].notes[d] = '';
      appState.weeks[wk].gymRpe[d] = '';
      appState.weeks[wk].bodyWeight[d] = '';
      appState.weeks[wk].gymStats[d] = { time: '', avgHR: '', maxHR: '', cals: '' };
      appState.weeks[wk].lifts[d] = {};
    });

    DEFAULT_DAYS.forEach(d => {
      const dayBlueprint = activeProgram.days[d];
      // Ignore blank/whitespace lift names (custom-builder programs can carry
      // empty rows) so they never seed a junk lift key or pollute liftOrder.
      const liftNames = (dayBlueprint?.lifts || []).filter(n => typeof n === 'string' && n.trim());
      if (liftNames.length > 0) {
        const weekModifier = getWeekModifier(activeProgram, wk);

        liftNames.forEach(liftName => {
          appState.weeks[wk].lifts[d][liftName] =
            prescribeSetsForLift(wk, d, liftName, dayBlueprint.desc, weekModifier);
        });
        // Stamp the explicit display order (blueprint order). Render reads this
        // instead of object-key enumeration, which would otherwise float any
        // integer-like keys to the top and scramble the prescribed sequence.
        appState.weeks[wk].liftOrder[d] = [...liftNames];
      }
    });
  }
  // Defensive schema repair for imported/current-version snapshots that lack
  // the v4 sidecar. This adopts any legacy projection before creating arrays.
  migrateLegacyRunSessions({ weeks: { [wk]: appState.weeks[wk] } }, DEFAULT_DAYS);

  // Older builds materialised every lift from the week-wide 3×10 fallback when
  // an authored target was a range/max prescription or lived in the lift name.
  // Reconcile only the active program's scaffold: untouched rows resize exactly;
  // user-entered/completed rows are never removed and only gain missing rows.
  const week = appState.weeks[wk];
  if (!week.lifts || typeof week.lifts !== 'object') week.lifts = {};
  const modifier = getWeekModifier(activeProgram, wk);
  DEFAULT_DAYS.forEach((day) => {
    const blueprint = activeProgram.days?.[day];
    for (const liftName of (blueprint?.lifts || [])) {
      const target = liftTarget(blueprint.desc, liftName, modifier);
      const existing = week.lifts?.[day]?.[liftName];
      const reconciled = reconcilePrescribedSets(existing, target.sets);
      if (!week.lifts[day]) week.lifts[day] = {};
      week.lifts[day][liftName] = reconciled;
    }
  });
  return true;
}

// A set counts as "logged" (real history, never discard on a program switch)
// once it's completed or carries an entered weight. Prescribed-but-untouched
// sets seed w:'' with only a rep target, so they don't qualify.
function liftHasLoggedData(sets) {
  return Array.isArray(sets) && sets.some(s => s && (s.c || (s.w !== '' && s.w != null)));
}

// Begin a fresh run of a program: mint a new activation identity and vacate every
// numeric week owned by the PREVIOUS run into the archive (logged history kept for
// analytics, empty scaffolding dropped). After this, the numeric program-week slots
// are clean for the new run — the caller seeds the chosen start week. Returns the
// new activation id. Used by both a program SWITCH and a same-program RESTART: each
// is a distinct run, so a restart never inherits the prior run's completed state.
export function startProgramActivation(programId, startWeek = 1) {
  beginActivation(appState, programId, startWeek);
  return archiveForeignWeeks(appState);
}

// Re-point a single week at the *active* program: add the new program's
// exercises, drop the previous program's unlogged scaffolding, and rebuild
// liftOrder (new blueprint order first, retained logged lifts appended). This
// replaces stale scaffolding so a program switch doesn't leave a week showing
// the union of both programs. Logged sets are always preserved.
export function reseedActiveProgramIntoWeek(wk) {
  const activationId = ensureActivation(appState);
  // ISOLATION GUARD: if this numeric slot is owned by a PREVIOUS activation, it
  // holds a different program run's logged history. Archive it (kept for
  // analytics/PRs) and clear the slot so the new run seeds clean — a previous
  // program's completed lifts can never be appended to this workout.
  if (appState.weeks?.[wk] && appState.weeks[wk].activationId &&
      appState.weeks[wk].activationId !== activationId) {
    archiveForeignWeeks(appState);
  }
  verifyWeekStorageSchema(wk); // ensures the week object exists & is shaped (fresh if just vacated)
  const program = getProgramById(appState.activeProgramId);
  if (!program?.days) return;
  const weekModifier = getWeekModifier(program, wk);
  const week = appState.weeks[wk];
  if (!week.lifts) week.lifts = {};
  if (!week.liftOrder) week.liftOrder = {};
  // Stamp ownership so a later switch can recognise this run's weeks.
  week.activationId = activationId;
  week.programId = appState.activeProgramId;

  DEFAULT_DAYS.forEach(d => {
    const blueprintLifts = (program.days[d]?.lifts || []).filter(n => typeof n === 'string' && n.trim());
    if (!week.lifts[d]) week.lifts[d] = {};
    const existing = week.lifts[d];

    // 1. Drop old, unlogged scaffolding that isn't in the new blueprint.
    for (const liftName of Object.keys(existing)) {
      if (blueprintLifts.includes(liftName)) continue;
      if (!liftHasLoggedData(existing[liftName])) delete existing[liftName];
    }
    // 2. Seed new blueprint lifts, AND re-prescribe kept-but-unlogged ones so an
    //    unlogged lift's row count always matches THIS program+week's target.
    //    Without the re-prescribe, a lift shared by both programs (e.g. "Bench
    //    Press") keeps the *old* program's set count while the cockpit label
    //    recomputes to the new one — the "Target: 3 × 8 but 4 rows" bug. Logged
    //    sets are never touched (liftHasLoggedData guard).
    blueprintLifts.forEach(liftName => {
      if (!existing[liftName] || !liftHasLoggedData(existing[liftName])) {
        existing[liftName] = prescribeSetsForLift(wk, d, liftName, program.days[d]?.desc, weekModifier);
      }
    });
    // 3. Rebuild order: blueprint order, then retained logged lifts (history).
    const retained = Object.keys(existing).filter(n => !blueprintLifts.includes(n));
    week.liftOrder[d] = [...blueprintLifts, ...retained];
  });
}

// ==========================================
// CLOUD PERSISTENCE
// ==========================================
//
// recomputeLoadMetrics() rebuilds the full daily CTL/ATL timeline (Date math +
// sort over every logged day) — far too heavy to run on every keystroke-save.
// It only depends on per-day RPE/duration, so we memoise on a cheap signature
// of exactly those fields and skip the rebuild when nothing relevant changed.
let _loadSig = null;
let _loadCache = { atl: 0, ctl: 0 };

function loadMetricsSignature(state) {
  if (!state.weekStartedAt || !state.currentWeek) return 'none';
  const parts = [state.weekStartedAt, state.currentWeek];
  const weeks = state.weeks || {};
  for (const wk of Object.keys(weeks)) {
    const wd = weeks[wk];
    if (!wd) continue;
    for (const d of DEFAULT_DAYS) {
      const gr = wd.gymRpe?.[d];
      const gt = wd.gymStats?.[d]?.time;
      const runSig = runSessionsForDay(wd, d)
        .map(run => `${run.sessionId || ''}:${run.rpe || ''}/${run.time || ''}`)
        .join(',');
      if (gr || gt || runSig) parts.push(`${wk}${d}:${gr || ''}/${gt || ''}/${runSig}`);
    }
  }
  return parts.join('|');
}

function memoizedLoadMetrics(state) {
  const sig = loadMetricsSignature(state);
  if (sig === _loadSig) return _loadCache;
  _loadSig = sig;
  _loadCache = recomputeLoadMetrics(state);
  return _loadCache;
}

// Cloud upserts the whole state blob over the network. Debounce the autosave
// path (suppressToast === true: typing, toggles) so rapid edits coalesce into a
// single round-trip; explicit user saves flush immediately for their toast.
let _cloudTimer = null;
let _cloudPending = false;
const CLOUD_DEBOUNCE_MS = 1500;

// Local-write coalescing. Serialising the entire appState to localStorage on
// every weight/rep keystroke is wasteful for large histories. High-frequency,
// low-criticality edits (typing) go through scheduleLocalSave() and coalesce
// into one write; critical events (set complete, finish, run save) still call
// saveStateToLocalStorage() for an immediate write. A debounced flush always
// serialises the CURRENT appState, so it can never persist stale data.
let _localTimer = null;
let _localPending = false;
const LOCAL_DEBOUNCE_MS = 400;
// Dev instrumentation: set localStorage.helyxPersistDebug='1' to log slow writes.
let _persistDebug = false;
try { _persistDebug = typeof localStorage !== 'undefined' && localStorage.getItem('helyxPersistDebug') === '1'; } catch { /* ignore */ }
const PERSIST_WARN_MS = 16; // one frame budget

function _now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

// The one place that actually serialises + writes local state. Cancels any
// pending debounce (it just wrote the latest), recomputes memoized load metrics,
// and — in dev — warns when a single write blows the frame budget.
function writeLocalNow() {
  if (_localTimer) { clearTimeout(_localTimer); _localTimer = null; }
  _localPending = false;
  appState.loadMetrics = memoizedLoadMetrics(appState);
  const t0 = _persistDebug ? _now() : 0;
  let saved = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    _cloudDirty = true;
    saved = true;
  } catch (e) {
    console.error('Failed to save state locally:', e);
  }
  if (_persistDebug) {
    const dt = _now() - t0;
    if (dt > PERSIST_WARN_MS) console.warn(`[persist] local write ${dt.toFixed(1)}ms (state ~${JSON.stringify(appState).length} bytes)`);
  }
  return saved;
}

function _scheduleCloudDebounce() {
  _cloudPending = true;
  if (!_cloudTimer) {
    _cloudTimer = setTimeout(() => {
      _cloudTimer = null;
      if (_cloudPending) { _cloudPending = false; cloudSave(true); }
    }, CLOUD_DEBOUNCE_MS);
  }
}

// Debounced local persist for rapid, non-critical edits (typing weight/reps).
// Coalesces a burst of keystrokes into a single serialize. The cloud write is
// debounced separately. Crash safety: critical actions never use this path, and
// flushLocalSave() runs on pagehide/visibilitychange so a backgrounded app
// persists the last keystroke.
export function scheduleLocalSave() {
  _localPending = true;
  if (!_localTimer) {
    _localTimer = setTimeout(() => { _localTimer = null; if (_localPending) writeLocalNow(); }, LOCAL_DEBOUNCE_MS);
  }
  _scheduleCloudDebounce();
}

// Force any pending debounced LOCAL write to happen now (before unload/reads).
export function flushLocalSave() {
  if (_localPending || _localTimer) writeLocalNow();
}

// Sync-conflict wiring. When a save would overwrite newer cloud data (another
// device wrote since we loaded), we do NOT clobber it: we raise a conflict for
// the user to resolve. `_conflictPending` suppresses further cloud writes until
// they choose; `_forceOverwrite` is a one-shot bypass set by "keep this device".
let _onSyncConflict = null;
let _conflictPending = false;
let _forceOverwrite = false;

// Offline resilience: an edit always reaches localStorage, but if the cloud
// write can't complete (offline, or a transient network error) the cloud copy
// is now stale. Track that so we can push it up the moment connectivity is
// back, instead of leaving it un-synced until the next manual save.
let _cloudDirty = false;

/** Register the UI handler shown when a stale-overwrite is detected. */
export function setSyncConflictHandler(fn) { _onSyncConflict = fn; }

export function isSyncConflictPending() { return _conflictPending; }

// Pure decision for the reconnect handler: only re-sync when there is unsynced
// local work, a cloud client exists, and we're not already blocked on a
// user conflict choice (which would otherwise re-prompt on every reconnect).
export function shouldResyncOnReconnect(dirty, hasClient, conflictPending) {
  return !!(dirty && hasClient && !conflictPending);
}

async function cloudSave(suppressToast) {
  const _sb = getSupabaseClient();
  if (!_sb) {
    if (!suppressToast) showToast('Session Saved Locally ✓');
    return;
  }
  try {
    const { data: sessionData } = await _sb.auth.getSession();
    if (!sessionData?.session) {
      if (!suppressToast) showToast('Session Saved Locally ✓');
      return;
    }
    const uid = sessionData.session.user.id;

    // Already waiting on the user to resolve a conflict — local state is safely
    // in localStorage; don't touch the cloud until they decide.
    if (_conflictPending) return;

    // Divergence guard: unless the user explicitly chose to overwrite, check
    // whether the server row is newer than the version this device last saw.
    if (!_forceOverwrite) {
      const { data: row, error: selErr } = await _sb
        .from('user_data')
        .select('updated_at')
        .eq('user_id', uid)
        .maybeSingle();
      if (!selErr && row && isServerNewer(getStoredCloudVersion(), row.updated_at)) {
        _conflictPending = true;
        if (_onSyncConflict) {
          _onSyncConflict({ serverUpdatedAt: row.updated_at, lastSeen: getStoredCloudVersion() });
        }
        return; // do NOT overwrite newer cloud data
      }
    }
    _forceOverwrite = false;

    const { error } = await _sb
      .from('user_data')
      .upsert({ user_id: uid, state_data: appState }, { onConflict: 'user_id' });

    if (error) throw error;
    _cloudDirty = false; // cloud now matches local

    // Best-effort: record the new server version for divergence detection.
    // Kept separate from the upsert (and error-tolerant) so a save never breaks
    // if the updated_at migration hasn't been applied yet.
    try {
      const { data: v } = await _sb
        .from('user_data')
        .select('updated_at')
        .eq('user_id', uid)
        .maybeSingle();
      if (v?.updated_at) setStoredCloudVersion(v.updated_at);
    } catch { /* column absent until migration applied — degrade gracefully */ }

    if (!suppressToast) showToast('Session Saved to Cloud ✓');
  } catch (err) {
    console.error('Supabase Save Error:', err);
    // Plain-language, reassuring — the edit is already safe in localStorage; the
    // raw "DB Reject: <error>" read as data loss to a non-technical user.
    if (!suppressToast) showToast("Couldn't sync to cloud — saved on this device.", true);
  }
}

// Resolve a detected sync conflict from the UI. 'local' overwrites the cloud
// with this device's state; 'cloud' discards local edits and reloads the
// authoritative cloud copy (the pre-pull snapshot backup still lets it be undone).
export async function resolveSyncConflict(choice) {
  _conflictPending = false;
  if (choice === 'local') {
    _forceOverwrite = true;
    await cloudSave(false);
  } else if (choice === 'cloud') {
    // Reload: the fresh boot pull replaces local with cloud and re-stamps the
    // last-seen version, so the next save won't re-trigger the conflict.
    if (typeof window !== 'undefined') window.location.reload();
  }
}

// Force any pending debounced cloud save to run now (e.g. before unload/login).
export function flushCloudSave() {
  if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = null; }
  if (_cloudPending) { _cloudPending = false; return cloudSave(true); }
}

if (typeof window !== 'undefined') {
  // Don't lose the last debounced local write or sync if the app is backgrounded
  // or killed. Local flush first so the persisted copy is current, then cloud.
  window.addEventListener('pagehide', () => { flushLocalSave(); flushCloudSave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flushLocalSave(); flushCloudSave(); } });
  // Back online: push up any edits made while offline (or after a failed save).
  window.addEventListener('online', () => {
    if (shouldResyncOnReconnect(_cloudDirty, !!getSupabaseClient(), _conflictPending)) {
      cloudSave(true);
    }
  });
}

export async function saveStateToLocalStorage(suppressToast = false) {
  // Critical/explicit save: write local immediately (also cancels any pending
  // debounced local write, since we just persisted the latest state).
  const savedLocally = writeLocalNow();

  if (suppressToast) {
    // Autosave: coalesce network writes. localStorage already holds the latest.
    _scheduleCloudDebounce();
    return savedLocally;
  }

  // Explicit save: cancel any pending debounce and flush now so the toast is truthful.
  if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = null; }
  _cloudPending = false;
  await cloudSave(false);
  return savedLocally;
}

export async function pullEngineDataFromStorage() {
  let localData = null;
  let rawLocal = null;
  try {
    rawLocal = localStorage.getItem(STORAGE_KEY);
    if (rawLocal) {
      localData = JSON.parse(rawLocal);
    }
  } catch (e) {
    console.error('Failed to parse local storage:', e);
  }

  const baseDefaults = {
    schemaVersion: 0, // 0 = legacy/unstamped; migrateState() upgrades + stamps on load
    currentWeek: '1', activeProgramId: 'hybrid_engine', weekStartedAt: null,
    weeks: {}, exerciseStats: {}, customExercises: [], customPrograms: [], bodyWeightLog: [],
    thresholdPaceSeconds: null, deloadApplied: null, _deloadDismissedWeek: null,
    streakData: { current: 0, longest: 0, lastActivityDate: null },
    goalData: { milestones: [], completedCount: 0 },
    prGoals: {},
    loadMetrics: { atl: 0, ctl: 0 },
    healthConnect: { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [], stepGoal: 10000, syncFields: { steps: true, restingHR: true, hrv: true, sleep: true }, fieldStatus: {} },
    wellnessLog: [],
    fastingSession: { active: false, startTime: null, goal: 16, history: [] },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
    settings: { name: '', weightUnit: 'kg', distanceUnit: 'km', progressionIncrement: 2.5, defaultBodyWeight: null, autoAdvanceWeek: true, theme: 'dark', onboardingComplete: false, fitnessGoal: 'hybrid', weightGoal: 'maintain', fitnessLevel: 'intermediate', equipmentTier: 'gym', weekStartDay: 'mon', fastingDefault: 16, reminderTime: { hour: 7, minute: 30 }, notifWeeklySummary: false, notifStreak: false, streakAlertTime: { hour: 20, minute: 0 }, notifMissedWorkout: false, notifFastingStage: true, equipment: { barbell: true, rack: true, dumbbells: true, cables: true, pullupBar: true, bands: false, kettlebells: false, treadmill: false }, bandWeights: { L: 10, M: 20, H: 30 }, restPeriods: { compound: 180, accessory: 120, isolation: 90 }, restTimerEnabled: true, restOverrides: {}, avatarDataUrl: null },
    profileSections: { order: null, hidden: [] },
    dashboardTiles: { order: null, hidden: null },   // hidden:null = focused default set (R4)
    hybridScore: { history: [], xp: 0, lastRecordedDate: null },
    overtrainingAck: null,        // { sig, date } — acknowledged risk condition (R10)
    _overtrainingPushedDate: null,
    streakFreezes: { available: 1, used: [], earnedTier: 0 },   // R7 streak protection
  };

  // Always seed defaults so a brand-new install (no localData, no cloud) still
  // has every top-level key — notably `settings`, which the schema-patch block
  // below dereferences. Settings is deep-merged so keys added in later versions
  // reach returning users instead of being shadowed by their stored object.
  appState = {
    ...baseDefaults,
    ...(localData || {}),
    settings: { ...baseDefaults.settings, ...(localData && localData.settings) },
  };

  // Whether this device had a real saved Helyx blob when the app loaded. This is
  // the honest "returning user" signal for onboarding: a brand-new install has
  // none. It must be read here, before verifyWeekStorageSchema() seeds an empty
  // week scaffold — otherwise every fresh user looks like they already have data
  // and onboarding (and its provisional-Score reveal) never shows.
  appState._hadStoredState = localData != null;

  const _sb2 = getSupabaseClient();
  if (_sb2) {
    try {
      const fetchCloud = async () => {
        const { data: userData, error: authError } = await _sb2.auth.getUser();
        if (!authError && userData?.user) {
            // select('*') (not 'state_data, updated_at') so the load still works
            // if the updated_at migration hasn't been applied yet — the column
            // is simply absent from the row rather than erroring the query.
            const { data, error } = await _sb2
              .from('user_data')
              .select('*')
              .eq('user_id', userData.user.id)
              .single();

            if (!error && data?.state_data) return data;
        }
        return null;
      };

      const cloudRow = await Promise.race([
        fetchCloud(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Supabase timeout")), 4000))
      ]);

      if (cloudRow?.state_data) {
        // Safety net: back up the pre-pull local state before the cloud blob
        // overwrites it, so a stale/empty device clobbering real history on
        // load can be recovered (sync is last-write-wins with no merge).
        snapshotLocalBeforeCloudPull(rawLocal);
        appState = {
          ...baseDefaults,
          ...cloudRow.state_data,
          settings: { ...baseDefaults.settings, ...(cloudRow.state_data && cloudRow.state_data.settings) },
        };
        // Record the server version we just loaded, so a later save can tell
        // whether another device has written since (divergence detection).
        if (cloudRow.updated_at) setStoredCloudVersion(cloudRow.updated_at);
      }
    } catch (cloudErr) {
      console.warn('Cloud sync timeout/failure, relying on local backup.');
    }
  }

  // Schema Patching
  if (!appState.activeProgramId) appState.activeProgramId = "hybrid_engine";
  if (!appState.exerciseStats) appState.exerciseStats = {};
  if (!appState.weeks) appState.weeks = {};
  if (!appState.customExercises) appState.customExercises = [];
  if (!appState.customPrograms) appState.customPrograms = [];
  if (!appState.bodyWeightLog) appState.bodyWeightLog = [];
  if (appState.thresholdPaceSeconds === undefined) appState.thresholdPaceSeconds = null;
  if (appState.deloadApplied === undefined) appState.deloadApplied = null;
  if (!appState.streakData) appState.streakData = { current: 0, longest: 0, lastActivityDate: null };
  if (!appState.goalData) appState.goalData = { milestones: [], completedCount: 0 };
  if (!appState.loadMetrics) appState.loadMetrics = { atl: 0, ctl: 0 };
  if (!appState.healthConnect) appState.healthConnect = { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [], stepGoal: 10000, syncFields: { steps: true, restingHR: true, hrv: true, sleep: true }, fieldStatus: {} };
  if (!appState.wellnessLog) appState.wellnessLog = [];
  if (!appState.fastingSession) appState.fastingSession = { active: false, startTime: null, goal: 16, history: [] };
  if (!appState.prGoals) appState.prGoals = {};
  if (!appState.profileSections) appState.profileSections = { order: null, hidden: [] };
  if (!appState.dashboardTiles) appState.dashboardTiles = { order: null, hidden: null };
  // One-time migration of dashboard tile layout from the legacy standalone
  // localStorage keys into synced app state. The legacy keys are removed so a
  // later "reset tiles" can't be silently resurrected from them on next load.
  try {
    if (appState.dashboardTiles.order == null) {
      const _legacyOrder = localStorage.getItem('dashboardTileOrder');
      if (_legacyOrder) appState.dashboardTiles.order = JSON.parse(_legacyOrder);
    }
    if (!appState.dashboardTiles.hidden || appState.dashboardTiles.hidden.length === 0) {
      const _legacyHidden = localStorage.getItem('dashboardTilesHidden');
      if (_legacyHidden) appState.dashboardTiles.hidden = JSON.parse(_legacyHidden);
    }
    localStorage.removeItem('dashboardTileOrder');
    localStorage.removeItem('dashboardTilesHidden');
  } catch {}
  if (!appState.settings.avatarDataUrl && appState.settings.avatarDataUrl !== null) appState.settings.avatarDataUrl = null;
  if (!appState.settings.bandWeights) appState.settings.bandWeights = { L: 10, M: 20, H: 30 };
  if (!appState.settings.restPeriods) appState.settings.restPeriods = { compound: 180, accessory: 120, isolation: 90 };
  if (appState.settings.restTimerEnabled === undefined) appState.settings.restTimerEnabled = true;
  if (appState.settings.weightGoal === undefined) appState.settings.weightGoal = 'maintain';
  if (!appState.settings.restOverrides) appState.settings.restOverrides = {};

  // Run versioned schema migrations before any save-capable sub-module starts.
  // A failed step leaves localStorage byte-for-byte untouched, blocks the rest
  // of boot, and presents an explicit retry path instead of running on a
  // partially upgraded blob.
  try {
    migrateState(appState);
  } catch (migrationError) {
    showMigrationRecovery(migrationError);
    throw migrationError;
  }

  verifyWeekStorageSchema(appState.currentWeek);
  appState.loadMetrics = recomputeLoadMetrics(appState);

  // Wire up sub-modules now that state is live
  initAuth(pullEngineDataFromStorage);
  initImportExport({
    getState:    () => appState,
    setState:    (s) => { appState = s; },
    saveState:   saveStateToLocalStorage,
    defaultDays: DEFAULT_DAYS,
    migrate:     migrateState,
    storageKey:  STORAGE_KEY,
    getCloudBackup:   getCloudPullBackup,
    clearCloudBackup: clearCloudPullBackup,
  });

  try {
    emitStorageLoadedEvent();
  } catch (err) {
    console.warn('Storage loaded event dispatch failed.', err);
  }
}

export function saveNewCustomExerciseToLibrary(exerciseName) {
  const cleanedName = exerciseName.trim();
  if (!cleanedName) return;
  if (!appState.customExercises) appState.customExercises = [];
  if (!appState.customExercises.includes(cleanedName)) {
    appState.customExercises.push(cleanedName);
    saveStateToLocalStorage(true); 
  }
}
