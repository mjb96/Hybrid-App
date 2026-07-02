// @ts-check
// =============================================================================
// MORNING BRIEFING (js/brain/morning-briefing.js)
//
// The daily "here's your day" narrative — R1 of the product roadmap. Replaces
// the two competing Home surfaces (coaching card + insight banner) with ONE
// coaching voice, anchored by Hybrid Score.
//
// Pure function of (state, dashboard model, hybrid-score result, program,
// selectedDay, now). No DOM, no persistence. `briefingToText` renders the same
// briefing as a notification-ready string (for the future morning push).
//
// The Mission is DERIVED from logged data (session completion, wellness
// check-in) — never manually ticked — so it cannot be gamed and needs no new
// state. Completing it is done by *doing the thing*, and XP already flows
// through the Hybrid Score daily recorder.
// =============================================================================
import { WEEK_PHASE_NAMES } from '../constants.js';

const DAY_NAMES = Object.freeze({
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
});

function firstName(state) {
  const n = (state?.settings?.name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

function greetingFor(now, name) {
  const h = now.getHours();
  const base = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${base}, ${name}` : base;
}

// One line about the day's Hybrid Score (used verbatim in notifications; the
// in-app card sits under the gauge so it renders the delta chip instead).
function scoreLineFor(score) {
  if (!score || score.score == null) {
    return 'Your Hybrid Score is calibrating — log a few sessions to unlock it';
  }
  let deltaTxt = 'new today';
  if (typeof score.delta === 'number') {
    deltaTxt = score.delta > 0 ? `up ${score.delta} since yesterday`
             : score.delta < 0 ? `down ${Math.abs(score.delta)} since yesterday`
             : 'steady since yesterday';
  }
  return `Your Hybrid Score is ${score.score} (${deltaTxt})`;
}

// The single mission for the day. Priority:
//   training day → complete the planned session (readiness-aware framing);
//   rest day     → wellness check-in, then pure recovery framing.
function missionFor(model, session) {
  const readyScore = model?.ready?.hasData ? model.ready.score : null;
  const checkedIn = (model?.ready?.available || []).includes('wellness');

  if (!session.isRest) {
    if (session.done) {
      return { icon: '✅', text: `${session.label} complete — nice work`, done: true };
    }
    let text = `Complete today's ${session.label.toLowerCase()}`;
    if (session.hasRun && readyScore !== null && readyScore < 55) {
      text += ' — keep the run easy, Zone 2 only';
    } else if (!session.hasRun && readyScore !== null && readyScore >= 85) {
      text += ' — you’re primed, a good day to push';
    }
    return { icon: '🎯', text, done: false };
  }

  if (!checkedIn) {
    return { icon: '📝', text: 'Rest day — log a 30-second wellness check-in', done: false };
  }
  return { icon: '😌', text: 'Rest well — recovery is where you grow', done: true };
}

// Main export — compose the whole briefing from already-computed inputs.
// `model` is the shared dashboard model; `score` is computeHybridScore output.
/** @param {{state?:any, model?:any, score?:any, program?:any, selectedDay?:string, now?:Date}} [opts] */
export function buildMorningBriefing(opts = {}) {
  const { state, model, score, program, selectedDay, now = new Date() } = opts;
  const rec = model?.rec || {};
  const wk = String(state?.currentWeek || '1');
  const phase = WEEK_PHASE_NAMES[wk] || '';
  const dayName = DAY_NAMES[selectedDay] || '';

  const bp = program?.days?.[selectedDay] || null;
  const label = rec.sessionLabel || 'Rest Day';
  const isRest = label === 'Rest Day';
  const hasRun = label === 'Run Day' || label === 'Hybrid Session';
  const session = {
    label,
    title: (!isRest && bp?.title) ? bp.title : '',
    isRest,
    hasRun,
    done: rec.badge === 'Session Done',
  };

  const readinessLine = model?.ready?.hasData
    ? `Readiness ${model.ready.score} — ${model.ready.status}`
    : null;

  return {
    greeting: greetingFor(now, firstName(state)),
    context: [dayName, `Week ${wk}`, phase].filter(Boolean).join(' · '),
    scoreLine: scoreLineFor(score),
    readinessLine,
    session,
    mission: missionFor(model, session),
    coach: {
      headline: rec.headline || '',
      advice: rec.advice || '',
      severity: rec.severity || 'neutral',
      badge: rec.badge || '',
    },
  };
}

// Notification-ready plain text (morning push, R3). One compact paragraph.
export function briefingToText(b) {
  const parts = [`${b.greeting}.`, `${b.scoreLine}.`];
  if (!b.session.isRest) {
    parts.push(`Today: ${b.session.title || b.session.label}.`);
  }
  parts.push(`Mission: ${b.mission.text}.`);
  return parts.join(' ');
}
