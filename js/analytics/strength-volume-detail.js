// @ts-check
// Calendar-week strength evidence model. This is the detail-side companion to
// buildWeekChart: dates decide attribution, future records are excluded from a
// live week, aliases merge through the canonical catalogue, and every aggregate
// retains the exact persisted workout IDs that contributed to it.

import { addDaysISO, DAY_KEYS, indexSlotsByDate, localDayKey, weekStartOf } from './weekly-aggregate.js';
import { comparePeriodValues } from './comparison.js';
import { isValidWorkingSet, setVolume } from '../set-utils.js';
import { muscleCreditsForExercise, resolveExercise } from '../exercises/catalog.js';

const DAY_LABELS = Object.freeze({
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
});

/** @param {string} value */
function parseDurationSeconds(value) {
  if (!value) return 0;
  const parts = String(value).split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Math.max(0, parts[0] || 0);
}

/** @param {string} weekKey @param {string} day @param {string|null} sessionId */
function strengthActivityId(weekKey, day, sessionId) {
  return sessionId
    ? `strength:${sessionId}`
    : `strength:${encodeURIComponent(weekKey)}:${day}`;
}

function emptyTotals() {
  return { volumeKg: 0, workingSets: 0, reps: 0, durationSeconds: 0 };
}

/** @param {ReturnType<typeof emptyTotals>} target @param {ReturnType<typeof emptyTotals>} value */
function addTotals(target, value) {
  target.volumeKg += value.volumeKg;
  target.workingSets += value.workingSets;
  target.reps += value.reps;
  target.durationSeconds += value.durationSeconds;
}

/**
 * Summarise a Monday-based strength period while retaining evidence rows.
 * @param {any} state
 * @param {string} weekStart
 * @param {{today:string, elapsedDays:number, index:ReturnType<typeof indexSlotsByDate>}} options
 */
function summariseWeek(state, weekStart, { today, elapsedDays, index }) {
  const totals = emptyTotals();
  const exerciseMap = new Map();
  const muscleMap = new Map();
  const workouts = [];
  const days = DAY_KEYS.map((dayKey, dayIndex) => ({
    dayKey,
    label: DAY_LABELS[dayKey],
    date: addDaysISO(weekStart, dayIndex),
    ...emptyTotals(),
    workoutCount: 0,
    exerciseCount: 0,
  }));

  for (let dayIndex = 0; dayIndex < DAY_KEYS.length; dayIndex++) {
    if (dayIndex >= elapsedDays) break;
    const day = days[dayIndex];
    if (day.date > today && weekStart === weekStartOf(today)) continue;
    const slots = index.allByDate?.get(day.date)
      || (index.byDate.get(day.date) ? [index.byDate.get(day.date)] : []);

    for (const slot of slots) {
      if (!slot?.lifts || slot.stats.workingSets <= 0) continue;
      const storedWeek = state?.weeks?.[slot.weekKey] || {};
      const workoutTotals = emptyTotals();
      workoutTotals.durationSeconds = parseDurationSeconds(slot.gymStats?.time);
      const workoutExercises = [];

      for (const [storedName, sets] of Object.entries(slot.lifts)) {
        if (!Array.isArray(sets)) continue;
        const workingSets = sets.filter(isValidWorkingSet);
        if (!workingSets.length) continue;

        const canonical = resolveExercise(storedName);
        const id = canonical?.id || `custom:${storedName}`;
        const name = canonical?.name || storedName;
        const exTotals = workingSets.reduce((sum, set) => {
          sum.workingSets++;
          sum.reps += parseInt(set?.r, 10) || 0;
          sum.volumeKg += setVolume(set);
          return sum;
        }, emptyTotals());
        addTotals(workoutTotals, exTotals);

        let exercise = exerciseMap.get(id);
        if (!exercise) {
          exercise = {
            id, name, storedNames: new Set(), ...emptyTotals(),
            workoutIds: new Set(), dates: new Set(),
          };
          exerciseMap.set(id, exercise);
        }
        exercise.storedNames.add(storedName);
        exercise.workoutIds.add(strengthActivityId(slot.weekKey, slot.day, slot.sessionId));
        exercise.dates.add(day.date);
        addTotals(exercise, exTotals);
        workoutExercises.push({ id, name, ...exTotals });

        const credits = muscleCreditsForExercise(storedName) || {};
        for (const [muscleId, credit] of Object.entries(credits)) {
          let muscle = muscleMap.get(muscleId);
          if (!muscle) {
            muscle = {
              id: muscleId,
              directSets: 0,
              indirectSets: 0,
              totalSetCredits: 0,
              exerciseIds: new Set(),
              exerciseCredits: new Map(),
              workoutIds: new Set(),
            };
            muscleMap.set(muscleId, muscle);
          }
          const setCredit = exTotals.workingSets * Number(credit || 0);
          if (credit >= 1) muscle.directSets += setCredit;
          else muscle.indirectSets += setCredit;
          muscle.totalSetCredits += setCredit;
          muscle.exerciseIds.add(id);
          muscle.workoutIds.add(strengthActivityId(slot.weekKey, slot.day, slot.sessionId));
          let exerciseCredit = muscle.exerciseCredits.get(id);
          if (!exerciseCredit) {
            exerciseCredit = { id, name, directSets: 0, indirectSets: 0, totalSetCredits: 0 };
            muscle.exerciseCredits.set(id, exerciseCredit);
          }
          if (credit >= 1) exerciseCredit.directSets += setCredit;
          else exerciseCredit.indirectSets += setCredit;
          exerciseCredit.totalSetCredits += setCredit;
        }
      }

      if (!workoutTotals.workingSets) continue;
      const workout = {
        id: strengthActivityId(slot.weekKey, slot.day, slot.sessionId),
        date: day.date,
        dayKey: day.dayKey,
        title: slot.sessionTitle || storedWeek.sessionTitle || 'Strength Workout',
        status: storedWeek.sessionStatus?.[slot.day] || null,
        weekKey: slot.weekKey,
        sourceDay: slot.day,
        exercises: workoutExercises.sort((a, b) => b.volumeKg - a.volumeKg),
        ...workoutTotals,
      };
      workouts.push(workout);
      day.workoutCount++;
      day.exerciseCount += workoutExercises.length;
      addTotals(day, workoutTotals);
      addTotals(totals, workoutTotals);
    }
  }

  const exercises = [...exerciseMap.values()]
    .map((item) => ({
      ...item,
      storedNames: [...item.storedNames],
      workoutIds: [...item.workoutIds],
      dates: [...item.dates].sort(),
      workoutCount: item.workoutIds.size,
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg || b.workingSets - a.workingSets || a.name.localeCompare(b.name));
  const muscles = [...muscleMap.values()]
    .map((item) => ({
      ...item,
      exerciseIds: [...item.exerciseIds],
      exerciseCredits: [...item.exerciseCredits.values()]
        .sort((a, b) => b.totalSetCredits - a.totalSetCredits || a.name.localeCompare(b.name)),
      workoutIds: [...item.workoutIds],
    }))
    .sort((a, b) => b.totalSetCredits - a.totalSetCredits || a.id.localeCompare(b.id));

  return {
    totals,
    days,
    workouts: workouts.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    exercises,
    muscles,
  };
}

/**
 * @param {any} state
 * @param {{weekStart?:string,today?:string,tz?:string}} [options]
 */
export function buildWeeklyStrengthVolumeDetail(state, options = {}) {
  const today = options.today || localDayKey(new Date(), options.tz);
  const currentWeekStart = weekStartOf(today);
  const weekStart = options.weekStart || currentWeekStart;
  const isCurrentWeek = weekStart === currentWeekStart;
  const elapsedDays = isCurrentWeek
    ? Math.max(1, Math.min(7, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${weekStart}T12:00:00Z`)) / 86400000) + 1))
    : 7;
  const index = indexSlotsByDate(state, { tz: options.tz });
  const selected = summariseWeek(state, weekStart, { today, elapsedDays, index });
  const previousStart = addDaysISO(weekStart, -7);
  const previous = summariseWeek(state, previousStart, { today, elapsedDays, index });
  const hasPreviousEvidence = [...index.byDate.keys()].some((date) => date < weekStart);

  return {
    weekStart,
    weekEnd: addDaysISO(weekStart, 6),
    today,
    isCurrentWeek,
    status: isCurrentWeek ? 'In progress' : 'Completed week',
    elapsedDays,
    ...selected,
    comparison: comparePeriodValues({
      currentValue: selected.totals.volumeKg,
      previousValue: hasPreviousEvidence ? previous.totals.volumeKg : null,
      isCurrentWeek,
    }),
    comparisonPeriod: {
      start: previousStart,
      end: addDaysISO(previousStart, elapsedDays - 1),
      ...previous,
    },
    excludedFutureRecords: isCurrentWeek
      ? [...index.allByDate.keys()].filter((date) => date > today && date <= addDaysISO(weekStart, 6)).length
      : 0,
    undatedRecords: index.undated.length,
  };
}
