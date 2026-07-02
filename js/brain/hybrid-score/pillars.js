// @ts-check
// =============================================================================
// HYBRID SCORE — PILLARS (js/brain/hybrid-score/pillars.js)
//
// Eight pure pillar sub-scores (0–100), each built from metrics that ALREADY
// exist (reused via the dashboard model + the metric/load modules). No metric
// is recomputed from scratch here beyond light trend maths over existing series.
//
// Each pillar returns { score: number|null, signals: string[] }:
//   score  — 0..100, or null when there is not enough data (dropped + weight
//            redistributed by the engine).
//   signals — short human phrases, most important first, used to caption the
//            "why today" drivers.
// =============================================================================
import { clamp } from '../../analytics/calculations/math-utils.js';
import { weeklyE1rmByLift } from '../../metrics/metrics-strength.js';
import { weeklyDistanceSeries, weeklyPaceSeries } from '../../metrics/metrics-running.js';
import { strengthLoadSeries, recoveryCostBreakdown } from '../load_models.js';
import { vdotFromThresholdPace, enduranceScore } from '../../analytics/calculations/running-calcs.js';
import { levelProfile } from './config.js';

const round = (n) => Math.round(n);

// Last non-zero value in a series at or before `idx`.
function lastNonZero(series, idx) {
  for (let i = Math.min(idx, series.length - 1); i >= 0; i--) if (series[i] > 0) return series[i];
  return 0;
}
// A non-zero value at least `lookback` weeks before `idx`.
function priorNonZero(series, idx, lookback) {
  for (let i = idx - lookback; i >= 0; i--) if (series[i] > 0) return series[i];
  return 0;
}
// Percent change of a series over a trailing window (null if not enough data).
function progressionPct(series, idx, lookback = 4) {
  const cur = lastNonZero(series, idx);
  const past = priorNonZero(series, idx, lookback);
  if (cur <= 0 || past <= 0) return null;
  return ((cur - past) / past) * 100;
}
// Map a percent gain to 0–100 given the athlete's level (full marks at the
// level's fullGainPct; a floor so a flat/modest week isn't crushed; gains above
// target saturate; regression drops below the floor toward 0).
function gainToScore(pct, level) {
  const { fullGainPct, floor } = levelProfile(level);
  if (pct == null) return null;
  if (pct >= fullGainPct) return clamp(100, 0, 100);
  if (pct >= 0) return clamp(floor + (pct / fullGainPct) * (100 - floor), 0, 100);
  // regression: below the floor, scaled by how far it fell (−fullGainPct → 0)
  return clamp(floor + (pct / fullGainPct) * floor, 0, 100);
}

// ---- CONSISTENCY ----------------------------------------------------------
export function consistencyPillar(model) {
  const w = model.week;
  const streak = model.streak?.current || 0;
  const avg = model.goal?.avgConsistency || 0;
  const hasData = (w?.consistencyTotal || 0) > 0 || streak > 0 || avg > 0;
  if (!hasData) return { score: null, signals: [] };

  const thisWeek = w.consistencyTotal > 0 ? w.consistencyPct : avg;
  let score = 0.6 * thisWeek + 0.4 * (avg || thisWeek);
  score = clamp(score + Math.min(streak, 7) / 7 * 8, 0, 100); // streak nudge

  const signals = [];
  if (w.consistencyTotal > 0) {
    const missed = w.consistencyTotal - w.consistencyDone;
    if (w.consistencyPct >= 100) signals.push('all planned sessions done');
    else if (missed > 0) signals.push(`${missed} planned session${missed > 1 ? 's' : ''} still open`);
    else signals.push(`${w.consistencyPct}% of the plan done`);
  }
  if (streak >= 3) signals.push(`${streak}-day streak`);
  if (!signals.length) signals.push('building your routine');
  return { score: round(score), signals };
}

// ---- RECOVERY -------------------------------------------------------------
export function recoveryPillar(model) {
  const r = model.ready;
  const hasLoad = model.load?.hasData;
  if (!r?.hasData && !hasLoad) return { score: null, signals: [] };

  let score;
  if (r?.hasData) score = r.score;
  else {
    // Fall back to freshness (TSB) when no readiness signals exist.
    const tsb = model.load.tsb;
    score = clamp(60 + tsb * 1.5, 10, 100);
  }

  const signals = [];
  const c = r?.components || {};
  if (c.sleep != null && c.sleep < 55) signals.push('poor sleep');
  else if (c.sleep != null && c.sleep >= 85) signals.push('good sleep');
  if (c.hrv != null && c.hrv < 50) signals.push('HRV suppressed');
  if (c.restingHr != null && c.restingHr < 50) signals.push('resting HR elevated');
  if (hasLoad && model.load.tsb <= -15) signals.push('high fatigue');
  if (!signals.length) signals.push(r?.status ? r.status.toLowerCase() + ' recovery' : 'recovering');
  return { score: round(score), signals };
}

// ---- STRENGTH -------------------------------------------------------------
export function strengthPillar(model, state, days, level) {
  const maxWeek = model.maxWeek;
  const idx = model.wkNum - 1;
  const tonnage = strengthLoadSeries(state, days, maxWeek);
  const everLifted = tonnage.some(v => v > 0);
  if (!everLifted) return { score: null, signals: [] };

  // Progression: best per-lift e1RM change over ~4 weeks, averaged across lifts.
  const byLift = weeklyE1rmByLift(state, days, maxWeek);
  const gains = [];
  let bestLift = null, bestGain = -Infinity;
  for (const lift in byLift) {
    const pct = progressionPct(byLift[lift], idx, 4);
    if (pct == null) continue;
    gains.push(pct);
    if (pct > bestGain) { bestGain = pct; bestLift = lift; }
  }
  const progScore = gains.length
    ? gainToScore(gains.reduce((a, b) => a + b, 0) / gains.length, level)
    : levelProfile(level).floor; // lifting but no window yet → neutral floor

  // Volume upkeep: current week tonnage vs trailing 3-week average.
  const cur = lastNonZero(tonnage, idx);
  const window = tonnage.slice(Math.max(0, idx - 3), idx).filter(v => v > 0);
  const avg = window.length ? window.reduce((a, b) => a + b, 0) / window.length : cur;
  const upkeep = avg > 0 ? clamp(50 + ((cur - avg) / avg) * 60, 20, 100) : 60;

  const score = 0.6 * progScore + 0.4 * upkeep;
  const signals = [];
  if (bestLift && isFinite(bestGain)) {
    if (bestGain >= 1) signals.push(`${bestLift} e1RM up ${bestGain.toFixed(0)}%`);
    else if (bestGain <= -1) signals.push(`${bestLift} e1RM down ${Math.abs(bestGain).toFixed(0)}%`);
  }
  if (cur > avg * 1.1) signals.push('lifting volume rising');
  else if (cur < avg * 0.9) signals.push('lifting volume down');
  if (!signals.length) signals.push('strength holding');
  return { score: round(score), signals };
}

// ---- ENDURANCE ------------------------------------------------------------
export function endurancePillar(model, state, days, level) {
  const maxWeek = model.maxWeek;
  const idx = model.wkNum - 1;
  const dist = weeklyDistanceSeries(state, days, maxWeek);
  const everRan = dist.some(v => v > 0);
  if (!everRan) return { score: null, signals: [] };

  const pace = weeklyPaceSeries(state, days, maxWeek); // sec/km, lower = faster
  // Distance progression (volume trend).
  const distPct = progressionPct(dist, idx, 4);
  const distScore = distPct != null ? gainToScore(distPct, level) : levelProfile(level).floor;
  // Pace progression: a DROP in sec/km is improvement → invert the sign.
  const pacePct = progressionPct(pace, idx, 4);
  const paceScore = pacePct != null ? gainToScore(-pacePct, level) : null;

  // If the athlete set a threshold pace, fold in the science-based endurance score.
  const vdot = state?.thresholdPaceSeconds ? vdotFromThresholdPace(state.thresholdPaceSeconds) : null;
  const weeklyAvgDist = dist.filter(v => v > 0).slice(-4).reduce((a, b, _, arr) => a + b / arr.length, 0);
  const eScore = vdot ? enduranceScore(vdot, model.week?.consistencyPct || 0, weeklyAvgDist) : null;

  const parts = [distScore];
  if (paceScore != null) parts.push(paceScore);
  if (eScore != null) parts.push(eScore);
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;

  const signals = [];
  if (pacePct != null && pacePct <= -1) signals.push(`pace improving ${Math.abs(pacePct).toFixed(0)}%`);
  else if (pacePct != null && pacePct >= 1) signals.push('pace slowing');
  if (distPct != null && distPct >= 5) signals.push('running volume rising');
  if (vdot) signals.push(`VDOT ~${vdot.toFixed(0)}`);
  if (!signals.length) signals.push('aerobic base building');
  return { score: round(score), signals };
}

// ---- TRAINING LOAD & BALANCE ---------------------------------------------
// Rewards the productive ACWR zone AND doing both modalities. Deload-aware:
// on a planned deload an easing load (ACWR < 1, rising TSB) scores HIGH.
export function loadPillar(model, state, days, deload) {
  const hasLoad = model.load?.hasData;
  const bd = recoveryCostBreakdown(state, days, model.maxWeek);
  const idx = model.wkNum - 1;
  const str = bd.strength[idx] || 0;
  const end = bd.endurance[idx] || 0;
  const hasBalance = str > 0 || end > 0;
  if (!hasLoad && !hasBalance) return { score: null, signals: [] };

  const acwr = model.load?.acwr || 0;
  let zone;
  if (deload) {
    // Planned deload: easing load is the goal, not a fault.
    zone = acwr === 0 ? 80 : acwr < 0.8 ? 95 : acwr < 1.0 ? 100 : acwr < 1.2 ? 80 : 45;
  } else if (acwr === 0) {
    zone = 60;
  } else if (acwr < 0.5) zone = 65;
  else if (acwr < 0.8) zone = 88;
  else if (acwr < 1.0) zone = 100;
  else if (acwr < 1.1) zone = 92;
  else if (acwr < 1.3) zone = 68;
  else if (acwr < 1.5) zone = 40;
  else zone = 18;

  // Balance: closest to an even hybrid split scores best; a single modality is
  // capped to nudge the athlete toward true hybrid training.
  let balance = 60, balanceSignal = null;
  if (str > 0 && end > 0) {
    const total = str + end;
    const strPct = (str / total) * 100;
    const imbalance = Math.abs(strPct - 50); // 0 = perfect
    balance = clamp(100 - imbalance * 1.4, 30, 100);
    if (imbalance <= 15) balanceSignal = 'well-balanced lift/run load';
    else balanceSignal = strPct > 50 ? 'lift-heavy week' : 'run-heavy week';
  } else if (hasBalance) {
    balance = 52;
    balanceSignal = str > 0 ? 'no running logged this week' : 'no lifting logged this week';
  }

  const score = hasBalance ? 0.6 * zone + 0.4 * balance : zone;
  const signals = [];
  if (hasLoad) {
    if (deload) signals.push(`deload — ACWR ${acwr.toFixed(2)}`);
    else if (acwr >= 1.5) signals.push(`load spiking (ACWR ${acwr.toFixed(2)})`);
    else if (acwr >= 1.3) signals.push(`load elevated (ACWR ${acwr.toFixed(2)})`);
    else if (acwr >= 0.8) signals.push(`productive load (ACWR ${acwr.toFixed(2)})`);
    else signals.push(`light load (ACWR ${acwr.toFixed(2)})`);
  }
  if (balanceSignal) signals.push(balanceSignal);
  return { score: round(score), signals };
}

// ---- MOMENTUM -------------------------------------------------------------
// Trajectory of the whole picture over recent weeks (rewards improvers early,
// independent of absolute level). Uses existing tail series on the model.
export function momentumPillar(model) {
  const s = model.series || {};
  const trends = [];
  const slope = (arr) => {
    const v = (arr || []).filter(x => typeof x === 'number');
    if (v.length < 3) return null;
    const recent = v.slice(-3);
    const base = recent[0];
    if (base <= 0) return recent[recent.length - 1] > 0 ? 1 : null;
    return (recent[recent.length - 1] - base) / base; // fractional change
  };
  const vol = slope(s.volume);
  const dist = slope(s.distance);
  const ctl = slope(s.ctl);
  [vol, dist, ctl].forEach(x => { if (x != null) trends.push(x); });
  if (!trends.length) return { score: null, signals: [] };

  const avg = trends.reduce((a, b) => a + b, 0) / trends.length;
  const score = clamp(50 + avg * 120, 0, 100); // ±40% swing → full range
  const signals = [];
  if (avg > 0.05) signals.push('fitness trending up');
  else if (avg < -0.05) signals.push('fitness trending down');
  else signals.push('holding steady');
  if (ctl != null && ctl > 0.03) signals.push('chronic load rising');
  return { score: round(score), signals };
}

// ---- BODY COMPOSITION -----------------------------------------------------
export function bodyPillar(model, state) {
  const b = model.bodyweight;
  if (!b?.hasData || b.delta7 == null) return { score: null, signals: [] };
  const goal = state?.settings?.weightGoal || 'maintain';
  const d = b.delta7; // kg change vs 7 days ago
  let score, signal;
  if (goal === 'cut') {
    score = d <= 0 ? clamp(70 + Math.min(Math.abs(d), 1) * 30, 70, 100) : clamp(70 - d * 25, 20, 70);
    signal = d <= 0 ? `down ${Math.abs(d)}kg (cutting)` : `up ${d}kg — off cut target`;
  } else if (goal === 'bulk') {
    score = d >= 0 ? clamp(70 + Math.min(d, 1) * 30, 70, 100) : clamp(70 + d * 25, 20, 70);
    signal = d >= 0 ? `up ${d}kg (bulking)` : `down ${Math.abs(d)}kg — off bulk target`;
  } else {
    const off = Math.abs(d);
    score = clamp(100 - off * 40, 30, 100); // maintain: within ~1kg/wk is ideal
    signal = off <= 1 ? 'weight stable (maintaining)' : `weight moved ${d > 0 ? '+' : '−'}${off}kg`;
  }
  return { score: round(score), signals: [signal] };
}

// ---- LIFESTYLE ------------------------------------------------------------
export function lifestylePillar(model) {
  const h = model.health || {};
  const f = model.fasting || {};
  const subs = [];
  const signals = [];

  if (h.sleepHours > 0) {
    const s = clamp((h.sleepHours / 8) * 100, 20, 100);
    subs.push(s);
    if (h.sleepHours < 6) signals.push('short sleep');
    else if (h.sleepHours >= 7.5) signals.push('sleep on point');
  }
  if (h.steps != null && h.steps > 0) {
    subs.push(clamp((h.steps / 10000) * 100, 10, 100));
    if (h.steps >= 10000) signals.push('step goal hit');
  }
  if (f.streak > 0 || f.active) {
    subs.push(f.active ? 85 : clamp(60 + f.streak * 4, 60, 100));
    if (f.streak >= 3) signals.push(`${f.streak}-day fasting streak`);
    else if (f.active) signals.push('fasting today');
  }
  if (!subs.length) return { score: null, signals: [] };
  const score = subs.reduce((a, b) => a + b, 0) / subs.length;
  if (!signals.length) signals.push('lifestyle steady');
  return { score: round(score), signals };
}

// Assemble every pillar in one pass. Returns { [pillar]: {score, signals} }.
/** @param {{level?:string, deload?:boolean}} [opts] */
export function computePillars(model, state, days, opts = {}) {
  const { level, deload } = opts;
  return {
    consistency: consistencyPillar(model),
    recovery:    recoveryPillar(model),
    strength:    strengthPillar(model, state, days, level),
    endurance:   endurancePillar(model, state, days, level),
    load:        loadPillar(model, state, days, deload),
    momentum:    momentumPillar(model),
    body:        bodyPillar(model, state),
    lifestyle:   lifestylePillar(model),
  };
}
