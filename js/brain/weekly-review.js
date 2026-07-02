// @ts-check
// =============================================================================
// WEEKLY REVIEW (js/brain/weekly-review.js) — roadmap R6
//
// The week's story in one screen: totals, week-over-week deltas, PRs, the
// Hybrid Score arc, and ONE focus for next week. Pure builder — reuses the
// shared dashboard model (volume / distance / consistency / streak), the
// strength metrics (PR detection) and the recorded score history. No DOM.
//
// reviewToText() renders the same review as share/notification copy.
// =============================================================================
import { computeDashboardModel } from '../home/dashboard-model.js';
import { weeklyE1rmByLift } from '../metrics/metrics-strength.js';

const round1 = (n) => Math.round(n * 10) / 10;

function pctDelta(current, prev) {
  if (!prev || prev <= 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

// Lifts whose best e1RM this week beats their best in ALL prior weeks.
// A first-ever lift (no prior best) is not a PR — same rule as the recap.
function weekPRs(state, days, wkNum, maxWeek) {
  const byLift = weeklyE1rmByLift(state, days, maxWeek);
  const idx = wkNum - 1;
  const prs = [];
  for (const lift in byLift) {
    const arr = byLift[lift];
    const thisWeek = arr[idx] || 0;
    if (thisWeek <= 0) continue;
    const priorBest = Math.max(0, ...arr.slice(0, idx));
    if (priorBest > 0 && thisWeek > priorBest + 0.5) {
      prs.push({ lift, e1rm: Math.round(thisWeek), prevBest: Math.round(priorBest) });
    }
  }
  return prs.sort((a, b) => b.e1rm - a.e1rm);
}

// The Hybrid Score arc across the last 7 recorded days.
function scoreArc(state) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const entries = (state?.hybridScore?.history || [])
    .filter(h => h.date >= cutoffISO)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!entries.length) return { hasData: false, series: [] };
  const series = entries.map(e => e.score);
  const avg = Math.round(series.reduce((a, b) => a + b, 0) / series.length);
  return {
    hasData: true,
    start: series[0],
    end: series[series.length - 1],
    delta: series[series.length - 1] - series[0],
    avg,
    series,
  };
}

// ONE focus for next week, priority-ordered and honest: the biggest fixable
// thing first, praise only when everything genuinely held up.
export function pickWeeklyFocus({ consistencyPct, hasPlan, acwr, distance, volumeDeltaPct }) {
  if (hasPlan && consistencyPct < 70) {
    return { area: 'Consistency', text: 'Hit every planned session next week — adherence moves your Hybrid Score most.' };
  }
  if (acwr >= 1.3) {
    return { area: 'Recovery', text: 'Load is running hot — ease volume back toward the productive zone and protect sleep.' };
  }
  if (distance <= 0) {
    return { area: 'Endurance', text: 'No running logged this week — get at least one easy Zone 2 run in.' };
  }
  if (volumeDeltaPct !== null && volumeDeltaPct <= -10) {
    return { area: 'Strength', text: 'Lifting volume dipped — rebuild toward recent levels without forcing intensity.' };
  }
  return { area: 'Momentum', text: 'A strong week across the board — repeat it. Progressive overload plus consistency wins.' };
}

export function buildWeeklyReview(state, days, program) {
  const model = computeDashboardModel(state, days, program, 'mon');
  const wkNum = model.wkNum;

  const vol = model.week.volume;      // { current, prev, ... }
  const dist = model.week.distance;   // km (views convert units)
  const volumeDeltaPct = pctDelta(vol.current, vol.prev);
  const distanceDeltaPct = pctDelta(dist.current, dist.prev);

  // Sessions = distinct days this week with completed work.
  const weekData = state?.weeks?.[String(wkNum)] || {};
  let sessionDays = 0;
  days.forEach(d => {
    const lifts = weekData.lifts?.[d] || {};
    const lifted = Object.values(lifts).some(sets => Array.isArray(sets) && sets.some(s => s && s.c));
    const ran = (parseFloat(weekData.runs?.[d]?.dist) || 0) > 0;
    if (lifted || ran) sessionDays++;
  });

  const prs = weekPRs(state, days, wkNum, model.maxWeek);
  const arc = scoreArc(state);

  const focus = pickWeeklyFocus({
    consistencyPct: model.week.consistencyPct,
    hasPlan: model.week.consistencyTotal > 0,
    acwr: model.load.hasData ? model.load.acwr : 0,
    distance: dist.current,
    volumeDeltaPct,
  });

  return {
    wkNum,
    hasData: sessionDays > 0 || prs.length > 0 || arc.hasData,
    totals: {
      volume: Math.round(vol.current),
      distanceKm: round1(dist.current),
      sessions: sessionDays,
      prCount: prs.length,
    },
    deltas: { volumePct: volumeDeltaPct, distancePct: distanceDeltaPct },
    consistency: {
      done: model.week.consistencyDone,
      total: model.week.consistencyTotal,
      pct: model.week.consistencyPct,
    },
    prs,
    arc,
    streak: model.streak.current,
    focus,
  };
}

// Share / notification copy. Compact, numbers-first, one focus.
export function reviewToText(r, distUnit = 'km') {
  if (!r.hasData) return `Week ${r.wkNum}: no sessions logged yet — next week is a fresh start.`;
  const dist = distUnit === 'mi' ? `${round1(r.totals.distanceKm * 0.621371)} mi` : `${r.totals.distanceKm} km`;
  const bits = [
    `${r.totals.volume.toLocaleString()} kg lifted`,
    `${dist} run`,
    `${r.totals.sessions} session${r.totals.sessions === 1 ? '' : 's'}`,
  ];
  if (r.totals.prCount > 0) bits.push(`${r.totals.prCount} PR${r.totals.prCount === 1 ? '' : 's'} 🏆`);
  let txt = `Week ${r.wkNum} on Helyx: ${bits.join(' · ')}.`;
  if (r.arc.hasData) txt += ` Hybrid Score ${r.arc.end}${r.arc.delta !== 0 ? ` (${r.arc.delta > 0 ? '+' : ''}${r.arc.delta} this week)` : ''}.`;
  txt += ` Next week's focus — ${r.focus.area}: ${r.focus.text}`;
  return txt;
}
