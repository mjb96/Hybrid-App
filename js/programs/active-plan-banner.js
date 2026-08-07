// @ts-check
// =============================================================================
// PLANS — ACTIVE PLAN BANNER MODEL
// -----------------------------------------------------------------------------
// The leading card on the Plans landing. Phase 4A asks Plans to "lead with the
// active plan, current week, next session, and progress"; the card was leading
// with something it could not know.
//
// It read the programme TEMPLATE and nothing else, so it announced
// "Today: Push A" over a session that was already finished, in progress, or
// performed on another day — directly contradicting Home's Today card and the
// `sessionStatus` store. This model reads the same canonical primitives Home
// and the workout picker read (`evaluateSessionCompletion`,
// `explicitSessionStatus`, `activeOneOffSession`, `buildProgramSessionChoices`)
// in the same precedence order, so the two surfaces cannot disagree about what
// the athlete should do next.
//
// Pure: no DOM, no state writes.
// =============================================================================
import { dateKey, todayProgramDay } from '../dates.js';
import { programProgressPct } from '../util.js';
import { evaluateSessionCompletion } from '../workout/completion-policy.js';
import { activeOneOffSession } from '../workout/one-off-session.js';
import { explicitSessionStatus, SESSION_STATUS } from '../workout/session-status.js';
import { buildProgramSessionChoices } from '../workout/program-session-picker.js';

const DAY_NAMES = Object.freeze({
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
});
// Two orderings, for two different questions. ROTATION answers "how many days
// from today" (a calendar question). WEEK_ORDER is the program week's own
// Monday→Sunday span, which is where "still to come this week" ends.
const ROTATION = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** How far ahead `day` is from `todayDay`, 0–6. */
function daysAhead(todayDay, day) {
  const from = ROTATION.indexOf(todayDay);
  const to = ROTATION.indexOf(day);
  if (from < 0 || to < 0) return null;
  return (to - from + 7) % 7;
}

/** "Today" / "Tomorrow" / "Thursday" — never a bare "Next", which said nothing. */
function leadFor(todayDay, day) {
  const ahead = daysAhead(todayDay, day);
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  return DAY_NAMES[day] || day;
}

function isOpenCompletion(week, day, completion) {
  return explicitSessionStatus(week, day) === SESSION_STATUS.IN_PROGRESS
    || (!!completion?.anyLogged && !completion.finished);
}

/**
 * The plan's own week counter — a PROGRAM week, which is what plan adherence and
 * "Week N of M" are legitimately about. Calendar attribution is Progress's job.
 */
function weekModel(state, program, catalog) {
  const current = Math.max(1, parseInt(String(state?.currentWeek ?? '1'), 10) || 1);
  const total = Math.max(1, parseInt(String(
    catalog?.durationWeeks || program?.totalWeeks || 12,
  ), 10) || 12);
  const pct = programProgressPct(current, total);
  return {
    current,
    total,
    label: `Week ${current} of ${total}`,
    pct,
    // The ring was an unlabelled SVG with a floating number beside it. State the
    // basis: it counts weeks FINISHED, so week 1 is honestly 0%.
    pctLabel: `${pct}% of the plan complete · ${current - 1} of ${total} weeks finished`,
  };
}

/**
 * Progress that actually moves between two visits to this screen. The plan
 * percentage only changes when the week does, so on its own the card looked
 * identical after a session as before it.
 */
function thisWeekModel(choices) {
  const total = choices.length;
  if (!total) return null;
  const done = choices.filter((c) => c.status === 'complete').length;
  return {
    done,
    total,
    label: done === total
      ? `All ${total} session${total === 1 ? '' : 's'} done this week`
      : `${done} of ${total} session${total === 1 ? '' : 's'} done this week`,
  };
}

/**
 * @param {{
 *   state:any, program?:any, catalog?:any, now?:Date, tz?:string,
 * }} options
 * @returns {null | {
 *   programId:string, name:string, accent:string|null,
 *   week:{current:number,total:number,label:string,pct:number,pctLabel:string},
 *   thisWeek:{done:number,total:number,label:string}|null,
 *   session:{state:string,day:string|null,lead:string,title:string,status:string},
 *   action:{action:string,day:string|null,label:string,tone:'primary'|'quiet'},
 * }}
 */
export function buildActivePlanBanner(options) {
  const {
    state, program = null, catalog = null, now = new Date(), tz = undefined,
  } = options || {};
  const programId = state?.activeProgramId;
  // No plan, or a plan that cannot be resolved: the caller owns those — an
  // absent banner and the existing Plans recovery card respectively. Inventing
  // a session here would talk over a data-recovery contract.
  if (!programId || !program) return null;

  const todayDay = todayProgramDay(now, tz);
  const todayISO = dateKey(now, tz);
  const week = weekModel(state, program, catalog);
  // Read the week EXACTLY as `buildProgramSessionChoices` does, so the statuses
  // in `choices` and the completions read below can never come from different
  // weeks. `week.current` is clamped for display and is not a storage key.
  const weekKey = String(state?.currentWeek || '1');
  const weekData = state?.weeks?.[weekKey] || {};
  const choices = buildProgramSessionChoices(state, program, todayDay);

  const base = {
    programId,
    name: catalog?.name || program?.name || 'My Program',
    accent: catalog?.accentColor || null,
    week,
    thisWeek: thisWeekModel(choices),
  };

  const finish = (session, action) => ({ ...base, session, action });

  // ── 1. An unfinished one-off session outranks the plan ─────────────────────
  // Same precedence as Home. `select-program-workout` drops the one-off pointer,
  // so offering a programmed day first would quietly sideline started work.
  const oneOff = activeOneOffSession(state);
  if (oneOff) {
    const day = oneOff.week.sessionDay || todayDay;
    const completion = evaluateSessionCompletion(state, program, oneOff.key, day);
    const startedToday = oneOff.week.dates?.[day] === todayISO;
    return finish({
      state: 'one_off',
      day: null,
      lead: startedToday ? 'In progress' : 'Finish this first',
      title: oneOff.week.sessionTitle || 'Strength Workout',
      status: completion.progressLabel || 'Workout started',
    }, { action: 'start-today-workout', day: null, label: 'Resume workout', tone: 'primary' });
  }

  // ── 2. A programmed session with work already logged ──────────────────────
  const started = choices.find((c) => {
    const completion = evaluateSessionCompletion(state, program, weekKey, c.day);
    return isOpenCompletion(weekData, c.day, completion);
  });
  if (started) {
    const completion = evaluateSessionCompletion(state, program, weekKey, started.day);
    return finish({
      state: 'in_progress',
      day: started.day,
      lead: started.day === todayDay ? 'In progress' : `${DAY_NAMES[started.day]} · in progress`,
      title: started.title,
      status: completion.progressLabel || 'Workout started',
    }, { action: 'select-program-workout', day: started.day, label: 'Resume workout', tone: 'primary' });
  }

  // ── 3. Today's programmed session, finished ───────────────────────────────
  const today = choices.find((c) => c.day === todayDay);
  if (today && today.status === 'complete') {
    const upcoming = nextOpen(choices, todayDay, 1);
    return finish({
      state: 'today_done',
      day: todayDay,
      lead: 'Completed today',
      title: today.title,
      status: upcoming
        ? `Next: ${leadFor(todayDay, upcoming.day)} · ${upcoming.title}`
        : 'Nothing else scheduled this week',
    }, { action: 'open-program-workout-picker', day: null, label: 'Choose another workout', tone: 'quiet' });
  }

  // ── 4. Today's programmed session, untouched ──────────────────────────────
  if (today) {
    const completion = evaluateSessionCompletion(state, program, weekKey, todayDay);
    return finish({
      state: 'today',
      day: todayDay,
      lead: 'Today',
      title: today.title,
      status: today.sessionLabel || completion.label,
    }, { action: 'select-program-workout', day: todayDay, label: 'Start workout', tone: 'primary' });
  }

  // ── 5. Today is a rest day: name the next real session and when it is ─────
  // Reaching here means today has no programmed session (steps 3–4 own the days
  // that do), which is exactly what `classifyPlannedSession` calls rest — the
  // same reading Home's Today card gives an unprogrammed day.
  const upcoming = nextOpen(choices, todayDay, 1);
  if (upcoming) {
    return finish({
      state: 'rest',
      day: upcoming.day,
      lead: leadFor(todayDay, upcoming.day),
      title: upcoming.title,
      status: 'Recovery day today',
    }, { action: 'open-program-workout-picker', day: null, label: 'Choose another workout', tone: 'quiet' });
  }

  // ── 6. Nothing left ahead this week ───────────────────────────────────────
  // Either the week is genuinely complete, or the only sessions still open are
  // behind today. Both are true statements; neither may claim the other.
  const behind = choices.find((c) => c.status !== 'complete');
  if (behind) {
    return finish({
      state: 'behind',
      day: behind.day,
      lead: DAY_NAMES[behind.day] || behind.day,
      title: behind.title,
      status: 'Not logged yet · still available',
    }, { action: 'select-program-workout', day: behind.day, label: 'Start workout', tone: 'primary' });
  }
  if (base.thisWeek) {
    return finish({
      state: 'week_complete',
      day: null,
      lead: `Week ${week.current} complete`,
      title: base.thisWeek.label,
      status: week.current < week.total
        ? `Week ${week.current + 1} is next`
        : 'Final week of the plan',
    }, { action: 'open-program-workout-picker', day: null, label: 'Choose another workout', tone: 'quiet' });
  }
  return finish({
    state: 'no_sessions',
    day: null,
    lead: 'No sessions scheduled',
    title: 'This week has no planned training',
    status: 'Every day is a rest day in this week of the plan',
  }, { action: 'open-program-workout-picker', day: null, label: 'Choose a workout', tone: 'quiet' });
}

/**
 * The first non-complete session still ahead of today IN THIS PROGRAM WEEK.
 *
 * Deliberately does not wrap: a program week runs Monday→Sunday, so scanning
 * past Sunday would find days belonging to the NEXT week and announce them
 * against this week's data. On a Saturday that made an unlogged Monday look
 * like an upcoming session.
 */
function nextOpen(choices, todayDay, offset = 0) {
  const byDay = new Map(choices.map((c) => [c.day, c]));
  const from = WEEK_ORDER.indexOf(todayDay);
  if (from < 0) return null;
  for (let i = from + offset; i < WEEK_ORDER.length; i++) {
    const choice = byDay.get(WEEK_ORDER[i]);
    if (choice && choice.status !== 'complete') return choice;
  }
  return null;
}
