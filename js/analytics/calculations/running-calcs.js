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
import { runSessionsForDay } from '../../state/run-sessions.js';

// VDOT estimate from threshold pace (sec/km). Threshold pace is treated as an
// approximate 60-minute performance, then passed through the same
// Daniels–Gilbert performance equation used for recorded efforts. This keeps
// a manual threshold and a real performance on one scale without the old unit
// error that saturated ordinary paces at the VDOT 90 ceiling.
export function vdotFromThresholdPace(thresholdSecs) {
  const pace = parseFloat(thresholdSecs);
  if (!Number.isFinite(pace) || pace <= 0) return null;
  const distanceInOneHour = 3600 / pace;
  return vdotFromPerformance(distanceInOneHour, 3600);
}

// VDOT from an actual performance (distance km + time seconds) — the
// Daniels–Gilbert model. This is how VDOT is really defined (from a hard
// effort), so it works for anyone who logs runs, no manual threshold needed.
export function vdotFromPerformance(distKm, timeSec) {
  const d = parseFloat(distKm) || 0;
  const t = parseFloat(timeSec) || 0;
  if (d <= 0 || t <= 0) return null;
  const tMin = t / 60;
  const v = (d * 1000) / tMin;                       // velocity, m/min
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  if (pctMax <= 0) return null;
  return clamp(Math.round(vo2 / pctMax), 20, 90);
}

// Inverse of vdotFromThresholdPace: an equivalent threshold pace (s/km) for a
// VDOT, so an estimated VDOT can reuse racePredictors() / race maths.
export function thresholdSecsFromVdot(vdot) {
  const raw = parseFloat(vdot);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const target = clamp(raw, 20, 90);
  let fastest = 120;
  let slowest = 900;
  for (let i = 0; i < 24; i++) {
    const midpoint = (fastest + slowest) / 2;
    const estimate = vdotFromThresholdPace(midpoint) || 0;
    if (estimate > target) fastest = midpoint;
    else slowest = midpoint;
  }
  return Math.round((fastest + slowest) / 2);
}

function _timeToSecs(timeStr) {
  if (!timeStr) return 0;
  const p = String(timeStr).split(':').map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return parseFloat(timeStr) || 0;
}

// Best VDOT implied by any qualifying run in the recent window (last `window`
// weeks). Taking the MAX self-selects the hardest effort — Daniels VDOT is a
// best-effort metric — without needing RPE. Sprints (<1.5km) and ultras
// (>42.2km) are excluded as outside the model's validated range. Walks skipped.
export function bestEffortVdot(state, days, maxWeek, window = 8) {
  let best = null;
  const from = Math.max(1, maxWeek - window + 1);
  for (let w = from; w <= maxWeek; w++) {
    const wk = (state?.weeks || {})[String(w)];
    if (!wk) continue;
    for (const d of days) {
      for (const run of runSessionsForDay(wk, d)) {
        if (run.type === 'walk') continue;
        const dist = parseFloat(run.dist) || 0;
        if (dist < 1.5 || dist > 42.2) continue;
        const v = vdotFromPerformance(dist, _timeToSecs(run.time));
        if (v != null && (best == null || v > best)) best = v;
      }
    }
  }
  return best;
}

// The athlete's effective VDOT + an equivalent threshold pace: a manually-set
// threshold wins (they told us); otherwise it's estimated from their best
// recent run. Returns { vdot, thresholdSecs, source } or null.
export function effectiveVdot(state, days, maxWeek) {
  const manual = parseFloat(state?.thresholdPaceSeconds) || 0;
  if (manual > 0) return { vdot: vdotFromThresholdPace(manual), thresholdSecs: manual, source: 'threshold' };
  const best = bestEffortVdot(state, days, maxWeek);
  if (best != null) return { vdot: best, thresholdSecs: thresholdSecsFromVdot(best), source: 'estimated' };
  return null;
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
// Divide ml/kg/min by speed in km/min (not m/s) to preserve the displayed unit.
export function runningEconomy(thresholdSecs, vdot) {
  if (!vdot || !thresholdSecs) return null;
  const vo2AtThreshold = vdot * 0.88;
  const speedMs        = 1000 / thresholdSecs;
  if (speedMs <= 0) return null;
  const speedKmPerMin = speedMs * 60 / 1000;
  return Math.round((vo2AtThreshold / speedKmPerMin) * 10) / 10;
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
