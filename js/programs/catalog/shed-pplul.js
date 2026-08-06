// @ts-check
// =============================================================================
// SHED PPLUL — Push / Pull / Legs / Upper / Lower.
//
// Standard catalog shape (days{} + weeklyVolModifiers{}) so activation, the
// cockpit, day preview, persistence and analytics treat it exactly like every
// other program. day.lifts stay BARE STRINGS.
//
// The per-week/per-lift maths lives in ../shed-pplul-model.js because this
// program runs two main-lift progressions at once (bench/squat/press vs
// deadlift) and one shared week modifier cannot express both. `days` and
// `dayExercises` below are BUILT from that model's DAY_PLAN, so the Structure
// preview, the day-preview sheet and the logger cannot drift apart.
// =============================================================================
import {
  DAY_PLAN, TRAINING_DAYS, MAIN_BY_DAY, DEADLIFT,
  shedPplulWeeklyVolModifiers, shedPplulWeekPlan,
} from '../shed-pplul-model.js';

const accent = '#f97316';
const RM = 'Rest';

const restDay = (title, desc) => ({
  title, badge: 'Recovery', color: 'var(--text-muted)', desc, runs: RM, lifts: [],
});

/** days{} built from the authored plan — one source of truth for both. */
const days = (() => {
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of TRAINING_DAYS) {
    const day = DAY_PLAN[key];
    out[key] = {
      title: day.title,
      badge: day.badge,
      color: day.color,
      desc: day.desc,
      runs: RM,
      lifts: day.exercises.map((exercise) => exercise.name),
    };
  }
  out.thu = restDay(
    'Rest',
    'Recovery day. Optional easy walking for 20–40 minutes, light mobility, gentle cycling or normal daily movement. Keep this a recovery day rather than another demanding workout.',
  );
  out.sun = restDay('Rest', 'No programmed training. Easy walking and normal daily activity are encouraged.');
  return out;
})();

/** Detail-view metadata, order-aligned with days[*].lifts. */
const dayExercises = (() => {
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const key of TRAINING_DAYS) {
    out[key] = DAY_PLAN[key].exercises.map((exercise) => ({
      name: exercise.name,
      tier: exercise.main ? (exercise.name === DEADLIFT ? 'Main — deadlift progression' : 'Main — primary progression') : 'Accessory',
      progression: exercise.main
        ? (exercise.name === DEADLIFT ? 'Deadlift-specific weekly progression' : 'Primary-lift weekly progression')
        : 'Double progression within the repetition range',
      rest: exercise.rest || '',
      optional: !!exercise.optional,
      notes: exercise.notes || [],
    }));
  }
  return out;
})();

const PROGRAM_NOTES = [
  'Warm-up sets are not included in the listed working sets.',
  'Three progressions run at once. Bench press, back squat and standing overhead press share the primary-lift progression; the conventional deadlift follows its own; everything else uses double progression.',
  'Primary-lift progression: 4×8 in weeks 1–3, 4×6 in weeks 5–7 and 5×4 in weeks 9–11, with the target RIR falling within each block.',
  'Deadlift progression: 3×6 in weeks 1–3, 3×5 in weeks 5–7 and 4×3 in weeks 9–11.',
  'Deload weeks 4 and 8: use the stated deload prescription, reduce accessory sets by approximately 50%, reduce accessory loads where necessary, keep at least 4 RIR and do not attempt rep PRs.',
  'Deload loading: reduce the previous week’s working weight by approximately 10–15%.',
  'Week 12 is an assessment. Perform one controlled set stopping at approximately 1 RIR, then two back-off sets at approximately 90% of that load. The goal is a controlled rep PR, not a one-repetition maximum attempt.',
  'Secondary compound double progression: choose a weight allowing about eight controlled repetitions at the required RIR, add repetitions over subsequent workouts, and once every set reaches the top of the range with good technique, increase the weight and return to the bottom of the range.',
  'For barbell exercises increase load conservatively. For dumbbell exercises keep adding repetitions when the next available dumbbell increment is too large.',
  'Pull-up progression: begin band-assisted or bodyweight and build toward four sets of eight clean repetitions on Tuesday. Once achieved, add a small amount of weight and rebuild from about four sets of five. Friday’s vertical pull stays slightly lower in volume than Tuesday’s.',
  'Isolation work: stay within the listed repetition range, add repetitions before adding weight or band resistance, and keep most sets at approximately 1–3 RIR. The final set may occasionally reach 0–1 RIR when technique remains controlled.',
  'RIR means repetitions in reserve: 3 RIR means about three clean repetitions remained; 1 RIR is very hard with one clean repetition probably available.',
  'Approximate weekly volume: chest 10 sets; back and lats 16–18; quadriceps 12; hamstrings and glutes 12; side and rear delts 11–13; biceps 7; triceps 7; calves 8; core 6.',
];

const WEEK_NOTES = (() => {
  /** @type {Record<string, any>} */
  const out = {};
  for (let w = 1; w <= 12; w++) {
    const plan = shedPplulWeekPlan(w);
    const notes = [
      `Bench, squat and overhead press: ${plan.main.sets}×${plan.main.reps}. Deadlift: ${plan.deadlift.sets}×${plan.deadlift.reps}.`,
    ];
    if (plan.deload) {
      notes.push('Reduce the previous week’s working weight by approximately 10–15%.');
      notes.push('Halve accessory sets and keep at least 4 RIR. Do not attempt rep PRs.');
    } else if (plan.assessment) {
      notes.push('One controlled set stopping at approximately 1 RIR, then two back-off sets at approximately 90% of that load.');
      notes.push('A controlled rep PR is the goal — do not attempt a true one-repetition maximum.');
    } else {
      notes.push(`Target approximately ${plan.rir} RIR on the main lifts.`);
    }
    out[String(w)] = { label: plan.phase, notes };
  }
  return out;
})();

/** @type {any[]} */
const shedPplulPrograms = [
  {
    id: 'shed_pplul',
    name: 'Shed PPLUL',
    tagline: 'Push, Pull, Legs, Upper, Lower — five days, three progressions',
    description: 'A five-day push/pull/legs/upper/lower block for intermediate lifters. Bench press, back squat and standing overhead press share a primary-lift progression while the deadlift runs its own, and every accessory uses double progression. Twelve weeks with deloads in weeks 4 and 8 and a controlled rep-PR assessment in week 12.',
    author: { name: 'Helyx', type: 'community', verified: false },
    category: 'hypertrophy',
    subcategory: 'strength-hypertrophy',
    tags: ['intermediate', 'strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity', 'home-gym', 'ppl', 'pplul', '5-day'],
    durationWeeks: 12,
    sessionsPerWeek: 5,
    sessionDurationMinutes: { min: 60, max: 85 },
    difficulty: 'intermediate',
    equipment: ['barbell', 'ez-bar', 'rack', 'bench', 'dumbbells', 'bands', 'pullup-bar'],
    equipmentTier: 'home-gym',
    goals: ['strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity'],
    metrics: { strengthEmphasis: 75, hypertrophyEmphasis: 90, enduranceEmphasis: 5, conditioningEmphasis: 20, recoveryDemand: 70, weeklyVolumeScore: 85 },
    highlights: [
      'Push / Pull / Legs / Upper / Lower across five days',
      'Separate deadlift progression, not a shared main-lift wave',
      'Deloads in weeks 4 and 8, rep-PR assessment in week 12',
      'Home-gym equipment only',
    ],
    expectedOutcomes: [
      'Stronger bench press, squat, overhead press and deadlift',
      'Balanced muscle gain across chest, back, shoulders, arms and legs',
      'Improved body composition and work capacity',
    ],
    popularity: 55, rating: 0, ratingCount: 0, completionRate: 0, enrolledCount: 0,
    featured: false, verified: false, isNew: true,
    coverGradient: ['#2a1405', '#3d2208'], accentColor: accent, icon: '🔁',
    collections: ['hypertrophy-collection', 'home-gym'],
    days,
    weeklyVolModifiers: shedPplulWeeklyVolModifiers(),
    // ── Additive metadata (ignored by consumers that do not know it) ─────────
    programNotes: PROGRAM_NOTES,
    weekNotes: WEEK_NOTES,
    dayExercises,
    trainingMaxLifts: [MAIN_BY_DAY.mon, MAIN_BY_DAY.wed, MAIN_BY_DAY.fri, DEADLIFT],
    progressionModel: 'shed-pplul',
    dossier: {
      creator: 'Helyx',
      focus: 'Strength + Hypertrophy (home gym)',
      philosophy: 'Give every session one clear job. Push builds the bench, chest, shoulders and triceps; Pull builds the lats, upper back, rear delts and biceps; Legs prioritises the squat; Upper prioritises overhead pressing with a second chest and back exposure; Lower prioritises the deadlift with a second lower-body exposure. Pressing and pulling volume is spread across sessions rather than concentrated into one oversized workout.',
    },
  },
];

export default shedPplulPrograms;
