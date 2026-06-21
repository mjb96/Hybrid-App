// ==========================================
// HYBRID BRAIN — DAILY RECOMMENDATIONS (js/brain/recommendations.js)
//
// Synthesizes ACWR, TSB (freshness), recent RPE trend, and today's planned
// session to produce a single prescriptive coaching recommendation.
//
// Output shape:
//   { severity, badge, headline, advice, sessionLabel, acwr, status }
//
// severity: 'positive' | 'neutral' | 'caution' | 'warning'
// ==========================================
import { recoveryCostBalance } from './load_models.js';
import { trainingStatus } from './briefing.js';
import { getFastingHours } from '../fasting.js';

// Collect RPE readings from the last two weeks, most recent first.
function getRecentRpes(state, days) {
  const currentWk = parseInt(state.currentWeek || '1', 10);
  const entries = [];
  for (let w = currentWk; w >= Math.max(1, currentWk - 1); w--) {
    const wkData = state.weeks?.[String(w)];
    if (!wkData) continue;
    for (const d of days) {
      const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
      const runRpe = parseFloat(wkData.runs?.[d]?.rpe) || 0;
      if (gymRpe > 0) entries.push(gymRpe);
      if (runRpe > 0) entries.push(runRpe);
    }
  }
  return entries.reverse().slice(0, 6); // most recent first, cap at 6
}

// Read today's blueprint and return what kind of session is planned.
function classifySession(blueprint) {
  if (!blueprint) return { label: 'Rest Day', hasRun: false, hasGym: false };
  const runsText = (blueprint.runs || '').toLowerCase();
  const titleText = (blueprint.title || '').toLowerCase();
  const isRestRun =
    runsText === 'rest' ||
    runsText.includes('no running') ||
    runsText.includes('no structured') ||
    runsText.includes('no run') ||
    runsText === '';
  const hasRun = !!blueprint.runs && !isRestRun;
  const isRestDay =
    titleText.includes('rest') ||
    titleText.includes('recovery') ||
    (blueprint.badge || '').toLowerCase() === 'rest';
  const hasGym = !isRestDay;
  let label = 'Rest Day';
  if (hasRun && hasGym) label = 'Hybrid Session';
  else if (hasRun) label = 'Run Day';
  else if (hasGym) label = 'Gym Session';
  return { label, hasRun, hasGym };
}

// Build advice text based on ACWR, TSB, session type, and RPE trend.
function buildAdvice(acwr, tsb, session, highRpeStreak, hasData) {
  const { hasRun, hasGym } = session;

  if (acwr >= 1.5) {
    if (hasRun && hasGym) {
      return `ACWR is ${acwr.toFixed(2)} — load is very high. Cut gym volume by 20% and cap the run at easy Zone 2 effort today, or take a full rest day if fatigue is significant.`;
    }
    if (hasRun) {
      return `ACWR is ${acwr.toFixed(2)} — load is very high. Replace today's run with a short walk or light mobility work to protect recovery.`;
    }
    if (hasGym) {
      return `ACWR is ${acwr.toFixed(2)} — load is very high. Reduce working sets by one per exercise and avoid training to failure today.`;
    }
    return `Load is very high. This rest day is well timed — prioritise sleep, protein intake, and stress management.`;
  }

  if (acwr >= 1.3) {
    if (hasRun && hasGym) {
      return `ACWR is ${acwr.toFixed(2)} — building well but watch fatigue. Complete the gym session as planned and keep the run aerobic (Zone 2 effort only).`;
    }
    if (hasRun) {
      return `ACWR is ${acwr.toFixed(2)}. Complete today's run but target the easier end of your prescribed pace range and avoid surging.`;
    }
    if (hasGym) {
      return `ACWR is ${acwr.toFixed(2)}. Stick to planned volume — avoid adding sets, increasing load, or extending the session today.`;
    }
    return `Load is elevated. Use this rest day well — sleep, hydrate, and limit non-training stressors.`;
  }

  if (acwr >= 0.8) {
    if (tsb > 5) {
      if (hasRun && hasGym) {
        return `Training load is optimal and you're carrying freshness (TSB +${Math.round(tsb)}). Today is a good day to push intensity on both the gym session and the run.`;
      }
      if (hasRun) {
        return `Load balance is optimal and your body is fresh. Good conditions to target the upper end of your pace range — or test a time trial effort.`;
      }
      if (hasGym) {
        return `Load balance is optimal and you're fresh. Today is a good day to aim for small PRs or add an extra back-off set.`;
      }
      return `Recovery is on track and you're carrying freshness. Enjoy the rest day — you'll come back stronger tomorrow.`;
    }
    if (hasRun && hasGym) {
      return `Training load is in the productive zone. Complete today's hybrid session as programmed — no changes needed.`;
    }
    if (hasRun) {
      return `Load is in the productive zone. Stick to your prescribed pace and effort today.`;
    }
    if (hasGym) {
      return `Load is in the productive zone. Follow the program today — no adjustments needed.`;
    }
    return `Training load is well balanced. This rest day is well placed in your training cycle.`;
  }

  if (acwr >= 0.5) {
    return `Training volume is on the lighter side. If you're feeling good, consider adding a working set or slightly extending today's session to build momentum.`;
  }

  // Very low ACWR (detraining range)
  return `Recent training load has dropped. Make sure to complete today's full session — consistency now will protect your fitness base.`;
}

// Main export — call once per home render.
export function generateRecommendation(state, days, activeProgram, selectedDay) {
  const currentWk = parseInt(state.currentWeek || '1', 10);
  const weekKeys = Object.keys(state.weeks || {}).map(Number);
  const maxWeek = weekKeys.length > 0 ? Math.max(...weekKeys) : 1;

  const balance = recoveryCostBalance(state, days, currentWk, maxWeek);
  const { status } = trainingStatus(balance);
  const session = classifySession(activeProgram?.days?.[selectedDay]);
  const recentRpes = getRecentRpes(state, days);

  const acwr = balance.acwr;
  const atl = state.loadMetrics?.atl || 0;
  const ctl = state.loadMetrics?.ctl || 0;
  const tsb = ctl - atl;
  const highRpeStreak = recentRpes.filter(r => r >= 8).length;
  const hasData = balance.hasData || recentRpes.length >= 2;

  if (!hasData) {
    return {
      severity: 'neutral',
      badge: 'Getting Started',
      headline: session.label,
      advice: 'Log a few more sessions and your personalised coaching guidance will appear here.',
      sessionLabel: session.label,
      acwr: 0,
      status: 'Building',
    };
  }

  let severity;
  let headline;
  let badge = status;

  if (acwr >= 1.5) {
    severity = 'warning';
    headline = 'Reduce load today';
  } else if (acwr >= 1.3) {
    severity = 'caution';
    headline = 'Moderate load — watch intensity';
  } else if (acwr >= 0.8) {
    severity = tsb > 5 ? 'positive' : 'neutral';
    headline = tsb > 5 ? 'Well rested — push it today' : 'On track — stick to the plan';
  } else if (acwr >= 0.5) {
    severity = 'neutral';
    headline = 'Light week — build back up';
    badge = 'Maintaining';
  } else {
    severity = 'caution';
    headline = 'Load is low — ramp it up';
    badge = 'Detraining';
  }

  // Override if consecutive high-RPE sessions even when ACWR looks normal
  if (highRpeStreak >= 3 && severity === 'neutral') {
    severity = 'caution';
    headline = 'High effort streak — listen to your body';
    badge = 'High RPE Trend';
  }

  let advice = buildAdvice(acwr, tsb, session, highRpeStreak, hasData);

  // ── Fasting note (24h+ only) ──────────────────────────────────────────────
  // A brief, non-prescriptive heads-up — the athlete decides how to adjust.
  // Sources: Ho et al. (1988) J Clin Invest; Aird et al. (2018) J Sports Sci.
  const fastH = getFastingHours(state.fastingSession);
  if (fastH >= 24 && (session.hasGym || session.hasRun)) {
    advice += ` You're ${Math.floor(fastH)}h into a fast — listen to your body today.`;
  }

  return { severity, badge, headline, advice, sessionLabel: session.label, acwr, status, fastingHours: fastH };
}
