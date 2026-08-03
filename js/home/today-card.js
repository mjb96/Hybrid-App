// @ts-check
// HOME TODAY CARD
// A pure, calendar-day-aware presentation model for Home's single primary
// action. It deliberately does not trust the cockpit's last-selected day.
import { dateKey } from '../dates.js';
import { evaluateSessionCompletion, classifyPlannedSession } from '../workout/completion-policy.js';
import { activeOneOffSession } from '../workout/one-off-session.js';
import { explicitSessionStatus, SESSION_STATUS } from '../workout/session-status.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = Object.freeze({
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
});

export function todayProgramDay(now = new Date(), tz = undefined) {
  const todayISO = dateKey(now, tz);
  // Parse the intentional local date at UTC noon so the weekday is stable in
  // tests and on devices whose process timezone differs from their display TZ.
  return DAY_KEYS[new Date(`${todayISO}T12:00:00Z`).getUTCDay()];
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[char]));
}

function firstSentence(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] || text).trim();
}

function programSession(program, day) {
  const blueprint = program?.days?.[day] || null;
  const planned = classifyPlannedSession(blueprint);
  return {
    blueprint,
    planned,
    title: blueprint?.title || planned.label,
  };
}

function completionFor(state, program, weekKey, day) {
  return evaluateSessionCompletion(state, program, weekKey, day);
}

function isOpenCompletion(state, week, day, completion) {
  return explicitSessionStatus(week, day) === SESSION_STATUS.IN_PROGRESS
    || (!!completion?.anyLogged && !completion.finished);
}

function completedToday(state, program, weekKey, todayISO) {
  const week = state?.weeks?.[weekKey] || {};
  for (const day of Object.keys(week.dates || {})) {
    if (week.dates?.[day] !== todayISO) continue;
    const completion = completionFor(state, program, weekKey, day);
    if (completion.finished) return { day, completion };
  }
  return null;
}

function openSessionToday(state, program, weekKey, todayISO) {
  const week = state?.weeks?.[weekKey] || {};
  for (const day of Object.keys(week.dates || {})) {
    if (week.dates?.[day] !== todayISO) continue;
    const completion = completionFor(state, program, weekKey, day);
    if (isOpenCompletion(state, week, day, completion)) return { day, completion };
  }
  return null;
}

function unresolvedProgramSession(state, program, weekKey, todayDay, todayISO) {
  const week = state?.weeks?.[weekKey] || {};
  for (const day of Object.keys(program?.days || {})) {
    if (day === todayDay) continue;
    const completion = completionFor(state, program, weekKey, day);
    if (!isOpenCompletion(state, week, day, completion)) continue;
    const loggedDate = week.dates?.[day] || null;
    if (loggedDate === todayISO) continue;
    return { day, completion, loggedDate };
  }
  return null;
}

function readinessGuidance(model, fallback) {
  const ready = model?.ready;
  const rec = model?.rec || {};
  if (ready?.hasData && ready.score != null) {
    const coaching = rec.badge === 'Getting Started'
      ? 'Keep the plan simple and log how it feels.'
      : (rec.headline || fallback);
    return `Readiness ${ready.score} · ${coaching}`;
  }
  if (rec.badge === 'Getting Started') {
    return 'Log this session to start personalising your guidance.';
  }
  return rec.headline || fallback;
}

function scoreSupport(score) {
  if (!score?.hasData || score.score == null || Number(score.confidence) < 50) return null;
  const delta = typeof score.delta === 'number'
    ? score.delta > 0 ? `+${score.delta} today`
      : score.delta < 0 ? `${score.delta} today`
      : 'steady today'
    : score.band?.status || '';
  return {
    value: score.score,
    label: ['Hybrid Score', delta].filter(Boolean).join(' · '),
  };
}

function baseModel({ state, program, model, briefing, score, now, offline, tz }) {
  const todayDay = todayProgramDay(now, tz);
  return {
    state: 'ready',
    tone: 'ready',
    eyebrow: 'Today',
    day: todayDay,
    dayLabel: DAY_NAMES[todayDay],
    title: '',
    meta: '',
    guidance: '',
    primary: null,
    secondary: null,
    evidence: briefing?.coach?.evidence || null,
    score: scoreSupport(score),
    offline: !!offline,
    week: String(state?.currentWeek || '1'),
    programName: program?.name || program?.title || '',
    model,
  };
}

/**
 * @param {{
 *  state:any, program?:any, model?:any, briefing?:any, score?:any,
 *  now?:Date, offline?:boolean, tz?:string
 * }} options
 */
export function buildTodayCardModel(options) {
  const {
    state, program = null, model = null, briefing = null, score = null,
    now = new Date(), offline = false, tz = undefined,
  } = options;
  const todayISO = dateKey(now, tz);
  const card = baseModel({ state, program, model, briefing, score, now, offline, tz });
  const weekKey = card.week;

  // A one-off strength session is the most explicit unfinished intent. Keep it
  // resumable even after midnight; starting another activity must not bury it.
  const oneOff = activeOneOffSession(state);
  if (oneOff) {
    const day = oneOff.week.sessionDay || card.day;
    const completion = completionFor(state, program, oneOff.key, day);
    const startedToday = oneOff.week.dates?.[day] === todayISO;
    card.state = startedToday ? 'in_progress' : 'unresolved';
    card.tone = 'progress';
    card.eyebrow = startedToday ? 'In progress' : 'Finish this first';
    card.day = day;
    card.dayLabel = DAY_NAMES[day] || card.dayLabel;
    card.title = oneOff.week.sessionTitle || 'Strength Workout';
    card.meta = completion.progressLabel || 'Workout started';
    card.guidance = startedToday
      ? 'Your work is saved. Pick up where you left off.'
      : `Started ${oneOff.week.dates?.[day] || 'earlier'} · finish or discard it before starting something else.`;
    card.primary = { action: 'start-today-workout', label: 'Resume workout' };
    return card;
  }

  if (!program) {
    card.state = 'no_plan';
    card.tone = 'quiet';
    card.eyebrow = 'Set up your training';
    card.title = 'No active plan';
    card.meta = 'Choose a plan to put the right session here each day.';
    card.guidance = 'Your existing workout history is safe and still available in Progress.';
    card.primary = { action: 'switch-tab', target: 'program', label: 'Choose a plan' };
    card.score = null;
    card.evidence = null;
    return card;
  }

  const todayCompleted = completedToday(state, program, weekKey, todayISO);
  if (todayCompleted) {
    const session = programSession(program, todayCompleted.day);
    card.state = 'completed';
    card.tone = 'complete';
    card.eyebrow = 'Completed today';
    card.day = todayCompleted.day;
    card.dayLabel = DAY_NAMES[todayCompleted.day] || card.dayLabel;
    card.title = session.title;
    card.meta = todayCompleted.completion.progressLabel || 'Workout logged';
    card.guidance = 'Today’s work is safely logged. Recover now; the details remain editable.';
    card.primary = { action: 'open-today-summary', day: todayCompleted.day, label: 'Review workout' };
    card.secondary = { action: 'open-program-workout-picker', label: 'Choose another workout' };
    return card;
  }

  const todayOpen = openSessionToday(state, program, weekKey, todayISO);
  if (todayOpen) {
    const session = programSession(program, todayOpen.day);
    card.state = 'in_progress';
    card.tone = 'progress';
    card.eyebrow = 'In progress';
    card.day = todayOpen.day;
    card.dayLabel = DAY_NAMES[todayOpen.day] || card.dayLabel;
    card.title = session.title;
    card.meta = todayOpen.completion.progressLabel || session.planned.label;
    card.guidance = 'Your work is saved. Pick up where you left off.';
    card.primary = { action: 'select-program-workout', day: todayOpen.day, label: 'Resume workout' };
    card.secondary = { action: 'open-program-workout-picker', label: 'Choose another workout' };
    return card;
  }

  const unresolved = unresolvedProgramSession(state, program, weekKey, card.day, todayISO);
  if (unresolved) {
    const session = programSession(program, unresolved.day);
    card.state = 'unresolved';
    card.tone = 'progress';
    card.eyebrow = 'Finish this first';
    card.day = unresolved.day;
    card.dayLabel = DAY_NAMES[unresolved.day] || unresolved.day;
    card.title = session.title;
    card.meta = `${card.dayLabel} · ${unresolved.completion.progressLabel}`;
    card.guidance = 'This session is still open. Finish or discard it before choosing another workout.';
    card.primary = { action: 'select-program-workout', day: unresolved.day, label: 'Resume workout' };
    return card;
  }

  const todaySession = programSession(program, card.day);
  const todayCompletion = completionFor(state, program, weekKey, card.day);
  card.title = todaySession.title;
  card.meta = `${card.dayLabel} · Week ${weekKey} · ${todaySession.planned.label}`;

  if (todayCompletion.finished) {
    card.state = 'completed';
    card.tone = 'complete';
    card.eyebrow = 'Completed today';
    card.guidance = 'Today’s work is safely logged. Recover now; the details remain editable.';
    card.primary = { action: 'open-today-summary', day: card.day, label: 'Review workout' };
    card.secondary = { action: 'open-program-workout-picker', label: 'Choose another workout' };
    return card;
  }

  if (isOpenCompletion(state, state?.weeks?.[weekKey] || {}, card.day, todayCompletion)) {
    card.state = 'in_progress';
    card.tone = 'progress';
    card.eyebrow = 'In progress';
    card.meta = todayCompletion.progressLabel || card.meta;
    card.guidance = 'Your work is saved. Pick up where you left off.';
    card.primary = { action: 'select-program-workout', day: card.day, label: 'Resume workout' };
    card.secondary = { action: 'open-program-workout-picker', label: 'Choose another workout' };
    return card;
  }

  if (todaySession.planned.isRest) {
    card.state = 'rest';
    card.tone = 'rest';
    card.eyebrow = 'Recovery day';
    card.meta = `${card.dayLabel} · Week ${weekKey}`;
    card.guidance = firstSentence(model?.rec?.advice, 'Planned recovery. Move easy if you like, then let the work absorb.');
    card.primary = { action: 'open-wellness-checkin', label: 'Log wellness check-in' };
    card.secondary = { action: 'open-program-workout-picker', label: 'Choose another workout' };
    return card;
  }

  card.guidance = readinessGuidance(model, 'Follow the planned session and log how it feels.');
  card.primary = { action: 'select-program-workout', day: card.day, label: 'Start workout' };
  card.secondary = { action: 'open-program-workout-picker', label: 'Choose another workout' };
  return card;
}

function actionAttrs(action) {
  if (!action) return '';
  return [
    `data-action="${esc(action.action)}"`,
    action.target ? `data-target="${esc(action.target)}"` : '',
    action.day ? `data-day="${esc(action.day)}"` : '',
  ].filter(Boolean).join(' ');
}

export function todayCardHTML(card) {
  const evidence = card.evidence?.bullets?.length
    ? `<details class="today-card__why">
        <summary>Why this guidance?</summary>
        <ul>${card.evidence.bullets.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
      </details>`
    : '';
  const score = card.score
    ? `<button class="today-card__score" data-action="open-analytics" data-context="hybrid-score"
              aria-label="${esc(card.score.label)}. Open Hybrid Score details">
        <span>${esc(card.score.label)}</span><strong>${esc(card.score.value)}</strong><span aria-hidden="true">›</span>
      </button>`
    : '';
  const offline = card.offline
    ? `<p class="today-card__offline" role="status"><span aria-hidden="true"></span>Offline · logging still saves on this device</p>`
    : '';
  const secondary = card.secondary
    ? `<button id="homeChooseWorkout" class="today-card__secondary" ${actionAttrs(card.secondary)}>${esc(card.secondary.label)}</button>`
    : '';

  return `<article class="today-card today-card--${esc(card.tone)}" data-today-state="${esc(card.state)}" aria-labelledby="homeTodayTitle">
    <div class="today-card__top">
      <span class="today-card__eyebrow">${esc(card.eyebrow)}</span>
      <span class="today-card__state" aria-label="Session status">${esc(card.state.replace('_', ' '))}</span>
    </div>
    <h2 id="homeTodayTitle" class="today-card__title">${esc(card.title)}</h2>
    <p class="today-card__meta">${esc(card.meta)}</p>
    <p class="today-card__guidance">${esc(card.guidance)}</p>
    ${score}
    ${evidence}
    ${offline}
    <div class="today-card__actions">
      <button id="homePrimaryCta" class="today-card__primary btn-action-block btn-green" ${actionAttrs(card.primary)}>${esc(card.primary?.label || 'Continue')}</button>
      ${secondary}
    </div>
  </article>`;
}
