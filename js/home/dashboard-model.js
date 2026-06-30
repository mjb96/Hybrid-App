// @ts-check
// =============================================================================
// DASHBOARD MODEL — the unified "brain pass" for the At a Glance dashboard.
//
// Computed ONCE per Home render and handed to every tile, so:
//   • every tile reads the SAME numbers (no divergent per-tile recompute),
//   • tiles become pure presenters (hero + delta + sparkline + insight),
//   • the intelligence lives in one testable, side-effect-free place.
//
// Pure function of (state, days, program, selectedDay). No DOM, no getState,
// no engine singletons — so it is unit-testable and cheap to call.
// =============================================================================
import {
  strengthLoadSeries, enduranceLoadSeries, recoveryCostSeries, weeklyLoadMetricsSeries,
  recoveryCostBalance,
} from '../brain/load_models.js';
import { trainingStatus } from '../brain/briefing.js';
import { generateRecommendation } from '../brain/recommendations.js';
import { computeReadiness, readinessStatus, readinessColor } from '../analytics/scoring/readiness-scoring.js';
import { getFastingContext } from '../fasting.js';
import { isCompletedSet as isDone, dayVolume } from '../set-utils.js';

const TONE_COLOR = {
  positive: 'var(--color-green)',
  progress: 'var(--color-green)',
  neutral:  'var(--color-blue)',
  caution:  'var(--color-amber)',
  warning:  'var(--color-red)',
};

const num = (v) => parseFloat(v) || 0;

// Last `n` non-undefined values of a series (for sparklines).
function tail(arr, n) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

// Week-over-week delta descriptor. `higherIsBetter` flips the good/bad colour.
function makeDelta(current, prev, { higherIsBetter = true, unit = '', pct = true } = {}) {
  if (!prev || prev === 0) return null;
  const diff = current - prev;
  if (diff === 0) return { dir: 'flat', good: true, label: `0${unit}`, pctLabel: '0%' };
  const dir = diff > 0 ? 'up' : 'down';
  const good = higherIsBetter ? diff > 0 : diff < 0;
  const pctVal = Math.round((diff / prev) * 100);
  return {
    dir, good,
    label: `${diff > 0 ? '+' : ''}${unit === 'kg' ? Math.round(diff) : Math.round(diff * 10) / 10}${unit}`,
    pctLabel: `${Math.abs(pctVal)}%`,
    usePct: pct,
  };
}

// HRV status from the Health Connect log: latest vs 30-day mean.
function hrvStatusFrom(log) {
  if (!Array.isArray(log) || log.length < 2) return null;
  const sorted = [...log].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = sorted[0].rmssd;
  const window = sorted.slice(0, Math.min(30, sorted.length));
  const mean = window.reduce((s, e) => s + e.rmssd, 0) / window.length;
  if (!mean) return null;
  const ratio = latest / mean;
  let status = 'baseline';
  if (ratio >= 1.10) status = 'elevated';
  else if (ratio >= 0.92) status = 'baseline';
  else if (ratio >= 0.80) status = 'suppressed';
  else status = 'low';
  return { status, latest, mean };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
export function computeDashboardModel(state, days, program, selectedDay) {
  const weeks = state?.weeks || {};
  const wkNum = parseInt(state?.currentWeek, 10) || 1;
  const wk = String(wkNum);
  const weekKeys = Object.keys(weeks).map(Number).filter(n => !isNaN(n));
  const maxWeek = weekKeys.length ? Math.max(...weekKeys) : wkNum;

  // ---- Load series (pure) -------------------------------------------------
  const volumeSeries   = strengthLoadSeries(state, days, maxWeek);
  const distanceSeries = enduranceLoadSeries(state, days, maxWeek);
  const costSeries     = recoveryCostSeries(state, days, maxWeek);
  const { atl: atlSeries, ctl: ctlSeries } = weeklyLoadMetricsSeries(state, days, maxWeek);
  const balance        = recoveryCostBalance(state, days, wk, maxWeek);

  const idx = wkNum - 1;
  const volCurrent  = volumeSeries[idx]   || 0;
  const volPrev     = volumeSeries[idx - 1] || 0;
  const distCurrent = distanceSeries[idx]   || 0;
  const distPrev    = distanceSeries[idx - 1] || 0;

  // ---- EWMA load / freshness ---------------------------------------------
  const lm = state?.loadMetrics || {};
  const atl = num(lm.atl);
  const ctl = num(lm.ctl);
  const hasLoad = ctl > 0;
  const tsb = hasLoad ? ctl - atl : 0;
  const acwr = hasLoad ? Math.round((atl / ctl) * 100) / 100 : 0;
  const ts = trainingStatus({ hasData: hasLoad, acwr });

  // ---- Readiness (multi-signal, Garmin-style) ----------------------------
  const hc = state?.healthConnect || {};
  const today = new Date().toISOString().slice(0, 10);
  const todayWellness = (state?.wellnessLog || []).find(e => e.date === today) || null;
  const sleepLog = Array.isArray(hc.sleep) ? [...hc.sleep].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
  const sleepHours = sleepLog[0]?.totalHours || 0;
  const readyRaw = computeReadiness({
    hrvStat:        hrvStatusFrom(hc.hrv),
    sleepHours,
    atl, ctl,
    todayWellness,
    restingHrValues: hc.restingHR || [],
  });
  const ready = {
    score:          readyRaw.score,
    status:         readyRaw.status,
    color:          readinessColor(readyRaw.score),
    recommendation: readyRaw.recommendation,
    components:     readyRaw.components,
    available:      readyRaw.available,
    hasData:        readyRaw.score !== null,
  };

  // ---- Prescriptive recommendation (reused coach brain) ------------------
  let rec;
  try { rec = generateRecommendation(state, days, program, selectedDay); }
  catch { rec = { severity: 'neutral', badge: 'Building', headline: '', advice: '', sessionLabel: '', acwr: 0, status: 'Building' }; }

  // ---- This-week roll-up --------------------------------------------------
  const weekData = weeks[wk] || {};
  let sets = 0, reps = 0, consistencyDone = 0, consistencyTotal = 0;
  days.forEach(d => {
    const bp = program?.days?.[d];
    const runScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
    if (runScheduled) { consistencyTotal++; if (num(weekData.runs?.[d]?.dist) > 0) consistencyDone++; }
    const dayLifts = weekData.lifts?.[d] || {};
    for (const lift in dayLifts) {
      if (!Array.isArray(dayLifts[lift])) continue;
      dayLifts[lift].forEach(s => { consistencyTotal++; if (isDone(s)) { consistencyDone++; sets++; reps += parseInt(s.r, 10) || 0; } });
    }
  });

  // ---- Body weight --------------------------------------------------------
  const bwLog = [...(state?.bodyWeightLog || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let bodyweight = { hasData: false, latest: null, delta7: null, trend: [] };
  if (bwLog.length) {
    const latest = bwLog[bwLog.length - 1];
    const targetDate = new Date(latest.date); targetDate.setDate(targetDate.getDate() - 7);
    let old = [...bwLog].reverse().find(e => new Date(e.date) <= targetDate);
    if (!old && bwLog.length > 1) old = bwLog[0];
    bodyweight = {
      hasData: true,
      latest: latest.weight,
      delta7: old && old.date !== latest.date ? Math.round((latest.weight - old.weight) * 10) / 10 : null,
      trend: tail(bwLog.map(e => e.weight), 10),
    };
  }

  // ---- Estimated big-3 1RM (inline, keeps model pure) --------------------
  const big3 = computeBig3(state);

  // ---- Pace (last logged runs across history, current program) -----------
  const pace = computePace(weeks, days, state?.settings?.distanceUnit || 'km');

  // ---- Streak -------------------------------------------------------------
  const streak = computeStreak(weeks, days, state);

  // ---- Fasting ------------------------------------------------------------
  const fasting = getFastingContext(state || {});

  // ---- This-week vs last-week roll-up (for the home compare card) ---------
  const weekCompare = computeWeekCompare(weeks, days, wkNum);

  // ---- Goal progress ------------------------------------------------------
  const totalWeeks = program?.totalWeeks || 12;
  const calPct = Math.round((wkNum / totalWeeks) * 100);

  // ---- Health snapshot ----------------------------------------------------
  const health = {
    connected: !!hc.connected,
    sleepHours,
    restingHR: latestVal(hc.restingHR, 'bpm'),
    steps:     latestVal(hc.steps, 'count'),
    vo2max:    latestVal(hc.vo2max, 'value'),
    hrv:       latestVal(hc.hrv, 'rmssd'),
  };

  const model = {
    wkNum, maxWeek, hasLoad,
    load: { atl, ctl, tsb, acwr, status: ts.status, tone: ts.tone, color: TONE_COLOR[ts.tone] || TONE_COLOR.neutral, hasData: hasLoad },
    ready,
    rec,
    balance,
    series: {
      volume:   tail(volumeSeries, 8),
      distance: tail(distanceSeries, 8),
      cost:     tail(costSeries, 8),
      ctl:      tail(ctlSeries, 8),
      atl:      tail(atlSeries, 8),
    },
    week: {
      volume:   { current: volCurrent, prev: volPrev, delta: makeDelta(volCurrent, volPrev, { unit: 'kg' }), spark: tail(volumeSeries, 8) },
      distance: { current: distCurrent, prev: distPrev, delta: makeDelta(distCurrent, distPrev), spark: tail(distanceSeries, 8) },
      sets, reps, consistencyDone, consistencyTotal,
      consistencyPct: consistencyTotal > 0 ? Math.round((consistencyDone / consistencyTotal) * 100) : 0,
    },
    bodyweight,
    big3,
    pace,
    streak,
    fasting,
    goal: { calPct, wk: wkNum, total: totalWeeks, avgConsistency: avgConsistency(weeks, days, program, wkNum) },
    weekCompare,
    health,
  };

  model.topInsight = pickTopInsight(model);
  return model;
}

// ---------------------------------------------------------------------------
// The single most important thing to surface right now. Priority-ordered.
// ---------------------------------------------------------------------------
function pickTopInsight(m) {
  if (m.fasting.active) {
    return { text: `Fasting ${Math.floor(m.fasting.hours)}h — ${m.fasting.zone.name}`, tone: 'caution', nav: 'custom:fasting' };
  }
  if (m.load.hasData && m.load.acwr >= 1.5) {
    return { text: `Load spiking (ACWR ${m.load.acwr}). Ease off and protect recovery today.`, tone: 'warning', nav: 'training-status' };
  }
  if (m.ready.hasData && m.ready.score >= 85) {
    return { text: `Readiness ${m.ready.score} — primed for a hard session or a PR attempt.`, tone: 'positive', nav: 'recovery-score' };
  }
  if (m.ready.hasData && m.ready.score < 40) {
    return { text: `Readiness ${m.ready.score} — recovery is suppressed. Keep it easy today.`, tone: 'warning', nav: 'recovery-score' };
  }
  if (m.load.hasData && m.load.acwr >= 1.3) {
    return { text: `Building load (ACWR ${m.load.acwr}) — hold volume, watch fatigue.`, tone: 'caution', nav: 'training-status' };
  }
  if (m.week.volume.delta && m.week.volume.delta.good && m.week.volume.delta.dir === 'up') {
    return { text: `Weekly volume up ${m.week.volume.delta.pctLabel} on last week — momentum is building.`, tone: 'positive', nav: 'weekly-volume' };
  }
  if (m.streak.current >= 3) {
    return { text: `${m.streak.current}-day training streak — keep it alive.`, tone: 'positive', nav: 'streak' };
  }
  // Complementary to (not a duplicate of) the coaching card below.
  if (m.week.consistencyTotal > 0 && m.week.consistencyPct >= 50) {
    return { text: `${m.week.consistencyPct}% of this week's plan done — stay on it.`, tone: 'neutral', nav: 'progress' };
  }
  if (m.bodyweight.hasData && m.bodyweight.delta7 !== null && m.bodyweight.delta7 !== 0) {
    const dir = m.bodyweight.delta7 < 0 ? 'down' : 'up';
    return { text: `Body weight ${dir} ${Math.abs(m.bodyweight.delta7)}kg over the last week.`, tone: 'neutral', nav: 'bodyweight' };
  }
  return { text: 'Log a few sessions to unlock personalised insights.', tone: 'neutral', nav: 'progress' };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
function latestVal(log, key) {
  if (!Array.isArray(log) || !log.length) return null;
  const sorted = [...log].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sorted[0]?.[key] ?? null;
}

function computeBig3(state) {
  let sq = 0, bp = 0, dl = 0;
  const sqK = ['back squat', 'squat', 'front squat'];
  const bpK = ['bench press', 'incline bench press', 'incline barbell press'];
  const dlK = ['deadlift', 'romanian deadlift', 'deficit deadlift'];
  const weeks = state?.weeks || {};
  for (const w in weeks) {
    const lifts = weeks[w]?.lifts || {};
    for (const day in lifts) {
      for (const lift in lifts[day]) {
        if (!Array.isArray(lifts[day][lift])) continue;
        const name = lift.toLowerCase();
        lifts[day][lift].forEach(s => {
          if (!isDone(s) || s.type === 'W' || s.isWarmup) return;
          const w0 = num(s.w), r0 = parseInt(s.r, 10) || 0;
          if (w0 <= 0 || r0 <= 0) return;
          const e = w0 * (1 + r0 / 30);
          if (sqK.some(k => name.includes(k))) { if (e > sq) sq = e; }
          else if (bpK.some(k => name.includes(k))) { if (e > bp) bp = e; }
          else if (dlK.some(k => name.includes(k))) { if (e > dl) dl = e; }
        });
      }
    }
  }
  return { sq: Math.round(sq), bp: Math.round(bp), dl: Math.round(dl), total: Math.round(sq + bp + dl) };
}

function parseMins(t) {
  if (!t) return 0;
  const p = String(t).split(':').map(Number);
  if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
  if (p.length === 2) return p[0] + p[1] / 60;
  return parseFloat(t) || 0;
}

// Average pace over the most recent runs (up to 6), distance-weighted.
function computePace(weeks, days, distUnit) {
  const runs = [];
  for (const w of Object.keys(weeks).map(Number).sort((a, b) => b - a)) {
    const wd = weeks[String(w)];
    days.forEach(d => {
      const r = wd?.runs?.[d];
      if (r && num(r.dist) > 0 && parseMins(r.time) > 0) runs.push({ dist: num(r.dist), mins: parseMins(r.time) });
    });
    if (runs.length >= 6) break;
  }
  const recent = runs.slice(0, 6);
  if (!recent.length) return { hasData: false, label: '--:--', unit: distUnit, spark: [] };
  let totalDist = 0, totalMins = 0;
  const spark = [];
  recent.forEach(r => {
    totalDist += r.dist; totalMins += r.mins;
    const dispDist = distUnit === 'mi' ? r.dist * 0.621371 : r.dist;
    spark.push(r.mins / dispDist);
  });
  const dispTotal = distUnit === 'mi' ? totalDist * 0.621371 : totalDist;
  const paceMin = totalMins / dispTotal;
  const pm = Math.floor(paceMin);
  const ps = Math.round((paceMin - pm) * 60).toString().padStart(2, '0');
  return { hasData: true, label: `${pm}:${ps}`, unit: distUnit, spark: spark.reverse() };
}

export function computeStreak(weeks, days, state) {
  const active = new Set();
  const base = state?.weekStartedAt ? new Date(state.weekStartedAt) : new Date();
  const curWk = parseInt(state?.currentWeek, 10) || 1;
  for (const w in weeks) {
    const wd = weeks[w];
    const storedDates = wd?.dates || {};
    days.forEach((d, dayIdx) => {
      let done = 0;
      const dl = wd?.lifts?.[d] || {};
      for (const lift in dl) if (Array.isArray(dl[lift])) done += dl[lift].filter(isDone).length;
      const rDist = num(wd?.runs?.[d]?.dist);
      if (done > 0 || rDist > 0) {
        // Prefer the real logged date (the same source the activity calendar
        // uses); fall back to reconstructing from weekStartedAt only when the
        // stored date is missing.
        let ds = storedDates[d];
        if (!ds) {
          const approx = new Date(base);
          approx.setDate(base.getDate() - ((curWk - (parseInt(w, 10) || 1)) * 7) + dayIdx);
          ds = approx.toISOString().slice(0, 10);
        }
        active.add(ds);
      }
    });
  }
  const todayD = new Date();
  let current = 0;
  for (let i = 0; i <= 120; i++) {
    const d = new Date(todayD); d.setDate(todayD.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (active.has(ds)) { if (i === current) current++; }
    else if (i === current) break;
  }
  const sorted = [...active].sort();
  let longest = 0, temp = 0, prev = null;
  sorted.forEach(ds => {
    if (prev) { const diff = (new Date(ds).getTime() - new Date(prev).getTime()) / 86400000; temp = diff === 1 ? temp + 1 : 1; }
    else temp = 1;
    if (temp > longest) longest = temp;
    prev = ds;
  });
  return { current, longest, total: active.size };
}

// This-week vs previous-week totals for the home compare card. Tonnage uses the
// canonical dayVolume (completed working sets, warm-ups excluded); distance is
// raw km (the view converts to the user's unit). Returns hasPrev:false when
// there is no previous week to compare against.
function computeWeekCompare(weeks, days, wkNum) {
  const prevWeek = wkNum - 1;
  if (prevWeek < 1) return { hasPrev: false };
  const prevWkData = weeks[String(prevWeek)];
  if (!prevWkData) return { hasPrev: false };
  const curWkData = weeks[String(wkNum)] || {};

  let prevVol = 0, prevDist = 0, curVol = 0, curDist = 0;
  days.forEach(d => {
    prevDist += num(prevWkData.runs?.[d]?.dist);
    curDist  += num(curWkData.runs?.[d]?.dist);
    prevVol  += dayVolume(prevWkData.lifts?.[d]);
    curVol   += dayVolume(curWkData.lifts?.[d]);
  });
  return {
    hasPrev: true,
    prevWeek,
    volume:   { current: curVol,  prev: prevVol },
    distance: { current: curDist, prev: prevDist },
  };
}

function avgConsistency(weeks, days, program, wkNum) {
  let total = 0, n = 0;
  for (let w = 1; w <= wkNum; w++) {
    const wd = weeks[String(w)];
    if (!wd) continue;
    let done = 0, tot = 0;
    days.forEach(d => {
      const bp = program?.days?.[d];
      const runScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
      if (runScheduled) { tot++; if (num(wd.runs?.[d]?.dist) > 0) done++; }
      const dl = wd.lifts?.[d] || {};
      for (const lift in dl) if (Array.isArray(dl[lift])) dl[lift].forEach(s => { tot++; if (isDone(s)) done++; });
    });
    if (tot > 0) { total += done / tot; n++; }
  }
  return n > 0 ? Math.round((total / n) * 100) : 0;
}
