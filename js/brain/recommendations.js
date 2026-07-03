// @ts-check
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
import { trainingStatus } from './briefing.js';
import { isCompletedSet } from '../set-utils.js';

// Has the selected day's planned session already been logged? Gym counts as done
// when every materialised set for the day is complete (and there is at least
// one); a run counts as done once a distance is logged. Rest days never count.
function sessionCompletion(state, selectedDay, session) {
  const wkNum = parseInt(state.currentWeek || '1', 10);
  const wk = state.weeks?.[String(wkNum)] || {};
  const dayLifts = wk.lifts?.[selectedDay] || {};
  let totalSets = 0, doneSets = 0;
  for (const lift in dayLifts) {
    if (!Array.isArray(dayLifts[lift])) continue;
    totalSets += dayLifts[lift].length;
    doneSets += dayLifts[lift].filter(isCompletedSet).length;
  }
  const runLogged = (parseFloat(wk.runs?.[selectedDay]?.dist) || 0) > 0;
  const gymDone = session.hasGym ? (totalSets > 0 && doneSets === totalSets) : true;
  const runDone = session.hasRun ? runLogged : true;
  const anyLogged = doneSets > 0 || runLogged;
  return { complete: anyLogged && gymDone && runDone };
}

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

// Build advice text from load, freshness, session type and RPE trend. V2-4: the
// coach speaks CONSEQUENCES, never mechanisms — no "ACWR 1.52", no "TSB +7". The
// athlete hears what to do and why it matters, not the model's internals (those
// still live one tap deeper in the Recovery/Load Stats views).
function buildAdvice(acwr, tsb, session) {
  const { hasRun, hasGym } = session;

  if (acwr >= 1.5) {
    if (hasRun && hasGym) {
      return `Your training load is spiking and fatigue is outrunning recovery. Cut gym volume by 20% and keep the run easy Zone 2 today — or take a full rest day if you're feeling beaten up.`;
    }
    if (hasRun) {
      return `Your load is spiking faster than you're recovering. Swap today's run for a short walk or light mobility to let the fatigue drain.`;
    }
    if (hasGym) {
      return `Your load is spiking faster than you're recovering. Drop a working set on each lift and stay well clear of failure today.`;
    }
    return `Fatigue is running high. This rest day is well timed — prioritise sleep, protein, and keeping stress down.`;
  }

  if (acwr >= 1.3) {
    if (hasRun && hasGym) {
      return `You're building hard and fatigue is climbing — a productive edge, but an edge. Do the gym work as planned and keep the run aerobic, Zone 2 only.`;
    }
    if (hasRun) {
      return `You're building hard and the fatigue is starting to show. Run today, but hold the easier end of your pace range and don't surge.`;
    }
    if (hasGym) {
      return `You're building hard and fatigue is climbing. Hit the planned volume exactly — no extra sets, no load bumps, no extending the session.`;
    }
    return `Fatigue is elevated. Use this rest day well — sleep, hydrate, and keep other stressors light.`;
  }

  if (acwr >= 0.8) {
    if (tsb > 5) {
      if (hasRun && hasGym) {
        return `You're fresh and your load is right where it should be — a green light. Good day to push the intensity on both the lifts and the run.`;
      }
      if (hasRun) {
        return `You're fresh and well-balanced. Ideal conditions to reach for the top of your pace range — or test a time-trial effort.`;
      }
      if (hasGym) {
        return `You're fresh and well-balanced. Good day to chase a small PR or add a back-off set.`;
      }
      return `You're recovered and carrying freshness. Enjoy the rest day — you'll come back stronger tomorrow.`;
    }
    if (hasRun && hasGym) {
      return `Your load is in the productive zone. Run the hybrid session exactly as programmed — nothing to change today.`;
    }
    if (hasRun) {
      return `Your load is in the productive zone. Hold your prescribed pace and effort today.`;
    }
    if (hasGym) {
      return `Your load is in the productive zone. Follow the program today — no adjustments needed.`;
    }
    return `Your training is well balanced. This rest day is well placed in the cycle.`;
  }

  if (acwr >= 0.5) {
    return `Your training has been on the lighter side lately. If you feel good, add a working set or stretch today's session a little to build momentum back up.`;
  }

  // Detraining range — load has fallen off.
  return `Your training load has dropped off and fitness is starting to slip. Get today's full session in — consistency now protects the base you've built.`;
}

// Main export — call once per home render.
export function generateRecommendation(state, days, activeProgram, selectedDay) {
  const session = classifySession(activeProgram?.days?.[selectedDay]);
  const recentRpes = getRecentRpes(state, days);

  // Single ACWR source for the whole dashboard: the persisted EWMA load metrics
  // (ATL/CTL). Keeps the coaching card, top-insight banner, training-status tile
  // and deload card all reading the same number instead of diverging.
  const atl = state.loadMetrics?.atl || 0;
  const ctl = state.loadMetrics?.ctl || 0;
  const tsb = ctl - atl;
  const hasLoad = ctl > 0;
  const acwr = hasLoad ? Math.round((atl / ctl) * 100) / 100 : 0;
  const { status } = trainingStatus({ hasData: hasLoad, acwr });

  // If today's planned session is already logged, acknowledge it rather than
  // prescribing effort the athlete has already put in.
  if (session.hasGym || session.hasRun) {
    const done = sessionCompletion(state, selectedDay, session);
    if (done.complete) {
      const what = session.hasRun && session.hasGym ? 'hybrid session'
                 : session.hasRun ? 'run' : 'session';
      const advice = tsb <= -15
        ? `Nice work — today's ${what} is done. Fatigue is high, so keep the rest of the day easy: refuel, hydrate, and protect your sleep tonight.`
        : `Nice work — today's ${what} is logged. Ease into recovery — refuel, hydrate, and let the adaptation happen.`;
      return {
        severity: 'positive',
        badge: 'Session Done',
        headline: 'Today’s session is logged ✓',
        advice,
        sessionLabel: session.label,
        acwr,
        status: hasLoad ? status : 'Complete',
      };
    }
  }

  const highRpeStreak = recentRpes.filter(r => r >= 8).length;
  const hasData = hasLoad || recentRpes.length >= 2;

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

  // Override if consecutive high-RPE sessions even when ACWR looks normal —
  // including on otherwise-"positive" (fresh, productive-load) days, where a
  // run of hard efforts is exactly the signal worth flagging.
  if (highRpeStreak >= 3 && (severity === 'neutral' || severity === 'positive')) {
    severity = 'caution';
    headline = 'High effort streak — listen to your body';
    badge = 'High RPE Trend';
  }

  let advice = buildAdvice(acwr, tsb, session);

  return { severity, badge, headline, advice, sessionLabel: session.label, acwr, status };
}
