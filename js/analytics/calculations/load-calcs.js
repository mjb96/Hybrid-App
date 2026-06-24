// @ts-check
// ==========================================
// LOAD CALCULATIONS — analytics/calculations/load-calcs.js
// Pure functions. No DOM, no side effects.
// ==========================================
import { rollingAverage, rollingSum, trendLine, pctChange, clamp } from './math-utils.js';
import { weeklyLoadMetricsSeries } from '../../brain/load_models.js';
import { weeklyLoadSeries } from '../../metrics/metrics-load.js';

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

// Training status classification from ACWR (ATL/CTL ratio).
// Returns { status, tone, zone } suitable for UI display.
export function trainingLoadStatus(atl, ctl) {
  if (!ctl || ctl === 0) return { status: 'No Data', tone: 'neutral', zone: 'unknown' };
  const ratio = atl / ctl;
  const tsb   = ctl - atl;

  if (ratio < 0.5)                       return { status: 'Detraining',    tone: 'neutral',  zone: 'low' };
  if (ratio >= 0.5 && ratio < 0.8)       return { status: 'Fresh',         tone: 'progress', zone: 'low' };
  if (ratio >= 0.8 && ratio < 1.0)       return { status: 'Optimal',       tone: 'progress', zone: 'optimal' };
  if (ratio >= 1.0 && ratio < 1.1)       return { status: 'Productive',    tone: 'progress', zone: 'productive' };
  if (ratio >= 1.1 && ratio < 1.3)       return { status: 'Accumulating',  tone: 'caution',  zone: 'caution' };
  if (ratio >= 1.3 && ratio < 1.5)       return { status: 'High Load',     tone: 'caution',  zone: 'high' };
  return                                          { status: 'Danger Zone',  tone: 'warning',  zone: 'danger' };
}

// Load progression percentage: current 7-day load vs previous 7-day load.
export function loadProgressionPct(loadSeries) {
  const n = loadSeries.length;
  if (n < 2) return null;
  return pctChange(loadSeries[n - 2], loadSeries[n - 1]);
}

// Volume of training in each zone based on run pace data.
// Zones: easy (<80% T-pace), moderate (80-95%), threshold (95-105%), hard (>105%)
export function runZoneDistribution(weeklyPaceSeries, thresholdSecs) {
  if (!thresholdSecs) return null;
  const zones = { easy: 0, moderate: 0, threshold: 0, hard: 0 };
  weeklyPaceSeries.filter(p => p > 0).forEach(pace => {
    const ratio = pace / thresholdSecs;
    if (ratio > 1.2)        zones.easy++;
    else if (ratio > 1.05)  zones.moderate++;
    else if (ratio > 0.95)  zones.threshold++;
    else                    zones.hard++;
  });
  return zones;
}

// Training Monotony: mean / stdDev of recent weekly loads (Foster's method).
// High monotony (>2) = repetitive, increases injury risk.
export function trainingMonotony(weeklyTotalSeries, lookback = 7) {
  const recent = weeklyTotalSeries.slice(-lookback).filter(v => v > 0);
  if (recent.length < 2) return null;
  const mean     = recent.reduce((s, v) => s + v, 0) / recent.length;
  const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
  const stdDev   = Math.sqrt(variance);
  if (stdDev === 0) return null;
  return Math.round((mean / stdDev) * 10) / 10;
}

// Strain Score: current week load × training monotony.
// High strain requires careful recovery.
export function strainScore(weeklyTotalSeries, lookback = 7) {
  const monotony = trainingMonotony(weeklyTotalSeries, lookback);
  if (monotony === null) return null;
  const weeklyLoad = weeklyTotalSeries[weeklyTotalSeries.length - 1] || 0;
  return Math.round(weeklyLoad * monotony);
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
  const loadStatus    = trainingLoadStatus(
    atlSeries[atlSeries.length - 1] || 0,
    ctlSeries[ctlSeries.length - 1] || 0,
  );

  const currentATL    = atlSeries[atlSeries.length - 1] || 0;
  const currentCTL    = ctlSeries[ctlSeries.length - 1] || 0;
  const currentTSB    = currentCTL - currentATL;
  const currentRatio  = currentCTL > 0 ? Math.round((currentATL / currentCTL) * 100) / 100 : 0;

  const weeklyTotal   = liftLoad.map((l, i) => l + (runLoad[i] || 0));
  const loadProgPct   = loadProgressionPct(weeklyTotal);

  // New advanced metrics
  const monotony      = trainingMonotony(weeklyTotal, 7);
  const strain        = strainScore(weeklyTotal, 7);
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
