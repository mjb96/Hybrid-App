// Shared JSDoc-importable types for the app's core contracts.
// Reference from .js with:  /** @type {import('./types').AppState} */
// Kept intentionally loose where shapes are large/dynamic (Record<string, any>);
// the value is documenting the top-level state contract and catching typos.

export interface StreakData {
  current: number;
  longest: number;
  lastActivityDate: string | null;
}

export interface GoalData {
  milestones: any[];
  completedCount: number;
}

export interface LoadMetrics {
  atl: number;
  ctl: number;
}

export interface HealthConnectState {
  connected: boolean;
  lastSync: string | null;
  hrv: any[];
  restingHR: any[];
  sleep: any[];
  steps: any[];
  vo2max: any[];
  stepGoal: number;
}

export interface FastingSession {
  active: boolean;
  startTime: number | null;
  goal: number;
  history: any[];
}

export interface ProgramLibrary {
  bookmarks: string[];
  completions: Array<{ programId: string; completedAt: string; weeksCompleted: number }>;
  recentlyViewed: Array<{ programId: string; viewedAt: string }>;
  personalRatings: Record<string, { rating: number; review?: string; ratedAt: string }>;
  activeFilters: Record<string, any>;
}

export interface AppSettings {
  name?: string;
  weightUnit?: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'mi';
  theme?: 'dark' | 'light' | 'system';
  restPeriods?: { compound: number; accessory: number; isolation: number };
  restTimerEnabled?: boolean;
  restOverrides?: Record<string, number>;
  progressionIncrement?: number;
  fitnessGoal?: string;
  fitnessLevel?: string;
  weekStartDay?: 'mon' | 'sun';
  fastingDefault?: number;
  defaultBodyWeight?: number;
  [key: string]: any;
}

export interface AppState {
  currentWeek: string;
  activeProgramId: string;
  weekStartedAt: number | null;
  weeks: Record<string, any>;
  exerciseStats: Record<string, any>;
  customExercises: any[];
  customPrograms: any[];
  bodyWeightLog: Array<{ weight: number; date?: string }>;
  thresholdPaceSeconds: number | null;
  deloadApplied: any;
  _deloadDismissedWeek: string | null;
  streakData: StreakData;
  goalData: GoalData;
  prGoals: Record<string, any>;
  loadMetrics: LoadMetrics;
  healthConnect: HealthConnectState;
  wellnessLog: any[];
  fastingSession: FastingSession;
  programLibrary: ProgramLibrary;
  profileSections?: { order: string[] | null; hidden: string[] };
  settings?: AppSettings;
}

// Globals injected by the native Android WebView host (HybridHealthBridge.kt /
// MainActivity.kt) and a few app-defined window hooks. Declared so `// @ts-check`
// modules that talk to the bridge type-check cleanly.
declare global {
  interface Window {
    /** Native Health Connect bridge (Android only; undefined on web/PWA). */
    HybridHealthBridge?: {
      getAvailabilityStatus(): string;
      requestPermissions(typesJson: string, callbackId: string): void;
      readHealthData(startIso: string, endIso: string, callbackId: string): void;
      readHealthDataByDay(startIso: string, endIso: string, callbackId: string): void;
      notifyRestComplete(title: string, body: string): void;
      saveTextFile(filename: string, content: string, mime: string): void;
    };
    /** Pending native→JS callbacks keyed by callbackId. */
    __hcCB?: Record<string, (json: string) => void>;
    /** Hardware/gesture back handler; returns 'handled' or 'exit'. */
    __onAndroidBack?: () => string;
    _hybridGetState?: () => any;
    _hybridGetProgram?: () => any;
    supabase?: any;
  }
}

export {};
