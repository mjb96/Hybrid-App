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
import { classifyWeek } from '../programs/timeline.js';
import { projectionLine } from './hybrid-score/project.js';
import { streakRiskLine } from './streak.js';
import { coachMemory } from './coach-memory.js';
import { buildCoachEvidence } from './coach-evidence.js';
import { reportHandledError } from '../monitoring/report-error.js';

const DEFAULT_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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
function missionFor(model, session, firstSession = false) {
  const readyScore = model?.ready?.hasData ? model.ready.score : null;
  const checkedIn = (model?.ready?.available || []).includes('wellness');

  // First run after onboarding: point squarely at the very first action.
  if (firstSession && !session.done) {
    return session.isRest
      ? { icon: '🚶', text: 'Welcome! Start with an easy walk or run to break the ice', done: false }
      : { icon: '🎯', text: `Log your first session — tap to open today's ${session.label.toLowerCase()}`, done: false };
  }

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
/** @param {{state?:any, model?:any, score?:any, projection?:any, program?:any, selectedDay?:string, now?:Date, firstSession?:boolean, overtrainingActive?:boolean, days?:string[]}} [opts] */
export function buildMorningBriefing(opts = {}) {
  const { state, model, score, projection, program, selectedDay, now = new Date(), firstSession = false, overtrainingActive = false, days = DEFAULT_DAY_KEYS } = opts;
  const rec = model?.rec || {};
  const wk = String(state?.currentWeek || '1');
  const phase = WEEK_PHASE_NAMES[wk] || '';
  const dayName = DAY_NAMES[selectedDay] || '';

  // C3 — a planned deload is explained, not silent. Detect it from the program's
  // own week label (falling back to the generic phase map) and carry a short,
  // honest rationale so the lighter week reads as intent, not lost progress.
  const weekLabel = program?.weeklyVolModifiers?.[wk]?.intensityLabel || phase || '';
  const deload = classifyWeek(weekLabel) === 'deload'
    ? { note: "Planned deload — lighter on purpose. Reduced volume lets your body absorb the work and adapt; this is where gains consolidate, not where they're lost." }
    : null;

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

  // V2-3 the morning hook — a forward-looking upside ("train and it rises to X")
  // simulated through the real engine, and a streak-at-stake line (loss aversion)
  // when a meaningful streak is unprotected today. Both are omitted honestly when
  // there's no gain to promise / no streak at risk, so callers fall back cleanly.
  const forward = (projection && projection.canProject && projection.gain >= 1)
    ? { line: projectionLine(projection), from: projection.current.score,
        to: projection.projected.score, gain: projection.gain }
    : null;
  const streakRisk = streakRiskLine(state, model, now.toISOString().slice(0, 10));
  // V2-4 — the coach remembers: one true line drawn from the athlete's own
  // score/streak history (or null when nothing stands out).
  const memory = coachMemory(state, score?.score ?? null);

  return {
    greeting: greetingFor(now, firstName(state)),
    context: [dayName, `Week ${wk}`, phase].filter(Boolean).join(' · '),
    scoreLine: scoreLineFor(score),
    readinessLine,
    forward,
    streakRisk,
    memory,
    deload,
    session,
    mission: missionFor(model, session, firstSession),
    coach: buildCoach({ state, model, rec, days, overtrainingActive, now }),
  };
}

// The coach line + its progressive-disclosure evidence. When the overtraining
// escalation card is on screen it OWNS the load message (with its own signal
// chips), so the briefing suppresses its own redundant load headline — one red
// voice, not two cards repeating the same cause.
function buildCoach({ state, model, rec, days, overtrainingActive, now }) {
  if (overtrainingActive) {
    return { headline: '', advice: '', severity: 'neutral', badge: rec.badge || '', evidence: null, deferred: true };
  }
  let evidence = null;
  try {
    evidence = buildCoachEvidence({ state, days, model, rec, today: now.toISOString().slice(0, 10) });
    if (!evidence.bullets.length) evidence = null;
  } catch (e) { reportHandledError('briefing:coach-evidence', e); evidence = null; }
  return {
    headline: rec.headline || '',
    advice: rec.advice || '',
    severity: rec.severity || 'neutral',
    badge: rec.badge || '',
    evidence,
    deferred: false,
  };
}

// Notification-ready plain text (morning push, V2-3). One compact, decisive,
// forward-looking paragraph: lead with the upside of training today (falling
// back to the plain score line when there's no gain to promise), then the
// session, the mission, and — if a streak is on the line — the loss-aversion nudge.
export function briefingToText(b) {
  const parts = [`${b.greeting}.`];
  parts.push(b.forward ? b.forward.line : `${b.scoreLine}.`);
  if (!b.session.isRest) {
    parts.push(`Today: ${b.session.title || b.session.label}.`);
  }
  parts.push(`Mission: ${b.mission.text}.`);
  if (b.memory) parts.push(b.memory);
  if (b.streakRisk?.text) parts.push(b.streakRisk.text);
  return parts.join(' ');
}
