// @ts-check
// =============================================================================
// SHED PPLUL — performance-based Push / Pull / Legs / Upper / Lower model.
//
// The program repeats stable set/rep ranges while the athlete progresses reps,
// load and execution from actual performance. The catalog's one shared weekly
// modifier cannot express the different prescriptions used on the same day, so
// `liftTarget` resolves each authored lift here at read time. Stored day.lifts
// remain bare strings; no per-set prescription data is persisted.
// =============================================================================

/** A renewable app window containing three four-week review cycles. */
export const SHED_PPLUL_WEEKS = 12;

/** Declarative hook used by the workout engine. */
export function isShedPplulProgram(program) {
  return program?.progressionModel === 'shed-pplul';
}

/** The priority lift for each main strength day. */
export const MAIN_BY_DAY = Object.freeze({
  mon: 'Barbell Bench Press',
  wed: 'Back Squat',
  fri: 'Standing Barbell Overhead Press',
  sat: 'Paused Conventional Deadlift',
});

/** The deliberately paused deadlift variation used by this program. */
export const DEADLIFT = 'Paused Conventional Deadlift';

/**
 * Authored session plan. `sets` plus `min`/`max` (or `reps`) are the exact
 * working-set prescriptions shown by preview and materialised by the cockpit.
 */
export const DAY_PLAN = Object.freeze({
  mon: {
    title: 'Push', badge: 'Push', color: 'var(--accent-blue)',
    desc: 'Bench press is the priority lift. Keep most bench work around 1–3 RIR. Incline and seated dumbbell pressing add chest, shoulder and triceps volume without turning Monday into another maximal overhead-press session.',
    minutes: [60, 80],
    exercises: [
      { name: 'Barbell Bench Press', main: true, sets: 4, min: 6, max: 8, rest: '2½–4 min', notes: ['Priority lift. Keep most work around 1–3 RIR.', 'Add load only after all four sets reach eight clean repetitions with approximately 1–2 RIR on the final set.'] },
      { name: 'Incline Dumbbell Press', sets: 3, min: 8, max: 12, rest: '90–120 s', notes: ['Use double progression and keep most productive sets around 1–2 RIR.'] },
      { name: 'Seated Dumbbell Shoulder Press', sets: 2, min: 8, max: 12, rest: '90–120 s', notes: ['Additional shoulder and triceps volume, not a maximal press.'] },
      { name: 'Dumbbell Lateral Raise', sets: 3, min: 12, max: 20, rest: '60–90 s', notes: ['Controlled repetitions; occasional 0–1 RIR is acceptable when technique stays sound.'] },
      { name: 'Band Triceps Pushdown', sets: 3, min: 10, max: 20, rest: '60–90 s', notes: ['Add repetitions before increasing band resistance.'] },
      { name: 'Band Face Pull', sets: 2, min: 15, max: 20, rest: '60 s', notes: ['Keep the movement controlled and shoulder-friendly.'] },
    ],
  },
  tue: {
    title: 'Pull', badge: 'Pull', color: 'var(--accent-green)',
    desc: 'The main vertical- and horizontal-pulling session. Keep barbell-row technique strict enough that lower-back fatigue does not compromise Wednesday squats and Romanian deadlifts. Chest-supported rows add back volume at a lower fatigue cost.',
    minutes: [60, 75],
    exercises: [
      { name: 'Pull-Up', sets: 4, min: 5, max: 8, rest: '2–3 min', loadMode: 'bodyweight', notes: ['Use band assistance when needed; add load after four clean sets of eight.'] },
      { name: 'Barbell Row', sets: 3, min: 6, max: 10, rest: '2–3 min', notes: ['Keep technique strict enough to protect Wednesday lower-body performance.'] },
      { name: 'Chest-Supported Dumbbell Row', sets: 2, min: 8, max: 12, rest: '90–120 s', notes: ['Keep the chest supported to limit lower-back fatigue.'] },
      { name: 'Dumbbell Rear-Delt Raise', sets: 2, min: 12, max: 20, rest: '60–90 s', notes: [] },
      { name: 'EZ-Bar Curl', sets: 3, min: 8, max: 12, rest: '60–90 s', notes: [] },
      { name: 'Dumbbell Hammer Curl', sets: 2, min: 10, max: 15, rest: '60–90 s', notes: [] },
    ],
  },
  wed: {
    title: 'Legs', badge: 'Legs', color: 'var(--accent-green)',
    desc: 'Back squat is the priority. Romanian deadlifts provide the main hip-hinge and hamstring stimulus. Two hard Bulgarian split-squat sets are the starting dose because another lower-body session follows later in the week.',
    minutes: [65, 85],
    exercises: [
      { name: 'Back Squat', main: true, sets: 4, min: 6, max: 8, rest: '3–5 min', notes: ['Priority lift. Keep approximately 1–3 RIR and avoid unnecessary grinding.', 'Add load only after all four sets reach eight clean repetitions with approximately 1–2 RIR on the final set.'] },
      { name: 'Romanian Deadlift', sets: 3, min: 6, max: 10, rest: '2–3 min', notes: ['Use a controlled hinge and maintain hamstring tension.'] },
      { name: 'Dumbbell Bulgarian Split Squat', sets: 2, min: 8, max: 12, rest: '90–150 s', notes: ['Repetitions are per leg. Add volume only when progression and recovery support it.'] },
      { name: 'Dumbbell Lying Leg Curl', sets: 3, min: 10, max: 15, rest: '60–90 s', notes: [] },
      { name: 'Barbell Standing Calf Raise', sets: 3, min: 8, max: 15, rest: '60–90 s', notes: [] },
      { name: 'Hanging Leg Raise', sets: 3, min: 8, max: 15, rest: '60–90 s', loadMode: 'bodyweight', notes: [] },
    ],
  },
  fri: {
    title: 'Upper', badge: 'Upper', color: 'var(--accent-amber)',
    desc: 'Standing overhead press is the main overhead-strength movement. Paused bench supplies a second weekly bench exposure for technique and hypertrophy; keep it controlled rather than turning it into another maximal bench session.',
    minutes: [65, 85],
    exercises: [
      { name: 'Standing Barbell Overhead Press', main: true, sets: 3, min: 6, max: 8, rest: '2½–4 min', notes: ['Main overhead-strength movement. Progress after three clean sets of eight with appropriate RIR.'] },
      { name: 'Paused Barbell Bench Press', sets: 3, min: 6, max: 8, rest: '2–3 min', notes: ['Pause under control on the chest and keep this below maximal effort.'] },
      { name: 'Pull-Up', sets: 3, min: 6, max: 10, rest: '90–150 s', loadMode: 'bodyweight', notes: ['Keep this lower in volume than Tuesday’s pull-up work.'] },
      { name: 'One-Arm Dumbbell Row', sets: 3, min: 8, max: 12, rest: '60–90 s', notes: ['Repetitions are per side.'] },
      { name: 'Dumbbell Lateral Raise', sets: 3, min: 12, max: 20, rest: '60–90 s', notes: [] },
      { name: 'EZ-Bar Skull Crusher', sets: 3, min: 8, max: 12, rest: '60–90 s', notes: ['Use a controlled range and stop if the movement irritates the elbows.'] },
      { name: 'EZ-Bar Curl', sets: 2, min: 8, max: 12, rest: '60–90 s', notes: [] },
    ],
  },
  sat: {
    title: 'Lower', badge: 'Lower', color: 'var(--accent-green)',
    desc: 'Paused conventional deadlifts make moderate available loads challenging while retaining deadlift specificity. Pause for one to two seconds just off the floor or around lower-shin height. Farmer carries are optional and should be removed if they interfere with recovery.',
    minutes: [65, 85],
    exercises: [
      { name: 'Paused Conventional Deadlift', main: true, sets: 3, min: 5, max: 8, rest: '3–5 min', notes: ['Pause for one to two seconds just off the floor or around lower-shin height.', 'Progress through cleaner pauses, bar speed, repetitions, lower RPE and load when available; do not use excessively high-repetition deadlift sets.'] },
      { name: 'Front Squat', sets: 3, min: 6, max: 10, rest: '2–3 min', notes: ['Keep repetitions controlled after deadlifts.'] },
      { name: 'Reverse Lunge', sets: 2, min: 8, max: 12, rest: '90–120 s', notes: ['Use dumbbells; repetitions are per leg.'] },
      { name: 'Dumbbell Lying Leg Curl', sets: 2, min: 10, max: 15, rest: '60–90 s', notes: [] },
      { name: 'Seated Dumbbell Calf Raise', sets: 3, min: 12, max: 20, rest: '60–90 s', notes: [] },
      { name: 'Band Kneeling Crunch', sets: 3, min: 10, max: 15, rest: '60–90 s', notes: [] },
      { name: 'Dumbbell Farmer Carry', sets: 2, reps: '30–45s', rest: '45–75 s', optional: true, notes: ['Optional. Remove it if it meaningfully interferes with recovery.'] },
    ],
  },
});

/** Day keys that carry lifting. */
export const TRAINING_DAYS = Object.freeze(['mon', 'tue', 'wed', 'fri', 'sat']);

function _wk(week) {
  const w = Math.floor(Number(week));
  return Number.isFinite(w) && w >= 1 && w <= SHED_PPLUL_WEEKS ? w : null;
}

/** Stable prescriptions plus a non-prescriptive four-week review checkpoint. */
export function shedPplulWeekPlan(week) {
  const w = _wk(week);
  if (!w) return null;
  const review = w % 4 === 0;
  return {
    week: w,
    phase: review ? 'Review performance and recovery' : 'Performance-based progression',
    rir: '1–3',
    review,
    deload: false,
    assessment: false,
    benchSquat: { sets: 4, reps: '6–8' },
    press: { sets: 3, reps: '6–8' },
    deadlift: { sets: 3, reps: '5–8' },
    accessoryScale: 1,
  };
}

/** The authored entry for a lift on a day, or null when it is not programmed. */
export function shedPplulExercise(dayKey, name) {
  const day = DAY_PLAN[dayKey];
  if (!day) return null;
  return day.exercises.find((exercise) => exercise.name === name) || null;
}

/**
 * Resolve one authored lift's stable set/rep target. An exercise added or
 * swapped mid-session returns null and follows the engine's normal fallback.
 */
export function shedPplulLiftTarget(program, week, dayKey, name) {
  if (!isShedPplulProgram(program) || !shedPplulWeekPlan(week)) return null;
  const entry = shedPplulExercise(dayKey, name);
  if (!entry) return null;
  const reps = entry.reps != null ? entry.reps : `${entry.min}–${entry.max}`;
  return {
    sets: entry.sets,
    reps,
    deload: false,
    assessment: false,
    main: !!entry.main,
  };
}

/** Label used by the cockpit header and Plan timeline. */
export function shedPplulWeekLabel(week) {
  const plan = shedPplulWeekPlan(week);
  if (!plan) return 'Performance-based progression';
  const base = 'Performance-based · bench/squat 4×6–8 · press 3×6–8 · paused deadlift 3×5–8';
  return plan.review ? `Review checkpoint · ${base}` : base;
}

/** Shared modifiers remain populated for schema consumers; per-lift targets win. */
export function shedPplulWeeklyVolModifiers() {
  /** @type {Record<string, any>} */
  const mods = {};
  for (let w = 1; w <= SHED_PPLUL_WEEKS; w++) {
    mods[String(w)] = {
      sets: 4,
      reps: '6–8',
      intensityLabel: shedPplulWeekLabel(w),
    };
  }
  return mods;
}
