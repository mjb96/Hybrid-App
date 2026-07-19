// @ts-check
// ==========================================
// VOLUME LANDMARKS — analytics/calculations/volume-landmarks.js
//
// Broad weekly volume guidance. These are not individual prescriptions or
// scientifically exact MEV/MRV thresholds: adaptation depends on effort,
// exercise selection, training age and recovery, which the logger cannot fully
// observe. The UI therefore calls them typical ranges and explains the estimate.
// Credits come from the canonical exercise catalogue (dominant 1.0,
// meaningful secondary 0.5, minor 0.25; stabilisers 0).
// ==========================================

/**
 * @typedef {{ mv:number, mev:number, mav:number, mrv:number }} Landmarks
 */

/** @type {Record<string, Landmarks>} */
export const VOLUME_LANDMARKS = {
  // Chest
  chest:        { mv: 8, mev: 10, mav: 20, mrv: 22 },
  upper_chest:  { mv: 4, mev: 6,  mav: 12, mrv: 14 },
  // Back
  lats:         { mv: 6, mev: 10, mav: 20, mrv: 22 },
  upper_back:   { mv: 6, mev: 10, mav: 20, mrv: 25 },
  traps:        { mv: 0, mev: 4,  mav: 16, mrv: 20 },
  erectors:     { mv: 4, mev: 6,  mav: 12, mrv: 16 },
  // Legs
  quads:        { mv: 6, mev: 8,  mav: 18, mrv: 20 },
  hamstrings:   { mv: 4, mev: 6,  mav: 16, mrv: 20 },
  glutes:       { mv: 0, mev: 4,  mav: 12, mrv: 16 },
  adductors:    { mv: 0, mev: 4,  mav: 12, mrv: 16 },
  calves:       { mv: 6, mev: 8,  mav: 16, mrv: 20 },
  // Shoulders
  front_delts:  { mv: 0, mev: 6,  mav: 12, mrv: 16 },
  side_delts:   { mv: 6, mev: 8,  mav: 22, mrv: 26 },
  rear_delts:   { mv: 0, mev: 6,  mav: 18, mrv: 25 },
  // Arms
  biceps:       { mv: 4, mev: 8,  mav: 20, mrv: 26 },
  triceps:      { mv: 4, mev: 6,  mav: 14, mrv: 18 },
  brachialis:   { mv: 0, mev: 4,  mav: 12, mrv: 16 },
  forearms:     { mv: 0, mev: 4,  mav: 12, mrv: 18 },
  // Core
  core:         { mv: 0, mev: 6,  mav: 16, mrv: 25 },
};

// The 6 canonical groups → their constituent fine-grained muscles. Owned here
// (rather than in strength-calcs) so the landmark module has no import cycle;
// strength-calcs imports it back for its aggregation.
/** @type {Record<string, string[]>} */
export const MUSCLE_GROUPS = {
  Chest:     ['chest', 'upper_chest'],
  Back:      ['lats', 'upper_back', 'traps', 'erectors'],
  Legs:      ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'],
  Shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  Arms:      ['biceps', 'triceps', 'brachialis', 'forearms'],
  Core:      ['core'],
};

// Human-readable labels for the fine-grained muscles.
/** @type {Record<string, string>} */
export const MUSCLE_LABELS = {
  chest: 'Chest', upper_chest: 'Upper Chest',
  lats: 'Lats', upper_back: 'Upper Back', traps: 'Traps', erectors: 'Erectors',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  adductors: 'Adductors', calves: 'Calves',
  front_delts: 'Front Delts', side_delts: 'Side Delts', rear_delts: 'Rear Delts',
  biceps: 'Biceps', triceps: 'Triceps', brachialis: 'Brachialis', forearms: 'Forearms',
  core: 'Core',
};

// Group landmarks derived by summing their muscles' landmarks, so a group's
// total volume is judged against the sum of its parts' targets — consistent
// with the per-muscle view by construction.
/** @type {Record<string, Landmarks>} */
export const GROUP_LANDMARKS = Object.fromEntries(
  Object.entries(MUSCLE_GROUPS).map(([group, muscles]) => {
    const acc = { mv: 0, mev: 0, mav: 0, mrv: 0 };
    muscles.forEach(m => {
      const lm = VOLUME_LANDMARKS[m];
      if (!lm) return;
      acc.mv += lm.mv; acc.mev += lm.mev; acc.mav += lm.mav; acc.mrv += lm.mrv;
    });
    return [group, acc];
  })
);

// Zone vocabulary, shared by every consumer.
export const ZONES = ['no_data', 'detraining', 'maintenance', 'growth', 'optimal', 'overreaching'];

/**
 * Place a weekly volume against a set of landmarks.
 * @param {number} sets
 * @param {Landmarks} [lm]
 * @returns {'no_data'|'detraining'|'maintenance'|'growth'|'optimal'|'overreaching'}
 */
export function classifyVolume(sets, lm) {
  if (!lm) return 'no_data';
  if (!(sets > 0)) return 'no_data';
  if (lm.mv > 0 && sets < lm.mv) return 'detraining';
  if (sets < lm.mev) return 'maintenance';
  if (sets < lm.mav) return 'growth';
  if (sets <= lm.mrv) return 'optimal';
  return 'overreaching';
}

/** @param {string} zone */
export function zoneLabel(zone) {
  switch (zone) {
    case 'detraining':   return 'Below typical';
    case 'maintenance':  return 'Maintenance';
    case 'growth':       return 'Productive range';
    case 'optimal':      return 'Upper range';
    case 'overreaching': return 'Above typical';
    default:             return 'No completed sets';
  }
}

/** @param {string} zone */
export function zoneColor(zone) {
  switch (zone) {
    case 'detraining':   return '#ef4444';
    case 'maintenance':  return '#eab308';
    case 'growth':       return '#22d3ee';
    case 'optimal':      return '#10b981';
    case 'overreaching': return '#f97316';
    default:             return 'rgba(255,255,255,0.25)';
  }
}

/**
 * Build the current-week landmark report for every muscle and every group.
 * @param {Record<string, number[]>} muscleByWeek  weeklyVolumeByMuscle output
 * @param {number} currentWeek  1-indexed
 * @returns {{ muscles: Record<string, any>, groups: Record<string, any> }}
 */
export function buildMuscleLandmarkReport(muscleByWeek, currentWeek) {
  const idx = (currentWeek || 1) - 1;
  const credits = Object.fromEntries(Object.keys(VOLUME_LANDMARKS).map((muscle) => [
    muscle, muscleByWeek?.[muscle]?.[idx] || 0,
  ]));
  return buildMuscleLandmarkReportFromCredits(credits);
}

/** Build a report from one calendar week's muscle-credit totals. */
export function buildMuscleLandmarkReportFromCredits(credits) {
  const round1 = v => Math.round(v * 10) / 10;
  const setsFor = m => round1(credits?.[m] || 0);

  const muscles = {};
  for (const [m, lm] of Object.entries(VOLUME_LANDMARKS)) {
    const sets = setsFor(m);
    const zone = classifyVolume(sets, lm);
    muscles[m] = { muscle: m, name: MUSCLE_LABELS[m] || m, sets, ...lm, zone, label: zoneLabel(zone) };
  }

  const groups = {};
  for (const [group, members] of Object.entries(MUSCLE_GROUPS)) {
    const sets = round1(members.reduce((a, m) => a + setsFor(m), 0));
    const lm = GROUP_LANDMARKS[group];
    const zone = classifyVolume(sets, lm);
    groups[group] = { group, sets, ...lm, zone, label: zoneLabel(zone), muscles: members };
  }

  return {
    muscles,
    groups,
    methodology: {
      unit: 'estimated_set_credits',
      period: 'calendar_week',
      weights: { dominant: 1, secondary: 0.5, minor: 0.25 },
      caveat: 'Typical ranges based on completed working sets; effort and individual response are not fully measured.',
    },
  };
}
