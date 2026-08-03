// @ts-check
// Independent strength sessions live in their own non-numeric week-shaped
// records. This lets the existing logger/history/export paths reuse one durable
// shape without ever completing or overwriting a programmed day.
import { dateKey } from '../dates.js';

const PREFIX = 'session:';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function newStrengthSessionId() {
  return `str_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isOneOffWeek(week) {
  return !!week && typeof week === 'object' && typeof week.sessionId === 'string'
    && (week.sessionKind === 'empty' || week.sessionKind === 'copy');
}

export function activeOneOffSession(state) {
  const key = state?.activeStrengthSessionKey;
  const week = key && state?.weeks?.[key];
  return isOneOffWeek(week) ? { key, week } : null;
}

export function activeWorkoutWeekKey(state) {
  return activeOneOffSession(state)?.key || String(state?.currentWeek || '1');
}

export function activeWorkoutDay(state, fallbackDay) {
  return activeOneOffSession(state)?.week?.sessionDay || fallbackDay;
}

export function clearActiveOneOffSession(state) {
  if (state && state.activeStrengthSessionKey) delete state.activeStrengthSessionKey;
}

/** Remove the active unfinished one-off without touching programmed workouts. */
export function discardActiveOneOffSession(state) {
  const active = activeOneOffSession(state);
  if (!active) return null;
  const day = active.week.sessionDay || null;
  const sessionId = active.week.sessionId;
  delete state.weeks[active.key];
  clearActiveOneOffSession(state);
  return { key: active.key, day, sessionId };
}

function blankCopiedSet(set) {
  const next = clone(set) || {};
  next.c = false;
  delete next.isPR;
  return next;
}

function weekdayForDateKey(localDate) {
  const [year, month, day] = localDate.split('-').map(Number);
  return DAYS[new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()];
}

/**
 * @param {any} state
 * @param {{ kind?:'empty'|'copy', title?:string, sourceWeek?:any, sourceDay?:string,
 * sourceActivityId?:string, now?:Date, tz?:string }} [options]
 */
export function createOneOffStrengthSession(state, options = {}) {
  if (!state.weeks || typeof state.weeks !== 'object') state.weeks = {};
  const now = options.now || new Date();
  const sessionId = newStrengthSessionId();
  const key = `${PREFIX}${sessionId}`;
  const localDate = dateKey(now, options.tz);
  const day = weekdayForDateKey(localDate);
  const sourceLifts = options.sourceWeek?.lifts?.[options.sourceDay] || {};
  const sourceOrder = options.sourceWeek?.liftOrder?.[options.sourceDay];
  const lifts = {};
  for (const [name, sets] of Object.entries(sourceLifts)) {
    if (Array.isArray(sets)) lifts[name] = sets.map(blankCopiedSet);
  }
  const liftOrder = Array.isArray(sourceOrder)
    ? sourceOrder.filter((name) => Object.hasOwn(lifts, name))
    : Object.keys(lifts);
  const kind = options.kind === 'copy' ? 'copy' : 'empty';
  state.weeks[key] = {
    sessionId,
    sessionKind: kind,
    sessionTitle: String(options.title || (kind === 'copy' ? 'Copied Workout' : 'Empty Workout')),
    sessionDay: day,
    sourceActivityId: options.sourceActivityId || null,
    startedAt: now.toISOString(),
    programId: null,
    dates: { [day]: localDate },
    runs: {}, runSessions: {},
    lifts: { [day]: lifts },
    liftOrder: { [day]: liftOrder },
    liftMeta: { [day]: {} },
    notes: { [day]: '' },
    gymRpe: { [day]: '' },
    bodyWeight: {},
    gymStats: { [day]: { time: '', avgHR: '', maxHR: '', cals: '' } },
  };
  state.activeStrengthSessionKey = key;
  return { key, day, sessionId, week: state.weeks[key] };
}

export function oneOffBlueprint(state, fallback = null) {
  const active = activeOneOffSession(state);
  if (!active) return fallback;
  const day = active.week.sessionDay;
  return {
    title: active.week.sessionTitle || 'Workout',
    lifts: Object.keys(active.week.lifts?.[day] || {}),
    runs: 'Rest',
    desc: '',
    oneOff: true,
  };
}
