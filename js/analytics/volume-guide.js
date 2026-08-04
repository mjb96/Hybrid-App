// @ts-check
// Volume Guide: combines calendar-week logged set credits with the active
// program's projected credits. Generic bands remain descriptive guidance;
// priorities are athlete-owned and never feed readiness or Hybrid Score.

import { muscleCreditsForExercise } from '../exercises/catalog.js';
import { liftTarget } from '../engine.js';
import { getWeekModifier } from '../schema.js';
import { isDeloadWeek } from '../programs/progression.js';
import { buildWeeklyStrengthVolumeDetail } from './strength-volume-detail.js';
import { addDaysISO, localDayKey, weekStartOf } from './weekly-aggregate.js';
import { MUSCLE_LABELS, VOLUME_LANDMARKS, classifyVolume } from './calculations/volume-landmarks.js';

export const MUSCLE_PRIORITY_VALUES = Object.freeze(['grow', 'maintain', 'track']);

/** @param {unknown} value */
export function normaliseMusclePriority(value) {
  return MUSCLE_PRIORITY_VALUES.includes(String(value)) ? String(value) : null;
}

/** @param {string} priority */
export function musclePriorityLabel(priority) {
  if (priority === 'grow') return 'Grow';
  if (priority === 'maintain') return 'Maintain';
  return 'Track only';
}

/** @param {string} muscleId @param {string} priority */
export function volumeReferenceForPriority(muscleId, priority) {
  const landmarks = VOLUME_LANDMARKS[muscleId];
  if (!landmarks || priority === 'track') return null;
  if (priority === 'maintain') {
    return { min: landmarks.mv, max: landmarks.mev, label: 'General maintenance reference' };
  }
  return { min: landmarks.mev, max: landmarks.mav, label: 'General productive reference' };
}

const round1 = (value) => Math.round(Number(value || 0) * 10) / 10;
const fmt = (value) => {
  const n = round1(value);
  return n % 1 ? n.toFixed(1) : String(n);
};

/**
 * Describe one muscle's week against the landmark scale.
 *
 * Zone comes from the shared `classifyVolume` — the SAME five-zone classifier
 * the muscle landmark report uses. This module previously carried a second,
 * weaker set of thresholds of its own, so the guide and the landmark report
 * could describe identical volume differently.
 *
 * The wording states facts and distances, never instructions. These bands are
 * population references, not a personal minimum or a recovery limit, so the
 * guide may say "4 credits below the typical range" but must never say
 * "add 4 sets".
 *
 * @param {{priority:string, landmarks:any, reference:any, logged:{total:number},
 *          planned:{total:number}, remaining:number, deload:boolean,
 *          isCurrentWeek:boolean}} input
 */
export function volumeStatusFor({
  priority, landmarks, reference, logged, planned, remaining, deload, isCurrentWeek,
}) {
  const total = round1(logged.total);
  const zone = classifyVolume(total, landmarks);

  if (priority === 'track') {
    return {
      zone,
      label: 'Tracked only',
      detail: 'No target set — choose Grow or Maintain to compare against a range.',
      tone: 'neutral',
    };
  }
  if (deload && isCurrentWeek) {
    return { zone, label: 'Planned deload', detail: 'Lower volume is the plan this week.', tone: 'neutral' };
  }
  if (total <= 0) {
    return planned.total > 0 && isCurrentWeek
      ? { zone, label: 'Not started', detail: `${fmt(planned.total)} credits scheduled this week.`, tone: 'neutral' }
      : { zone, label: 'No sets logged', detail: 'Nothing logged for this muscle this week.', tone: 'neutral' };
  }
  if (!reference || !landmarks) {
    return { zone, label: 'Logged', detail: `${fmt(total)} set credits.`, tone: 'neutral' };
  }

  const band = `${fmt(reference.min)}–${fmt(reference.max)}`;

  if (total < reference.min) {
    // Scheduled-but-not-yet-done work is the plan working, not a shortfall.
    if (isCurrentWeek && remaining > 0 && round1(total + remaining) >= reference.min) {
      return {
        zone, label: 'On plan',
        detail: `${fmt(remaining)} more credits scheduled this week reach the ${band} typical range.`,
        tone: 'ok',
      };
    }
    return {
      zone, label: 'Below the typical range',
      detail: `${fmt(reference.min - total)} credits below the ${band} typical range.`,
      tone: 'low',
    };
  }
  if (total <= reference.max) {
    return { zone, label: 'In the typical range', detail: `${band} is typical for this muscle.`, tone: 'ok' };
  }
  if (total > landmarks.mrv) {
    return {
      zone, label: 'Above the usual ceiling',
      detail: `${fmt(landmarks.mrv)} credits is the usual weekly ceiling for this muscle.`,
      tone: 'high',
    };
  }
  return {
    zone, label: 'Above the typical range',
    detail: `${band} is typical; ${fmt(landmarks.mrv)} is the usual ceiling.`,
    tone: 'ok',
  };
}

function emptyProjection() {
  return { direct: 0, indirect: 0, total: 0, exercises: new Set(), days: new Set() };
}

/**
 * Project one authored program week using the same liftTarget resolver as the
 * logger. No rep-quality or effort claim is made: this is scheduled set credit.
 * @param {any} program
 * @param {string|number} weekKey
 */
export function projectProgramMuscleCredits(program, weekKey = '1') {
  const modifier = getWeekModifier(program, String(weekKey));
  /** @type {Record<string, ReturnType<typeof emptyProjection>>} */
  const muscles = {};

  for (const [dayKey, day] of Object.entries(program?.days || {})) {
    if (!day || typeof day !== 'object') continue;
    for (const storedName of Array.isArray(day.lifts) ? day.lifts : []) {
      if (typeof storedName !== 'string' || !storedName.trim()) continue;
      const target = liftTarget(day.desc, storedName, modifier, { program, week: weekKey, dayKey });
      const sets = Number.parseInt(String(target.sets), 10);
      if (!(sets > 0)) continue;
      const credits = muscleCreditsForExercise(storedName) || {};
      for (const [muscleId, rawCredit] of Object.entries(credits)) {
        const credit = Number(rawCredit);
        if (!(credit > 0)) continue;
        const row = muscles[muscleId] || (muscles[muscleId] = emptyProjection());
        const amount = sets * credit;
        if (credit >= 1) row.direct += amount;
        else row.indirect += amount;
        row.total += amount;
        row.exercises.add(storedName);
        row.days.add(dayKey);
      }
    }
  }

  return {
    weekKey: String(weekKey),
    deload: isDeloadWeek(modifier),
    muscles: Object.fromEntries(Object.entries(muscles).map(([id, row]) => [id, {
      direct: Math.round(row.direct * 10) / 10,
      indirect: Math.round(row.indirect * 10) / 10,
      total: Math.round(row.total * 10) / 10,
      exercises: [...row.exercises],
      days: [...row.days],
    }])),
  };
}

/**
 * Explicit settings win. Until an athlete makes a choice, directly trained
 * muscles inherit a Grow default from the active program; everything else is
 * tracked without targets.
 */
export function effectiveMusclePriorities(state, projection) {
  const saved = state?.settings?.musclePriorities;
  const explicit = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const result = {};
  for (const muscleId of Object.keys(VOLUME_LANDMARKS)) {
    const selected = normaliseMusclePriority(explicit[muscleId]);
    result[muscleId] = selected || (projection?.muscles?.[muscleId]?.direct > 0 ? 'grow' : 'track');
  }
  return result;
}

/** @param {any} state */
export function hasExplicitMusclePriorities(state) {
  const saved = state?.settings?.musclePriorities;
  return !!(saved && typeof saved === 'object' && Object.values(saved).some(normaliseMusclePriority));
}

/**
 * @param {any} state
 * @param {{program?:any,weekStart?:string,today?:string}} [options]
 */
export function buildVolumeGuideModel(state, options = {}) {
  const today = options.today || localDayKey(new Date());
  const selectedStart = options.weekStart || weekStartOf(today);
  const logged = buildWeeklyStrengthVolumeDetail(state, { weekStart: selectedStart, today });
  const program = options.program || null;
  const projection = logged.isCurrentWeek && program
    ? projectProgramMuscleCredits(program, state?.currentWeek || '1')
    : { weekKey: String(state?.currentWeek || '1'), deload: false, muscles: {} };
  const priorities = effectiveMusclePriorities(state, projection);
  const explicit = state?.settings?.musclePriorities || {};
  const loggedByMuscle = Object.fromEntries(logged.muscles.map((row) => [row.id, row]));

  const muscles = Object.keys(VOLUME_LANDMARKS).map((id) => {
    const actual = loggedByMuscle[id] || { directSets: 0, indirectSets: 0, totalSetCredits: 0, exerciseCredits: [], workoutIds: [] };
    const planned = projection.muscles[id] || { direct: 0, indirect: 0, total: 0, exercises: [], days: [] };
    const priority = priorities[id];
    const landmarks = VOLUME_LANDMARKS[id] || null;
    const reference = volumeReferenceForPriority(id, priority);
    const remaining = Math.max(0, round1(planned.total - actual.totalSetCredits));
    const loggedTotals = {
      direct: actual.directSets || 0,
      indirect: actual.indirectSets || 0,
      total: actual.totalSetCredits || 0,
    };
    const status = volumeStatusFor({
      priority, landmarks, reference, logged: loggedTotals, planned, remaining,
      deload: projection.deload, isCurrentWeek: logged.isCurrentWeek,
    });

    return {
      id,
      name: MUSCLE_LABELS[id] || id,
      priority,
      prioritySource: normaliseMusclePriority(explicit[id]) ? 'athlete' : 'program',
      reference,
      // The FULL landmark scale, not just the highlighted band — so the view can
      // show where MV/MEV/MAV/MRV sit and a very high week reads differently
      // from a merely productive one.
      landmarks,
      zone: status.zone,
      logged: loggedTotals,
      planned,
      remaining,
      status,
      workoutIds: actual.workoutIds || [],
      exerciseCredits: actual.exerciseCredits || [],
    };
  }).filter((row) => row.logged.total > 0 || row.planned.total > 0 || normaliseMusclePriority(explicit[row.id]));

  const focus = muscles.filter((row) => row.priority !== 'track');
  const inRange = focus.filter((row) => row.status.tone === 'ok');
  return {
    weekStart: logged.weekStart,
    weekEnd: logged.weekEnd,
    isCurrentWeek: logged.isCurrentWeek,
    status: logged.status,
    deload: projection.deload,
    muscles,
    summary: {
      loggedCredits: round1(muscles.reduce((sum, row) => sum + row.logged.total, 0)),
      plannedCredits: round1(muscles.reduce((sum, row) => sum + row.planned.total, 0)),
      focusCount: focus.length,
      // "In range or on plan" replaces the old "Covered", which counted any
      // muscle at or above the band's floor — including one sitting far above
      // its usual ceiling.
      inRangeCount: inRange.length,
      belowCount: focus.filter((row) => row.status.tone === 'low').length,
      aboveCount: focus.filter((row) => row.status.tone === 'high').length,
      // Muscles with nothing logged yet. Counted separately so the four
      // buckets always sum to focusCount — a partial week must not read as if
      // untouched muscles had silently failed a target.
      notStartedCount: focus.filter((row) => row.status.tone === 'neutral').length,
      scheduledCount: focus.filter((row) => row.remaining > 0 && row.planned.total > 0).length,
    },
  };
}

/** @param {any} state @param {string} muscleId @param {{weekStart?:string,weeks?:number,program?:any,today?:string}} [options] */
export function muscleVolumeCorridor(state, muscleId, options = {}) {
  const weeks = Math.max(2, options.weeks || 8);
  const today = options.today || localDayKey(new Date());
  const end = options.weekStart || weekStartOf(today);
  const current = buildVolumeGuideModel(state, { weekStart: end, today, program: options.program });
  const selected = current.muscles.find((row) => row.id === muscleId);
  const points = Array.from({ length: weeks }, (_, index) => {
    const weekStart = addDaysISO(end, (index - weeks + 1) * 7);
    const week = buildWeeklyStrengthVolumeDetail(state, { weekStart, today });
    return {
      weekStart,
      value: week.muscles.find((row) => row.id === muscleId)?.totalSetCredits || 0,
    };
  });
  return {
    muscleId,
    priority: selected?.priority || 'track',
    reference: selected?.reference || null,
    planned: current.isCurrentWeek ? selected?.planned?.total || 0 : 0,
    points,
  };
}
