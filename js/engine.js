// @ts-check
// ==========================================
// ENGINE: DIAGNOSTICS, 1RM, PARSER
// ==========================================
import { CONFIG } from './constants.js';
import { devWarn } from './debug.js';
import { isCompletedSet, isWarmupSet } from './set-utils.js';
import { canonicalExerciseId, exerciseStatForName } from './exercises/catalog.js';
import {
  EXERCISE_HISTORY_SCOPE,
  exercisePerformanceHistory,
  latestExercisePerformance,
} from './workout/exercise-history.js';
import { estimatedE1rm, estimatedE1rmForSet, isE1rmExercise } from './strength/e1rm.js';
import { daysBetween } from './dates.js';
import { isJtShedProgram, jtLiftTarget, jtStoredRolesFor } from './programs/jt-shed-model.js';
import { isShedPplulProgram, shedPplulLiftTarget } from './programs/shed-pplul-model.js';

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
  return estimatedE1rm(weight, reps);
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
// Backwards-compatible adapter over the canonical dated exercise-history query.
// Explicit catalogue aliases resolve to one canonical exercise identity;
// unknown custom exercises remain exact-name matches.
// ==========================================

/**
 * @param {any} state
 * @param {string} name
 * @param {{ excludeWeek?: string|number, excludeDay?:string, days?: string[], scope?:'all'|'activation'|'program' }} [opts]
 */
export function findLastPerformance(state, name, { excludeWeek, excludeDay, days = [], scope = 'all' } = {}) {
  return latestExercisePerformance(state, name, {
    scope,
    days,
    exclude: excludeWeek == null ? undefined : { weekKey: excludeWeek, day: excludeDay },
  });
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
  /** @type {{sets:number, reps:number|string, matched:boolean}} */
  let result = { sets: 3, reps: 10, matched: false };
  // Production catalogue lifts are bare strings. Some callers can still hand
  // us richer/custom values; fail closed to the week modifier without noisy
  // parser errors or stringifying an object into a fake exercise name.
  if (typeof liftName !== 'string' || !liftName.trim()) return result;

  try {
    const escapedLift = liftName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escapedLift + '\\s*\\((\\d+)\\s*[xX×]\\s*([^\\)]+)\\)', 'i');
    const descriptionMatch = descString ? descString.match(regex) : null;
    // A sizeable legacy part of the catalogue carries the prescription inside
    // the bare-string lift itself ("Push-Ups 4×max", "Curl 3×10-12") while the
    // day description is generic. That string is still the program's authored
    // source, so read its trailing sets×reps spec before falling back to the
    // week-wide modifier.
    const liftMatch = liftName.match(/^(.+?)\s+(\d+)\s*[xX×]\s*(.+)$/i);
    const match = descriptionMatch || liftMatch;

    if (match) {
      result.matched = true;
      // Description capture groups are [sets,reps]; lift-name groups are
      // [baseName,sets,reps].
      const setsRaw = descriptionMatch ? match[1] : match[2];
      const repsRaw = descriptionMatch ? match[2] : match[3];
      result.sets = parseInt(setsRaw, 10) || 3;
      result.reps = normalizeRepPrescription(repsRaw);
    }
  } catch (e) {
    console.error("Failed to parse exercise specs:", e);
  }
  return result;
}

function normalizeRepPrescription(value) {
  const raw = String(value || '').trim();
  if (!raw) return 10;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^max(?:\s+reps?)?$/i.test(raw)) return 'max reps';
  // Canonical display dash while preserving meaningful text such as "each
  // side", seconds, metres and 5/3/1+ instead of coercing it to a fake number.
  return raw.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1–$2');
}

/** Numeric top-of-range used only by progression/quality maths. */
export function repGoalFromTarget(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const range = raw.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (range) return parseInt(range[2], 10);
  const each = raw.match(/^(\d+)\s+each\b/i);
  return each ? parseInt(each[1], 10) : null;
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
  if (!appState?.weeks) return result;

  // Progression is active-program state, not global exercise history. A program
  // switch/restart mints a new activation and archives the old numeric weeks;
  // only performances stamped with the current activation may influence the
  // next-load suggestion. Restricting to the same workout day also prevents a
  // heavy/low-rep occurrence of a lift from becoming the target for another
  // day with a different prescription. If the activation identity is missing,
  // fail closed: history remains visible through exerciseLoggerHistory(), but
  // it is not safe to present any of it as a current progression requirement.
  const currentWeek = appState.weeks[String(currentWeekString)];
  const activeActivationId = currentWeek?.activationId || appState.activeActivationId;
  if (!activeActivationId) return result;

  const scopedHistory = exercisePerformanceHistory(appState, liftName, {
    scope: EXERCISE_HISTORY_SCOPE.ACTIVATION,
    activationId: activeActivationId,
    days: [dayKey],
    exclude: { weekKey: currentWeekString, day: dayKey },
  });
  // `tr` is the persisted rep prescription captured with the performed set.
  // Requiring the same target prevents an in-place program edit or a later
  // phase with a different prescription from inheriting an obsolete rule.
  // Legacy rows without a trustworthy prescription remain global history but
  // cannot generate an active requirement.
  const history = repTarget > 0
    ? scopedHistory.filter((performance) => {
        const targetStamps = performance.workingSets
          .map((set) => Number(set?.tr))
          .filter((value) => Number.isFinite(value) && value > 0);
        return targetStamps.length > 0
          && targetStamps.every((value) => value === repTarget);
      })
    : scopedHistory;

  if (history.length === 0) return result;

  const lastSession = history[0];
  result.suggestedWeight = lastSession.weight || '';
  result.suggestedReps = lastSession.reps || '';

  // A repeated load is not automatically a plateau: completing the prescribed
  // target is evidence to progress, even if the last three e1RM estimates are
  // numerically identical. Keep a conservative candidate here and qualify it
  // after checking whether the latest performance actually missed the target.
  const recentTrend = history.slice(0, 3);
  const trendSpanDays = recentTrend.length === 3
    ? daysBetween(recentTrend[2].date, recentTrend[0].date)
    : null;
  const hasProgressConcern = repTarget > 0
    && recentTrend.length === 3
    && recentTrend.every((row) => row.e1rm > 0)
    && trendSpanDays !== null && trendSpanDays >= 14 && trendSpanDays <= 56
    && recentTrend[0].e1rm <= Math.max(recentTrend[1].e1rm, recentTrend[2].e1rm) * 1.01;

  const lastSessionSets = lastSession.workingSets;
  let totalRpeSum = 0, rpeCount = 0;
  const pastWkData = appState.weeks[lastSession.weekKey];

  if (pastWkData) {
    // Primary: completed working-set RPE for THIS exercise in the exact prior
    // performance. Unrelated lifts and a same-day run must never change this
    // exercise's next-load recommendation.
    const sourceDay = lastSession.day;
    lastSessionSets.forEach((set) => {
      const rpe = parseFloat(set?.rpe) || 0;
      if (rpe > 0) { totalRpeSum += rpe; rpeCount++; }
    });

    // Fallback: strength-session RPE only. A run's effort is a separate signal
    // used by readiness/load analytics, not proof that this lift was too heavy.
    if (rpeCount === 0) {
      const gymRpe = parseInt(pastWkData.gymRpe?.[sourceDay], 10) || 0;
      if (gymRpe > 0) { totalRpeSum += gymRpe; rpeCount++; }
    }
  }
  
  const priorSessionAvgRpe = rpeCount > 0 ? totalRpeSum / rpeCount : 0;
  const loadedSets = lastSessionSets.filter((set) => (parseFloat(set?.w) || 0) > 0 && (parseInt(set?.r, 10) || 0) > 0);
  const topLoad = loadedSets.length ? Math.max(...loadedSets.map((set) => parseFloat(set.w))) : 0;
  const topLoadSets = topLoad > 0 ? loadedSets.filter((set) => parseFloat(set.w) === topLoad) : [];
  const latestMetTarget = repTarget > 0 && topLoadSets.length > 0
    && topLoadSets.every((set) => (parseInt(set?.r, 10) || 0) >= repTarget);
  if (hasProgressConcern && !latestMetTarget) {
    result.isStalled = true;
    result.message = `${liftName} has not meaningfully improved across 3 comparable sessions over ${trendSpanDays} days, and the latest top-load sets missed the current rep target. Hold the load and review recovery.`;
  }
  if (priorSessionAvgRpe >= (CONFIG.fatigueRpeThreshold || 8.5)) {
    result.isFatigueOverload = true;
    // A documented stall keeps message precedence, so callers that surface a
    // single line (home stall alerts) are unchanged in the single-flag cases.
    if (!result.message) {
      result.message = `${liftName}'s previous work averaged RPE ${priorSessionAvgRpe.toFixed(1)}. Hold the load today and adjust if warm-ups feel off.`;
    }
  }

  // Auto-progression: turn the last session into a concrete next target
  // (the ghost the cockpit shows, and what one-tap quick-log commits).
  const increment = appState.settings?.progressionIncrement || CONFIG.weightIncrement || 2.5;
  const canRecommendLoad = repTarget > 0 && isE1rmExercise(liftName, lastSessionSets?.[0]);
  const prog = suggestProgression(canRecommendLoad ? (lastSessionSets || []) : [], repTarget, {
    increment,
    weightGoal: appState.settings?.weightGoal,
    stalled: result.isStalled,
    fatigued: result.isFatigueOverload,
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
//   • any top-load set misses target → chase one more rep at the same load
//   • every top-load set hits target → add one load increment when effort allows
//   • effort maximal / session RPE high → hold load and consolidate
//   • flat three-session trend        → hold and review instead of auto-deloading
//   • cutting (energy deficit)    → preserve strength: hold load, progress reps
// Pure (no state access) so it drives the cockpit ghost, the coach label and the
// quick-log target from one source, and is trivially unit-testable.
// ==========================================

/**
 * @param {any[]} lastWorkingSets  completed working sets (warm-ups excluded) from
 *   the most recent session for this lift; each has at least `w` and `r`.
 * @param {number} repTarget       prescribed top-of-range rep goal for the lift.
 * @param {{ increment?: number, weightGoal?: 'cut'|'maintain'|'bulk',
 *           stalled?: boolean, fatigued?: boolean, hardRpe?: number }} [opts]
 * @returns {{ action: 'baseline'|'load-up'|'hold'|'rep-up',
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

  // Reference = every completed set at the session's heaviest working weight.
  // Judging one cherry-picked best set used to recommend more load even when
  // another set at the same weight missed the prescription.
  const W = Math.max(...sets.map((set) => parseFloat(set.w)));
  const referenceSets = sets.filter((set) => parseFloat(set.w) === W);
  const R = Math.min(...referenceSets.map((set) => parseInt(set.r, 10)));
  const target = repTarget > 0 ? repTarget : R;

  // Average RPE across the working sets that carry a reading (optional signal).
  const rpes = sets.map(s => parseFloat(s.rpe)).filter(v => v > 0);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  const round = v => Math.round(v / increment) * increment;

  // A flat trend is a review signal, not enough evidence for a precise 10%
  // deload. Hold the last successful load; the user/program still owns deloads.
  if (opts.stalled) {
    return { action: 'hold', weight: W, reps: target,
      rationale: `Flat estimated-strength trend — hold ${W} and review recovery.` };
  }

  const hitTarget  = referenceSets.every((set) => parseInt(set.r, 10) >= target);
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
  if (hardEffort || opts.fatigued || goal === 'cut') {
    const why = goal === 'cut'
      ? `Cutting — hold ${W} and keep the reps.`
      : `Completed ${R}${rpeNote} — hold ${W} to consolidate.`;
    return { action: 'hold', weight: W, reps: target, rationale: why };
  }

  // Rep target met with effort in reserve → add a load increment.
  const next = round(W + increment);
  return { action: 'load-up', weight: next, reps: target,
    rationale: `All top-load sets hit ${target}${rpeNote} — add load to ${next}.` };
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
/**
 * @param {any} desc
 * @param {any} liftName
 * @param {any} [weekModifier]
 * @param {{ program?:any, week?:(number|string), dayKey?:string, opts?:any }} [ctx]
 *   When the active program carries the tiered J&T progression model, the
 *   per-exercise/per-week prescription is resolved from that model instead of
 *   the single shared week modifier — so different tiers on the same day no
 *   longer all collapse to the week modifier's sets×reps (the "everything is
 *   4 × 10" bug). Non-J&T programs are entirely unaffected.
 */
export function liftTarget(desc, liftName, weekModifier = {}, ctx) {
  if (isJtShedProgram(ctx?.program)) {
    const jt = jtLiftTarget(ctx.program, ctx.week, ctx.dayKey, liftName, ctx.opts || {});
    if (jt) return { sets: jt.sets, reps: jt.reps };
  }
  // Shed PPLUL runs bench/squat/press and the deadlift on two different weekly
  // progressions, which one shared week modifier cannot express. Gated on the
  // program's own progressionModel, so every other program is unaffected, and
  // null-returning for unauthored lifts so an exercise added mid-session falls
  // through rather than inheriting a main-lift prescription.
  if (isShedPplulProgram(ctx?.program)) {
    const pp = shedPplulLiftTarget(ctx.program, ctx.week, ctx.dayKey, liftName);
    if (pp) return { sets: pp.sets, reps: pp.reps };
  }
  const parsed = parseTargetFromDescription(desc, liftName);
  if (parsed.matched) return { sets: parsed.sets, reps: parsed.reps };
  return { sets: weekModifier.sets || 4, reps: weekModifier.reps || 5 };
}

export function prescribeSetsForLift(wk, dayKey, liftName, desc, weekModifier, ctx) {
  // Materialise exactly the program's prescribed number of sets. Weight and reps
  // are left blank so the cockpit can show the latest dated performance as an editable
  // light-grey ghost; the set/rep target lives on the card label. The diagnostic
  // engine advises (stall/fatigue notes) but never silently removes sets.
  const { sets: setsCount } = liftTarget(desc, liftName, weekModifier, ctx);
  const roleStamps = jtRoleStampsForCtx(ctx, liftName);
  const sets = [];
  for (let i = 0; i < setsCount; i++) {
    sets.push(_blankPrescribedSet(roleStamps && roleStamps[i]));
  }
  return sets;
}

/**
 * The per-set role/prescription stamps for a J&T context (null for every other
 * program, so their scaffolding is byte-identical plain `{w,r,c}`).
 * @returns {Array<any>|null}
 */
export function jtRoleStampsForCtx(ctx, liftName) {
  if (!isJtShedProgram(ctx?.program)) return null;
  const stamps = jtStoredRolesFor(ctx.program, ctx.week, ctx.dayKey, liftName, ctx.opts || {});
  return Array.isArray(stamps) && stamps.length ? stamps : null;
}

/** A blank prescribed set row, optionally carrying a J&T role stamp (metadata,
 *  not user input — the draft/warmup predicates ignore these fields). */
function _blankPrescribedSet(stamp) {
  const set = { w: '', r: '', c: false };
  if (stamp && stamp.role) {
    set.role = stamp.role;
    if (stamp.roleReps != null) set.roleReps = stamp.roleReps;
    if (stamp.boPct != null) set.boPct = stamp.boPct;
    if (stamp.boSrc != null) set.boSrc = stamp.boSrc;
  }
  return set;
}

/**
 * Reconcile an already-materialised set array after prescription parsing gets
 * more accurate. Untouched scaffolding may be resized exactly; any user-edited
 * or completed row is never removed, and missing prescribed rows are appended.
 */
export function reconcilePrescribedSets(existing, desiredCount, roleStamps = null) {
  const count = Math.max(0, Math.floor(Number(desiredCount) || 0));
  // A blank scaffold row for the i-th prescribed set, carrying its J&T role stamp
  // when one is available so a re-materialised or padded row keeps its role.
  const blankAt = (i) => _blankPrescribedSet(Array.isArray(roleStamps) ? roleStamps[i] : null);
  if (!Array.isArray(existing)) return Array.from({ length: count }, (_, i) => blankAt(i));

  const hasUserData = existing.some((set) => set && (
    isCompletedSet(set) || String(set.w ?? '').trim() || String(set.r ?? '').trim() ||
    set.type || set.rpe != null || set.rir != null || set.bw || set.band || set.loadMode
  ));
  // A fresh (untouched) scaffold may be rebuilt exactly — re-stamp roles by index.
  // No warm-ups can exist here (a warm-up sets `type`, which trips hasUserData),
  // so index == prescription order and the stamp lands on the right row.
  if (!hasUserData) return Array.from({ length: count }, (_, i) => blankAt(i));
  if (existing.length >= count) return existing;
  // Pad missing prescribed rows at the end. Their prescription index is the count
  // of non-warm-up rows already present, so a padded back-off/plus row still gets
  // the correct stamp even when the athlete has inserted a warm-up.
  let working = existing.filter((s) => !(s && s.type === 'W')).length;
  const padded = Array.from({ length: count - existing.length }, () => blankAt(working++));
  return [...existing, ...padded];
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

        const exerciseId = canonicalExerciseId(lKey);

        setsArr.forEach(s => {
          if (isCompletedSet(s) && !isWarmupSet(s)) {
            const e1rm = estimatedE1rmForSet(lKey, s);

            if (wKey === wk) {
              if (exerciseId === 'back_squat' && e1rm > result.currentSq) result.currentSq = e1rm;
              if (exerciseId === 'barbell_bench_press' && e1rm > result.currentBp) result.currentBp = e1rm;
              if (exerciseId === 'conventional_deadlift' && e1rm > result.currentDl) result.currentDl = e1rm;
            }
            if (exerciseId === 'back_squat' && e1rm > result.globalMaxSq) result.globalMaxSq = e1rm;
            if (exerciseId === 'barbell_bench_press' && e1rm > result.globalMaxBp) result.globalMaxBp = e1rm;
            if (exerciseId === 'conventional_deadlift' && e1rm > result.globalMaxDl) result.globalMaxDl = e1rm;
          }
        });
      }
    }
  }
  return result;
}

// ==========================================
// PER-EXERCISE PR (ESTIMATED 1RM) AGGREGATION
//
// `allTimeMax` is DERIVED from the logged sets on every call, not accumulated.
//
// It used to only ever RAISE, which was described as deliberate ("a PR is not
// lost if the set that produced it is later deleted") but made the field
// permanently wrong the first time anyone mistyped a load. Logging 500 instead
// of 50 and immediately correcting it left the baseline pinned at 583 kg
// forever — and because this field is persisted to localStorage AND synced as
// part of the state blob, the bad number followed the athlete to every device.
// The cockpit's PR gate reads it, so no genuine PR for that lift could ever fire
// again. Deleting the workout did not help either.
//
// LEGACY FLOOR. Rebuilding from stored sets would discard a pre-existing max
// whose source sets are not in `state.weeks` at all — real history for anyone
// whose early sessions predate reliable set storage. Any such unbacked value is
// snapshotted ONCE into `legacyMax` and preserved. It is kept separate so it can
// never be mistaken for a derived figure, and unlike the old behaviour it is
// never raised by subsequent logging.
// ==========================================
export function computeExercisePRs(state, stats = {}) {
  /** @type {Record<string, {allTimeMax:number, currentEstimatedMax:number}>} */
  const derived = {};

  for (let wKey in state.weeks) {
    const weekObj = state.weeks[wKey];
    if (!weekObj || !weekObj.lifts) continue;

    for (let dKey in weekObj.lifts) {
      const dayLifts = weekObj.lifts[dKey];
      if (!dayLifts) continue;

      for (let lift in dayLifts) {
        const statKey = canonicalExerciseId(lift) || lift;
        const setsArr = dayLifts[lift];
        if (!Array.isArray(setsArr)) continue;

        let maxEstimated1RM = 0;
        setsArr.forEach(set => {
          if (isCompletedSet(set) && set.w && set.r && !isWarmupSet(set)) {
            const e1RM = estimatedE1rmForSet(lift, set);
            if (e1RM > maxEstimated1RM) maxEstimated1RM = e1RM;
          }
        });
        if (maxEstimated1RM <= 0) continue;

        if (!derived[statKey]) derived[statKey] = { allTimeMax: 0, currentEstimatedMax: 0 };
        if (maxEstimated1RM > derived[statKey].allTimeMax) {
          derived[statKey].allTimeMax = maxEstimated1RM;
        }
        if (wKey === state.currentWeek && maxEstimated1RM > derived[statKey].currentEstimatedMax) {
          derived[statKey].currentEstimatedMax = maxEstimated1RM;
        }
      }
    }
  }

  // Rewrite in place: the caller passes `state.exerciseStats` and relies on the
  // same object identity, and a stale key left behind would keep answering PR
  // lookups for an exercise whose every set has been deleted.
  //
  // `derived: true` marks a stat this function has already rebuilt. The legacy
  // rescue MUST be gated on it. Inferring legacy from "the old value exceeds the
  // new one" cannot distinguish genuine pre-migration history from a value this
  // code derived moments ago whose set has since been deleted or corrected —
  // which would launder every mistyped load straight back into a permanent
  // floor and reinstate the exact defect being fixed here.
  for (const key of Object.keys(stats)) {
    const previous = Number(stats[key]?.allTimeMax) || 0;
    const nowDerived = derived[key]?.allTimeMax || 0;
    const legacy = stats[key]?.derived === true
      ? Number(stats[key]?.legacyMax) || 0            // already migrated — frozen
      : Math.max(0, previous > nowDerived ? previous : 0); // one-time rescue

    if (!derived[key] && legacy <= 0) { delete stats[key]; continue; }
    stats[key] = {
      allTimeMax: nowDerived,
      currentEstimatedMax: derived[key]?.currentEstimatedMax || 0,
      derived: true,
      ...(legacy > 0 ? { legacyMax: legacy } : {}),
    };
  }
  for (const [key, value] of Object.entries(derived)) {
    if (!stats[key]) stats[key] = { ...value, derived: true };
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
