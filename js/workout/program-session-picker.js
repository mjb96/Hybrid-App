import { classifyPlannedSession, evaluateSessionCompletion } from './completion-policy.js';

export const PROGRAM_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

function performedDayKey(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ''))) return null;
  const parsed = new Date(`${dateISO}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : PROGRAM_DAY_KEYS[(parsed.getDay() + 6) % 7];
}

/** Current-program workouts available to start, retaining source-day identity. */
export function buildProgramSessionChoices(state, program, todayDay) {
  const weekKey = String(state?.currentWeek || '1');
  const week = state?.weeks?.[weekKey] || {};
  return PROGRAM_DAY_KEYS.flatMap((day) => {
    const blueprint = program?.days?.[day];
    const planned = classifyPlannedSession(blueprint);
    if (planned.isRest) return [];
    const completion = evaluateSessionCompletion(state, program, weekKey, day);
    const loggedDate = week.dates?.[day] || null;
    const performedDay = performedDayKey(loggedDate);
    return [{
      day,
      dayLabel: DAY_LABELS[day],
      title: blueprint?.title || planned.label,
      sessionLabel: planned.label,
      isToday: day === todayDay,
      status: completion.finished ? 'complete' : completion.anyLogged ? 'partial' : 'open',
      loggedDate,
      performedDay,
      moved: !!performedDay && performedDay !== day,
      performedLabel: performedDay ? DAY_LABELS[performedDay] : null,
    }];
  });
}

export function rescheduledWorkoutContext(program, sourceDay, todayDay) {
  if (!sourceDay || !todayDay || sourceDay === todayDay) return null;
  const blueprint = program?.days?.[sourceDay];
  if (classifyPlannedSession(blueprint).isRest) return null;
  return {
    title: blueprint?.title || 'Workout',
    sourceDay,
    sourceLabel: DAY_LABELS[sourceDay] || sourceDay,
    todayLabel: DAY_LABELS[todayDay] || todayDay,
  };
}
