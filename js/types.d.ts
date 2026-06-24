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
  restTimerDefault?: number;
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
  liftNames: Record<string, string>;
  liftIdMap: Record<string, string>;
  loadMetrics: LoadMetrics;
  healthConnect: HealthConnectState;
  wellnessLog: any[];
  fastingSession: FastingSession;
  programLibrary: ProgramLibrary;
  profileSections?: { order: string[] | null; hidden: string[] };
  settings?: AppSettings;
}
