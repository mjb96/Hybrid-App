// @ts-check
// ==========================================
// STATE MANAGER — core state + sub-module wiring.
// Auth lives in ./state/auth.js
// Import/Export lives in ./state/import-export.js
// ==========================================
import { PROGRAMS } from './constants.js';
import { getCatalogEntry } from './programs/catalog.js';
import { prescribeSetsForLift } from './engine.js';
import { getWeekModifier } from './schema.js';
export { showToast } from './toast.js';
import { showToast } from './toast.js';
import { recomputeLoadMetrics } from './brain/load_models.js';
import { getSupabaseClient } from './state/supabase.js';
import { initAuth, loginToSupabase, signUpToSupabase, checkActiveSession } from './state/auth.js';
import { initImportExport, triggerEngineExport, triggerCSVExport, triggerEngineImport, setImportSuccessCallback } from './state/import-export.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from './state/migrations.js';

export { loginToSupabase, signUpToSupabase, checkActiveSession };
export { triggerEngineExport, triggerCSVExport, triggerEngineImport, setImportSuccessCallback };

const STORAGE_KEY = 'hybrid_engine_v2_state';

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
  healthConnect: { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [], stepGoal: 10000 },
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
  if (appState.customPrograms) {
    const custom = appState.customPrograms.find(p => p.id === id);
    if (custom) return custom;
  }
  if (PROGRAMS[id]) return PROGRAMS[id];
  // Catalog-only programs — normalize to workout-compatible shape
  const catalogEntry = getCatalogEntry(id);
  if (catalogEntry) {
    return {
      ...catalogEntry,
      totalWeeks: catalogEntry.durationWeeks || 12,
      weeklyVolModifiers: catalogEntry.weeklyVolModifiers || {},
      dossier: catalogEntry.dossier || {
        creator: catalogEntry.author?.name || 'Helyx',
        focus:   catalogEntry.tagline || '',
        philosophy: catalogEntry.description || '',
      },
    };
  }
  return PROGRAMS['hybrid_engine'];
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
    newProg.weeklyVolModifiers[i.toString()] = { sets: 3, reps: 10, intensityLabel: "Custom Block" };
  }
  
  if (!appState.customPrograms) appState.customPrograms = [];
  appState.customPrograms.push(newProg);
  saveStateToLocalStorage(true);
  return id;
}

export function duplicateCustomProgram(id) {
  const source = getProgramById(id);
  if (!source) return;
  const newProg = JSON.parse(JSON.stringify(source));
  newProg.id = 'prog_' + Date.now();
  newProg.name = newProg.name + " (Copy)";
  if(newProg.dossier) newProg.dossier.creator = "You";
  
  if (!appState.customPrograms) appState.customPrograms = [];
  appState.customPrograms.push(newProg);
  saveStateToLocalStorage(true);
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
  if (!appState.weeks) appState.weeks = {};
  
  if (!appState.weeks[wk]) {
    appState.weeks[wk] = { runs: {}, lifts: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {}, liftOrder: {}, dates: {} };
    DEFAULT_DAYS.forEach(d => {
      appState.weeks[wk].runs[d] = { dist: '', time: '', rpe: '' };
      appState.weeks[wk].notes[d] = '';
      appState.weeks[wk].gymRpe[d] = '';
      appState.weeks[wk].bodyWeight[d] = '';
      appState.weeks[wk].gymStats[d] = { time: '', avgHR: '', maxHR: '', cals: '' };
      appState.weeks[wk].lifts[d] = {};
    });

    const activeProgram = getProgramById(appState.activeProgramId);

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
}

// A set counts as "logged" (real history, never discard on a program switch)
// once it's completed or carries an entered weight. Prescribed-but-untouched
// sets seed w:'' with only a rep target, so they don't qualify.
function liftHasLoggedData(sets) {
  return Array.isArray(sets) && sets.some(s => s && (s.c || (s.w !== '' && s.w != null)));
}

// Re-point a single week at the *active* program: add the new program's
// exercises, drop the previous program's unlogged scaffolding, and rebuild
// liftOrder (new blueprint order first, retained logged lifts appended). This
// replaces stale scaffolding so a program switch doesn't leave a week showing
// the union of both programs. Logged sets are always preserved.
export function reseedActiveProgramIntoWeek(wk) {
  verifyWeekStorageSchema(wk); // ensures the week object exists & is shaped
  const program = getProgramById(appState.activeProgramId);
  if (!program?.days) return;
  const weekModifier = getWeekModifier(program, wk);
  const week = appState.weeks[wk];
  if (!week.lifts) week.lifts = {};
  if (!week.liftOrder) week.liftOrder = {};

  DEFAULT_DAYS.forEach(d => {
    const blueprintLifts = (program.days[d]?.lifts || []).filter(n => typeof n === 'string' && n.trim());
    if (!week.lifts[d]) week.lifts[d] = {};
    const existing = week.lifts[d];

    // 1. Drop old, unlogged scaffolding that isn't in the new blueprint.
    for (const liftName of Object.keys(existing)) {
      if (blueprintLifts.includes(liftName)) continue;
      if (!liftHasLoggedData(existing[liftName])) delete existing[liftName];
    }
    // 2. Seed any new blueprint lift that isn't already present.
    blueprintLifts.forEach(liftName => {
      if (!existing[liftName]) {
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
      const rr = wd.runs?.[d]?.rpe;
      const rt = wd.runs?.[d]?.time;
      if (gr || gt || rr || rt) parts.push(`${wk}${d}:${gr || ''}/${gt || ''}/${rr || ''}/${rt || ''}`);
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
    const { error } = await _sb
      .from('user_data')
      .upsert({ user_id: sessionData.session.user.id, state_data: appState }, { onConflict: 'user_id' });

    if (error) throw error;
    if (!suppressToast) showToast('Session Saved to Cloud ✓');
  } catch (err) {
    console.error('Supabase Save Error:', err);
    if (!suppressToast) showToast('DB Reject: ' + (err.message || 'Unknown error').substring(0, 40), true);
  }
}

// Force any pending debounced cloud save to run now (e.g. before unload/login).
export function flushCloudSave() {
  if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = null; }
  if (_cloudPending) { _cloudPending = false; return cloudSave(true); }
}

if (typeof window !== 'undefined') {
  // Don't lose the last debounced sync if the app is backgrounded or killed.
  window.addEventListener('pagehide', () => { flushCloudSave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushCloudSave(); });
}

export async function saveStateToLocalStorage(suppressToast = false) {
  appState.loadMetrics = memoizedLoadMetrics(appState);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error('Failed to save state locally:', e);
  }

  if (suppressToast) {
    // Autosave: coalesce network writes. localStorage already holds the latest.
    _cloudPending = true;
    if (!_cloudTimer) {
      _cloudTimer = setTimeout(() => {
        _cloudTimer = null;
        if (_cloudPending) { _cloudPending = false; cloudSave(true); }
      }, CLOUD_DEBOUNCE_MS);
    }
    return;
  }

  // Explicit save: cancel any pending debounce and flush now so the toast is truthful.
  if (_cloudTimer) { clearTimeout(_cloudTimer); _cloudTimer = null; }
  _cloudPending = false;
  await cloudSave(false);
}

export async function pullEngineDataFromStorage() {
  let localData = null;
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (rawData) {
      localData = JSON.parse(rawData);
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
    healthConnect: { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [], stepGoal: 10000 },
    wellnessLog: [],
    fastingSession: { active: false, startTime: null, goal: 16, history: [] },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
    settings: { name: '', weightUnit: 'kg', distanceUnit: 'km', restTimerDefault: 90, progressionIncrement: 2.5, defaultBodyWeight: null, autoAdvanceWeek: true, theme: 'dark', onboardingComplete: false, fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym', weekStartDay: 'mon', fastingDefault: 16, reminderTime: { hour: 7, minute: 30 }, notifWeeklySummary: false, notifStreak: false, streakAlertTime: { hour: 20, minute: 0 }, notifMissedWorkout: false, equipment: { barbell: true, rack: true, dumbbells: true, cables: true, pullupBar: true, bands: false, kettlebells: false, treadmill: false }, avatarDataUrl: null },
    profileSections: { order: null, hidden: [] },
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

  const _sb2 = getSupabaseClient();
  if (_sb2) {
    try {
      const fetchCloud = async () => {
        const { data: userData, error: authError } = await _sb2.auth.getUser();
        if (!authError && userData?.user) {
            const { data, error } = await _sb2
              .from('user_data')
              .select('state_data')
              .eq('user_id', userData.user.id)
              .single();

            if (!error && data?.state_data) return data.state_data;
        }
        return null;
      };

      const cloudData = await Promise.race([
        fetchCloud(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Supabase timeout")), 4000))
      ]);

      if (cloudData) {
        appState = {
          ...baseDefaults,
          ...cloudData,
          settings: { ...baseDefaults.settings, ...(cloudData && cloudData.settings) },
        };
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
  if (!appState.healthConnect) appState.healthConnect = { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [], stepGoal: 10000 };
  if (!appState.wellnessLog) appState.wellnessLog = [];
  if (!appState.fastingSession) appState.fastingSession = { active: false, startTime: null, goal: 16, history: [] };
  if (!appState.prGoals) appState.prGoals = {};
  if (!appState.profileSections) appState.profileSections = { order: null, hidden: [] };
  if (!appState.settings.avatarDataUrl && appState.settings.avatarDataUrl !== null) appState.settings.avatarDataUrl = null;

  // Run versioned schema migrations (legacy-week cleanup lives here now) and
  // stamp the current schema version.
  migrateState(appState);

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
