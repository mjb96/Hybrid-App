// ==========================================
// RECOVERY CALCULATIONS — analytics/calculations/recovery-calcs.js
// Pure functions. No DOM, no side effects.
// ==========================================
import { rollingAverage, pctChange, clamp } from './math-utils.js';

// Extract last N days of sleep data from wellnessLog.
// Returns [{ date, hours }, ...] sorted ascending.
export function sleepSeries(wellnessLog, days = 28) {
  if (!Array.isArray(wellnessLog) || wellnessLog.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return wellnessLog
    .filter(e => e.date >= cutoff && e.sleep > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.sleep }));
}

// Extract mood series from wellnessLog.
export function moodSeries(wellnessLog, days = 28) {
  if (!Array.isArray(wellnessLog) || wellnessLog.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return wellnessLog
    .filter(e => e.date >= cutoff && e.mood > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.mood }));
}

// Extract soreness series from wellnessLog.
export function sorenessSeries(wellnessLog, days = 28) {
  if (!Array.isArray(wellnessLog) || wellnessLog.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return wellnessLog
    .filter(e => e.date >= cutoff && e.soreness > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.soreness }));
}

// HRV trend series from Health Connect data.
// Returns [{ date, value }, ...] for last N days.
export function hrvSeries(healthConnect, days = 28) {
  const hrv = healthConnect?.hrv;
  if (!Array.isArray(hrv) || hrv.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return hrv
    .filter(e => e.date >= cutoff && (e.rmssd || e.value) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, value: e.rmssd || e.value }));
}

// Resting HR trend series from Health Connect.
export function restingHrSeries(healthConnect, days = 28) {
  const rhr = healthConnect?.restingHR;
  if (!Array.isArray(rhr) || rhr.length === 0) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
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

  const today = new Date().toISOString().slice(0, 10);
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
    hasHC: hc.connected === true || hrvData.length > 0 || rhrData.length > 0,
  };
}
