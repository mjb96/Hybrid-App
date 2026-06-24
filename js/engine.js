// ==========================================
// ENGINE: DIAGNOSTICS, 1RM, PARSER
// ==========================================
import { CONFIG } from './constants.js';
import { devWarn } from './debug.js';

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

export function isCompletedSet(s) {
  if (!s) return false;
  return s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
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
// LIFT IDENTITY MAP (D8)
// getLiftId — registers a name → stable opaque key, idempotent.
// getLiftDisplayName — resolves key back to display name.
// resolveLiftKey — maps display name → stored key.
// ==========================================

export function getLiftId(state, name) {
  if (!name) return '';
  if (!state.liftIdMap) state.liftIdMap = {};
  if (!state.liftNames) state.liftNames = {};
  if (state.liftIdMap[name]) return state.liftIdMap[name];
  const id = 'lift_' + Math.random().toString(36).slice(2, 10);
  state.liftIdMap[name] = id;
  state.liftNames[id] = name;
  return id;
}

export function getLiftDisplayName(state, id) {
  return (state.liftNames && state.liftNames[id]) || id;
}

export function resolveLiftKey(state, name) {
  return (state.liftIdMap && state.liftIdMap[name]) || name;
}

// ==========================================
// FIND LAST PERFORMANCE (D9)
// Scans weeks in descending order for the last completed working sets of a
// given lift. Accepts both ID-keyed and plain-string-keyed storage.
// Returns { weekKey, day, workingSets } or null.
// ==========================================

export function findLastPerformance(state, name, { excludeWeek, days = [] } = {}) {
  const key = resolveLiftKey(state, name);
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
  let result = { sets: 3, reps: 10 };
  if (!descString || !liftName) return result;

  try {
    const escapedLift = liftName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // UPDATED REGEX: Catches normal 'x', capital 'X', and the formal multiplication sign '×'
    const regex = new RegExp(escapedLift + '\\s*\\((\\d+)\\s*[xX×]\\s*([^\\)]+)\\)', 'i');
    const match = descString.match(regex);

    if (match) {
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
export function computeDiagnosticForLift(currentWeekString, dayKey, liftName) {
  let result = { suggestedWeight: '', suggestedReps: '', isStalled: false, isFatigueOverload: false, message: '' };
  
  if (!_getState || !_getDays) {
    devWarn('computeDiagnosticForLift called before initEngine() — returning empty diagnostic.');
    return result;
  }
  
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const cWk = parseInt(currentWeekString, 10);
  if (isNaN(cWk) || cWk <= 1 || !appState.weeks) return result;

  const liftKey = resolveLiftKey(appState, liftName);
  const history = [];
  for (let w = cWk - 1; w >= 1; w--) {
    const wData = appState.weeks[w.toString()];
    if (wData && wData.lifts && wData.lifts[dayKey]?.[liftKey]) {
      const finishedSets = wData.lifts[dayKey][liftKey].filter(s => s && s.c && s.w && s.r);
      if (finishedSets.length > 0) {
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

  if (history.length >= 3) {
    if (history[0].e1rm <= history[1].e1rm && history[1].e1rm <= history[2].e1rm) {
      result.isStalled = true;
      result.message = 'You stalled on ' + liftName + '. Reducing sets by 20% for this session to allow recovery.';
      return result;
    }
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
          if (isCompletedSet(s) && s.rpe) {
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
    result.message = 'High fatigue detected from last week (Avg RPE ' + pastWeekAvgRpe.toFixed(1) + '). We recommend dropping workout volume by 10% today.';
    return result;
  }

  return result;
}

// ==========================================
// SET/REP PRESCRIPTION
// Owns the per-lift prescription decision: inline-spec vs weekly modifier,
// taper override, and stall/fatigue set reduction. Returns the sets array.
// ==========================================
export function prescribeSetsForLift(wk, dayKey, liftName, desc, weekModifier) {
  const parsedTarget = parseTargetFromDescription(desc, liftName);
  const usesInlineSpec = desc && desc.includes('x');
  let setsCount  = usesInlineSpec ? parsedTarget.sets : (weekModifier.sets || 4);
  let repsTarget = usesInlineSpec ? parsedTarget.reps : (weekModifier.reps || 5);

  if (weekModifier.intensityLabel.toLowerCase().includes("taper") || weekModifier.reps === 1) {
    repsTarget = weekModifier.reps;
  }

  const diagnostic = computeDiagnosticForLift(wk, dayKey, liftName);
  if (diagnostic.isStalled || diagnostic.isFatigueOverload) {
    setsCount = Math.max(1, Math.round(setsCount * CONFIG.stallSetReductionModifier));
  }

  const sets = [];
  for (let i = 0; i < setsCount; i++) {
    sets.push({
      w: diagnostic.suggestedWeight !== '' ? diagnostic.suggestedWeight.toString() : '',
      r: repsTarget.toString(),
      c: false
    });
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

        // Resolve opaque lift ID → display name so comparisons work regardless
        // of whether old data uses plain strings or the lift identity map.
        const lName = getLiftDisplayName(appState, lKey);

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
  const week = parseInt(state.currentWeek, 10) || 1;

  // ACWR > 1.3 → injury-risk zone
  if (ctl > 0 && atl / ctl > 1.3) {
    return { suggest: true, reason: `Acute:Chronic ratio is elevated (${(atl / ctl).toFixed(2)}). A deload week will protect against overuse injury.` };
  }

  // Every 4th week is a scheduled deload (classic 3:1 block structure)
  if (week > 3 && week % 4 === 0) {
    return { suggest: true, reason: `Week ${week} is a scheduled deload in your current training block.` };
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