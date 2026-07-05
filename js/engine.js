// @ts-check
// ==========================================
// ENGINE: DIAGNOSTICS, 1RM, PARSER
// ==========================================
import { CONFIG } from './constants.js';
import { devWarn } from './debug.js';
import { isCompletedSet } from './set-utils.js';

// Re-exported for backwards-compatible import sites (and the engine test suite).
export { isCompletedSet };

let _getState;
let _getDays;

export function initEngine(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays = getDaysFn;
}

// ==========================================
// PRIMITIVE EXPORTS (D1–D6)
// ==========================================

export function epley1RM(weight, reps) {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  if (w <= 0 || r === 0) return 0;
  return w * (1 + r / 30);
}

export function parseDurationToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(timeStr) || 0;
}

export function paceSecondsPerKm(distKm, timeStr) {
  const d = parseFloat(distKm) || 0;
  if (!d || !timeStr) return 0;
  const mins = parseDurationToMinutes(timeStr);
  if (!mins) return 0;
  return (mins * 60) / d;
}

export function formatPace(secsPerKm) {
  if (!secsPerKm || secsPerKm === 0) return '--';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60).toString().padStart(2, '0');
  return `${m}:${s}/km`;
}

// ==========================================
// FIND LAST PERFORMANCE
// Scans weeks in descending order for the last completed working sets of a
// given lift. Lifts are stored keyed by display name.
// Returns { weekKey, day, workingSets } or null.
// ==========================================

/**
 * @param {any} state
 * @param {string} name
 * @param {{ excludeWeek?: string|number, days?: string[] }} [opts]
 */
export function findLastPerformance(state, name, { excludeWeek, days = [] } = {}) {
  const key = name;
  const weeks = Object.keys(state.weeks || {}).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  for (const wKey of weeks) {
    if (wKey === excludeWeek) continue;
    const wkData = state.weeks[wKey];
    for (const d of days) {
      const setsArr = wkData?.lifts?.[d]?.[key];
      if (!Array.isArray(setsArr) || setsArr.length === 0) continue;
      const workingSets = setsArr.filter(s => isCompletedSet(s) && s.type !== 'W' && !s.isWarmup);
      if (workingSets.length > 0) return { weekKey: wKey, day: d, workingSets };
    }
  }
  return null;
}

// ==========================================
// GRADE-ADJUSTED PACE (D10)
// Returns per-point GAP (s/km). Index 0 is always 0.
// Uphill → GAP < actual pace; downhill → GAP > actual pace.
// ==========================================

export function computeGAP(distKm, elapsedSec, altitude) {
  if (!distKm || distKm.length < 1 || !altitude || altitude.length < 1) return [];
  if (distKm.length === 1) return [0];
  const result = [0];
  for (let i = 1; i < distKm.length; i++) {
    const dDist = distKm[i] - distKm[i - 1];
    const dTime = elapsedSec[i] - elapsedSec[i - 1];
    const dElev = altitude[i] - altitude[i - 1];
    if (dDist <= 0 || dTime <= 0) { result.push(0); continue; }
    const grade  = dElev / (dDist * 1000);
    const factor = Math.exp(grade * 3.5);
    result.push((dTime / dDist) / factor);
  }
  return result;
}

// ==========================================
// TEXT DESCRIPTION PARSER ENGINE
// ==========================================
export function parseTargetFromDescription(descString, liftName) {
  let result = { sets: 3, reps: 10, matched: false };
  if (!descString || !liftName) return result;

  try {
    const escapedLift = liftName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // UPDATED REGEX: Catches normal 'x', capital 'X', and the formal multiplication sign '×'
    const regex = new RegExp(escapedLift + '\\s*\\((\\d+)\\s*[xX×]\\s*([^\\)]+)\\)', 'i');
    const match = descString.match(regex);

    if (match) {
      result.matched = true;
      result.sets = parseInt(match[1], 10) || 3;
      
      // Normalize en-dashes (–) to standard hyphens (-) before splitting
      let repValue = match[2].trim().toLowerCase().replace(/–/g, '-');

      if (repValue.includes('-')) {
        // If it's a range like "8-10", grab the higher number
        result.reps = parseInt(repValue.split('-')[1], 10) || 10;
      } else if (repValue === 'max') {
        result.reps = 10; // Fallback visual target for 'max' reps
      } else {
        result.reps = parseInt(repValue, 10) || 10;
      }
    }
  } catch (e) {
    console.error("Failed to parse exercise specs:", e);
  }
  return result;
}

// ==========================================
// DIAGNOSTIC ENGINE
// ==========================================
export function computeDiagnosticForLift(currentWeekString, dayKey, liftName, repTarget = 0) {
  /** @type {{ suggestedWeight: string|number, suggestedReps: string|number, isStalled: boolean, isFatigueOverload: boolean, message: string, progression: null | { action: string, weight: number|'', reps: number|'', rationale: string } }} */
  let result = { suggestedWeight: '', suggestedReps: '', isStalled: false, isFatigueOverload: false, message: '', progression: null };
  
  if (!_getState || !_getDays) {
    devWarn('computeDiagnosticForLift called before initEngine() — returning empty diagnostic.');
    return result;
  }
  
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const cWk = parseInt(currentWeekString, 10);
  if (isNaN(cWk) || cWk <= 1 || !appState.weeks) return result;

  const liftKey = liftName;
  const history = [];
  // The most recent session's working sets (warm-ups excluded) — the raw input
  // the auto-progression engine reasons over. Captured on the first week (newest,
  // since we iterate descending) that carries completed working sets.
  let lastSessionSets = null;
  for (let w = cWk - 1; w >= 1; w--) {
    const wData = appState.weeks[w.toString()];
    if (wData && wData.lifts && wData.lifts[dayKey]?.[liftKey]) {
      const finishedSets = wData.lifts[dayKey][liftKey].filter(s => s && s.c && s.w && s.r);
      if (finishedSets.length > 0) {
        if (!lastSessionSets) {
          lastSessionSets = finishedSets.filter(s => s.type !== 'W' && !s.isWarmup);
        }
        let bestE1rm = 0, bestWeight = 0, bestReps = 0;
        finishedSets.forEach(s => {
          const w_ = parseFloat(s.w) || 0;
          const r_ = parseInt(s.r, 10) || 0;
          const e = w_ * (1 + r_ / 30);
          if (e > bestE1rm) { bestE1rm = e; bestWeight = w_; bestReps = r_; }
        });
        history.push({ weekNum: w, weight: bestWeight, reps: bestReps, e1rm: bestE1rm });
      }
    }
  }

  if (history.length === 0) return result;

  const lastSession = history[0];
  result.suggestedWeight = lastSession.weight || '';
  result.suggestedReps = lastSession.reps || '';

  if (history.length >= 3 &&
      history[0].e1rm <= history[1].e1rm && history[1].e1rm <= history[2].e1rm) {
    result.isStalled = true;
    result.message = 'You stalled on ' + liftName + '. Reducing sets by 20% for this session to allow recovery.';
  }

  let totalRpeSum = 0, rpeCount = 0;
  const pastWkData = appState.weeks[(cWk - 1).toString()];

  if (pastWkData) {
    // Primary: per-set RPE on completed sets
    let hasPerSetRpe = false;
    DEFAULT_DAYS.forEach(d => {
      const dayLifts = pastWkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          // Warm-ups are submaximal by design — exclude them so their (low)
          // effort never skews the weekly fatigue average.
          if (isCompletedSet(s) && s.rpe && s.type !== 'W' && !s.isWarmup) {
            const rpe = parseFloat(s.rpe) || 0;
            if (rpe > 0) { totalRpeSum += rpe; rpeCount++; hasPerSetRpe = true; }
          }
        });
      }
    });

    // Fallback: session-level RPE (gym + run)
    if (!hasPerSetRpe) {
      DEFAULT_DAYS.forEach(d => {
        const runRpe = parseInt(pastWkData.runs?.[d]?.rpe, 10) || 0;
        if (runRpe > 0) { totalRpeSum += runRpe; rpeCount++; }

        const gymRpe = parseInt(pastWkData.gymRpe?.[d], 10) || 0;
        if (gymRpe > 0) { totalRpeSum += gymRpe; rpeCount++; }
      });
    }
  }
  
  const pastWeekAvgRpe = rpeCount > 0 ? totalRpeSum / rpeCount : 0;
  if (pastWeekAvgRpe >= (CONFIG.fatigueRpeThreshold || 8.5)) {
    result.isFatigueOverload = true;
    // A documented stall keeps message precedence, so callers that surface a
    // single line (home stall alerts) are unchanged in the single-flag cases.
    if (!result.message) {
      result.message = 'High fatigue detected from last week (Avg RPE ' + pastWeekAvgRpe.toFixed(1) + '). We recommend dropping workout volume by 10% today.';
    }
  }

  // Auto-progression: turn the last session into a concrete next target
  // (the ghost the cockpit shows, and what one-tap quick-log commits).
  const increment = appState.settings?.progressionIncrement || CONFIG.weightIncrement || 2.5;
  const prog = suggestProgression(lastSessionSets || [], repTarget, {
    increment,
    weightGoal: appState.settings?.weightGoal,
    stalled: result.isStalled,
    hardRpe: CONFIG.fatigueRpeThreshold || 8.5,
  });
  if (prog.action !== 'baseline') {
    result.progression = prog;
    result.suggestedWeight = prog.weight;
    result.suggestedReps = prog.reps;
  }

  return result;
}

// ==========================================
// AUTO-PROGRESSION (double progression + RPE autoregulation)
// Rule-based, evidence-grounded — not generative. Turns the last session for a
// lift into the next concrete target:
//   • missed the rep target      → chase one more rep at the same load
//   • hit target, effort in hand  → add one load increment, reps back to target
//   • hit target, effort maximal  → hold load and consolidate (avoid grinding)
//   • documented multi-week stall → cut ~10% and rebuild
//   • cutting (energy deficit)    → preserve strength: hold load, progress reps
// Pure (no state access) so it drives the cockpit ghost, the coach label and the
// quick-log target from one source, and is trivially unit-testable.
// ==========================================

/**
 * @param {any[]} lastWorkingSets  completed working sets (warm-ups excluded) from
 *   the most recent session for this lift; each has at least `w` and `r`.
 * @param {number} repTarget       prescribed top-of-range rep goal for the lift.
 * @param {{ increment?: number, weightGoal?: 'cut'|'maintain'|'bulk',
 *           stalled?: boolean, hardRpe?: number }} [opts]
 * @returns {{ action: 'baseline'|'load-up'|'hold'|'rep-up'|'deload',
 *             weight: number|'', reps: number|'', rationale: string }}
 */
export function suggestProgression(lastWorkingSets, repTarget, opts = {}) {
  const increment = opts.increment > 0 ? opts.increment : (CONFIG.weightIncrement || 2.5);
  const hardRpe   = opts.hardRpe > 0 ? opts.hardRpe : 9;
  const goal      = opts.weightGoal || 'maintain';
  /** @type {{ action: any, weight: number|'', reps: number|'', rationale: string }} */
  const baseline  = { action: 'baseline', weight: '', reps: '', rationale: '' };

  const sets = (Array.isArray(lastWorkingSets) ? lastWorkingSets : []).filter(s => {
    return (parseFloat(s?.w) > 0) && (parseInt(s?.r, 10) > 0);
  });
  if (sets.length === 0) return baseline;

  // Reference = the heaviest working set (tie-break on reps): the set the next
  // session has to beat.
  let top = sets[0];
  for (const s of sets) {
    const w = parseFloat(s.w), tw = parseFloat(top.w);
    if (w > tw || (w === tw && parseInt(s.r, 10) > parseInt(top.r, 10))) top = s;
  }
  const W = parseFloat(top.w);
  const R = parseInt(top.r, 10);
  const target = repTarget > 0 ? repTarget : R;

  // Average RPE across the working sets that carry a reading (optional signal).
  const rpes = sets.map(s => parseFloat(s.rpe)).filter(v => v > 0);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  const round = v => Math.round(v / increment) * increment;

  // Documented multi-session stall → cut load and rebuild.
  if (opts.stalled) {
    const deloaded = Math.max(increment, round(W * 0.9));
    return { action: 'deload', weight: deloaded, reps: target,
      rationale: `Plateaued 3 sessions — drop to ${deloaded} and rebuild.` };
  }

  const hitTarget  = R >= target;
  const hardEffort = avgRpe != null && avgRpe >= hardRpe;
  const rpeNote    = avgRpe != null ? ` @ RPE ${+avgRpe.toFixed(1)}` : '';

  // Rep target not met yet → keep the load, chase one more rep.
  if (!hitTarget) {
    const nextReps = Math.min(target, R + 1);
    return { action: 'rep-up', weight: W, reps: nextReps,
      rationale: `Chase ${nextReps} reps at ${W} before adding load.` };
  }

  // Rep target met but effort was maximal, or we're in a deficit → hold load and
  // consolidate rather than grind a load increase into a stall/injury.
  if (hardEffort || goal === 'cut') {
    const why = goal === 'cut'
      ? `Cutting — hold ${W} and keep the reps.`
      : `Hit ${R}${rpeNote} — hold ${W} to consolidate.`;
    return { action: 'hold', weight: W, reps: target, rationale: why };
  }

  // Rep target met with effort in reserve → add a load increment.
  const next = round(W + increment);
  return { action: 'load-up', weight: next, reps: target,
    rationale: `Hit ${R}${rpeNote} — add load to ${next}.` };
}

// ==========================================
// SET/REP PRESCRIPTION
// Owns the per-lift prescription decision: inline-spec vs weekly modifier,
// taper override, and stall/fatigue set reduction. Returns the sets array.
// ==========================================
// The prescribed set/rep target for a lift: the inline spec in the day
// description when present (e.g. "Back Squat (4×5)"), otherwise the week's
// volume modifier. Used for BOTH what we materialise and what the cockpit label
// shows, so the two can never disagree.
export function liftTarget(desc, liftName, weekModifier = {}) {
  const parsed = parseTargetFromDescription(desc, liftName);
  if (parsed.matched) return { sets: parsed.sets, reps: parsed.reps };
  return { sets: weekModifier.sets || 4, reps: weekModifier.reps || 5 };
}

export function prescribeSetsForLift(wk, dayKey, liftName, desc, weekModifier) {
  // Materialise exactly the program's prescribed number of sets. Weight and reps
  // are left blank so the cockpit shows last week's numbers as an editable
  // light-grey ghost; the set/rep target lives on the card label. The diagnostic
  // engine advises (stall/fatigue notes) but never silently removes sets.
  const { sets: setsCount } = liftTarget(desc, liftName, weekModifier);
  const sets = [];
  for (let i = 0; i < setsCount; i++) {
    sets.push({ w: '', r: '', c: false });
  }
  return sets;
}

// ==========================================
// ESTIMATED 1RM CALCULATOR
// ==========================================
export function computeEstimated1RMs() {
  const result = { currentSq: 0, currentBp: 0, currentDl: 0, globalMaxSq: 0, globalMaxBp: 0, globalMaxDl: 0 };
  
  if (!_getState) {
    devWarn('computeEstimated1RMs called before initEngine() — returning zeroed 1RMs.');
    return result;
  }
  
  const appState = _getState();
  
  if (!appState || !appState.weeks) return result;
  
  const wk = appState.currentWeek || "1";
  
  for (let wKey in appState.weeks) {
    const weekObj = appState.weeks[wKey];
    if (!weekObj || !weekObj.lifts) continue;
    
    for (let dKey in weekObj.lifts) {
      const dayLifts = weekObj.lifts[dKey];
      if (!dayLifts) continue;
      
      for (let lKey in dayLifts) {
        const setsArr = dayLifts[lKey];
        if (!Array.isArray(setsArr)) continue;

        // Lifts are stored keyed by display name.
        const lName = lKey;

        setsArr.forEach(s => {
          if (s && s.c && s.type !== 'W' && !s.isWarmup) {
            const weight = parseFloat(s.w) || 0;
            const reps = parseInt(s.r, 10) || 0;
            const e1rm = weight * (1 + reps / 30);

            if (wKey === wk) {
              if (lName === 'Back Squat' && e1rm > result.currentSq) result.currentSq = e1rm;
              if (lName === 'Bench Press' && e1rm > result.currentBp) result.currentBp = e1rm;
              if (lName === 'Deadlift' && e1rm > result.currentDl) result.currentDl = e1rm;
            }
            if (lName === 'Back Squat' && e1rm > result.globalMaxSq) result.globalMaxSq = e1rm;
            if (lName === 'Bench Press' && e1rm > result.globalMaxBp) result.globalMaxBp = e1rm;
            if (lName === 'Deadlift' && e1rm > result.globalMaxDl) result.globalMaxDl = e1rm;
          }
        });
      }
    }
  }
  return result;
}

// ==========================================
// PER-EXERCISE PR (ESTIMATED 1RM) AGGREGATION
// Scans all logged sets and raises per-exercise PRs. Mutates and returns
// `stats` in place; only ever RAISES maxes (sticky by design — a PR is not
// lost if the set that produced it is later deleted). Verbatim from the
// former workout.updateExercisePRs(); state and stats are now parameters.
// ==========================================
export function computeExercisePRs(state, stats = {}) {
  for (let wKey in state.weeks) {
    const weekObj = state.weeks[wKey];
    if (!weekObj || !weekObj.lifts) continue;

    for (let dKey in weekObj.lifts) {
      const dayLifts = weekObj.lifts[dKey];
      if (!dayLifts) continue;

      for (let lift in dayLifts) {
        let maxEstimated1RM = 0;
        const setsArr = dayLifts[lift];
        if (!Array.isArray(setsArr)) continue;

        setsArr.forEach(set => {
          if (set && set.c && set.w && set.r && set.type !== 'W' && !set.isWarmup) {
            const weight = parseFloat(set.w);
            const reps = parseInt(set.r);
            const e1RM = weight * (1 + (reps / 30));
            if (e1RM > maxEstimated1RM) maxEstimated1RM = e1RM;
          }
        });

        if (maxEstimated1RM > 0) {
          if (!stats[lift]) {
            stats[lift] = { allTimeMax: 0, currentEstimatedMax: 0 };
          }
          if (maxEstimated1RM > stats[lift].allTimeMax) {
            stats[lift].allTimeMax = maxEstimated1RM;
          }
          if (wKey === state.currentWeek) {
            if (maxEstimated1RM > (stats[lift].currentEstimatedMax || 0)) {
              stats[lift].currentEstimatedMax = maxEstimated1RM;
            }
          }
        }
      }
    }
  }
  return stats;
}

// ==========================================
// DELOAD SUGGESTION
// Triggers on high ACWR, or every 4th week as a scheduled deload.
// ==========================================
export function shouldSuggestDeload() {
  if (!_getState) return { suggest: false, reason: '' };
  const state = _getState();
  if (!state) return { suggest: false, reason: '' };

  const { atl = 0, ctl = 0 } = state.loadMetrics || {};

  // The card is for an *unscheduled* overreach — load spiking faster than you're
  // recovering. Scheduled deloads already live in the program (and are explained
  // in the briefing), so we no longer fire a generic every-4th-week suggestion
  // (which used to pop "Apply deload" during weeks that were already deloads).
  // The caller additionally suppresses this whenever the current week IS a
  // deload — you can't be told to deload while deloading.
  if (ctl > 0 && atl / ctl > 1.3) {
    return { suggest: true, reason: "Your load is climbing faster than you're recovering. An easier week now protects against overuse — you'll come back stronger." };
  }

  return { suggest: false, reason: '' };
}

// ==========================================
// METRICS RE-EXPORTS (backwards-compatible)
// ==========================================
export {
  weeklyTonnageSeries, weeklyE1rmByLift, allLiftsStats,
  big3Progression, big3Maxes, weeklyVolumeByMuscle,
} from './metrics/metrics-strength.js';

export {
  weeklyDistanceSeries, weeklyElevationSeries, weeklyPaceSeries,
  weeklyHrSeries, weeklyHrZonesSeries, weeklyCadenceSeries, weeklyTrainingEffectSeries,
} from './metrics/metrics-running.js';

export {
  weeklyLoadSeries, weeklyRpeSeries, readinessMetrics, recoveryMetrics, streakView,
} from './metrics/metrics-load.js';