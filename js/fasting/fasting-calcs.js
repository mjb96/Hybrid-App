// ==========================================
// FASTING ANALYTICS CALCULATIONS — js/fasting/fasting-calcs.js
// Pure functions. No DOM, no side effects.
// ==========================================
import { FASTING_ZONES, getCurrentZone, getFastingHours } from '../fasting.js';

function _dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

function _isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

// ── Streaks ────────────────────────────────────────────────────────────────────

function _currentStreak(history, active) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 36-hour grace: if no fast has completed today yet, check if one ended within 36h
  const cutoff36h = Date.now() - 36 * 3_600_000;
  const hasRecentFast = history.some(h => new Date(h.endTime).getTime() >= cutoff36h);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const dayStart = new Date(today.getTime() - i * 86_400_000);
    const dayEnd   = new Date(dayStart.getTime() + 86_400_000);
    const had = history.some(h => { const e = new Date(h.endTime); return e >= dayStart && e < dayEnd; });
    if (had || (i === 0 && (active || hasRecentFast))) streak++;
    else break;
  }
  return streak;
}

function _longestStreak(history) {
  if (!history.length) return 0;
  const days = [...new Set(history.map(h => _dayKey(new Date(h.endTime))))].sort();
  let longest = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86_400_000);
    if (diff === 1) { cur++; if (cur > longest) longest = cur; }
    else cur = 1;
  }
  return longest;
}

// ── Trend windows ─────────────────────────────────────────────────────────────

export function calcWeeklyTrend(history, nWeeks = 12) {
  const now = new Date();
  return Array.from({ length: nWeeks }, (_, idx) => {
    const w = nWeeks - 1 - idx;
    const weekEnd = new Date(now.getTime() - w * 7 * 86_400_000);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd.getTime() - 6 * 86_400_000);
    weekStart.setHours(0, 0, 0, 0);

    const fasts = history.filter(h => { const e = new Date(h.endTime); return e >= weekStart && e <= weekEnd; });
    const hours = fasts.reduce((s, h) => s + h.durationHours, 0);
    const count = fasts.length;
    const metCount = fasts.filter(h => h.durationHours >= (h.goalHours ?? 16)).length;

    return {
      label: weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      weekStart: weekStart.toISOString().slice(0, 10),
      hours,
      count,
      avgDuration: count > 0 ? hours / count : 0,
      goalsMetCount: metCount,
      goalPct: count > 0 ? (metCount / count) * 100 : 0,
    };
  });
}

export function calcMonthlyTrend(history, nMonths = 6) {
  const now = new Date();
  return Array.from({ length: nMonths }, (_, idx) => {
    const m = nMonths - 1 - idx;
    const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const yr = date.getFullYear(), mo = date.getMonth();
    const fasts = history.filter(h => { const d = new Date(h.endTime); return d.getFullYear() === yr && d.getMonth() === mo; });
    const hours = fasts.reduce((s, h) => s + h.durationHours, 0);
    const count = fasts.length;
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    return {
      label: date.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      hours,
      count,
      adherence: Math.min(100, (count / daysInMonth) * 100),
    };
  });
}

// ── Scores ─────────────────────────────────────────────────────────────────────

function _consistencyScore(history, days) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const fastDays = new Set(history.filter(h => new Date(h.endTime) >= cutoff).map(h => _dayKey(new Date(h.endTime))));
  return Math.min(100, (fastDays.size / days) * 100);
}

function _adherenceScore(history, days) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const recent = history.filter(h => new Date(h.endTime) >= cutoff);
  if (!recent.length) return 0;
  return (recent.filter(h => h.durationHours >= (h.goalHours ?? 16)).length / recent.length) * 100;
}

// ── Distributions ─────────────────────────────────────────────────────────────

function _zoneDistribution(history) {
  const counts = Object.fromEntries(FASTING_ZONES.map(z => [z.id, 0]));
  history.forEach(h => { const z = getCurrentZone(h.durationHours); counts[z.id] = (counts[z.id] || 0) + 1; });
  return FASTING_ZONES.map(z => ({
    zone: z,
    count: counts[z.id] || 0,
    pct: history.length > 0 ? ((counts[z.id] || 0) / history.length) * 100 : 0,
  }));
}

function _weekdayAdherence(history) {
  if (!history.length) return { weekdayRate: 0, weekendRate: 0, weekdayCount: 0, weekendCount: 0 };
  let wdCount = 0, weCount = 0;
  history.forEach(h => { const day = new Date(h.endTime).getDay(); (day === 0 || day === 6) ? weCount++ : wdCount++; });
  // Use today as period end so rates don't inflate when fasting has been inactive recently
  const periodDays = Math.max(1, Math.ceil((Date.now() - new Date(history[0].endTime).getTime()) / 86_400_000) + 1);
  return {
    weekdayCount: wdCount,
    weekendCount: weCount,
    weekdayRate: Math.min(100, (wdCount / Math.max(1, Math.round(periodDays * 5 / 7))) * 100),
    weekendRate: Math.min(100, (weCount / Math.max(1, Math.round(periodDays * 2 / 7))) * 100),
  };
}

function _mostCommonSchedule(history) {
  if (!history.length) return null;
  const buckets = {};
  history.forEach(h => {
    if (h.durationHours >= 24) return; // extended fasts don't fit a daily schedule pattern
    const goal = Math.min(23, h.goalHours ?? Math.round(h.durationHours / 2) * 2);
    const eating = Math.max(1, 24 - goal);
    const key = `${goal}:${eating}`;
    buckets[key] = (buckets[key] || 0) + 1;
  });
  if (!Object.keys(buckets).length) return null;
  const best = Object.entries(buckets).sort(([, a], [, b]) => b - a)[0];
  return best ? best[0] : null;
}

// ── Calendar grid ─────────────────────────────────────────────────────────────

export function buildCalendarData(history, active, startTime, year, month) {
  const now = new Date();
  const yr = year ?? now.getFullYear();
  const mo = month ?? now.getMonth();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDayOfWeek = (new Date(yr, mo, 1).getDay() + 6) % 7; // Monday = 0

  const dateMap = {};
  history.forEach(h => {
    const d = new Date(h.endTime);
    if (d.getFullYear() === yr && d.getMonth() === mo) {
      const key = _dayKey(d);
      (dateMap[key] = dateMap[key] || []).push(h);
    }
  });

  const todayKey = _dayKey(now);
  const days = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(yr, mo, day);
    const key = _dayKey(date);
    const fasts = dateMap[key] || [];
    const isToday = key === todayKey;
    const isFuture = date > now && !isToday;

    let status = 'none', hours = 0, goalMet = false, zoneName = null;
    if (isFuture) {
      status = 'future';
    } else if (isToday && active) {
      status = 'active';
      hours = getFastingHours({ active: true, startTime });
      zoneName = getCurrentZone(hours).name;
    } else if (fasts.length > 0) {
      const best = fasts.reduce((mx, h) => h.durationHours > mx.durationHours ? h : mx, fasts[0]);
      hours = best.durationHours;
      goalMet = hours >= (best.goalHours ?? 16);
      status = goalMet ? 'completed' : 'partial';
      zoneName = getCurrentZone(hours).name;
    } else if (!isToday) {
      status = 'missed';
    }

    days.push({ date: key, day, status, hours, goalMet, zoneName, fasts });
  }

  return { days, firstDayOfWeek, daysInMonth, year: yr, month: mo };
}

// ── Correlations ──────────────────────────────────────────────────────────────

function _bodyWeightCorrelation(history, bwLog) {
  if (!bwLog?.length || bwLog.length < 4 || history.length < 4) return { hasData: false };

  const bwByWeek = {};
  bwLog.forEach(e => {
    if (!e?.date || !e.weight) return;
    const key = _isoWeekKey(new Date(e.date));
    (bwByWeek[key] = bwByWeek[key] || []).push(e.weight);
  });

  const fastsByWeek = {};
  history.forEach(h => {
    const key = _isoWeekKey(new Date(h.endTime));
    fastsByWeek[key] = (fastsByWeek[key] || 0) + 1;
  });

  const paired = Object.keys(bwByWeek)
    .filter(k => fastsByWeek[k] !== undefined)
    .map(k => ({ fasts: fastsByWeek[k], avgBw: bwByWeek[k].reduce((a, b) => a + b, 0) / bwByWeek[k].length }))
    .sort((a, b) => a.fasts - b.fasts);

  if (paired.length < 3) return { hasData: false };

  const mid = Math.floor(paired.length / 2);
  const avgLow  = paired.slice(0, mid).reduce((s, p) => s + p.avgBw, 0) / mid;
  const avgHigh = paired.slice(mid).reduce((s, p) => s + p.avgBw, 0) / (paired.length - mid);
  const diff = avgLow - avgHigh;

  return {
    hasData: true,
    direction: diff > 0.2 ? 'decreasing' : diff < -0.2 ? 'increasing' : 'neutral',
    diffKg: parseFloat(diff.toFixed(1)),
  };
}

function _recoveryCorrelation(history, wellnessLog) {
  if (!wellnessLog?.length || wellnessLog.length < 5 || history.length < 5) return { hasData: false };

  const fastDaySet = new Set(history.map(h => _dayKey(new Date(h.endTime))));
  const onFast  = wellnessLog.filter(e => fastDaySet.has(e.date));
  const offFast = wellnessLog.filter(e => !fastDaySet.has(e.date));

  if (onFast.length < 2 || offFast.length < 2) return { hasData: false };

  const avg = (arr, key) => {
    const valid = arr.filter(e => e[key] > 0);
    return valid.length ? valid.reduce((s, e) => s + e[key], 0) / valid.length : 0;
  };

  const fastMood    = avg(onFast, 'mood');
  const nonFastMood = avg(offFast, 'mood');
  const fastSleep   = avg(onFast, 'sleep');
  const nonFastSleep = avg(offFast, 'sleep');

  const moodEffect = fastMood > 0 && nonFastMood > 0
    ? ((fastMood - nonFastMood) / nonFastMood) * 100
    : 0;

  return {
    hasData: true,
    avgFastMood:     parseFloat(fastMood.toFixed(1)),
    avgNonFastMood:  parseFloat(nonFastMood.toFixed(1)),
    avgFastSleep:    parseFloat(fastSleep.toFixed(1)),
    avgNonFastSleep: parseFloat(nonFastSleep.toFixed(1)),
    moodEffect:      parseFloat(moodEffect.toFixed(1)),
  };
}

// ── Average timing ─────────────────────────────────────────────────────────────

function _fmt12h(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function _avgStartTime(history) {
  const mins = history.filter(h => h.startTime).map(h => {
    const d = new Date(h.startTime);
    return d.getHours() * 60 + d.getMinutes();
  });
  if (!mins.length) return null;
  return _fmt12h(mins.reduce((a, b) => a + b, 0) / mins.length);
}

function _avgEndTime(history) {
  const mins = history.filter(h => h.endTime).map(h => {
    const d = new Date(h.endTime);
    return d.getHours() * 60 + d.getMinutes();
  });
  if (!mins.length) return null;
  return _fmt12h(mins.reduce((a, b) => a + b, 0) / mins.length);
}

// ── Routine Stability: std-dev of fast start time → 100 = perfect routine ─────

function _routineStabilityScore(history) {
  const mins = history.filter(h => h.startTime).map(h => {
    const d = new Date(h.startTime);
    return d.getHours() * 60 + d.getMinutes();
  });
  if (mins.length < 3) return 0;
  const mean     = mins.reduce((a, b) => a + b, 0) / mins.length;
  const variance = mins.reduce((s, m) => s + Math.pow(m - mean, 2), 0) / mins.length;
  const stdDev   = Math.sqrt(variance);
  // stdDev 0 = 100, stdDev ≥120 min (2h scatter) = 0
  return Math.max(0, Math.min(100, Math.round(100 - (stdDev / 120) * 100)));
}

// ── Fasting Score 0–100 ────────────────────────────────────────────────────────

function _fastingScore(totalFasts, consistencyScore, adherenceScore, goalCompletionPct, weeklyTrend) {
  if (totalFasts < 2) return null;
  const consistency = consistencyScore * 0.30;
  const adherence   = adherenceScore * 0.25;
  const completion  = goalCompletionPct * 0.25;
  const recentWeeks  = weeklyTrend.slice(-4).filter(w => w.count > 0);
  const avgCount     = recentWeeks.length > 0
    ? recentWeeks.reduce((s, w) => s + w.count, 0) / recentWeeks.length : 0;
  const frequency   = Math.min(100, (avgCount / 5) * 100) * 0.20;
  return Math.min(100, Math.round(consistency + adherence + completion + frequency));
}

function _fastingScoreLabel(score) {
  if (score === null) return null;
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Improving';
  return 'Needs Attention';
}

function _fastingScoreColor(score) {
  if (score === null) return '#6b7280';
  if (score >= 85) return '#10b981';
  if (score >= 70) return '#3b82f6';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

// ── Momentum ───────────────────────────────────────────────────────────────────

function _weeklyMomentum(weeklyTrend) {
  const active = weeklyTrend.filter(w => w.hours > 0);
  if (active.length < 2) return 0;
  const recent = active.slice(-2);
  const older  = active.slice(Math.max(0, active.length - 4), active.length - 2);
  if (!older.length) return 0;
  const recentAvg = recent.reduce((s, w) => s + w.hours, 0) / recent.length;
  const olderAvg  = older.reduce((s, w) => s + w.hours, 0) / older.length;
  if (!olderAvg) return 0;
  return parseFloat(((recentAvg - olderAvg) / olderAvg * 100).toFixed(1));
}

function _monthlyMomentum(monthlyTrend) {
  const active = monthlyTrend.filter(m => m.hours > 0);
  if (active.length < 2) return 0;
  const last = active[active.length - 1];
  const prev = active[active.length - 2];
  if (!prev.hours) return 0;
  return parseFloat(((last.hours - prev.hours) / prev.hours * 100).toFixed(1));
}

// ── Habit Strength ─────────────────────────────────────────────────────────────

function _habitStrengthScore(history, consistencyScore, currentStreak) {
  if (!history.length) return 0;
  const streakPoints = Math.min(30, currentStreak * 3);
  const depthPoints  = Math.min(20, (history.length / 60) * 20);
  const habitPoints  = consistencyScore * 0.50;
  return Math.min(100, Math.round(streakPoints + depthPoints + habitPoints));
}

// ── Fasting Load ───────────────────────────────────────────────────────────────

function _fastingLoad(weeklyTrend) {
  const last4   = weeklyTrend.slice(-4);
  const current = last4[last4.length - 1]?.hours ?? 0;
  const prev3   = last4.slice(0, -1).filter(w => w.hours > 0);
  const avg     = prev3.length > 0
    ? prev3.reduce((s, w) => s + w.hours, 0) / prev3.length : current;
  const ratio   = avg > 0 ? current / avg : 1;
  let status = 'Balanced';
  if (ratio > 1.3)  status = 'High';
  else if (ratio > 1.1) status = 'Elevated';
  else if (ratio < 0.7) status = 'Low';
  return {
    currentLoad: parseFloat(current.toFixed(1)),
    avgLoad:     parseFloat(avg.toFixed(1)),
    ratio:       parseFloat(ratio.toFixed(2)),
    status,
  };
}

// ── Sleep correlation (detailed) ───────────────────────────────────────────────

function _sleepCorrelation(history, wellnessLog) {
  if (!wellnessLog?.length || wellnessLog.length < 5 || history.length < 5)
    return { hasData: false };
  const fastDaySet = new Set(history.map(h => _dayKey(new Date(h.endTime))));
  const onFast  = wellnessLog.filter(e => fastDaySet.has(e.date) && e.sleep > 0);
  const offFast = wellnessLog.filter(e => !fastDaySet.has(e.date) && e.sleep > 0);
  if (onFast.length < 2 || offFast.length < 2) return { hasData: false };
  const fastSleep    = onFast.reduce((s, e) => s + e.sleep, 0) / onFast.length;
  const nonFastSleep = offFast.reduce((s, e) => s + e.sleep, 0) / offFast.length;
  const diff = fastSleep - nonFastSleep;
  return {
    hasData:       true,
    fastSleep:     parseFloat(fastSleep.toFixed(2)),
    nonFastSleep:  parseFloat(nonFastSleep.toFixed(2)),
    diff:          parseFloat(diff.toFixed(2)),
    direction:     diff > 0.2 ? 'better' : diff < -0.2 ? 'worse' : 'neutral',
  };
}

// ── HRV correlation ────────────────────────────────────────────────────────────

function _hrvCorrelation(history, healthConnect) {
  const hrv = healthConnect?.hrv;
  if (!hrv?.length || hrv.length < 5 || history.length < 5) return { hasData: false };
  const fastDaySet = new Set(history.map(h => _dayKey(new Date(h.endTime))));
  const val = e => e.rmssd ?? e.value ?? 0;
  const onFast  = hrv.filter(e => fastDaySet.has(e.date) && val(e) > 0);
  const offFast = hrv.filter(e => !fastDaySet.has(e.date) && val(e) > 0);
  if (onFast.length < 2 || offFast.length < 2) return { hasData: false };
  const fastHrv    = onFast.reduce((s, e) => s + val(e), 0) / onFast.length;
  const nonFastHrv = offFast.reduce((s, e) => s + val(e), 0) / offFast.length;
  const diffPct = nonFastHrv > 0 ? ((fastHrv - nonFastHrv) / nonFastHrv) * 100 : 0;
  return {
    hasData:     true,
    fastHrv:     parseFloat(fastHrv.toFixed(1)),
    nonFastHrv:  parseFloat(nonFastHrv.toFixed(1)),
    diffPct:     parseFloat(diffPct.toFixed(1)),
    direction:   diffPct > 3 ? 'better' : diffPct < -3 ? 'worse' : 'neutral',
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeFastingAnalytics(appState) {
  const fs      = appState.fastingSession;
  const history = [...(fs?.history ?? [])].sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
  const active  = fs?.active ?? false;
  const n       = history.length;

  const currentHours = active ? getFastingHours(fs) : 0;

  const totalFasts     = n;
  const totalHours     = history.reduce((s, h) => s + h.durationHours, 0) + (active ? currentHours : 0);
  const avgDuration    = n > 0 ? totalHours / n : 0;
  const longestFast    = n > 0 ? Math.max(...history.map(h => h.durationHours)) : 0;
  const shortestFast   = n > 0 ? Math.min(...history.map(h => h.durationHours)) : 0;
  const goalsCompleted = history.filter(h => h.durationHours >= (h.goalHours ?? 16)).length;
  const goalCompletionPct = n > 0 ? (goalsCompleted / n) * 100 : 0;

  const currentStreak = _currentStreak(history, active);
  const longestStreak = _longestStreak(history);

  const weeklyTrend  = calcWeeklyTrend(history, 12);
  const monthlyTrend = calcMonthlyTrend(history, 6);

  const consistencyScore = _consistencyScore(history, 30);
  const adherenceScore   = _adherenceScore(history, 30);

  const zoneDistribution   = _zoneDistribution(history);
  const weekdayAdherence   = _weekdayAdherence(history);
  const mostCommonSchedule = _mostCommonSchedule(history);

  const bwCorrelation       = _bodyWeightCorrelation(history, appState.bodyWeightLog || []);
  const recoveryCorrelation = _recoveryCorrelation(history, appState.wellnessLog || []);
  const sleepCorrelation    = _sleepCorrelation(history, appState.wellnessLog || []);
  const hrvCorrelation      = _hrvCorrelation(history, appState.healthConnect);

  const calendarData = buildCalendarData(history, active, fs?.startTime);

  const now = new Date();

  const weeklyHours = history
    .filter(h => new Date(h.endTime).getTime() >= Date.now() - 7 * 86_400_000)
    .reduce((s, h) => s + h.durationHours, 0) + (active ? currentHours : 0);

  const monthlyHours = history
    .filter(h => { const d = new Date(h.endTime); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
    .reduce((s, h) => s + h.durationHours, 0) + (active ? currentHours : 0);

  // Advanced analytics
  const avgStartTime       = _avgStartTime(history);
  const avgEndTime         = _avgEndTime(history);
  const routineStabilityScore = _routineStabilityScore(history);
  const fastingScore       = _fastingScore(n, consistencyScore, adherenceScore, goalCompletionPct, weeklyTrend);
  const fastingScoreLabel  = _fastingScoreLabel(fastingScore);
  const fastingScoreColor  = _fastingScoreColor(fastingScore);
  const weeklyMomentum     = _weeklyMomentum(weeklyTrend);
  const monthlyMomentum    = _monthlyMomentum(monthlyTrend);
  const habitStrengthScore = _habitStrengthScore(history, consistencyScore, currentStreak);
  const fastingLoad        = _fastingLoad(weeklyTrend);

  return {
    active, currentHours, currentZone: active ? getCurrentZone(currentHours) : null, goal: fs?.goal ?? 16,
    totalFasts, totalHours, avgDuration, longestFast, shortestFast, goalsCompleted, goalCompletionPct,
    currentStreak, longestStreak, weeklyHours, monthlyHours,
    weeklyTrend, monthlyTrend,
    consistencyScore, adherenceScore,
    zoneDistribution, weekdayAdherence, mostCommonSchedule,
    bwCorrelation, recoveryCorrelation, sleepCorrelation, hrvCorrelation,
    calendarData,
    // Advanced
    avgStartTime, avgEndTime,
    routineStabilityScore,
    fastingScore, fastingScoreLabel, fastingScoreColor,
    weeklyMomentum, monthlyMomentum,
    habitStrengthScore,
    fastingLoad,
  };
}
