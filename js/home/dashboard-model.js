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
import { workoutQuality } from '../metrics/metrics-strength.js';
import { trainingStatus } from '../brain/briefing.js';
import { generateRecommendation } from '../brain/recommendations.js';
import { computeReadiness, readinessStatus, readinessColor } from '../analytics/scoring/readiness-scoring.js';
import { getFastingContext } from '../fasting.js';
import { isCompletedSet as isDone, dayVolume } from '../set-utils.js';
import { loggedDateSet } from '../analytics/logged-days.js';
import { buildCalendarWeekStrength, indexSlotsByDate } from '../analytics/weekly-aggregate.js';
import { addDaysISO, localDayKey, todayKey } from '../dates.js';
import { runDaySummary, runSessionsForDay } from '../state/run-sessions.js';
import { estimatedE1rmForSet } from '../strength/e1rm.js';
import { canonicalExerciseId } from '../exercises/catalog.js';

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
  return { status, latest, mean, date: sorted[0]?.date || null };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
export function computeDashboardModel(state, days, program, selectedDay, opts = {}) {
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
  const distCurrent = distanceSeries[idx]   || 0;

  // Fair week-over-week: an in-progress week must be judged against the SAME
  // weekdays last week, not last week's finished total. Otherwise day one of a
  // new week always reads as a volume/distance drop (partial vs full). We sum the
  // previous week only over the days already trained/run this week — a
  // "same point in the week" pace comparison. Falls through to a full-week vs
  // full-week compare naturally once every trained day has been logged.
  const curWkData  = weeks[wk];
  const prevWkData = weeks[String(wkNum - 1)];
  const paceMatchedPrev = (valueFn) => {
    if (!prevWkData) return 0;
    return days.reduce((sum, d) => (valueFn(curWkData, d) > 0 ? sum + valueFn(prevWkData, d) : sum), 0);
  };
  const liftVolOf = (wd, d) => dayVolume(wd?.lifts?.[d]);
  const runDistOf = (wd, d) => parseFloat(runDaySummary(wd, d).dist) || 0;
  const volPrev  = paceMatchedPrev(liftVolOf);
  const distPrev = paceMatchedPrev(runDistOf);

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
  const today = todayKey();
  const todayWellness = (state?.wellnessLog || []).find(e => e.date === today) || null;
  const sleepLog = Array.isArray(hc.sleep) ? [...hc.sleep].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
  const sleepHours = sleepLog[0]?.totalHours || 0;
  const hrvStat = hrvStatusFrom(hc.hrv);
  const restingHrValues = Array.isArray(hc.restingHR) ? hc.restingHR : [];
  const latestRestingHr = [...restingHrValues].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const signalDates = {
    hrv: hrvStat?.date,
    sleep: sleepLog[0]?.date,
    load: today,
    restingHr: latestRestingHr?.date,
    wellness: todayWellness?.date,
  };
  const readyRaw = computeReadiness({
    hrvStat,
    sleepHours,
    atl, ctl,
    todayWellness,
    restingHrValues,
    signalDates,
    asOf: today,
  });
  const ready = {
    ...readyRaw,
    color:          readinessColor(readyRaw.score),
    hasData:        readyRaw.score !== null,
  };

  // Readiness WITHOUT the ACWR load component (E3): the Hybrid Score's Recovery
  // pillar uses this so ACWR isn't counted twice (Recovery + the Load pillar).
  // The full `ready` above still powers the Readiness tile and recovery view.
  const readyNoLoadRaw = computeReadiness({
    hrvStat,
    sleepHours,
    atl: 0, ctl: 0,   // 0 → the load component drops out (that's the point)
    todayWellness,
    restingHrValues,
    signalDates,
    asOf: today,
  });
  const readyNoLoad = {
    ...readyNoLoadRaw,
    hasData:    readyNoLoadRaw.score !== null,
  };

  // ---- Prescriptive recommendation (reused coach brain) ------------------
  let rec;
  try { rec = generateRecommendation(state, days, program, selectedDay); }
  catch { rec = { severity: 'neutral', badge: 'Building', headline: '', advice: '', sessionLabel: '', acwr: 0, status: 'Building' }; }

  // ---- This-week roll-up --------------------------------------------------
  // Two consistency views are tracked:
  //   • whole-week (consistencyTotal/Done/Pct)   — every planned slot this week.
  //   • scheduled-to-date (…ToDate)              — only the days that have already
  //     arrived (weekday ≤ today) OR already carry completed work.
  // The Hybrid Score judges adherence on the TO-DATE view, so an early week is
  // never scored as if Tue–Sun were already due and missed (the reported "27% of
  // the week done on Monday, marked down for today's workout" bug). Whole-week
  // stays for progress tiles that legitimately show how much of the week remains.
  const weekData = weeks[wk] || {};
  const asOfKey = opts.today || today;
  const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const startDay = state?.settings?.weekStartDay || 'mon';
  const startIdx = Math.max(0, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(startDay));
  const weekOrder = [...['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].slice(startIdx),
                     ...['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].slice(0, startIdx)];
  const asOfDow = DOW[new Date(asOfKey + 'T00:00:00Z').getUTCDay()];
  const asOfIdx = weekOrder.indexOf(asOfDow);
  // A day is "overdue" only once it is STRICTLY in the past this week. TODAY's
  // own session is pending, not missed, until it is done (dayHasWork picks it up
  // the moment it is logged), so Monday morning never reads as a miss.
  const dayElapsed = (d) => { const i = weekOrder.indexOf(d); return asOfIdx === -1 || i === -1 ? false : i < asOfIdx; };
  const dayHasWork = (d) => {
    if (num(runDaySummary(weekData, d).dist) > 0) return true;
    const dl = weekData.lifts?.[d] || {};
    for (const lift in dl) if (Array.isArray(dl[lift]) && dl[lift].some(isDone)) return true;
    return false;
  };
  let sets = 0, reps = 0, consistencyDone = 0, consistencyTotal = 0;
  let consistencyDoneToDate = 0, consistencyTotalToDate = 0;
  days.forEach(d => {
    const due = dayElapsed(d) || dayHasWork(d);
    const bp = program?.days?.[d];
    const runScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
    if (runScheduled) {
      consistencyTotal++; if (due) consistencyTotalToDate++;
      if (num(runDaySummary(weekData, d).dist) > 0) { consistencyDone++; if (due) consistencyDoneToDate++; }
    }
    const dayLifts = weekData.lifts?.[d] || {};
    for (const lift in dayLifts) {
      if (!Array.isArray(dayLifts[lift])) continue;
      dayLifts[lift].forEach(s => {
        consistencyTotal++; if (due) consistencyTotalToDate++;
        if (isDone(s)) { consistencyDone++; if (due) consistencyDoneToDate++; sets++; reps += parseInt(s.r, 10) || 0; }
      });
    }
  });

  // ---- Canonical CALENDAR-week strength (the honest "this week") ----------
  // The At-a-Glance Weekly Volume tile reads THIS, not `week.*` above. `week.*`
  // tracks PROGRAM-week progression (consumed by the Hybrid Score / weekly
  // review); it can point at a frozen program week whose dates are last calendar
  // week — exactly the stale-attribution bug. The calendar aggregate buckets by
  // real stamped date, so an empty current calendar week reads as a true zero
  // and matches the In Focus graph + strength detail (all share this source).
  const calToday = opts.today || localDayKey(new Date(), opts.tz);
  const slotIndex = indexSlotsByDate(state, { tz: opts.tz });
  const calCur = buildCalendarWeekStrength(state, { today: calToday, tz: opts.tz, index: slotIndex });
  const calPrev = buildCalendarWeekStrength(state, {
    weekStart: addDaysISO(calCur.weekKey, -7), today: calToday, tz: opts.tz, index: slotIndex,
  });
  // Pace-matched previous week: same elapsed weekday positions as this week, so a
  // partial week is never judged against a full one (mirrors the In Focus graph).
  const calElapsedN = calCur.days.filter(d => d.date <= calToday).length || 7;
  const calPrevPaceVol = calPrev.days.slice(0, calElapsedN).reduce((s, d) => s + d.volumeKg, 0);
  const calendarWeek = {
    weekKey: calCur.weekKey,
    startDate: calCur.startDate,
    endDate: calCur.endDate,
    sets: calCur.totalWorkingSets,
    reps: calCur.totalReps,
    volume: {
      current: calCur.totalVolumeKg,
      prev: calPrevPaceVol,
      delta: makeDelta(calCur.elapsedVolumeKg, calPrevPaceVol, { unit: 'kg' }),
    },
    sourceWeekNums: calCur.sourceWeekNums,
  };

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
    hrv:       latestVal(hc.hrv, 'rmssd'),
  };

  const model = {
    wkNum, maxWeek, hasLoad,
    load: { atl, ctl, tsb, acwr, status: ts.status, tone: ts.tone, color: TONE_COLOR[ts.tone] || TONE_COLOR.neutral, hasData: hasLoad },
    ready,
    readyNoLoad,
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
      // Scheduled-to-date adherence (only days that have arrived / been trained).
      // Null when nothing is due yet, so the score's Consistency pillar can tell
      // "nothing scheduled yet" apart from "0% of what was due got done".
      consistencyDoneToDate, consistencyTotalToDate,
      consistencyPctToDate: consistencyTotalToDate > 0 ? Math.round((consistencyDoneToDate / consistencyTotalToDate) * 100) : null,
      // E5 — true-adherence quality of completed sets vs their prescribed target
      // (null until sets carry targets; the Consistency pillar folds it in gently).
      ...(() => { const q = workoutQuality(state, days, maxWeek); return { qualityPct: q.pct, qualityN: q.n }; })(),
    },
    calendarWeek,
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
// NOTE: no longer rendered on Home (the Morning Briefing replaced the insight
// banner) — kept as tested model intelligence and the intended copy source for
// the future morning notification (roadmap R3).
// ---------------------------------------------------------------------------
function pickTopInsight(m) {
  // Once today's planned session is logged, don't nudge the athlete to go hard —
  // the coaching card already acknowledges the session.
  const sessionDone = m.rec?.badge === 'Session Done';
  if (m.fasting.active) {
    return { text: `Fasting ${Math.floor(m.fasting.hours)}h — ${m.fasting.zone.name}`, tone: 'caution', nav: 'custom:fasting' };
  }
  if (m.load.hasData && m.load.acwr >= 1.5) {
    return { text: `Load spiking (ACWR ${m.load.acwr}). Ease off and protect recovery today.`, tone: 'warning', nav: 'training-status' };
  }
  if (!sessionDone && m.ready.hasData && m.ready.confidence === 'high' && m.ready.score >= 85) {
    return { text: `Readiness ${m.ready.score} — primed for a hard session or a PR attempt.`, tone: 'positive', nav: 'recovery-score' };
  }
  if (m.ready.hasData && m.ready.confidence === 'high' && m.ready.score < 40) {
    return { text: `Readiness ${m.ready.score} — recovery is suppressed. Keep it easy today.`, tone: 'warning', nav: 'recovery-score' };
  }
  if (m.load.hasData && m.load.acwr >= 1.3) {
    return { text: `Building load (ACWR ${m.load.acwr}) — hold volume, watch fatigue.`, tone: 'caution', nav: 'training-status' };
  }
  if (m.week.volume.delta && m.week.volume.delta.good && m.week.volume.delta.dir === 'up') {
    // `volume.delta` is pace-matched (this week's trained days vs the SAME days
    // last week), so the copy names that period rather than a full-week "last week".
    return { text: `Weekly volume up ${m.week.volume.delta.pctLabel} vs the same point last week — momentum is building.`, tone: 'positive', nav: 'weekly-volume' };
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
  const weeks = state?.weeks || {};
  for (const w in weeks) {
    const lifts = weeks[w]?.lifts || {};
    for (const day in lifts) {
      for (const lift in lifts[day]) {
        if (!Array.isArray(lifts[day][lift])) continue;
        const exerciseId = canonicalExerciseId(lift);
        lifts[day][lift].forEach(s => {
          if (!isDone(s) || s.type === 'W' || s.isWarmup) return;
          const w0 = num(s.w), r0 = parseInt(s.r, 10) || 0;
          if (w0 <= 0 || r0 <= 0) return;
          const e = estimatedE1rmForSet(lift, s);
          if (exerciseId === 'back_squat') { if (e > sq) sq = e; }
          else if (exerciseId === 'barbell_bench_press') { if (e > bp) bp = e; }
          else if (exerciseId === 'conventional_deadlift') { if (e > dl) dl = e; }
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
      for (const r of runSessionsForDay(wd, d)) {
        if (num(r.dist) > 0 && parseMins(r.time) > 0) runs.push({ dist: num(r.dist), mins: parseMins(r.time) });
      }
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

// The set of ISO dates on which real training was logged (gym or run). Shared
// by the streak view, the Hybrid Score history and the streak-freeze module so
// "what counts as a training day" has one definition (js/analytics/logged-days).
export function activeTrainingDates(weeks, days, state) {
  // `state` carries weeks; loggedDateSet reads state.weeks, so ensure it sees
  // the same weeks object even when a caller passes them separately.
  return loggedDateSet(state?.weeks === weeks ? state : { ...state, weeks }, days);
}

export function computeStreak(weeks, days, state, todayISO = todayKey()) {
  const active = activeTrainingDates(weeks, days, state);
  // Streak freezes (R7): a frozen day counts for streak continuity, so an
  // occasional missed day doesn't wipe a long streak.
  (state?.streakFreezes?.used || []).forEach(ds => active.add(ds));
  let current = 0;
  for (let i = 0; i <= 120; i++) {
    const ds = addDaysISO(todayISO, -i);
    if (!ds) break;
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
    prevDist += num(runDaySummary(prevWkData, d).dist);
    curDist  += num(runDaySummary(curWkData, d).dist);
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

// Program-long adherence baseline over COMPLETED weeks only (w < wkNum). The
// in-progress current week is deliberately excluded: including it dragged the
// baseline down every Monday (a week that is 27% done because it just started
// is not evidence of poor adherence). The current week still lifts the score
// via the pillar's scheduled-to-date term; this stays the stable anchor.
function avgConsistency(weeks, days, program, wkNum) {
  let total = 0, n = 0;
  for (let w = 1; w < wkNum; w++) {
    const wd = weeks[String(w)];
    if (!wd) continue;
    let done = 0, tot = 0;
    days.forEach(d => {
      const bp = program?.days?.[d];
      const runScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
      if (runScheduled) { tot++; if (num(runDaySummary(wd, d).dist) > 0) done++; }
      const dl = wd.lifts?.[d] || {};
      for (const lift in dl) if (Array.isArray(dl[lift])) dl[lift].forEach(s => { tot++; if (isDone(s)) done++; });
    });
    if (tot > 0) { total += done / tot; n++; }
  }
  return n > 0 ? Math.round((total / n) * 100) : 0;
}
