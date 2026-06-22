// ==========================================
// STRENGTH CALCULATIONS — analytics/calculations/strength-calcs.js
// Pure functions. No DOM, no side effects.
// ==========================================
import { linearRegression, trendLine, rollingAverage, pctChange, clamp } from './math-utils.js';
import { weeklyE1rmByLift, weeklyTonnageSeries, weeklyVolumeByMuscle } from '../../metrics/metrics-strength.js';

// Rate of improvement (kg per week) for a lift, from linear regression on e1RM series.
// Returns kg/week. Negative = declining. Returns 0 if insufficient data.
export function rateOfImprovement(e1rmSeries) {
  const reg = linearRegression(e1rmSeries);
  return reg.slope; // kg per week
}

// Projected e1RM in weeksAhead using linear trend.
// Returns null if trend is flat or declining, or if data is insufficient.
export function projectedPR(e1rmSeries, weeksAhead = 4) {
  const nonZero = e1rmSeries.filter(v => v > 0);
  if (nonZero.length < 3) return null;
  const reg = linearRegression(e1rmSeries);
  if (reg.slope <= 0) return null;
  const lastIdx = e1rmSeries.length - 1;
  return reg.slope * (lastIdx + weeksAhead) + reg.intercept;
}

// Current block PR: max e1RM within the last `blockLength` weeks.
export function currentBlockPR(e1rmSeries, currentWeek, blockLength = 4) {
  const start = Math.max(0, currentWeek - blockLength);
  const slice = e1rmSeries.slice(start, currentWeek);
  return Math.max(...slice.filter(v => v > 0), 0);
}

// Volume progression percentage: current week vs N weeks prior.
export function volumeProgressionPct(volSeries, lookback = 4) {
  const cur = volSeries[volSeries.length - 1];
  const ref = volSeries[Math.max(0, volSeries.length - 1 - lookback)];
  return pctChange(ref, cur);
}

// Monthly volume: aggregate weekly volumes into 4-week buckets.
// Returns array of { label, volume } objects.
export function monthlyVolumeBuckets(volSeries) {
  const months = [];
  for (let i = 0; i < volSeries.length; i += 4) {
    const slice = volSeries.slice(i, i + 4);
    const vol   = slice.reduce((a, b) => a + b, 0);
    const mNum  = Math.floor(i / 4) + 1;
    months.push({ label: `M${mNum}`, volume: vol, weeks: slice.length });
  }
  return months;
}

// Strength-specific Acute:Chronic ratio (tonnage-based).
// Acute = average of last 1 week; Chronic = average of last 4 weeks.
export function strengthACWR(volSeries) {
  const n      = volSeries.length;
  if (n < 2) return null;
  const acute  = volSeries[n - 1];
  const slice4 = volSeries.slice(Math.max(0, n - 4));
  const chronic = slice4.reduce((a, b) => a + b, 0) / slice4.length;
  if (chronic === 0) return null;
  return acute / chronic;
}

// Muscle group aggregation into 6 canonical groups.
const MUSCLE_GROUPS = {
  Chest:     ['chest', 'upper_chest'],
  Back:      ['lats', 'upper_back', 'erectors'],
  Legs:      ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'],
  Shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  Arms:      ['biceps', 'triceps', 'brachialis'],
  Core:      ['core'],
};

// Aggregate fine-grained muscle data into the 6 canonical groups.
// Returns { Chest, Back, Legs, Shoulders, Arms, Core } each with weeklyVolume[].
export function aggregateMuscleGroups(weeklyVolumeByMuscleData, maxWeek) {
  const result = {};
  for (const [group, muscles] of Object.entries(MUSCLE_GROUPS)) {
    const sums = new Array(maxWeek).fill(0);
    muscles.forEach(m => {
      const series = weeklyVolumeByMuscleData[m] || [];
      series.forEach((v, i) => { if (i < maxWeek) sums[i] += v; });
    });
    result[group] = sums;
  }
  return result;
}

// Current-week sets per canonical muscle group.
export function currentWeekSetsByGroup(muscleGroupSeries, currentWeek) {
  const idx = currentWeek - 1;
  const out = {};
  for (const [group, series] of Object.entries(muscleGroupSeries)) {
    out[group] = series[idx] || 0;
  }
  return out;
}

// Relative muscle balance: each group as % of the highest group.
export function muscleBalanceRelative(currentWeekSets) {
  const max = Math.max(...Object.values(currentWeekSets), 1);
  const out = {};
  for (const [g, v] of Object.entries(currentWeekSets)) {
    out[g] = (v / max) * 100;
  }
  return out;
}

// Minimum evidence-based weekly sets per muscle group for hypertrophy maintenance.
const MIN_WEEKLY_SETS = {
  Chest: 8, Back: 10, Legs: 10, Shoulders: 8, Arms: 6, Core: 4,
};
const OPTIMAL_WEEKLY_SETS = {
  Chest: 16, Back: 20, Legs: 20, Shoulders: 14, Arms: 12, Core: 8,
};

// Classify each muscle group: 'undertrained' | 'optimal' | 'overtrained' | 'no_data'
export function muscleTrainingStatus(currentWeekSets) {
  const out = {};
  for (const [group, sets] of Object.entries(currentWeekSets)) {
    const min     = MIN_WEEKLY_SETS[group] || 6;
    const optimal = OPTIMAL_WEEKLY_SETS[group] || 12;
    if (sets === 0)               out[group] = 'no_data';
    else if (sets < min)          out[group] = 'undertrained';
    else if (sets <= optimal * 1.5) out[group] = 'optimal';
    else                          out[group] = 'overtrained';
  }
  return out;
}

// Full strength analytics payload — computed once, passed to views.
export function computeStrengthAnalytics(state, days, maxWeek) {
  const currentWeek   = parseInt(state.currentWeek || '1', 10);
  const volSeries     = weeklyTonnageSeries(state, days, maxWeek);
  const e1rmByLift    = weeklyE1rmByLift(state, days, maxWeek);
  const muscleByWeek  = weeklyVolumeByMuscle(state, days, maxWeek);
  const muscleGroups  = aggregateMuscleGroups(muscleByWeek, maxWeek);
  const currentSets   = currentWeekSetsByGroup(muscleGroups, currentWeek);

  // Per-lift progression metrics
  const liftProgression = {};
  for (const [lift, series] of Object.entries(e1rmByLift)) {
    const nonZero    = series.filter(v => v > 0);
    const lifetimePR = Math.max(...series, 0);
    const blockPR    = currentBlockPR(series, currentWeek, 4);
    const roi        = rateOfImprovement(series);
    const projection = projectedPR(series, 4);
    const rolling4   = rollingAverage(series, 4);
    // Extend trend 4 weeks so the chart can render the projection extension line.
    const trend      = trendLine(series, 4);

    liftProgression[lift] = {
      series, trend, rolling4,
      lifetimePR, blockPR,
      currentWeekPR: series[currentWeek - 1] || 0,
      previousWeekPR: series[currentWeek - 2] || 0,
      roi,           // kg/week
      projection,    // kg in 4 weeks (null if declining)
      hasData: nonZero.length >= 2,
    };
  }

  // Monthly volume
  const monthlyVol = monthlyVolumeBuckets(volSeries);

  // Training load metrics
  // tonnageACWR is the naive rolling tonnage ratio (distinct from EWMA-based la.currentRatio).
  const tonnageACWR   = strengthACWR(volSeries);
  const volProgPct    = volumeProgressionPct(volSeries, 4);
  const weeklyRolling = rollingAverage(volSeries, 4);
  const volTrendLine  = trendLine(volSeries);

  // Muscle analysis
  const muscleBalance = muscleBalanceRelative(currentSets);
  const muscleStatus  = muscleTrainingStatus(currentSets);

  return {
    volSeries,
    weeklyRolling,
    volTrendLine,
    monthlyVol,
    liftProgression,
    muscleGroups,
    muscleByWeek,
    currentSets,
    muscleBalance,
    muscleStatus,
    tonnageACWR,
    volProgPct,
    currentWeek,
  };
}
