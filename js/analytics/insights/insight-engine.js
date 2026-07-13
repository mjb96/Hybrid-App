// @ts-check
// ==========================================
// INSIGHTS ENGINE — analytics/insights/insight-engine.js
// Pure functions. Generates ranked athlete-facing text insights.
// No DOM, no side effects.
// ==========================================
import { pctChange } from '../calculations/math-utils.js';

// Format a percentage cleanly.
function fmtPct(pct, decimals = 0) {
  if (pct === null || !isFinite(pct)) return null;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

// Format pace as M:SS.
function fmtPace(secs) {
  if (!secs || secs <= 0) return null;
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// Insight priority levels: 'alert' (red), 'good' (green), 'info' (blue).
// Each insight: { text, priority, category }

export function generateLoadInsights({ atl, ctl, ratio, loadProgPct, fatigue, loadStatus }) {
  const insights = [];

  if (!ctl || ctl === 0) return insights;

  if (loadStatus.zone === 'danger')
    insights.push({ text: `Acute load is ${Math.round((ratio - 1) * 100)}% above your recent baseline — a sharp spike. Consider easing volume and prioritising recovery this week.`, priority: 'alert', category: 'load' });
  else if (loadStatus.zone === 'high')
    insights.push({ text: `Your training load is running high — fatigue is starting to outpace recovery. Keep a close eye on sleep and readiness this week.`, priority: 'alert', category: 'load' });
  else if (loadStatus.zone === 'optimal' || loadStatus.zone === 'productive')
    insights.push({ text: `Your training load is in the productive zone — right where adaptation happens. Keep it here.`, priority: 'good', category: 'load' });
  else if (loadStatus.zone === 'low' || loadStatus.zone === 'detraining')
    insights.push({ text: `Acute load is well below your chronic baseline. Consider increasing weekly volume to drive adaptation.`, priority: 'info', category: 'load' });

  if (fatigue === 'rising')
    insights.push({ text: `Fatigue is trending up over the last 4 weeks. Plan a deload in 1–2 weeks.`, priority: 'alert', category: 'load' });
  else if (fatigue === 'declining')
    insights.push({ text: `Fatigue is declining — you are recovering well. Ready for a training block push.`, priority: 'good', category: 'load' });

  // Week-over-week load progression: the two most recent COMPLETED weeks
  // (full-vs-full — see loadProgressionPct), so "vs the previous week" always
  // matches the periods compared. Kept as supporting context (info/good): the
  // ACWR zone insight above and the Home overtraining escalation own the red
  // "load" warning — a single week's jump between completed weeks is worth
  // watching, not an alarm, and shouldn't out-shout the escalation card.
  if (loadProgPct !== null) {
    if (loadProgPct > 15)
      insights.push({ text: `Training load rose ${fmtPct(loadProgPct)} vs the previous week. Keeping week-on-week increases near 10% helps manage load progression.`, priority: 'info', category: 'load' });
    else if (loadProgPct > 5)
      insights.push({ text: `Training load rose ${fmtPct(loadProgPct)} vs the previous week — solid progressive overload.`, priority: 'good', category: 'load' });
    else if (loadProgPct < -15)
      insights.push({ text: `Training load dropped ${fmtPct(Math.abs(loadProgPct))} vs the previous week.`, priority: 'info', category: 'load' });
  }

  return insights;
}

export function generateStrengthInsights({
  volSeries,
  volProgPct,
  liftProgression,
  muscleStatus,
  acwr,
}) {
  const insights = [];
  const n = volSeries.length;

  // Volume trend
  const recent4 = volSeries.slice(-4).filter(v => v > 0);
  if (recent4.length >= 2) {
    const monthPct = pctChange(recent4[0], recent4[recent4.length - 1]);
    if (monthPct !== null && Math.abs(monthPct) > 5) {
      insights.push({
        text: `Strength volume ${monthPct >= 0 ? 'increased' : 'decreased'} ${Math.abs(monthPct).toFixed(0)}% over the last 4 weeks.`,
        priority: monthPct >= 0 ? 'good' : 'info',
        category: 'strength',
      });
    }
  }

  // Per-lift PR and rate of improvement
  let bestRoi = 0, bestRoiLift = null;
  for (const [lift, prog] of Object.entries(liftProgression || {})) {
    if (!prog.hasData) continue;

    if (prog.currentWeekPR > 0 && prog.currentWeekPR >= prog.lifetimePR * 0.995) {
      insights.push({ text: `New estimated 1RM on ${lift}: ${Math.round(prog.currentWeekPR)} kg.`, priority: 'good', category: 'strength' });
    }

    if (prog.roi > bestRoi) { bestRoi = prog.roi; bestRoiLift = lift; }

    if (prog.projection && prog.projection > prog.lifetimePR * 1.02) {
      const projRounded = Math.round(prog.projection);
      insights.push({
        text: `${lift} is on track for a ${projRounded} kg 1RM within 4 weeks at the current rate.`,
        priority: 'good',
        category: 'strength',
      });
    }
  }
  if (bestRoiLift && bestRoi > 0.2) {
    insights.push({
      text: `${bestRoiLift} is showing the strongest improvement rate: +${bestRoi.toFixed(1)} kg/week.`,
      priority: 'good',
      category: 'strength',
    });
  }

  // Muscle imbalance — groups below their minimum effective volume (not growing)
  // vs groups above their maximum recoverable volume (junk / injury risk).
  const undertrained = Object.entries(muscleStatus || {}).filter(([, s]) => s === 'detraining' || s === 'maintenance').map(([g]) => g);
  if (undertrained.length > 0) {
    insights.push({
      text: `Below effective volume this week: ${undertrained.join(', ')}. Add sets to reach the growth range.`,
      priority: 'alert',
      category: 'strength',
    });
  }

  const overtrained = Object.entries(muscleStatus || {}).filter(([, s]) => s === 'overreaching').map(([g]) => g);
  if (overtrained.length > 0) {
    insights.push({
      text: `${overtrained.join(', ')} volume is above the recoverable range (MRV). Consider redistributing sets.`,
      priority: 'info',
      category: 'strength',
    });
  }

  // Strength ACWR
  if (acwr !== null && acwr > 1.4)
    insights.push({ text: `Strength load is ${Math.round((acwr - 1) * 100)}% above your 4-week average. Manage recovery this week.`, priority: 'alert', category: 'strength' });

  return insights;
}

export function generateRunningInsights({
  paceSeries,
  roi,
  distSeries,
  distProgPct,
  hrZonePct,
  bestPace,
  decoupling,
  vdot,
  thresholdSecs,
}) {
  const insights = [];
  const n = distSeries.length;

  // Distance trend
  if (distProgPct !== null && Math.abs(distProgPct) > 8) {
    insights.push({
      text: `Running volume ${distProgPct >= 0 ? 'increased' : 'decreased'} ${Math.abs(distProgPct).toFixed(0)}% vs last 4 weeks.`,
      priority: distProgPct >= 0 ? 'good' : 'info',
      category: 'running',
    });
  }

  // Pace improvement
  if (roi < -1.5) {
    insights.push({
      text: `Pace is improving at ${Math.abs(roi).toFixed(1)} sec/km per week — strong aerobic adaptation.`,
      priority: 'good',
      category: 'running',
    });
  } else if (roi > 2.0) {
    insights.push({
      text: `Average pace has slowed by ${roi.toFixed(1)} sec/km per week. High load or fatigue may be a factor.`,
      priority: 'info',
      category: 'running',
    });
  }

  // VDOT context
  if (vdot) {
    let cat;
    if (vdot >= 60)      cat = 'elite competitive';
    else if (vdot >= 52) cat = 'competitive club runner';
    else if (vdot >= 45) cat = 'strong recreational runner';
    else if (vdot >= 38) cat = 'recreational runner';
    else                 cat = 'developing aerobic base';
    insights.push({ text: `Your running fitness places you in the ${cat} range.`, priority: 'info', category: 'running' });
  }

  // HR zone balance
  if (hrZonePct) {
    const z1z2Pct = (hrZonePct[0] || 0) + (hrZonePct[1] || 0);
    const z4z5Pct = (hrZonePct[3] || 0) + (hrZonePct[4] || 0);
    if (z1z2Pct < 60 && z4z5Pct > 20)
      insights.push({ text: `HR zone balance is skewed hard: ${z4z5Pct}% in Z4-Z5, ${z1z2Pct}% easy. Consider more aerobic base work.`, priority: 'alert', category: 'running' });
    else if (z1z2Pct > 80)
      insights.push({ text: `${z1z2Pct}% of time in easy zones. Good aerobic base building — add one quality session per week.`, priority: 'info', category: 'running' });
  }

  // Decoupling
  if (decoupling !== null) {
    if (decoupling < -5)
      insights.push({ text: `Aerobic efficiency is improving: pace-HR relationship is getting stronger over recent weeks.`, priority: 'good', category: 'running' });
    else if (decoupling > 5)
      insights.push({ text: `Aerobic efficiency is declining — HR is rising for the same pace. A recovery week may be needed.`, priority: 'alert', category: 'running' });
  }

  return insights;
}

export function generateRecoveryInsights({
  recovDecline,
  sleep7d,
  hrvStat,
  loadStatus,
  todayWellness,
}) {
  const insights = [];

  if (recovDecline >= 3)
    insights.push({
      text: `Recovery trend has declined for ${recovDecline} consecutive days. Prioritise sleep and reduce training stress.`,
      priority: 'alert',
      category: 'recovery',
    });

  if (sleep7d !== null) {
    if (sleep7d < 6.5)
      insights.push({ text: `7-day average sleep is ${sleep7d.toFixed(1)} hours — below the 7–9h recovery window. This will limit adaptation.`, priority: 'alert', category: 'recovery' });
    else if (sleep7d >= 8.0)
      insights.push({ text: `Sleep averaging ${sleep7d.toFixed(1)} hours — excellent recovery foundation.`, priority: 'good', category: 'recovery' });
  }

  if (hrvStat) {
    if (hrvStat.status === 'low')
      insights.push({ text: `HRV is ${Math.abs(hrvStat.pct)}% below your 30-day baseline. High accumulated fatigue — consider a lighter training day.`, priority: 'alert', category: 'recovery' });
    else if (hrvStat.status === 'elevated')
      insights.push({ text: `HRV is ${hrvStat.pct}% above your baseline — strong recovery state.`, priority: 'good', category: 'recovery' });
  }

  if (todayWellness.soreness >= 4)
    insights.push({ text: `Soreness is rated ${todayWellness.soreness}/5. Prioritise mobility work and avoid max-effort sessions today.`, priority: 'alert', category: 'recovery' });

  return insights;
}

// Combine all insights and rank by priority (alerts first, then good, then info).
// The one insight a deload week should show, so an Overview never nags "add
// sets / push / progressive overload" while the whole plan is to back off. Used
// by the Strength/Running/Recovery Overviews when the current week is a deload.
export function deloadInsight() {
  return {
    text: "Deload week — lighter on purpose. Lower volume is the plan right now; don't chase sets. Reduced load is exactly what lets your fitness consolidate.",
    priority: 'info',
    category: 'deload',
  };
}

export function rankInsights(allInsights) {
  const order = { alert: 0, good: 1, info: 2 };
  return allInsights
    .filter(i => i.text)
    .sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
}

// Render insights as HTML for injection into any view.
export function renderInsightsHTML(insights, maxShow = 5) {
  if (!insights || insights.length === 0) return '';
  const shown = insights.slice(0, maxShow);

  const iconMap = { alert: '!', good: '↑', info: 'i' };

  const items = shown.map(i => {
    const icon = iconMap[i.priority] || '·';
    return `<div class="an-insight an-insight--${i.priority}">
      <div class="an-insight__icon">${icon}</div>
      <span>${i.text}</span>
    </div>`;
  }).join('');

  return `<div class="an-insights">
    <div class="an-insights__title">Insights</div>
    ${items}
  </div>`;
}
