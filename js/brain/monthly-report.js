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
import { forEachLoggedDay } from '../analytics/logged-days.js';
import { buildPredictions, topPredictionLine } from './predictions.js';
import { addDaysISO, dateKey } from '../dates.js';

// Every logged day → { dateISO, volume, distance } via the shared iterator.
function datedSessions(state, days) {
  const out = [];
  forEachLoggedDay(state, days, (d) => out.push({ dateISO: d.dateISO, volume: d.volume, distance: d.distance }));
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
  const todayISO = dateKey(now);
  const endISO = addDaysISO(todayISO, 1); // exclusive end, inclusive of today
  const startISO = addDaysISO(todayISO, -27);
  const prevEndISO = startISO;
  const prevStartISO = addDaysISO(todayISO, -55);

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
