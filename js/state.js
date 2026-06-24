// ==========================================
// STATE MANAGER — core state + sub-module wiring.
// Auth lives in ./state/auth.js
// Import/Export lives in ./state/import-export.js
// ==========================================
import { PROGRAMS } from './constants.js';
import { getCatalogEntry } from './programs/catalog.js';
import { prescribeSetsForLift } from './engine.js';
import { todayKey } from './dates.js';
import { getWeekModifier } from './schema.js';
export { showToast } from './toast.js';
import { showToast } from './toast.js';
import { recomputeLoadMetrics } from './brain/load_models.js';
import { getSupabaseClient } from './state/supabase.js';
import { initAuth, loginToSupabase, signUpToSupabase, checkActiveSession } from './state/auth.js';
import { initImportExport, triggerEngineExport, triggerCSVExport, triggerEngineImport, setImportSuccessCallback } from './state/import-export.js';

export { loginToSupabase, signUpToSupabase, checkActiveSession };
export { triggerEngineExport, triggerCSVExport, triggerEngineImport, setImportSuccessCallback };

const STORAGE_KEY = 'hybrid_engine_v2_state';

// Base state configuration
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
  liftNames: {},
  liftIdMap: {},
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
        creator: catalogEntry.author?.name || 'HybridHQ',
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
  saveStateToLocalStorage(false);
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
    appState.weeks[wk] = { runs: {}, lifts: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {}, dates: {} };
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
      if (dayBlueprint && dayBlueprint.lifts && dayBlueprint.lifts.length > 0) {
        const weekModifier = getWeekModifier(activeProgram, wk);

        dayBlueprint.lifts.forEach(liftName => {
          appState.weeks[wk].lifts[d][liftName] =
            prescribeSetsForLift(wk, d, liftName, dayBlueprint.desc, weekModifier);
        });
      }
    });
  }
}

// Merge a new program's exercise slots into an existing week without touching
// any already-logged sets. Called after a program switch so the cockpit shows
// the new exercises while preserving all historical log data.
export function mergeWeekSchema(wk) {
  verifyWeekStorageSchema(wk); // creates the week object if it doesn't exist yet
  const activeProgram = getProgramById(appState.activeProgramId);
  if (!activeProgram?.days) return;
  const weekModifier = getWeekModifier(activeProgram, wk);
  DEFAULT_DAYS.forEach(d => {
    const dayBlueprint = activeProgram.days[d];
    if (!dayBlueprint?.lifts?.length) return;
    if (!appState.weeks[wk].lifts[d]) appState.weeks[wk].lifts[d] = {};
    dayBlueprint.lifts.forEach(liftName => {
      if (!appState.weeks[wk].lifts[d][liftName]) {
        appState.weeks[wk].lifts[d][liftName] =
          prescribeSetsForLift(wk, d, liftName, dayBlueprint.desc, weekModifier);
      }
    });
  });
}

// ==========================================
// CLOUD PERSISTENCE
// ==========================================
export async function saveStateToLocalStorage(suppressToast = false) {
  appState.loadMetrics = recomputeLoadMetrics(appState);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error('Failed to save state locally:', e);
  }

  const _sb = getSupabaseClient();
  if (_sb) {
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
  } else {
     if (!suppressToast) showToast('Session Saved Locally ✓');
  }
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
    currentWeek: '1', activeProgramId: 'hybrid_engine', weekStartedAt: null,
    weeks: {}, exerciseStats: {}, customExercises: [], customPrograms: [], bodyWeightLog: [],
    thresholdPaceSeconds: null, deloadApplied: null, _deloadDismissedWeek: null,
    streakData: { current: 0, longest: 0, lastActivityDate: null },
    goalData: { milestones: [], completedCount: 0 },
    prGoals: {},
    liftNames: {},
    liftIdMap: {},
    loadMetrics: { atl: 0, ctl: 0 },
    healthConnect: { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [], stepGoal: 10000 },
    wellnessLog: [],
    fastingSession: { active: false, startTime: null, goal: 16, history: [] },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
    settings: { name: '', weightUnit: 'kg', distanceUnit: 'km', restTimerDefault: 90, progressionIncrement: 2.5, defaultBodyWeight: null, autoAdvanceWeek: true, theme: 'dark', onboardingComplete: false, fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym', weekStartDay: 'mon', fastingDefault: 16, reminderTime: { hour: 7, minute: 30 }, notifWeeklySummary: false, notifStreak: false, streakAlertTime: { hour: 20, minute: 0 }, notifMissedWorkout: false, equipment: { barbell: true, rack: true, dumbbells: true, cables: true, pullupBar: true, bands: false, kettlebells: false, treadmill: false }, avatarDataUrl: null },
    profileSections: { order: null, hidden: [] },
  };

  if (localData) {
    appState = { ...baseDefaults, ...localData };
  }

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
        appState = { ...baseDefaults, ...cloudData };
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
  if (!appState.liftNames) appState.liftNames = {};
  if (!appState.liftIdMap) appState.liftIdMap = {};
  if (!appState.prGoals) appState.prGoals = {};
  if (!appState.profileSections) appState.profileSections = { order: null, hidden: [] };
  if (!appState.settings.avatarDataUrl && appState.settings.avatarDataUrl !== null) appState.settings.avatarDataUrl = null;

  const weeksToDelete = [];
  for (const wk in appState.weeks) {
    const wkData = appState.weeks[wk];
    if (!wkData || !wkData.lifts) continue;
    const hasLegacySchema = DEFAULT_DAYS.some(d => Array.isArray(wkData.lifts[d]));
    if (hasLegacySchema) weeksToDelete.push(wk);
  }
  weeksToDelete.forEach(wk => { delete appState.weeks[wk]; });

  verifyWeekStorageSchema(appState.currentWeek);
  appState.loadMetrics = recomputeLoadMetrics(appState);

  // Wire up sub-modules now that state is live
  initAuth(pullEngineDataFromStorage);
  initImportExport({
    getState:    () => appState,
    setState:    (s) => { appState = s; },
    saveState:   saveStateToLocalStorage,
    defaultDays: DEFAULT_DAYS,
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

export function logActivityForStreak() {
  const today = todayKey();
  if (!appState.streakData) appState.streakData = { current: 0, longest: 0, lastActivityDate: null };
  const lastDate = appState.streakData.lastActivityDate;
  
  if (lastDate === today) return; 

  if (lastDate) {
    const last = new Date(lastDate);
    const current = new Date(today);
    last.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);
    
    const diffTime = current - last;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) appState.streakData.current += 1;
    else if (diffDays > 1) appState.streakData.current = 1;
  } else {
    appState.streakData.current = 1;
  }

  if (appState.streakData.current > appState.streakData.longest) {
    appState.streakData.longest = appState.streakData.current;
  }

  appState.streakData.lastActivityDate = today;
  saveStateToLocalStorage(true);
}

export function addGoalMilestone(title) {
  if (!appState.goalData) appState.goalData = { milestones: [], completedCount: 0 };
  appState.goalData.milestones.push({ 
    id: Date.now().toString(), title: title, completed: false, dateAdded: new Date().toISOString()
  });
  saveStateToLocalStorage(true);
}

export function toggleMilestoneCompletion(id) {
  if (!appState.goalData) return;
  const milestone = appState.goalData.milestones.find(m => m.id === id);
  if (milestone) {
    milestone.completed = !milestone.completed;
    appState.goalData.completedCount = appState.goalData.milestones.filter(m => m.completed).length;
    saveStateToLocalStorage(true);
  }
}