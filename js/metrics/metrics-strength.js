// @ts-check
// ==========================================
// STRENGTH METRICS (metrics/metrics-strength.js)
// ==========================================
// Pure functions — no DOM, no imports, no side effects.
// All take (state, days, …) so they can be tested in isolation.
// ==========================================

// ---- internal helpers -----------------------------------------------------

function e1rm(weight, reps) {
  return weight * (1 + reps / 30);
}

/**
 * Is a lift a genuine PR this week — a NEW best that beats prior history — rather
 * than a first-ever baseline? Mirrors the cockpit rule (a PR needs prior history;
 * the first log of a lift is a "baseline", not a trophy) so analytics and the
 * cockpit agree. Needs a stat carrying priorBestMax (best e1RM before this week).
 * @param {{currentEstimatedMax?:number, allTimeMax?:number, priorBestMax?:number}} stat
 */
export function isWeeklyPR(stat) {
  if (!stat) return false;
  const cur   = stat.currentEstimatedMax || 0;
  const all   = stat.allTimeMax || 0;
  const prior = stat.priorBestMax || 0;
  // Must have prior history (else it's a baseline) AND this week must hold the
  // all-time best (the current-week max is the top e1RM on record).
  return cur > 0 && prior > 0 && cur >= all - 0.01;
}

function isCompleted(s) {
  return s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
}

function isWorkingSet(s) {
  return isCompleted(s) && s.type !== 'W' && !s.isWarmup;
}

// ---- muscle map (primary weight 1.0, secondary weight 0.5) ----------------
export const MUSCLE_MAP = {
  'Back Squat':                { primary: ['quads', 'glutes'],                  secondary: ['erectors', 'adductors'] },
  'Front Squat':               { primary: ['quads'],                            secondary: ['glutes', 'core'] },
  'Romanian Deadlift':         { primary: ['hamstrings', 'glutes'],             secondary: ['erectors'] },
  'Deadlift':                  { primary: ['hamstrings', 'glutes'],             secondary: ['erectors', 'traps', 'lats'] },
  'Deficit Deadlift':          { primary: ['hamstrings', 'glutes'],             secondary: ['erectors', 'traps', 'lats'] },
  'Bulgarian Split Squat':     { primary: ['quads', 'glutes'],                  secondary: ['hamstrings', 'adductors'] },
  'Leg Press':                 { primary: ['quads'],                            secondary: ['glutes', 'hamstrings'] },
  'Hamstring Curl':            { primary: ['hamstrings'],                       secondary: [] },
  'Dumbbell Lying Hamstring Curl': { primary: ['hamstrings'],                   secondary: ['glutes'] },
  'Calf Raises':               { primary: ['calves'],                           secondary: [] },
  'Bench Press':               { primary: ['chest', 'front_delts'],             secondary: ['triceps'] },
  'Incline DB Press':          { primary: ['upper_chest', 'front_delts'],       secondary: ['triceps'] },
  'Incline Bench Press':       { primary: ['upper_chest', 'front_delts'],       secondary: ['triceps'] },
  'Incline Barbell Press':     { primary: ['upper_chest', 'front_delts'],       secondary: ['triceps'] },
  'Close-Grip Bench':          { primary: ['triceps'],                          secondary: ['chest'] },
  'Push-Ups':                  { primary: ['chest'],                            secondary: ['triceps', 'front_delts'] },
  'Close-Grip Push-Ups':       { primary: ['triceps'],                          secondary: ['chest'] },
  'Dips':                      { primary: ['chest', 'triceps'],                 secondary: ['front_delts'] },
  'Standing Barbell OHP':      { primary: ['front_delts'],                      secondary: ['triceps', 'upper_chest', 'core'] },
  'Standing OHP':              { primary: ['front_delts'],                      secondary: ['triceps', 'upper_chest', 'core'] },
  'Seated DB Shoulder Press':  { primary: ['front_delts'],                      secondary: ['triceps', 'upper_chest'] },
  'Lateral Raise':             { primary: ['side_delts'],                       secondary: [] },
  'Tricep Band Pushdown':      { primary: ['triceps'],                          secondary: [] },
  'Tricep Pushdown':           { primary: ['triceps'],                          secondary: [] },
  'Lying DB Tricep Extension': { primary: ['triceps'],                          secondary: [] },
  'Pull-Ups':                  { primary: ['lats', 'upper_back'],               secondary: ['biceps', 'rear_delts'] },
  'Chin-Ups':                  { primary: ['lats', 'biceps'],                   secondary: ['upper_back'] },
  'Lat Pulldown':              { primary: ['lats'],                             secondary: ['upper_back', 'biceps'] },
  'Barbell Bent-Over Row':     { primary: ['upper_back', 'lats'],               secondary: ['biceps', 'rear_delts', 'erectors'] },
  'Barbell Row':               { primary: ['upper_back', 'lats'],               secondary: ['biceps', 'rear_delts'] },
  'Chest Supported Dumbbell Row': { primary: ['upper_back'],                    secondary: ['rear_delts', 'biceps'] },
  'Chest Supported Row':       { primary: ['upper_back'],                       secondary: ['rear_delts', 'biceps'] },
  'Single-Arm DB Row':         { primary: ['lats', 'upper_back'],               secondary: ['biceps'] },
  'Single Arm DB Row':         { primary: ['lats', 'upper_back'],               secondary: ['biceps'] },
  'Face Pull':                 { primary: ['rear_delts'],                       secondary: ['upper_back'] },
  'Rear Delt Fly':             { primary: ['rear_delts'],                       secondary: ['upper_back'] },
  'Hammer Curl':               { primary: ['brachialis', 'biceps'],             secondary: [] },
  'Barbell Curl (Heavy)':      { primary: ['biceps'],                           secondary: ['brachialis'] },
  'Barbell Curl':              { primary: ['biceps'],                           secondary: ['brachialis'] },
  'Barbell Biceps Curl (Light)':{ primary: ['biceps'],                          secondary: ['brachialis'] },
  'Bicep Curl':                { primary: ['biceps'],                           secondary: ['brachialis'] },
  'EZ Bar Curl':               { primary: ['biceps'],                           secondary: ['brachialis'] },
  'Incline DB Curl':           { primary: ['biceps'],                           secondary: [] },
  'Core/Plank':                { primary: ['core'],                             secondary: [] },
  'Hanging Leg Raises':        { primary: ['core'],                             secondary: [] },
  'Ab Wheel Rollouts':         { primary: ['core'],                             secondary: [] },
  'Cable Crunches':            { primary: ['core'],                             secondary: [] },
};

// ---- public API -----------------------------------------------------------

// Returns total completed working-set tonnage (w×r) per week, indexed 1..maxWeek.
export function weeklyTonnageSeries(state, days, maxWeek) {
  const result = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    let ton = 0;
    if (wkData) {
      days.forEach(d => {
        const dayLifts = wkData.lifts?.[d] || {};
        for (const lift in dayLifts) {
          if (!Array.isArray(dayLifts[lift])) continue;
          dayLifts[lift].forEach(s => {
            if (isWorkingSet(s)) ton += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
          });
        }
      });
    }
    result.push(ton);
  }
  return result;
}

// Returns best e1RM per lift per week: {[liftName]: number[]}.
export function weeklyE1rmByLift(state, days, maxWeek) {
  const result = {};
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    days.forEach(d => {
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        if (!result[lift]) result[lift] = new Array(maxWeek).fill(0);
        dayLifts[lift].forEach(s => {
          if (!isWorkingSet(s)) return;
          const val = e1rm(parseFloat(s.w) || 0, parseInt(s.r, 10) || 0);
          if (val > result[lift][w - 1]) result[lift][w - 1] = val;
        });
      }
    });
  }
  return result;
}

// Median of a numeric array (sorted copy; robust to a single outlier).
function _median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// E8 — robust weekly e1RM. `weeklyE1rmByLift` stores each week's single best-set
// e1RM, and the e1RM formula OVER-estimates a grindy near-max single (low reps),
// so one such set spikes the series and, with it, the Strength score. This
// replaces each *training* week's peak with the MEDIAN of the trailing `window`
// training weeks: a one-off spike is rejected (median ignores a lone outlier),
// while a genuine PR that's actually repeated persists into the median within a
// couple of weeks. Non-training weeks (0) stay 0 so progression's gap-skipping
// (lastNonZero/priorNonZero) still works.
export function robustE1rmSeries(series, window = 3) {
  const out = new Array(series.length).fill(0);
  const seen = []; // trailing non-zero (training-week) values, in order
  for (let i = 0; i < series.length; i++) {
    if (series[i] > 0) {
      seen.push(series[i]);
      out[i] = _median(seen.slice(-window));
    }
  }
  return out;
}

// E8 — compound weighting. A squat PR is a truer signal of whole-body strength
// than a curl PR, and isolation lifts are both easy to PR and easy to game, so
// each lift's contribution to the Strength progression average is scaled by its
// tier. Checked accessory → secondary → primary (order matters: "incline bench"
// must resolve as secondary, not primary "bench"). Unknown lifts stay neutral so
// an unusual name is neither inflated nor punished.
export function liftWeight(name) {
  const n = String(name || '').toLowerCase();
  if (/curl|extension|lateral|front raise|rear delt|\bfly|flye|calf|shrug|face.?pull|pec.?deck|kickback|pullover|crunch|sit.?up|plank|abduction|adduction|wrist|reverse fly/.test(n))
    return 0.25; // isolation / accessory
  if (/split|bulgarian|lunge|goblet|hack|sissy|leg press|romanian|stiff|\brdl\b|good morning|hip thrust|\brow\b|pull.?up|chin.?up|pull.?down|\bdip\b|push press|incline|decline|close.?grip/.test(n))
    return 0.6; // secondary compound / assistance
  if (/\bsquat\b|dead\s?lift|bench|overhead press|military|strict press|\bohp\b|shoulder press|clean|snatch|\bjerk\b|\bpress\b/.test(n))
    return 1.0; // primary barbell compound
  return 0.5; // unknown → neutral
}

// E5 — true adherence / workout quality. Each logged set can carry the prescribed
// target it was measured against (`tw`/`tr`, captured by the workout logger). For
// the COMPLETED working sets that carry a target, this scores how fully the actual
// load-volume met the prescription: hitting or beating target = full marks; a set
// logged far below target (junk — 20 kg × 2 against a 100 kg × 5 prescription) =
// low. Sets with no target (free logging / legacy data) are ignored, so the signal
// only speaks when there's a plan to measure against and never punishes its absence.
// Returns { hasData, pct, n } over the trailing `window` weeks.
export function workoutQuality(state, days, maxWeek, window = 3) {
  let sum = 0, n = 0;
  const from = Math.max(1, maxWeek - window + 1);
  for (let w = from; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    days.forEach(d => {
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          if (!isWorkingSet(s)) return;
          const tw = parseFloat(s.tw) || 0;
          const tr = parseInt(s.tr, 10) || 0;
          const targetVol = tw * tr;
          if (targetVol <= 0) return; // no prescription → not measurable
          const actualVol = (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
          sum += Math.max(0, Math.min(1, actualVol / targetVol));
          n++;
        });
      }
    });
  }
  if (n === 0) return { hasData: false, pct: null, n: 0 };
  return { hasData: true, pct: Math.round((sum / n) * 100), n };
}

// Returns {[lift]: {allTimeMax, currentWeekMax, prevWeekMax}} scanning all weeks.
export function allLiftsStats(state, days) {
  const result = {};
  const curWk = String(state.currentWeek || '1');
  const prevWk = String((parseInt(curWk, 10) || 1) - 1);

  for (const wKey in (state.weeks || {})) {
    const wkData = state.weeks[wKey];
    days.forEach(d => {
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        if (!result[lift]) result[lift] = { allTimeMax: 0, currentWeekMax: 0, prevWeekMax: 0 };
        dayLifts[lift].forEach(s => {
          if (!isWorkingSet(s)) return;
          const val = e1rm(parseFloat(s.w) || 0, parseInt(s.r, 10) || 0);
          if (val > result[lift].allTimeMax) result[lift].allTimeMax = val;
          if (wKey === curWk  && val > result[lift].currentWeekMax) result[lift].currentWeekMax = val;
          if (wKey === prevWk && val > result[lift].prevWeekMax)    result[lift].prevWeekMax = val;
        });
      }
    });
  }
  return result;
}

// Returns {squat, bench, deadlift}: each has allTime e1RM and byWeek{} map.
export function big3Progression(state) {
  const result = {
    squat:    { allTime: 0, byWeek: {} },
    bench:    { allTime: 0, byWeek: {} },
    deadlift: { allTime: 0, byWeek: {} },
  };
  const BIG3 = { squat: 'Back Squat', bench: 'Bench Press', deadlift: 'Deadlift' };

  for (const wKey in (state.weeks || {})) {
    const wkData = state.weeks[wKey];
    for (const [key, liftName] of Object.entries(BIG3)) {
      for (const d in (wkData?.lifts || {})) {
        const sets = wkData.lifts[d]?.[liftName];
        if (!Array.isArray(sets)) continue;
        sets.forEach(s => {
          if (!isWorkingSet(s)) return;
          const val = e1rm(parseFloat(s.w) || 0, parseInt(s.r, 10) || 0);
          if (val > result[key].allTime) result[key].allTime = val;
          if (!result[key].byWeek[wKey] || val > result[key].byWeek[wKey]) {
            result[key].byWeek[wKey] = val;
          }
        });
      }
    }
  }
  return result;
}

// Convenience: flat {squat, bench, deadlift} all-time maxes.
export function big3Maxes(state) {
  const prog = big3Progression(state);
  return { squat: prog.squat.allTime, bench: prog.bench.allTime, deadlift: prog.deadlift.allTime };
}

// Returns {[muscle]: number[]} — weighted set credits (primary 1.0, secondary 0.5)
// per muscle per week. Excludes warmups. Returns {} when no data.
export function weeklyVolumeByMuscle(state, days, maxWeek) {
  /** @type {Record<string, number[]>} */
  const result = {};

  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    days.forEach(d => {
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const liftName in dayLifts) {
        if (!Array.isArray(dayLifts[liftName])) continue;
        const muscles = MUSCLE_MAP[liftName];
        if (!muscles) continue;

        let workingSets = 0;
        dayLifts[liftName].forEach(s => { if (isWorkingSet(s)) workingSets++; });
        if (workingSets === 0) continue;

        muscles.primary.forEach(m => {
          if (!result[m]) result[m] = new Array(maxWeek).fill(0);
          result[m][w - 1] += workingSets * 1.0;
        });
        muscles.secondary.forEach(m => {
          if (!result[m]) result[m] = new Array(maxWeek).fill(0);
          result[m][w - 1] += workingSets * 0.5;
        });
      }
    });
  }
  return result;
}
