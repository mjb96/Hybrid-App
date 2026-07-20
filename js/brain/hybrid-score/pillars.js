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
import { weeklyE1rmByLift, robustE1rmSeries, liftWeight } from '../../metrics/metrics-strength.js';
import { weeklyDistanceSeries, weeklyPaceSeries, weeklyBestPaceSeries } from '../../metrics/metrics-running.js';
import { strengthLoadSeries, recoveryCostBreakdown, paceMatchedWeekVolume } from '../load_models.js';
import { enduranceScore, effectiveVdot } from '../../analytics/calculations/running-calcs.js';
import { dayVolume } from '../../set-utils.js';
import { runDaySummary } from '../../state/run-sessions.js';
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

  // No baseline to judge against AND nothing done yet → no data. This is the
  // day-0/first-week case: a plan exists (consistencyTotal > 0) but the athlete
  // hasn't had a chance to be consistent. Returning null (rather than a
  // done÷planned 0) stops a brand-new user from being branded "At Risk" for
  // work they were never given time to do; the engine's provisional prior then
  // carries this pillar until real adherence exists.
  const noBaseline = avg <= 0 && streak <= 0;
  const nothingDone = (w?.consistencyDone || 0) === 0;
  if (noBaseline && nothingDone) return { score: null, signals: [] };

  // E1 — de-sawtooth: `consistencyPct` is done ÷ the WHOLE week's planned work,
  // so it reads near-zero every Monday and climbs through the week. That made
  // the score drop every Monday for no behavioural reason. Fix: anchor on the
  // established baseline (program-long adherence) and only ever *credit*
  // within-week progress — the current partial week can lift the score but can
  // no longer drag it below your baseline just because the week reset.
  const thisWeekPct = w.consistencyTotal > 0 ? w.consistencyPct : null;
  const baseline = avg > 0 ? avg : (thisWeekPct ?? 0);
  const effective = thisWeekPct == null ? baseline : Math.max(baseline, thisWeekPct);
  let score = 0.5 * baseline + 0.5 * effective;
  score = clamp(score + Math.min(streak, 7) / 7 * 8, 0, 100); // streak nudge

  // E5 — true-adherence quality. Showing up isn't the same as doing the work:
  // when completed sets carry a prescribed target, completing that work at/near
  // target keeps full credit while logging junk (far below the prescription)
  // trims Consistency. Gentle (≤20% haircut) and neutral when nothing is
  // measurable, so free-loggers and legacy data are never punished.
  const qPct = w.qualityPct;
  if (qPct != null) score = clamp(score * (0.8 + 0.2 * (qPct / 100)), 0, 100);

  const signals = [];
  if (w.consistencyTotal > 0) {
    // `consistencyTotal` is set-granular (each working set + each scheduled run),
    // so quote the plan-completion percentage, never a raw count phrased as
    // "sessions" (which read as a scary "89 sessions still open" on day 0).
    if (w.consistencyPct >= 100) signals.push('all planned work done');
    else signals.push(`${w.consistencyPct}% of this week's plan done`);
  }
  if (qPct != null && (w.qualityN || 0) >= 3) {
    if (qPct >= 95) signals.push('hitting your targets');
    else if (qPct < 70) signals.push('sets logged below target');
  }
  if (streak >= 3) signals.push(`${streak}-day streak`);
  if (!signals.length) signals.push('building your routine');
  return { score: round(score), signals };
}

// ---- RECOVERY -------------------------------------------------------------
// E6 — recovery-trend term. A single day's readiness can look fine on the way
// into an overreach; a multi-day *slope* catches the slide early. Least-squares
// slope (readiness pts/day) over the last 3 recorded days, mapped to a modest
// ±8 adjustment so today's actual readiness still dominates. null-slope (not
// enough history) → no adjustment.
function recoveryTrendAdj(state) {
  const pts = (state?.hybridScore?.history || [])
    .filter(e => typeof e.readiness === 'number')
    .slice(-3)
    .map((e, i) => ({ x: i, y: e.readiness }));
  if (pts.length < 3) return 0;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  const slope = den ? num / den : 0;
  return clamp(slope * 1.5, -8, 8);
}

export function recoveryPillar(model, state) {
  // E3 — use readiness WITHOUT its ACWR load component so load isn't counted
  // twice (the Load pillar already owns ACWR). Falls back to the full readiness
  // only if the load-excluded variant isn't available.
  const r = model.readyNoLoad?.hasData ? model.readyNoLoad : model.ready;
  const hasLoad = model.load?.hasData;
  if (!r?.hasData && !hasLoad) return { score: null, signals: [] };

  let score;
  if (r?.hasData) score = r.score;
  else {
    // Fall back to freshness (TSB) when no readiness signals exist.
    const tsb = model.load.tsb;
    score = clamp(60 + tsb * 1.5, 10, 100);
  }

  // E6 — fold in the multi-day readiness trend (early-warning nudge).
  const trendAdj = recoveryTrendAdj(state);
  score = clamp(score + trendAdj, 0, 100);

  const signals = [];
  if (trendAdj <= -3) signals.push('recovery trending down');
  else if (trendAdj >= 3) signals.push('recovery trending up');
  const c = r?.components || {};
  if (c.sleep != null && c.sleep < 55) signals.push('poor sleep');
  else if (c.sleep != null && c.sleep >= 85) signals.push('good sleep');
  if (c.hrv != null && c.hrv < 50) signals.push('HRV suppressed');
  if (c.restingHr != null && c.restingHr < 50) signals.push('resting HR elevated');
  if (hasLoad && model.load.tsb <= -15) signals.push('high fatigue');
  if (!signals.length && r?.hasData && r.confidence && r.confidence !== 'high') {
    signals.push(`${r.confidence}-confidence readiness (${r.inputCount || 1} signal${r.inputCount === 1 ? '' : 's'})`);
  }
  if (!signals.length) signals.push(score >= 70 ? 'well recovered' : score >= 45 ? 'recovering steadily' : 'recovery is low');
  return { score: round(score), signals };
}

// ---- STRENGTH -------------------------------------------------------------
export function strengthPillar(model, state, days, level) {
  const maxWeek = model.maxWeek;
  const idx = model.wkNum - 1;
  const tonnage = strengthLoadSeries(state, days, maxWeek);
  const everLifted = tonnage.some(v => v > 0);
  if (!everLifted) return { score: null, signals: [] };

  // E8 — compound-weighted, smoothed progression. Each lift's weekly e1RM is
  // first robust-smoothed (trailing median) so a single grindy near-max set
  // can't spike the pillar, then its gain is weighted by lift tier so a squat
  // PR moves the score more than a curl PR. Denominator floored at one compound's
  // worth so an accessory-only week can't earn full progression credit, while
  // adding accessories on top of compounds never dilutes them.
  const byLift = weeklyE1rmByLift(state, days, maxWeek);
  let num = 0, den = 0;
  let bestLift = null, bestGain = 0, bestRank = -Infinity;
  for (const lift in byLift) {
    const pct = progressionPct(robustE1rmSeries(byLift[lift]), idx, 4);
    if (pct == null) continue;
    const w = liftWeight(lift);
    num += w * pct; den += w;
    const rank = w * pct; // headline the biggest *weighted* mover
    if (rank > bestRank) { bestRank = rank; bestGain = pct; bestLift = lift; }
  }
  const progScore = den > 0
    ? gainToScore(num / Math.max(den, 1.0), level)
    : levelProfile(level).floor; // lifting but no window yet → neutral floor

  // Volume upkeep: PACE-MATCHED week-to-date tonnage vs the trailing weeks'
  // SAME-weekday tonnage. Comparing the current (in-progress) week's cumulative
  // tonnage against completed prior weeks made every early week read as a volume
  // decline even when today's session beat the equivalent day last week — the
  // reported Monday bug. Pace-matching judges like-for-like; when no comparable
  // basis exists yet (nothing trained this week, or no prior week trained these
  // weekdays) the upkeep term stays neutral rather than penalising.
  const pm = paceMatchedWeekVolume(state, days, model.wkNum, (wd, d) => dayVolume(wd?.lifts?.[d]), 3);
  const haveUpkeep = pm.cur > 0 && pm.priorAvg > 0;
  const upkeep = haveUpkeep ? clamp(50 + ((pm.cur - pm.priorAvg) / pm.priorAvg) * 60, 20, 100) : 60;

  const score = 0.6 * progScore + 0.4 * upkeep;
  const signals = [];
  if (bestLift && isFinite(bestGain)) {
    if (bestGain >= 1) signals.push(`${bestLift} e1RM up ${bestGain.toFixed(0)}%`);
    else if (bestGain <= -1) signals.push(`${bestLift} e1RM down ${Math.abs(bestGain).toFixed(0)}%`);
  }
  if (haveUpkeep && pm.cur > pm.priorAvg * 1.1) signals.push('lifting volume rising');
  else if (haveUpkeep && pm.cur < pm.priorAvg * 0.9) signals.push('lifting volume down');
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

  // Distance progression (volume trend) — PACE-MATCHED so a partial current week
  // is compared against the trailing weeks' SAME weekdays, not their full totals.
  // Without this a Monday-only week reads as a distance drop even when this
  // Monday's run beat last Monday's (the strength-pillar Monday bug, for running).
  const distPm = paceMatchedWeekVolume(state, days, model.wkNum, (wd, d) => parseFloat(runDaySummary(wd, d).dist) || 0, 4);
  const distPct = distPm.cur > 0 && distPm.priorAvg > 0
    ? ((distPm.cur - distPm.priorAvg) / distPm.priorAvg) * 100
    : null;
  const distScore = distPct != null ? gainToScore(distPct, level) : levelProfile(level).floor;
  // E2 — pace progression from BEST-EFFORT pace (fastest run/wk), not the weekly
  // AVERAGE. Average pace slows whenever you add easy Zone-2 volume — the
  // correct thing — so the old signal penalised polarised training. Best-effort
  // pace only improves with real speed. A DROP in sec/km is improvement → invert.
  // And slowing best-effort is treated as neutral, not a penalty (a single easy
  // week shouldn't read as lost fitness — genuine loss shows via VDOT/distance).
  const bestPace = weeklyBestPaceSeries(state, days, maxWeek); // sec/km, lower = faster
  const pacePct = progressionPct(bestPace, idx, 4);
  const paceScore = pacePct == null ? null : (pacePct <= 0 ? gainToScore(-pacePct, level) : 50);

  // E4 — VDOT from the manual threshold OR estimated from the best recent run,
  // so the science-based endurance score works for anyone who logs runs.
  const vdot = effectiveVdot(state, days, maxWeek)?.vdot || null;
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
export function loadPillar(model, state, days, deload, goal = 'hybrid') {
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

  // Balance is a real part of the HYBRID goal only. A strength- or endurance-
  // focused athlete is judged on productive total load, never on whether they
  // logged the unrelated modality.
  let balance = 60, balanceSignal = null;
  if (goal === 'hybrid' && str > 0 && end > 0) {
    const total = str + end;
    const strPct = (str / total) * 100;
    const imbalance = Math.abs(strPct - 50); // 0 = perfect
    balance = clamp(100 - imbalance * 1.4, 30, 100);
    if (imbalance <= 15) balanceSignal = 'well-balanced lift/run load';
    else balanceSignal = strPct > 50 ? 'lift-heavy week' : 'run-heavy week';
  } else if (goal === 'hybrid' && hasBalance) {
    balance = 52;
    balanceSignal = str > 0 ? 'no running logged this week' : 'no lifting logged this week';
  }

  const score = goal === 'hybrid' && hasBalance ? 0.6 * zone + 0.4 * balance : zone;
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
// E3 — trajectory of the HYBRID SCORE ITSELF, not a re-derivation of volume /
// distance / CTL (which the Strength, Endurance and Load pillars already own).
// "Is my overall trend rising?" is exactly what momentum should mean, and it's
// orthogonal to the other pillars (they measure today's level; this measures
// the slope of the composite over the last ~week). Reads only PAST scores
// (history excludes today), so there's no circular dependency.
export function momentumPillar(model, state) {
  const hist = [...(state?.hybridScore?.history || [])]
    .filter(h => typeof h.score === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));
  const pts = hist.slice(-7).map(h => h.score);
  if (pts.length < 3) return { score: null, signals: [] };

  // Least-squares slope (points per day) over the trailing window.
  const n = pts.length;
  const mx = (n - 1) / 2;
  const my = pts.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (pts[i] - my); den += (i - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;      // score-points per day
  const change = slope * (n - 1);               // total move across the window
  const score = clamp(50 + change * 4, 0, 100); // ±12.5 pts over the window → full range

  const signals = [];
  if (change > 1.5) signals.push('score trending up');
  else if (change < -1.5) signals.push('score trending down');
  else signals.push('holding steady');
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

  // E3 — sleep is NOT scored here: it already drives the Recovery pillar (via
  // readiness). Lifestyle owns only the non-recovery daily habits — daily
  // movement (steps) and fasting — so no signal is counted twice.
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
/** @param {{level?:string, deload?:boolean, goal?:string}} [opts] */
export function computePillars(model, state, days, opts = {}) {
  const { level, deload, goal = 'hybrid' } = opts;
  return {
    consistency: consistencyPillar(model),
    recovery:    recoveryPillar(model, state),
    strength:    strengthPillar(model, state, days, level),
    endurance:   endurancePillar(model, state, days, level),
    load:        loadPillar(model, state, days, deload, goal),
    momentum:    momentumPillar(model, state),
    body:        bodyPillar(model, state),
    lifestyle:   lifestylePillar(model),
  };
}
