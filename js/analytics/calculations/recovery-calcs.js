// @ts-check
// ==========================================
// RECOVERY CALCULATIONS — analytics/calculations/recovery-calcs.js
// Pure functions. No DOM, no side effects.
// ==========================================
import { rollingAverage, pctChange, clamp } from './math-utils.js';
import { addDaysISO, todayKey } from '../../dates.js';

const cutoffDay = (days, todayISO = todayKey()) => addDaysISO(todayISO, -days);

// Extract last N days of sleep data from wellnessLog.
// Returns [{ date, hours }, ...] sorted ascending.
export function sleepSeries(wellnessLog, days = 28, todayISO = todayKey()) {
  if (!Array.isArray(wellnessLog) || wellnessLog.length === 0) return [];
  const cutoff = cutoffDay(days, todayISO);
  return wellnessLog
    .filter(e => e.date >= cutoff && e.sleep > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.sleep }));
}

// Extract mood series from wellnessLog.
export function moodSeries(wellnessLog, days = 28, todayISO = todayKey()) {
  if (!Array.isArray(wellnessLog) || wellnessLog.length === 0) return [];
  const cutoff = cutoffDay(days, todayISO);
  return wellnessLog
    .filter(e => e.date >= cutoff && e.mood > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.mood }));
}

// Extract soreness series from wellnessLog.
export function sorenessSeries(wellnessLog, days = 28, todayISO = todayKey()) {
  if (!Array.isArray(wellnessLog) || wellnessLog.length === 0) return [];
  const cutoff = cutoffDay(days, todayISO);
  return wellnessLog
    .filter(e => e.date >= cutoff && e.soreness > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.soreness }));
}

// HRV trend series from Health Connect data.
// Returns [{ date, value }, ...] for last N days.
export function hrvSeries(healthConnect, days = 28, todayISO = todayKey()) {
  const hrv = healthConnect?.hrv;
  if (!Array.isArray(hrv) || hrv.length === 0) return [];
  const cutoff = cutoffDay(days, todayISO);
  return hrv
    .filter(e => e.date >= cutoff && (e.rmssd || e.value) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.rmssd || e.value }));
}

// Resting HR trend series from Health Connect.
export function restingHrSeries(healthConnect, days = 28, todayISO = todayKey()) {
  const rhr = healthConnect?.restingHR;
  if (!Array.isArray(rhr) || rhr.length === 0) return [];
  const cutoff = cutoffDay(days, todayISO);
  return rhr
    .filter(e => e.date >= cutoff && e.bpm > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.bpm }));
}

// Rolling 7-day average for a [{ date, value }] series.
export function rollingAvg7(series) {
  const values = series.map(e => e.value);
  const ma7    = rollingAverage(values, 7);
  return series.map((e, i) => ({ date: e.date, value: e.value, ma7: ma7[i] }));
}

// Detect consecutive recovery decline: number of days the recovery score
// has trended downward. Useful for "Recovery has declined for N days" insight.
export function consecutiveDecline(series) {
  if (series.length < 2) return 0;
  const values = series.map(e => (typeof e === 'object' ? e.value : e));
  let count = 0;
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i] < values[i - 1]) count++;
    else break;
  }
  return count;
}

// 7-day average sleep from wellnessLog.
export function avgSleep7d(wellnessLog) {
  const series = sleepSeries(wellnessLog, 7);
  if (series.length === 0) return null;
  return series.reduce((s, e) => s + e.value, 0) / series.length;
}

// 30-day average HRV baseline.
export function avgHrv30d(healthConnect) {
  const series = hrvSeries(healthConnect, 30);
  if (series.length === 0) return null;
  return series.reduce((s, e) => s + e.value, 0) / series.length;
}

// HRV status relative to 30d baseline.
// Returns { current, baseline, delta, status }.
export function hrvStatus(healthConnect) {
  const series   = hrvSeries(healthConnect, 30);
  if (series.length < 3) return null;
  const latest   = series[series.length - 1]?.value || 0;
  const baseline = series.slice(0, -1).reduce((s, e) => s + e.value, 0) / (series.length - 1);
  const delta    = latest - baseline;
  const pct      = baseline > 0 ? (delta / baseline) * 100 : 0;
  let status;
  if (pct > 5)       status = 'elevated';    // good
  else if (pct > -5) status = 'baseline';
  else if (pct > -15) status = 'suppressed'; // fatigued
  else               status = 'low';         // overreached
  return { current: Math.round(latest), baseline: Math.round(baseline), delta: Math.round(delta), pct: Math.round(pct), status };
}

// Recovery score series over last N days of wellness logs.
// Combines available signals: sleep, mood, soreness.
export function dailyRecoveryScoreSeries(wellnessLog, days = 28) {
  const sleep    = sleepSeries(wellnessLog, days);
  const mood     = moodSeries(wellnessLog, days);
  const soreness = sorenessSeries(wellnessLog, days);

  const byDate = {};
  sleep.forEach(e    => { byDate[e.date] = { ...byDate[e.date], sleep: e.value }; });
  mood.forEach(e     => { byDate[e.date] = { ...byDate[e.date], mood: e.value }; });
  soreness.forEach(e => { byDate[e.date] = { ...byDate[e.date], soreness: e.value }; });

  const SIGNAL_WEIGHTS = { sleep: 0.40, mood: 0.35, soreness: 0.25 };

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => {
      const available = [
        vals.sleep     !== undefined ? 'sleep'    : null,
        vals.mood      !== undefined ? 'mood'     : null,
        vals.soreness  !== undefined ? 'soreness' : null,
      ].filter(Boolean);

      if (available.length === 0) return { date, value: 0, ...vals };

      const totalW = available.reduce((s, k) => s + SIGNAL_WEIGHTS[k], 0);
      let score = 0;
      if (vals.sleep    !== undefined) score += clamp((vals.sleep / 8) * 100, 0, 100) * (SIGNAL_WEIGHTS.sleep    / totalW);
      if (vals.mood     !== undefined) score += (vals.mood / 5) * 100                 * (SIGNAL_WEIGHTS.mood     / totalW);
      if (vals.soreness !== undefined) score += ((6 - vals.soreness) / 5) * 100       * (SIGNAL_WEIGHTS.soreness / totalW);

      return { date, value: Math.round(clamp(score, 0, 100)), ...vals };
    });
}

// Sleep 28-day average baseline.
export function sleepBaseline28d(wellnessLog) {
  const series = sleepSeries(wellnessLog, 28);
  if (series.length === 0) return null;
  return series.reduce((s, e) => s + e.value, 0) / series.length;
}

// Sleep debt: total hours below 8h target over last 7 days.
export function sleepDebt7d(wellnessLog) {
  const series = sleepSeries(wellnessLog, 7);
  if (series.length === 0) return null;
  const deficit = series.reduce((s, e) => s + Math.max(0, 8 - e.value), 0);
  return Math.round(deficit * 10) / 10;
}

// Recovery momentum: 3-day average vs 7-day average recovery score.
// Returns { direction, pct, avg3d, avg7d } or null.
export function recoveryMomentum(recovScores) {
  if (recovScores.length < 4) return null;
  const last3 = recovScores.slice(-3).map(e => e.value);
  const last7 = recovScores.slice(-7).map(e => e.value);
  const avg3  = last3.reduce((s, v) => s + v, 0) / last3.length;
  const avg7  = last7.reduce((s, v) => s + v, 0) / last7.length;
  if (avg7 === 0) return null;
  const pct = ((avg3 - avg7) / avg7) * 100;
  return {
    direction: pct > 5 ? 'improving' : pct < -5 ? 'declining' : 'stable',
    pct: Math.round(pct),
    avg3d: Math.round(avg3),
    avg7d: Math.round(avg7),
  };
}

// Resting HR baseline (28-day average).
export function rhrBaseline28d(healthConnect) {
  const series = restingHrSeries(healthConnect, 28);
  if (series.length === 0) return null;
  return Math.round(series.reduce((s, e) => s + e.value, 0) / series.length);
}

// Resting HR deviation vs 28-day baseline.
export function rhrDeviation(healthConnect) {
  const series = restingHrSeries(healthConnect, 28);
  if (series.length < 3) return null;
  const latest   = series[series.length - 1]?.value || 0;
  const baseline = Math.round(series.slice(0, -1).reduce((s, e) => s + e.value, 0) / (series.length - 1));
  const delta    = latest - baseline;
  const pct      = baseline > 0 ? Math.round((delta / baseline) * 100) : 0;
  return { current: latest, baseline, delta, pct };
}

// Nervous system status from HRV + RHR composite.
// Returns { status: 'Primed'|'Balanced'|'Suppressed'|'Fatigued', tone } or null.
export function nervousSystemStatus(healthConnect) {
  const hrvStat  = hrvStatus(healthConnect);
  const rhrDev   = rhrDeviation(healthConnect);

  if (hrvStat) {
    switch (hrvStat.status) {
      case 'elevated':   return { status: 'Primed',    tone: 'progress' };
      case 'baseline':   return { status: 'Balanced',  tone: 'neutral'  };
      case 'suppressed': return { status: 'Suppressed', tone: 'caution'  };
      case 'low':        return { status: 'Fatigued',  tone: 'warning'  };
    }
  }

  // Fallback to RHR deviation if HRV unavailable
  if (rhrDev) {
    if (rhrDev.pct < -5) return { status: 'Primed',    tone: 'progress' };
    if (rhrDev.pct <  5) return { status: 'Balanced',  tone: 'neutral'  };
    if (rhrDev.pct < 10) return { status: 'Suppressed', tone: 'caution'  };
    return                        { status: 'Fatigued',  tone: 'warning'  };
  }

  return null;
}

// Recovery debt: number of consecutive days with recovery score below threshold.
export function recoveryDebt(recovScores, threshold = 60) {
  if (recovScores.length === 0) return 0;
  let count = 0;
  for (let i = recovScores.length - 1; i >= 0; i--) {
    if (recovScores[i].value < threshold) count++;
    else break;
  }
  return count;
}

// Full recovery analytics payload.
export function computeRecoveryAnalytics(appState) {
  const wellnessLog  = appState.wellnessLog || [];
  const hc           = appState.healthConnect || {};

  const sleepData    = rollingAvg7(sleepSeries(wellnessLog, 28));
  const moodData     = moodSeries(wellnessLog, 28);
  const sorenessData = sorenessSeries(wellnessLog, 28);
  const hrvData      = rollingAvg7(hrvSeries(hc, 28));
  const rhrData      = rollingAvg7(restingHrSeries(hc, 28));
  const recovScores  = dailyRecoveryScoreSeries(wellnessLog, 28);
  const recovDecline = consecutiveDecline(recovScores);
  const sleep7d      = avgSleep7d(wellnessLog);
  const hrv30d       = avgHrv30d(hc);
  const hrvStat      = hrvStatus(hc);

  // New: baseline-relative metrics
  const sleep28dBaseline = sleepBaseline28d(wellnessLog);
  const sleepDebt        = sleepDebt7d(wellnessLog);
  const momentum         = recoveryMomentum(recovScores);
  const nsStatus         = nervousSystemStatus(hc);
  const rhrBase28d       = rhrBaseline28d(hc);
  const rhrDev           = rhrDeviation(hc);
  const debtDays         = recoveryDebt(recovScores, 60);

  // Sleep deviation vs 28d baseline
  const sleepDev = (sleep7d !== null && sleep28dBaseline !== null)
    ? { current: sleep7d, baseline: sleep28dBaseline, pct: Math.round(((sleep7d - sleep28dBaseline) / sleep28dBaseline) * 100) }
    : null;

  const today = todayKey();
  const todayWellness = wellnessLog.find(e => e.date === today) || {};

  return {
    sleepData,
    moodData,
    sorenessData,
    hrvData,
    rhrData,
    recovScores,
    recovDecline,
    sleep7d,
    hrv30d,
    hrvStat,
    todayWellness,
    sleep28dBaseline,
    sleepDebt,
    momentum,
    nsStatus,
    rhrBase28d,
    rhrDev,
    debtDays,
    sleepDev,
    hasHC: hc.connected === true || hrvData.length > 0 || rhrData.length > 0,
  };
}
