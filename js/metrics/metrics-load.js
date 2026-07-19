// ==========================================
// LOAD / READINESS METRICS (metrics/metrics-load.js)
// ==========================================
// Pure functions — no DOM or side effects.
// ==========================================
import { daysBetween, todayKey } from '../dates.js';
import { runSessionsForDay } from '../state/run-sessions.js';
import { programWeekDailyLoads, programWeekLoadBreakdown } from './training-load.js';

// ---- public API -----------------------------------------------------------

// sRPE-based weekly load broken into lift and run components.
// lift load = gymRpe × gymTime(min); run load = runRpe × runTime(min).
// Returns {lift: number[], run: number[]}, each of length maxWeek.
export function weeklyLoadSeries(state, days, maxWeek) {
  const { strength, endurance } = programWeekLoadBreakdown(state, days, maxWeek);
  return { lift: strength, run: endurance };
}

// Per-day sRPE load for a SINGLE program week, in day order (`days`).
// dailyLoad = gymRpe×gymMins + runRpe×runMins. Rest days are 0 and are kept
// (Foster's training-monotony method includes rest days). Used by
// trainingMonotony/strainScore, which are within-week daily-variability metrics
// — NOT week-over-week series.
export function weekDailyLoads(state, days, weekNum) {
  return programWeekDailyLoads(state, days, weekNum);
}

// Average of all gym and run RPE readings per week. 0 when none logged.
export function weeklyRpeSeries(state, days, maxWeek) {
  const result = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    let sum = 0, count = 0;
    if (wkData) {
      days.forEach(d => {
        const gRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
        if (gRpe > 0) { sum += gRpe; count++; }
        for (const session of runSessionsForDay(wkData, d)) {
          const rRpe = parseFloat(session.rpe) || 0;
          if (rRpe > 0) { sum += rRpe; count++; }
        }
      });
    }
    result.push(count > 0 ? sum / count : 0);
  }
  return result;
}

// Form/TSB (training-stress balance = fitness − fatigue) for the Recovery leaf's
// stat card. TSB is only meaningful once real training-load history exists; with
// no data currentCTL is 0 and TSB collapses to 0, which must NOT be shown as a
// confident recovery verdict. Returns a neutral empty state instead,
// mirroring the ACWR card and the Stats-tab TSB. Pure + unit-tested.
export function formatFormTSB(currentCTL, currentATL) {
  const hasData = (Number(currentCTL) || 0) > 0;
  if (!hasData) return { value: '--', sub: 'Log training to build this' };
  const tsb = Math.round((Number(currentCTL) || 0) - (Number(currentATL) || 0));
  return {
    value: tsb > 0 ? `+${tsb}` : String(tsb),
    sub: tsb >= 0
      ? 'Acute load at or below 28-day baseline'
      : 'Acute load above 28-day baseline',
  };
}

// Streak view derived from stored streakData. Detects broken streaks (last
// activity > 1 local calendar day ago).
export function streakView(streakData, todayISO = todayKey()) {
  if (!streakData || !streakData.lastActivityDate) {
    return { hasData: false, current: 0, longest: 0, broken: false };
  }

  const diff = daysBetween(streakData.lastActivityDate, todayISO);

  const broken = diff !== null && diff > 1;
  return {
    hasData:  true,
    current:  broken ? 0 : (streakData.current || 0),
    longest:  streakData.longest || 0,
    broken,
  };
}
