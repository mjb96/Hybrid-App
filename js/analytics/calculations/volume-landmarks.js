// @ts-check
// ==========================================
// VOLUME LANDMARKS — analytics/calculations/volume-landmarks.js
//
// Per-muscle weekly-set landmarks and the classifier that places a muscle's
// current volume against them. Pure, no DOM, no side effects — the single
// source of truth shared by the strength analytics payload and its charts.
//
// Landmarks (Renaissance Periodization framework), in weekly hard sets:
//   MV  — Maintenance Volume:        floor to retain the muscle
//   MEV — Minimum Effective Volume:  where growth begins
//   MAV — Maximum Adaptive Volume:   top of the productive range
//   MRV — Maximum Recoverable Volume: ceiling; beyond this is junk / injury risk
//
// Volume is measured with the app's weighted-set-credit metric
// (weeklyVolumeByMuscle: a directly-worked set counts 1.0, a secondary set 0.5).
// That fractional counting matches how these landmarks are defined, so the two
// line up without a second parallel metric.
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
  Arms:      ['biceps', 'triceps', 'brachialis'],
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
  biceps: 'Biceps', triceps: 'Triceps', brachialis: 'Brachialis',
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
    case 'detraining':   return 'Under MV';
    case 'maintenance':  return 'Maintain';
    case 'growth':       return 'Growth';
    case 'optimal':      return 'Optimal';
    case 'overreaching': return 'Over MRV';
    default:             return 'No data';
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
  const round1 = v => Math.round(v * 10) / 10;
  const setsFor = m => round1((muscleByWeek?.[m]?.[idx]) || 0);

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

  return { muscles, groups };
}
