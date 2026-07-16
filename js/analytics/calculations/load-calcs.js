// @ts-check
// ==========================================
// LOAD CALCULATIONS — analytics/calculations/load-calcs.js
// Pure functions. No DOM, no side effects.
// ==========================================
import { rollingAverage, rollingSum, trendLine, pctChange, clamp } from './math-utils.js';
import { weeklyLoadMetricsSeries } from '../../brain/load_models.js';
import { weeklyLoadSeries, weekDailyLoads } from '../../metrics/metrics-load.js';

// TSB (Training Stress Balance) series: CTL − ATL for each week.
export function tsbSeries(atlSeries, ctlSeries) {
  return atlSeries.map((atl, i) => ctlSeries[i] - atl);
}

// ATL/CTL ratio series (equivalent to ACWR from EWMA).
// Safe zone: 0.8–1.3. Returns null for weeks where CTL = 0.
export function loadRatioSeries(atlSeries, ctlSeries) {
  return atlSeries.map((atl, i) => {
    const ctl = ctlSeries[i];
    return ctl > 0 ? Math.round((atl / ctl) * 100) / 100 : null;
  });
}

// Training stress trend: 4-week rolling sum of total sRPE load.
// Shows accumulated stress in the rolling window — not averaged, so spikes remain visible.
export function trainingStressTrend(liftLoadSeries, runLoadSeries, window = 4) {
  const total = liftLoadSeries.map((l, i) => l + (runLoadSeries[i] || 0));
  return rollingSum(total, window);
}

// Recovery impact: TSB divided by CTL (normalized recovery indicator).
// Positive = more recovered than baseline. Negative = in debt.
export function recoveryImpactSeries(atlSeries, ctlSeries) {
  return atlSeries.map((atl, i) => {
    const ctl = ctlSeries[i];
    const tsb = ctl - atl;
    return ctl > 0 ? Math.round((tsb / ctl) * 100) / 100 : null;
  });
}

// Fatigue trend: direction of ATL over last N weeks.
// Returns 'rising' | 'stable' | 'declining'.
export function fatigueTrend(atlSeries, lookback = 4) {
  const recent = atlSeries.slice(-lookback).filter(v => v > 0);
  if (recent.length < 2) return 'stable';
  const first = recent[0];
  const last  = recent[recent.length - 1];
  const pct   = ((last - first) / Math.abs(first)) * 100;
  if (pct > 5)  return 'rising';
  if (pct < -5) return 'declining';
  return 'stable';
}

// Training status classification from the acute:chronic load ratio (ATL/CTL).
// Returns { status, tone, zone } for UI display.
//
// Wording is deliberately descriptive (relative to the athlete's OWN recent
// baseline), not a causal injury prediction: the acute:chronic ratio is a
// load-management signal with wide individual variation, and universal "danger"
// cut-offs overstate the evidence. Zones are unchanged so downstream logic and
// styling that key on `zone` keep working; only the human-facing `status`
// strings are neutralised before they reach the load calculation.
export function trainingLoadStatus(atl, ctl) {
  if (!ctl || ctl === 0) return { status: 'Insufficient baseline', tone: 'neutral', zone: 'unknown' };
  const ratio = atl / ctl;

  if (ratio < 0.5)                       return { status: 'Well below baseline',        tone: 'neutral',  zone: 'low' };
  if (ratio >= 0.5 && ratio < 0.8)       return { status: 'Below baseline',             tone: 'progress', zone: 'low' };
  if (ratio >= 0.8 && ratio < 1.0)       return { status: 'Near baseline',              tone: 'progress', zone: 'optimal' };
  if (ratio >= 1.0 && ratio < 1.1)       return { status: 'Near baseline',              tone: 'progress', zone: 'productive' };
  if (ratio >= 1.1 && ratio < 1.3)       return { status: 'Above baseline',             tone: 'caution',  zone: 'caution' };
  if (ratio >= 1.3 && ratio < 1.5)       return { status: 'Well above baseline',        tone: 'caution',  zone: 'high' };
  return                                          { status: 'Substantially above baseline', tone: 'warning', zone: 'danger' };
}

// Load progression percentage: the change between the two most recent COMPLETED
// weeks, anchored at the athlete's current program week (`currentIdx`, 0-based).
//
// Two bugs this deliberately avoids:
//   1) Reading the last slot of a series padded out to the program's total weeks
//      made this collapse to null for anyone mid-program (weeks past today are 0),
//      so the "vs the previous week" line and the load-progression insights never
//      fired until the final weeks — the SAME dead-slot trap ATL/CTL already fixed.
//   2) Comparing the in-progress current week against a full previous week is a
//      partial-vs-full mislabel. Excluding the current week keeps it full-vs-full,
//      so "vs the previous week" always describes the periods actually compared.
// Returns null when there aren't two completed weeks with load to compare.
export function loadProgressionPct(loadSeries, currentIdx) {
  const n = loadSeries.length;
  if (n < 2) return null;
  // Default (no index / out of range): last two slots, legacy behaviour.
  let last = n - 1;
  if (Number.isFinite(currentIdx)) {
    // The current week may be partial → compare the two weeks BEFORE it.
    last = Math.min(currentIdx - 1, n - 1);
  }
  const prev = last - 1;
  if (prev < 0) return null;
  return pctChange(loadSeries[prev], loadSeries[last]);
}

// Foster Training Monotony = mean / standard deviation of the DAILY loads within
// ONE week (rest days included as 0). This is a within-week evenness measure: a
// high value means every day looked the same (little hard/easy contrast).
//
// Previously this was (incorrectly) computed over a series of WEEKLY totals,
// which is a different, undefined quantity — Foster's monotony has no meaning
// across weeks. It now takes the 7 daily loads of the target week.
//
// Returns null when the week has fewer than 2 training days, or when the daily
// loads have zero spread (SD = 0) — neither supports a valid monotony figure, so
// we report "insufficient" rather than an arbitrarily huge/undefined number.
export function trainingMonotony(dailyLoads) {
  if (!Array.isArray(dailyLoads) || dailyLoads.length < 2) return null;
  const trainingDays = dailyLoads.filter(v => v > 0).length;
  if (trainingDays < 2) return null;
  const mean     = dailyLoads.reduce((s, v) => s + v, 0) / dailyLoads.length;
  const variance = dailyLoads.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyLoads.length;
  const stdDev   = Math.sqrt(variance);
  if (stdDev === 0) return null;
  return Math.round((mean / stdDev) * 10) / 10;
}

// Foster Strain = weekly total load × training monotony. High strain (heavy AND
// monotonous week) is the combination Foster linked to maladaptation. Takes the
// week's total load and its daily loads. Null when monotony is undefined.
export function strainScore(weeklyTotalLoad, dailyLoads) {
  const monotony = trainingMonotony(dailyLoads);
  if (monotony === null) return null;
  return Math.round((weeklyTotalLoad || 0) * monotony);
}

// Consistency Score: % of last N weeks with meaningful training load.
export function consistencyScore(weeklyTotalSeries, lookback = 12) {
  const recent = weeklyTotalSeries.slice(-lookback);
  if (recent.length === 0) return null;
  const active = recent.filter(v => v > 0).length;
  return Math.round((active / recent.length) * 100);
}

// Load Distribution: strength vs endurance split over all tracked weeks.
export function loadDistribution(liftLoad, runLoad) {
  const totalLift = liftLoad.reduce((s, v) => s + v, 0);
  const totalRun  = runLoad.reduce((s, v) => s + v, 0);
  const total     = totalLift + totalRun;
  if (total === 0) return null;
  return {
    strength:   Math.round((totalLift / total) * 100),
    endurance:  Math.round((totalRun  / total) * 100),
    totalLift,
    totalRun,
  };
}

// Full load analytics payload.
export function computeLoadAnalytics(state, days, maxWeek) {
  const { atl: atlSeries, ctl: ctlSeries } = weeklyLoadMetricsSeries(state, days, maxWeek);
  const { lift: liftLoad, run: runLoad }    = weeklyLoadSeries(state, days, maxWeek);

  const tsb           = tsbSeries(atlSeries, ctlSeries);
  const ratioSeries   = loadRatioSeries(atlSeries, ctlSeries);
  const stressTrend   = trainingStressTrend(liftLoad, runLoad, 4);
  const recovImpact   = recoveryImpactSeries(atlSeries, ctlSeries);
  const fatigue       = fatigueTrend(atlSeries, 4);

  // "Current" = the athlete's current training week, not the last slot of a
  // series padded out to the program's total weeks. Reading the last slot made
  // ATL/CTL/ACWR collapse to "--" for anyone mid-program (weeks past today are
  // empty), contradicting the Score, which reads the live load. Index the
  // current week so both surfaces report the same load.
  const lastIdx       = atlSeries.length - 1;
  const wkNum         = parseInt(state?.currentWeek, 10);
  const ci            = Number.isFinite(wkNum) ? Math.max(0, Math.min(wkNum - 1, lastIdx)) : lastIdx;

  const loadStatus    = trainingLoadStatus(atlSeries[ci] || 0, ctlSeries[ci] || 0);

  const currentATL    = atlSeries[ci] || 0;
  const currentCTL    = ctlSeries[ci] || 0;
  const currentTSB    = currentCTL - currentATL;
  const currentRatio  = currentCTL > 0 ? Math.round((currentATL / currentCTL) * 100) / 100 : 0;

  const weeklyTotal   = liftLoad.map((l, i) => l + (runLoad[i] || 0));
  // Anchor at the current program week (`ci`) so this reflects the athlete's
  // real position, and compare the two most recent COMPLETED weeks — never the
  // padded end-of-program slots and never the partial current week.
  const loadProgPct   = loadProgressionPct(weeklyTotal, ci);

  // Foster monotony/strain are WITHIN-week daily-variability metrics: feed them
  // the current week's 7 daily loads (rest days as 0), not the week-over-week
  // totals. Anchored at the athlete's current program week (`ci`, 0-based → week
  // number ci+1) to match the rest of this payload.
  const currentWeekDaily = weekDailyLoads(state, days, ci + 1);
  const monotony      = trainingMonotony(currentWeekDaily);
  const strain        = strainScore(weeklyTotal[ci] || 0, currentWeekDaily);
  const consistency   = consistencyScore(weeklyTotal, 12);
  const distribution  = loadDistribution(liftLoad, runLoad);

  return {
    atlSeries,
    ctlSeries,
    tsb,
    ratioSeries,
    stressTrend,
    recovImpact,
    fatigue,
    loadStatus,
    liftLoad,
    runLoad,
    weeklyTotal,
    loadProgPct,
    currentATL,
    currentCTL,
    currentTSB,
    currentRatio,
    monotony,
    strain,
    consistency,
    distribution,
  };
}
