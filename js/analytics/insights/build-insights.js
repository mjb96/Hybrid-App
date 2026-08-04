// ==========================================
// INSIGHTS ORCHESTRATOR — analytics/insights/build-insights.js
// One place that computes the analytics bundles and runs the insight engine,
// so every surface (Analytics views + the session recap) reads insights from
// the same source instead of hand-rolling their own strings.
// ==========================================
import { computeStrengthAnalytics } from '../calculations/strength-calcs.js';
import { computeLoadAnalytics } from '../calculations/load-calcs.js';
import { computeRunningAnalytics } from '../calculations/running-calcs.js';
import {
  generateStrengthInsights,
  generateLoadInsights,
  generateRunningInsights,
  rankInsights,
} from './insight-engine.js';
import { weightUnitOf } from '../utils.js';

const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Compute strength + load + running insights for the whole history and return
// them ranked (alerts → good → info). Each compute is isolated so sparse data
// in one domain can't sink the others. Pure (no DOM).
export function buildRankedInsights(state, opts = {}) {
  if (!state || !state.weeks) return [];
  const days = opts.days || DEFAULT_DAYS;
  const maxWeek = Object.keys(state.weeks)
    .map(Number).filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 1);
  const thresholdSecs = state.thresholdPaceSeconds || null;

  const out = [];
  try {
    const sa = computeStrengthAnalytics(state, days, maxWeek);
    out.push(...generateStrengthInsights({
      volSeries: sa.volSeries, volProgPct: sa.volProgPct,
      liftProgression: sa.liftProgression, muscleStatus: sa.muscleStatus, acwr: sa.tonnageACWR,
      unit: weightUnitOf(state),
    }));
  } catch (_) { /* sparse strength data */ }
  try {
    const la = computeLoadAnalytics(state, days, maxWeek);
    out.push(...generateLoadInsights({
      atl: la.currentATL, ctl: la.currentCTL, ratio: la.currentRatio,
      loadProgPct: la.loadProgPct, fatigue: la.fatigue, loadStatus: la.loadStatus,
    }));
  } catch (_) { /* sparse load data */ }
  try {
    const ra = computeRunningAnalytics(state, days, maxWeek, thresholdSecs);
    out.push(...generateRunningInsights({
      paceSeries: ra.paceSeries, roi: ra.roi, distSeries: ra.distSeries,
      distProgPct: ra.distProgPct, hrZonePct: ra.hrZonePct, bestPace: ra.bestPace,
      decoupling: ra.decoupling, vdot: ra.vdot, thresholdSecs,
      endScore: ra.endScore, weeklyDistAvg: ra.weeklyDistAvg,
    }));
  } catch (_) { /* sparse running data */ }

  return rankInsights(out);
}

// Which insight categories are relevant to a session of the given types.
export function sessionInsightCategories(types = []) {
  const cats = new Set();
  if (types.includes('gym')) { cats.add('strength'); cats.add('load'); }
  if (types.includes('run') || types.includes('walk')) { cats.add('running'); cats.add('load'); }
  if (cats.size === 0) { cats.add('strength'); cats.add('load'); cats.add('running'); }
  return cats;
}

// Ranked engine insights limited to what's relevant to this session's types.
export function insightsForSession(state, types, max = 4) {
  const cats = sessionInsightCategories(types);
  return buildRankedInsights(state).filter((i) => cats.has(i.category)).slice(0, max);
}
