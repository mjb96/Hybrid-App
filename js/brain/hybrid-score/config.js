// @ts-check
// =============================================================================
// HYBRID SCORE — CONFIG (js/brain/hybrid-score/config.js)
//
// Single source of truth for weights, level-adaptation thresholds, score bands
// and the career-level ladder. Everything tunable lives here so the model can
// be adjusted without touching the engine. Pure data + tiny pure helpers.
// =============================================================================

// Pillar weights (default profile). Must be the full set; the engine drops
// pillars with no data and renormalises across whatever remains.
export const PILLAR_WEIGHTS = Object.freeze({
  consistency: 0.22,
  recovery:    0.18,
  strength:    0.14,
  endurance:   0.14,
  load:        0.12,
  momentum:    0.10,
  body:        0.05,
  lifestyle:   0.05,
});

// Human labels + accent tokens for each pillar (UI + drivers).
export const PILLAR_META = Object.freeze({
  consistency: { label: 'Consistency',    icon: '🎯', color: 'var(--color-blue)'  },
  recovery:    { label: 'Recovery',       icon: '❤️', color: 'var(--color-green)' },
  strength:    { label: 'Strength',       icon: '💪', color: 'var(--color-blue)'  },
  endurance:   { label: 'Endurance',      icon: '🏃', color: 'var(--color-pink)'  },
  load:        { label: 'Training Load',  icon: '⚖️', color: 'var(--color-amber)' },
  momentum:    { label: 'Momentum',       icon: '📈', color: 'var(--color-green)' },
  body:        { label: 'Body Comp',      icon: '⚖️', color: 'var(--color-green)' },
  lifestyle:   { label: 'Lifestyle',      icon: '🌙', color: 'var(--color-blue)'  },
});

// Progression needed (percent gain over the trailing window) to earn a full
// progression sub-score, scaled by athlete level. Beginners are rewarded for
// smaller gains and never punished for a modest week (higher floor); advanced
// athletes must sustain progression. Applies to Strength & Endurance pillars.
export const LEVEL_PROGRESSION = Object.freeze({
  beginner:     { fullGainPct: 2.0, floor: 55 },
  intermediate: { fullGainPct: 3.5, floor: 45 },
  advanced:     { fullGainPct: 5.0, floor: 40 },
});

export function levelProfile(fitnessLevel) {
  return LEVEL_PROGRESSION[fitnessLevel] || LEVEL_PROGRESSION.intermediate;
}

// Score bands → status label + colour. Shared by gauge + drivers.
export const SCORE_BANDS = Object.freeze([
  { min: 90, status: 'Elite',      color: '#10b981' },
  { min: 80, status: 'Excellent',  color: '#22c55e' },
  { min: 70, status: 'Strong',     color: '#3b82f6' },
  { min: 55, status: 'Building',   color: '#f59e0b' },
  { min: 40, status: 'Fragile',    color: '#f97316' },
  { min: 0,  status: 'At Risk',    color: '#ef4444' },
]);

export function scoreBand(score) {
  if (score == null) return { status: 'Calibrating', color: 'rgba(255,255,255,0.4)' };
  return SCORE_BANDS.find(b => score >= b.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
}

// Career Hybrid-Level ladder, driven by cumulative XP (monotonic — only ever
// climbs). "Hybrid Athlete" is the aspirational midpoint (the app's namesake).
export const HYBRID_LEVELS = Object.freeze([
  { tier: 1, name: 'Initiate',       minXp: 0,     icon: '○' },
  { tier: 2, name: 'Builder',        minXp: 500,   icon: '◔' },
  { tier: 3, name: 'Competitor',     minXp: 1500,  icon: '◑' },
  { tier: 4, name: 'Hybrid Athlete', minXp: 3500,  icon: '◕' },
  { tier: 5, name: 'Elite',          minXp: 7000,  icon: '●' },
  { tier: 6, name: 'Apex',           minXp: 12000, icon: '✦' },
  { tier: 7, name: 'Legend',         minXp: 20000, icon: '★' },
]);

// Deload detection: a phase label containing "deload", or an explicit apply.
export function isDeloadWeek(state, weekPhaseName) {
  const wk = String(state?.currentWeek ?? '');
  if (state?.deloadApplied != null && String(state.deloadApplied) === wk) return true;
  return /deload/i.test(String(weekPhaseName || ''));
}
