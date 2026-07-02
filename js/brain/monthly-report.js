// @ts-check
// =============================================================================
// MONTHLY REPORT (js/brain/monthly-report.js) — roadmap R13
//
// A 28-day rollup: totals + trend vs the previous 28 days, average Hybrid Score
// and its direction, fitness (CTL) trend, consistency, and the top forward
// projection. Pure; reuses the dashboard model, the score history, dayVolume,
// and the predictions engine. reportToText() renders share/notification copy.
// =============================================================================
import { computeDashboardModel } from '../home/dashboard-model.js';
import { dayVolume } from '../set-utils.js';
import { buildPredictions, topPredictionLine } from './predictions.js';

const num = (v) => parseFloat(v) || 0;
const DAY_MS = 86400000;

// Walk every logged day → { dateISO, volume, distance }. Uses stored dates when
// present, else reconstructs from weekStartedAt (same rule as computeStreak).
function datedSessions(state, days) {
  const out = [];
  const weeks = state?.weeks || {};
  const base = state?.weekStartedAt ? new Date(state.weekStartedAt) : new Date();
  const curWk = parseInt(state?.currentWeek, 10) || 1;
  for (const w in weeks) {
    const wd = weeks[w];
    const stored = wd?.dates || {};
    days.forEach((d, dayIdx) => {
      const vol = dayVolume(wd?.lifts?.[d]);
      const dist = num(wd?.runs?.[d]?.dist);
      if (vol <= 0 && dist <= 0) return;
      let ds = stored[d];
      if (!ds) {
        const approx = new Date(base);
        approx.setDate(base.getDate() - ((curWk - (parseInt(w, 10) || 1)) * 7) + dayIdx);
        ds = approx.toISOString().slice(0, 10);
      }
      out.push({ dateISO: ds, volume: vol, distance: dist });
    });
  }
  return out;
}

const pctDelta = (cur, prev) => (!prev || prev <= 0) ? null : Math.round(((cur - prev) / prev) * 100);

function windowTotals(sessions, startISO, endISO) {
  let volume = 0, distance = 0; const dayset = new Set();
  for (const s of sessions) {
    if (s.dateISO >= startISO && s.dateISO < endISO) {
      volume += s.volume; distance += s.distance; dayset.add(s.dateISO);
    }
  }
  return { volume: Math.round(volume), distanceKm: Math.round(distance * 10) / 10, sessions: dayset.size };
}

function avgScoreInWindow(state, startISO, endISO) {
  const hist = (state?.hybridScore?.history || []).filter(h => h.date >= startISO && h.date < endISO);
  if (!hist.length) return null;
  return Math.round(hist.reduce((s, h) => s + h.score, 0) / hist.length);
}

export function buildMonthlyReport(state, days, program, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const endISO = new Date(today.getTime() + DAY_MS).toISOString().slice(0, 10); // inclusive of today
  const startISO = new Date(today.getTime() - 27 * DAY_MS).toISOString().slice(0, 10);
  const prevEndISO = startISO;
  const prevStartISO = new Date(today.getTime() - 55 * DAY_MS).toISOString().slice(0, 10);

  const sessions = datedSessions(state, days);
  const cur = windowTotals(sessions, startISO, endISO);
  const prev = windowTotals(sessions, prevStartISO, prevEndISO);

  const model = computeDashboardModel(state, days, program, 'mon');
  const ctlSeries = (model.series?.ctl || []).filter(v => typeof v === 'number');
  const ctlTrend = ctlSeries.length >= 2
    ? (ctlSeries[ctlSeries.length - 1] > ctlSeries[0] ? 'rising' : ctlSeries[ctlSeries.length - 1] < ctlSeries[0] ? 'easing' : 'steady')
    : 'building';

  const avgScore = avgScoreInWindow(state, startISO, endISO);
  const prevAvgScore = avgScoreInWindow(state, prevStartISO, prevEndISO);

  const pred = buildPredictions(state, days);

  return {
    hasData: cur.sessions > 0 || avgScore !== null,
    window: { startISO, endISO },
    totals: cur,
    deltas: {
      volumePct: pctDelta(cur.volume, prev.volume),
      distancePct: pctDelta(cur.distanceKm, prev.distanceKm),
      sessions: cur.sessions - prev.sessions,
    },
    hybridScore: { avg: avgScore, prevAvg: prevAvgScore, delta: (avgScore !== null && prevAvgScore !== null) ? avgScore - prevAvgScore : null },
    fitness: { ctl: Math.round(model.load?.ctl || 0), trend: ctlTrend },
    consistency: model.goal?.avgConsistency || 0,
    projection: topPredictionLine(pred),
  };
}

export function reportToText(r, distUnit = 'km') {
  if (!r.hasData) return 'Your 30-day report will build as you train.';
  const dist = distUnit === 'mi' ? `${Math.round(r.totals.distanceKm * 0.621371)} mi` : `${r.totals.distanceKm} km`;
  const bits = [`${r.totals.sessions} sessions`, `${r.totals.volume.toLocaleString()} kg`, dist];
  let txt = `Last 30 days on Helyx: ${bits.join(' · ')}.`;
  if (r.hybridScore.avg !== null) txt += ` Avg Hybrid Score ${r.hybridScore.avg}${r.hybridScore.delta ? ` (${r.hybridScore.delta > 0 ? '+' : ''}${r.hybridScore.delta} vs prior month)` : ''}.`;
  txt += ` Fitness ${r.fitness.trend}.`;
  if (r.projection) txt += ` ${r.projection}`;
  return txt;
}
