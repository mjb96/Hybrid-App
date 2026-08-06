// @ts-check
// =============================================================================
// SHED PPLUL — Push / Pull / Legs / Upper / Lower progression model.
//
// WHY THIS MODULE EXISTS
// A catalog program is a single-week `days{}` template plus `weeklyVolModifiers`,
// and `getWeekModifier` (js/schema.js) returns ONE modifier per week, shared by
// every day. Shed PPLUL runs two main-lift progressions at the same time:
//
//   bench / squat / overhead press   4×8  →  4×6  →  5×4
//   conventional deadlift            3×6  →  3×5  →  4×3
//
// One shared modifier cannot express both, so this module resolves each lift's
// target from (week, day, lift) instead. `liftTarget` in js/engine.js consults it
// for programs declaring `progressionModel: 'shed-pplul'` — the same declarative
// hook Jacked & Tan already uses. Every other program is untouched.
//
// WHAT IT DELIBERATELY IS NOT
// Stored `day.lifts` remain BARE STRINGS and no per-set metadata is persisted, so
// this adds no migration, sync or export surface. It is a pure read-time
// resolver: the roadmap's ADR gate on *normalised per-lift prescriptions*
// (Phase 4C) concerns the stored data shape, which is unchanged here.
//
// NOT SHARED WITH JACKED & TAN. The J&T "Simplified" table is close but wrong
// for this program — its deadlift runs 2×6 in week 4 and 3×4 in weeks 5–7 where
// this spec calls for 2×5 and 3×5, its week 12 is a single set rather than an
// assessment plus two back-off sets, and it anchors main lifts on mon/tue/thu/fri
// rather than mon/wed/fri/sat. Sharing one table would also mean a future edit to
// either program silently changed the other.
// =============================================================================

/** Weeks in the block. */
export const SHED_PPLUL_WEEKS = 12;

/** Declarative hook — mirrors isJtShedProgram. */
export function isShedPplulProgram(program) {
  return program?.progressionModel === 'shed-pplul';
}

/**
 * The lift each training day is built around. Bench, squat and overhead press
 * share the primary progression; the deadlift has its own.
 */
export const MAIN_BY_DAY = Object.freeze({
  mon: 'Barbell Bench Press',
  wed: 'Back Squat',
  fri: 'Standing Barbell Overhead Press',
  sat: 'Conventional Deadlift',
});

/** The lift that follows the deadlift-specific progression. */
export const DEADLIFT = 'Conventional Deadlift';

/**
 * Per-week main-lift prescription.
 *
 * Week 12 is an assessment: ONE controlled set stopping at ~1 RIR, then two
 * back-off sets at ~90% of that load — three sets in total, not one. The goal is
 * a controlled rep PR, never a true 1RM attempt.
 * @type {Record<number, any>}
 */
const WEEK_TABLE = {
  1:  { phase: 'Volume & technique',   rir: '3',   main: { sets: 4, reps: 8 }, deadlift: { sets: 3, reps: 6 } },
  2:  { phase: 'Volume & technique',   rir: '2',   main: { sets: 4, reps: 8 }, deadlift: { sets: 3, reps: 6 } },
  3:  { phase: 'Volume & technique',   rir: '1–2', main: { sets: 4, reps: 8 }, deadlift: { sets: 3, reps: 6 } },
  4:  { phase: 'Deload',               rir: '4+',  deload: true, main: { sets: 2, reps: 8 }, deadlift: { sets: 2, reps: 5 } },
  5:  { phase: 'Strength & hypertrophy', rir: '3', main: { sets: 4, reps: 6 }, deadlift: { sets: 3, reps: 5 } },
  6:  { phase: 'Strength & hypertrophy', rir: '2', main: { sets: 4, reps: 6 }, deadlift: { sets: 3, reps: 5 } },
  7:  { phase: 'Strength & hypertrophy', rir: '1', main: { sets: 4, reps: 6 }, deadlift: { sets: 3, reps: 5 } },
  8:  { phase: 'Deload',               rir: '4+',  deload: true, main: { sets: 2, reps: 6 }, deadlift: { sets: 2, reps: 4 } },
  9:  { phase: 'Intensification',      rir: '3',   main: { sets: 5, reps: 4 }, deadlift: { sets: 4, reps: 3 } },
  10: { phase: 'Intensification',      rir: '2',   main: { sets: 5, reps: 4 }, deadlift: { sets: 4, reps: 3 } },
  11: { phase: 'Intensification',      rir: '1',   main: { sets: 5, reps: 4 }, deadlift: { sets: 4, reps: 3 } },
  12: { phase: 'Controlled rep-PR assessment', rir: '1', assessment: true, main: { sets: 3, reps: 4 }, deadlift: { sets: 3, reps: 3 } },
};

/**
 * The authored session plan — the single source of truth for this program.
 *
 * The catalog entry builds both `days[*].lifts` and the detail view's
 * `dayExercises` from this, so the Structure preview, the day-preview sheet and
 * the workout cockpit cannot drift apart.
 *
 * `sets`/`min`/`max` are the accessory base prescription. Main lifts carry
 * `main: true` and take their sets and reps from WEEK_TABLE instead.
 */
export const DAY_PLAN = Object.freeze({
  mon: {
    title: 'Push', badge: 'Push', color: 'var(--accent-blue)',
    desc: 'Bench-press strength followed by chest, shoulder and triceps hypertrophy. The seated dumbbell press here is a moderate accessory — Friday’s standing barbell overhead press is the main overhead strength movement.',
    minutes: [60, 75],
    exercises: [
      { name: 'Barbell Bench Press', main: true, rest: '2½–4 min', notes: ['Priority movement for the session.', 'Use a consistent setup, controlled descent and a stable touch point.'] },
      { name: 'Incline Dumbbell Press', sets: 3, min: 8, max: 12, rest: '90–120 s', notes: ['Use a moderate incline so the movement stays primarily chest-focused.', 'Target 1–3 RIR.'] },
      { name: 'Seated Dumbbell Shoulder Press', sets: 2, min: 8, max: 12, rest: '90–120 s', notes: ['Set the adjustable bench to approximately 75–80 degrees.', 'Moderate shoulder accessory, not a maximal press. Target 2–3 RIR.'] },
      { name: 'Dumbbell Lateral Raise', sets: 3, min: 12, max: 20, rest: '60–90 s', notes: ['Controlled repetitions — do not swing the dumbbells.'] },
      { name: 'Band Triceps Pushdown', sets: 3, min: 10, max: 15, rest: '60–90 s', notes: ['Keep the upper arms relatively fixed.'] },
      { name: 'Band Face Pull', sets: 2, min: 15, max: 20, rest: '60 s', notes: ['Light rear-delt and upper-back work to balance the pressing.'] },
    ],
    supersets: ['Dumbbell lateral raise with band triceps pushdown', 'Band face pull between accessory sets'],
  },
  tue: {
    title: 'Pull', badge: 'Pull', color: 'var(--accent-green)',
    desc: 'Vertical and horizontal pulling for the lats and upper back, followed by rear delts and direct biceps work. This is the week’s main pull-up session.',
    minutes: [60, 75],
    exercises: [
      { name: 'Pull-Up', sets: 4, min: 5, max: 8, rest: '2–3 min', loadMode: 'bodyweight', notes: ['Use band assistance when required.', 'Once all four sets reach eight clean repetitions, begin adding weight.'] },
      { name: 'Barbell Row', sets: 3, min: 6, max: 10, rest: '2–3 min', notes: ['Maintain a consistent torso position.', 'Do not let the final repetitions become upright rows. Target 2 RIR.'] },
      { name: 'Chest-Supported Dumbbell Row', sets: 3, min: 8, max: 12, rest: '90–120 s', notes: ['Keep the chest against the bench to reduce lower-back fatigue.'] },
      { name: 'Dumbbell Rear-Delt Raise', sets: 3, min: 12, max: 20, rest: '60–90 s', notes: [] },
      { name: 'Band Face Pull', sets: 2, min: 15, max: 20, rest: '60 s', notes: [] },
      { name: 'EZ-Bar Curl', sets: 3, min: 8, max: 12, rest: '60–90 s', notes: [] },
      { name: 'Dumbbell Hammer Curl', sets: 2, min: 10, max: 15, rest: '60–90 s', notes: [] },
    ],
    supersets: ['Rear-delt raise with EZ-bar curl', 'Band face pull with hammer curl'],
  },
  wed: {
    title: 'Legs', badge: 'Legs', color: 'var(--accent-green)',
    desc: 'Back-squat strength followed by balanced lower-body hypertrophy across hamstrings, glutes, quads and calves, finishing with direct core work.',
    minutes: [70, 85],
    exercises: [
      { name: 'Back Squat', main: true, rest: '3–5 min', notes: ['Priority movement for the session.', 'Maintain consistent depth and stop sets before technique deteriorates significantly.'] },
      { name: 'Romanian Deadlift', sets: 3, min: 6, max: 10, rest: '2–3 min', notes: ['Controlled lowering phase; maintain hamstring tension. Target 2–3 RIR.'] },
      { name: 'Dumbbell Bulgarian Split Squat', sets: 3, min: 8, max: 12, rest: '90–150 s', notes: ['Repetitions are per leg.'] },
      { name: 'Dumbbell Lying Leg Curl', sets: 3, min: 10, max: 15, rest: '60–90 s', notes: [] },
      { name: 'Barbell Standing Calf Raise', sets: 4, min: 8, max: 15, rest: '60–90 s', notes: ['Pause briefly at the top and in the stretched position.'] },
      { name: 'Hanging Leg Raise', sets: 3, min: 8, max: 15, rest: '60–90 s', loadMode: 'bodyweight', notes: [] },
    ],
    supersets: ['Standing calf raise with hanging leg raise'],
  },
  fri: {
    title: 'Upper', badge: 'Upper', color: 'var(--accent-amber)',
    desc: 'The main overhead-strength session, with a second weekly chest and back exposure plus direct arm work.',
    minutes: [65, 80],
    exercises: [
      { name: 'Standing Barbell Overhead Press', main: true, rest: '2½–4 min', notes: ['The primary overhead strength movement in the program.', 'Avoid excessive torso lean or turning it into an incline press.'] },
      { name: 'Close-Grip Bench Press', sets: 3, min: 6, max: 10, rest: '2–3 min', notes: ['Narrower than your normal bench grip, but comfortable for wrists and shoulders. Target 2 RIR.'] },
      { name: 'Pull-Up', sets: 3, min: 6, max: 10, rest: '90–150 s', loadMode: 'bodyweight', notes: ['Use pull-ups when recovery and performance are good.', 'Substitute band lat pulldowns at 10–15 repetitions when a lower-fatigue vertical pull is preferable.', 'Keep this below Tuesday’s pull-up volume.'] },
      { name: 'One-Arm Dumbbell Row', sets: 3, min: 8, max: 12, rest: '60–90 s', notes: ['Repetitions are per side.'] },
      { name: 'Dumbbell Lateral Raise', sets: 3, min: 12, max: 20, rest: '60–90 s', notes: [] },
      { name: 'EZ-Bar Skull Crusher', sets: 2, min: 8, max: 12, rest: '60–90 s', notes: ['Use a controlled range and stop if the movement causes elbow discomfort.'] },
      { name: 'EZ-Bar Curl', sets: 2, min: 8, max: 12, rest: '60–90 s', notes: [] },
    ],
    supersets: ['One-arm dumbbell row with dumbbell lateral raise', 'EZ-bar skull crusher with EZ-bar curl'],
  },
  sat: {
    title: 'Lower', badge: 'Lower', color: 'var(--accent-green)',
    desc: 'Deadlift strength on its own progression, followed by a second quad, hamstring and glute exposure. The optional farmer carry should only be performed when it will not compromise recovery.',
    minutes: [65, 80],
    exercises: [
      { name: 'Conventional Deadlift', main: true, rest: '3–5 min', notes: ['Follows the deadlift-specific progression, not the bench/squat/press progression.', 'Reset between repetitions when necessary.', 'The objective is repeatable strength and technique, not conditioning.'] },
      { name: 'Front Squat', sets: 3, min: 6, max: 10, rest: '2–3 min', notes: ['Keep these challenging but avoid grinding after deadlifts. Target 2–3 RIR.'] },
      { name: 'Reverse Lunge', sets: 2, min: 8, max: 12, rest: '90–120 s', notes: ['Dumbbell reverse lunge — repetitions are per leg.'] },
      { name: 'Dumbbell Lying Leg Curl', sets: 3, min: 10, max: 15, rest: '60–90 s', notes: [] },
      { name: 'Seated Dumbbell Calf Raise', sets: 4, min: 12, max: 20, rest: '60–90 s', notes: [] },
      { name: 'Band Kneeling Crunch', sets: 3, min: 10, max: 15, rest: '60–90 s', notes: [] },
      { name: 'Dumbbell Farmer Carry', sets: 3, reps: '30–45s', rest: '45–75 s', optional: true, notes: ['Optional. Perform only when it will not compromise recovery.', '30–45 seconds per set.'] },
    ],
    supersets: ['Dumbbell lying leg curl with seated dumbbell calf raise', 'Band kneeling crunch may be performed between calf-raise sets'],
  },
});

/** Day keys that carry training (the rest days are authored in the catalog). */
export const TRAINING_DAYS = Object.freeze(['mon', 'tue', 'wed', 'fri', 'sat']);

// -----------------------------------------------------------------------------

function _wk(week) {
  const w = Math.floor(Number(week));
  return Number.isFinite(w) && w >= 1 && w <= SHED_PPLUL_WEEKS ? w : null;
}

/** Accessory sets after any deload reduction. */
function _accessorySets(sets, scale) {
  const scaled = Math.round((Number(sets) || 0) * scale);
  return Math.max(1, scaled);
}

/**
 * Public per-week description for the detail view, the Plan timeline and tests.
 * `main` applies to bench/squat/overhead press; `deadlift` is separate.
 */
export function shedPplulWeekPlan(week) {
  const w = _wk(week);
  if (!w) return null;
  const row = WEEK_TABLE[w];
  return {
    week: w,
    phase: row.phase,
    rir: row.rir,
    deload: !!row.deload,
    assessment: !!row.assessment,
    main: { ...row.main },
    deadlift: { ...row.deadlift },
    // Only weeks 4 and 8 halve accessory volume. Week 12's assessment reduces
    // main-lift work but the spec keeps accessories at full volume, so this
    // deliberately differs from the Jacked & Tan table, which scales both.
    accessoryScale: row.deload ? 0.5 : 1,
  };
}

/** The authored entry for a lift on a day, or null when it is not programmed. */
export function shedPplulExercise(dayKey, name) {
  const day = DAY_PLAN[dayKey];
  if (!day) return null;
  return day.exercises.find((exercise) => exercise.name === name) || null;
}

/**
 * Resolve one lift's set/rep target for a given week and day.
 *
 * Returns null for anything this program does not author, so `liftTarget` falls
 * through to its normal description/week-modifier handling — an exercise the
 * athlete adds mid-session must not be silently given a main-lift prescription.
 *
 * @param {any} program
 * @param {number|string} week
 * @param {string} dayKey
 * @param {string} name
 * @returns {{sets:number, reps:number|string, deload:boolean, assessment:boolean, main:boolean}|null}
 */
export function shedPplulLiftTarget(program, week, dayKey, name) {
  if (!isShedPplulProgram(program)) return null;
  const plan = shedPplulWeekPlan(week);
  if (!plan) return null;
  const entry = shedPplulExercise(dayKey, name);
  if (!entry) return null;

  if (entry.main) {
    const target = name === DEADLIFT ? plan.deadlift : plan.main;
    return {
      sets: target.sets,
      reps: target.reps,
      deload: plan.deload,
      assessment: plan.assessment,
      main: true,
    };
  }

  // Accessories hold their authored rep range across the whole block — double
  // progression adds reps within the range, then load. Only the set count moves,
  // and only on a deload.
  const reps = entry.reps != null ? entry.reps : `${entry.min}–${entry.max}`;
  return {
    sets: _accessorySets(entry.sets, plan.accessoryScale),
    reps,
    deload: plan.deload,
    assessment: false,
    main: false,
  };
}

/**
 * Week label for `weeklyVolModifiers`, so the cockpit header, Plan timeline and
 * deload detection (`/deload/i` on the label) all read correctly.
 */
export function shedPplulWeekLabel(week) {
  const plan = shedPplulWeekPlan(week);
  if (!plan) return 'Working Sets';
  const main = `${plan.main.sets}×${plan.main.reps}`;
  const dl = `${plan.deadlift.sets}×${plan.deadlift.reps}`;
  if (plan.assessment) {
    return `Assessment — bench/squat/press ${main} (1 rep-PR set + 2 back-offs @90%) · deadlift ${dl}`;
  }
  const base = `${plan.phase} — bench/squat/press ${main} · deadlift ${dl} · ${plan.rir} RIR`;
  return plan.deload ? `Deload — ${base}` : base;
}

/** weeklyVolModifiers for the catalog entry — main-lift shape, per week. */
export function shedPplulWeeklyVolModifiers() {
  /** @type {Record<string, any>} */
  const mods = {};
  for (let w = 1; w <= SHED_PPLUL_WEEKS; w++) {
    const plan = shedPplulWeekPlan(w);
    mods[String(w)] = {
      sets: plan.main.sets,
      reps: plan.main.reps,
      intensityLabel: shedPplulWeekLabel(w),
    };
  }
  return mods;
}
