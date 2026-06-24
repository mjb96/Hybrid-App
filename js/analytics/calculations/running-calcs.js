// @ts-check
// ==========================================
// RUNNING CALCULATIONS — analytics/calculations/running-calcs.js
// Pure functions. No DOM, no side effects.
// ==========================================
import { linearRegression, trendLine, rollingAverage, pctChange, clamp } from './math-utils.js';
import {
  weeklyDistanceSeries,
  weeklyPaceSeries,
  weeklyHrSeries,
  weeklyHrZonesSeries,
  weeklyCadenceSeries,
} from '../../metrics/metrics-running.js';

// VDOT estimate from threshold pace (sec/km).
// Uses Daniels' VDOT formula approximation based on T-pace = 88% VO2max pace.
// T-pace in min/km relates to VO2max roughly as: VO2 ≈ 3537 / (pace_min_km - 0.4)
export function vdotFromThresholdPace(thresholdSecs) {
  if (!thresholdSecs || thresholdSecs <= 0) return null;
  const paceMinKm = thresholdSecs / 60;
  if (paceMinKm <= 0.4) return null;
  const vo2 = clamp(3537 / (paceMinKm - 0.4), 20, 90);
  return Math.round(vo2);
}

// Aerobic efficiency series: lower is more efficient (seconds per km per BPM).
// Returns array of efficiency values, 0 where HR data missing.
export function aerobicEfficiencySeries(paceSeries, avgHrSeries) {
  return paceSeries.map((pace, i) => {
    const hr = avgHrSeries[i];
    if (!pace || !hr || hr <= 0) return 0;
    return Math.round((pace / hr) * 100) / 100;
  });
}

// Running Economy: estimated oxygen cost in ml/kg/km.
// Requires VDOT. Approximation: VO2 at threshold ≈ 0.88 × VO2max.
// At T-pace: VO2 = efficiency × velocity. We estimate RE indirectly.
export function runningEconomy(thresholdSecs, vdot) {
  if (!vdot || !thresholdSecs) return null;
  const vo2AtThreshold = vdot * 0.88;
  const speedMs        = 1000 / thresholdSecs;
  if (speedMs <= 0) return null;
  return Math.round((vo2AtThreshold / speedMs) * 10) / 10;
}

// Improvement rate: sec/km per week (negative = faster = improving).
export function paceImprovementRate(paceSeries) {
  const reg = linearRegression(paceSeries);
  return reg.slope; // negative = getting faster
}

// Best effort pace: minimum (fastest) non-zero pace across all weeks.
export function bestEffortPace(paceSeries) {
  const nonZero = paceSeries.filter(v => v > 0);
  return nonZero.length > 0 ? Math.min(...nonZero) : null;
}

// Monthly distance: aggregate weekly distances into 4-week buckets.
export function monthlyDistanceBuckets(distSeries) {
  const months = [];
  for (let i = 0; i < distSeries.length; i += 4) {
    const slice = distSeries.slice(i, i + 4);
    const dist  = slice.reduce((a, b) => a + b, 0);
    months.push({ label: `M${Math.floor(i / 4) + 1}`, distance: dist });
  }
  return months;
}

// HR zone distribution across all time: sum each zone across all weeks.
export function allTimeHrZoneDistribution(hrZonesSeries) {
  const totals = [0, 0, 0, 0, 0];
  hrZonesSeries.forEach(week => {
    week.forEach((z, i) => { totals[i] += z; });
  });
  const total = totals.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return totals.map(z => Math.round((z / total) * 100));
}

// Pace vs HR relationship: correlation between pace and avg HR over all weeks.
// Returns { correlation, interpretation }.
export function paceHrCorrelation(paceSeries, avgHrSeries) {
  const pairs = paceSeries
    .map((p, i) => ({ pace: p, hr: avgHrSeries[i] }))
    .filter(p => p.pace > 0 && p.hr > 0);

  if (pairs.length < 3) return { correlation: null, interpretation: 'Insufficient data' };

  const n      = pairs.length;
  const meanP  = pairs.reduce((s, p) => s + p.pace, 0) / n;
  const meanH  = pairs.reduce((s, p) => s + p.hr,  0) / n;
  const num    = pairs.reduce((s, p) => s + (p.pace - meanP) * (p.hr - meanH), 0);
  const denP   = Math.sqrt(pairs.reduce((s, p) => s + (p.pace - meanP) ** 2, 0));
  const denH   = Math.sqrt(pairs.reduce((s, p) => s + (p.hr  - meanH) ** 2, 0));
  const r      = (denP * denH > 0) ? num / (denP * denH) : 0;
  const corr   = Math.round(r * 100) / 100;

  let interpretation;
  if (corr > 0.6)       interpretation = 'Strong: higher HR accompanies faster pace';
  else if (corr > 0.3)  interpretation = 'Moderate HR-pace coupling';
  else if (corr < -0.3) interpretation = 'Inverse: faster pace at lower HR (aerobic adaptation)';
  else                  interpretation = 'Weak HR-pace correlation';

  return { correlation: corr, interpretation };
}

// Threshold HR estimate: ~85–90% of max HR.
// If maxHR data available, use the highest recorded.
export function estimatedThresholdHR(maxHrSeries) {
  const highs = maxHrSeries.filter(h => h > 0);
  if (highs.length === 0) return null;
  const maxHR = Math.max(...highs);
  return Math.round(maxHR * 0.87);
}

// Aerobic decoupling approximation: compare avg pace in first half vs second half
// of each week's running load. Only possible if we have multiple runs per week.
// Returns null when not enough data. This is a week-level approximation.
export function weeklyAerobicDecoupling(paceSeries, hrSeries) {
  const pairs = paceSeries
    .map((p, i) => ({ pace: p, hr: hrSeries[i] }))
    .filter(p => p.pace > 0 && p.hr > 0);

  if (pairs.length < 4) return null;

  const half   = Math.floor(pairs.length / 2);
  const first  = pairs.slice(0, half);
  const second = pairs.slice(half);

  const eff1 = first.reduce((s, p)  => s + p.pace / p.hr, 0) / first.length;
  const eff2 = second.reduce((s, p) => s + p.pace / p.hr, 0) / second.length;

  if (eff1 === 0) return null;
  const decoupling = ((eff2 - eff1) / eff1) * 100;
  return Math.round(decoupling * 10) / 10;
}

// Race predictors from threshold pace using %VO2max scaling.
// T-pace = 88% VO2max. Scales other distances by intensity percentage.
export function racePredictors(thresholdSecs) {
  if (!thresholdSecs || thresholdSecs <= 0) return null;

  // Pace at each distance = T-pace × (88 / %VO2max_at_distance)
  const fiveK_seckm  = thresholdSecs * (88 / 100);  // faster
  const tenK_seckm   = thresholdSecs * (88 / 97);
  const hm_seckm     = thresholdSecs * (88 / 92);
  const mar_seckm    = thresholdSecs * (88 / 85);   // slower

  const toPaceStr = secs => {
    const s = Math.round(secs);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')} /km`;
  };

  const toTimeStr = (secKm, distKm) => {
    const total = Math.round(secKm * distKm);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  return {
    fiveK:    { dist: '5K',       pace: toPaceStr(fiveK_seckm),  time: toTimeStr(fiveK_seckm, 5)       },
    tenK:     { dist: '10K',      pace: toPaceStr(tenK_seckm),   time: toTimeStr(tenK_seckm, 10)       },
    halfMar:  { dist: 'Half Mar', pace: toPaceStr(hm_seckm),     time: toTimeStr(hm_seckm, 21.0975)    },
    marathon: { dist: 'Marathon', pace: toPaceStr(mar_seckm),    time: toTimeStr(mar_seckm, 42.195)    },
  };
}

// Endurance Score: composite from VDOT + consistency + distance volume.
// Returns 0–100.
export function enduranceScore(vdot, consistencyPct, weeklyDistAvg) {
  if (!vdot) return null;
  const vdotComponent       = clamp((vdot - 20) / 60 * 80 + 20, 20, 100);
  const consistencyComponent = consistencyPct !== null ? consistencyPct : 50;
  const distComponent        = clamp((weeklyDistAvg / 50) * 100, 0, 100);
  return clamp(Math.round(vdotComponent * 0.50 + consistencyComponent * 0.30 + distComponent * 0.20), 0, 100);
}

// Full running analytics payload.
export function computeRunningAnalytics(state, days, maxWeek, thresholdSecs) {
  const distSeries    = weeklyDistanceSeries(state, days, maxWeek);
  const paceSeries    = weeklyPaceSeries(state, days, maxWeek);
  const hrData        = weeklyHrSeries(state, days, maxWeek);
  const hrZonesSeries = weeklyHrZonesSeries(state, days, maxWeek);
  const cadenceSeries = weeklyCadenceSeries(state, days, maxWeek);

  const avgHrSeries = hrData.avgHr;
  const maxHrSeries = hrData.maxHr;

  const paceRolling4   = rollingAverage(paceSeries, 4);
  const paceTrendLine  = trendLine(paceSeries);
  const distRolling4   = rollingAverage(distSeries, 4);
  const effSeries      = aerobicEfficiencySeries(paceSeries, avgHrSeries);
  const effRolling4    = rollingAverage(effSeries, 4);

  const vdot           = vdotFromThresholdPace(thresholdSecs);
  const re             = runningEconomy(thresholdSecs, vdot);
  const roi            = paceImprovementRate(paceSeries); // negative = faster
  const bestPace       = bestEffortPace(paceSeries);
  const thresholdHR    = estimatedThresholdHR(maxHrSeries);
  const monthlyDist    = monthlyDistanceBuckets(distSeries);
  const hrZonePct      = allTimeHrZoneDistribution(hrZonesSeries);
  const paceHrCorr     = paceHrCorrelation(paceSeries, avgHrSeries);
  const decoupling     = weeklyAerobicDecoupling(paceSeries, avgHrSeries);

  const _priorDist = distSeries.slice(-5, -1).filter(v => v > 0);
  const distProgPct = pctChange(
    _priorDist.length > 0 ? _priorDist.reduce((a, b) => a + b, 0) / _priorDist.length : 0,
    distSeries[distSeries.length - 1],
  );

  // New: race predictors and endurance score
  const racePredict      = racePredictors(thresholdSecs);
  const weeklyDistAvg    = distSeries.filter(v => v > 0).reduce((s, v, _, a) => s + v / a.length, 0);
  const consistencyPct   = distSeries.filter(v => v > 0).length / Math.max(distSeries.length, 1) * 100;
  const endScore         = enduranceScore(vdot, consistencyPct, weeklyDistAvg);

  return {
    distSeries,
    paceSeries,
    paceRolling4,
    paceTrendLine,
    distRolling4,
    avgHrSeries,
    maxHrSeries,
    hrZonesSeries,
    cadenceSeries,
    effSeries,
    effRolling4,
    vdot,
    re,
    roi,
    bestPace,
    thresholdHR,
    monthlyDist,
    hrZonePct,
    paceHrCorr,
    decoupling,
    distProgPct,
    racePredict,
    endScore,
    weeklyDistAvg,
  };
}
