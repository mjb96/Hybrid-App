// @ts-check
// =============================================================================
// SHED PPLUL — Push / Pull / Legs / Upper / Lower.
//
// Standard catalog shape (days{} + weeklyVolModifiers{}) so activation, the
// cockpit, day preview, persistence and analytics treat it exactly like every
// other program. day.lifts stay BARE STRINGS.
//
// The per-lift prescriptions live in ../shed-pplul-model.js because one shared
// week modifier cannot express every exercise's set and repetition range. `days` and
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
    'Active Recovery',
    '45–60 minutes of easy walking on a flat treadmill, outdoors or through similarly easy aerobic work. Stay at a conversational pace and avoid meaningful fatigue for Friday and Saturday.',
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
      tier: exercise.main ? 'Priority lift' : (exercise.optional ? 'Optional accessory' : 'Accessory'),
      progression: exercise.main
        ? 'Performance-based double progression within the repetition range'
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
  'This is an ongoing performance-based block. The app presents a renewable 12-week window with review checkpoints every four weeks; prescriptions do not change automatically from week to week.',
  'Bench press and back squat use 4×6–8. Standing overhead press uses 3×6–8. Paused conventional deadlift uses 3×5–8.',
  'Keep the same load while total repetitions and repeated-set performance improve. Add the smallest practical increment only after every set reaches the top of its range with good technique and the final set retains approximately 1–2 RIR.',
  'Paused-deadlift progress may also come from cleaner one-to-two-second pauses, better bar speed, more repetitions, lower RPE and improved technique when additional plates are unavailable. Do not compensate with excessively high-repetition deadlift sets.',
  'Accessories use double progression: add repetitions within the range, then increase load and rebuild from the lower end. When a dumbbell jump is too large, continue progressing repetitions first.',
  'Main compound lifts generally stay at 1–3 RIR. Secondary compounds and hypertrophy work generally finish around 1–2 RIR. Isolation work may occasionally reach 0–1 RIR when technique and joint tolerance remain good.',
  'Do not deload automatically. Review fatigue every three to four weeks and reduce volume by approximately 30–50% only when repeated performance decline, persistent irritation, unusually high effort, prolonged soreness, poor session quality, systemic fatigue or worsening recovery indicate it.',
  'Pull-ups progress from assistance or bodyweight toward the top of the range, then add a small amount of weight and rebuild. Friday stays lower in volume than Tuesday.',
  'Thursday is 45–60 minutes of conversational-pace walking. Add a second easy walk when recovery is good; avoid hard running or intervals while strength and hypertrophy remain the priority.',
  'RIR means repetitions in reserve: 3 RIR means about three clean repetitions remained; 1 RIR is very hard with one clean repetition probably available.',
  'Current reference points: bench press 90 kg for four sets of six and 85 kg for 8, 8, 8, 6; back squat 100 kg for four sets of six; historical deadlift one-repetition maximum 200 kg, with current loading limited by available plates.',
];

const WEEK_NOTES = (() => {
  /** @type {Record<string, any>} */
  const out = {};
  for (let w = 1; w <= 12; w++) {
    const plan = shedPplulWeekPlan(w);
    const notes = [
      `Bench and squat: ${plan.benchSquat.sets}×${plan.benchSquat.reps}. Standing overhead press: ${plan.press.sets}×${plan.press.reps}. Paused deadlift: ${plan.deadlift.sets}×${plan.deadlift.reps}.`,
      'Progress repetitions, load and execution from actual performance; do not force a weekly load increase.',
    ];
    if (plan.review) {
      notes.push('Review strength and rep progression, RPE/RIR trends, repeated-set performance, soreness, joint tolerance, session duration, recovery, motivation, conditioning tolerance and body-composition trend.');
      notes.push('Deload only when the evidence supports it; first reduce volume by approximately 30–50% and keep work comfortably submaximal.');
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
    tagline: 'Five lifting days · performance-based progression · easy conditioning',
    description: 'An ongoing five-day push/pull/legs/upper/lower block for intermediate lifters prioritising strength, hypertrophy and body composition. Stable rep ranges let performance determine progression, Thursday provides easy recovery conditioning, and fatigue is reviewed every four weeks without an automatic deload.',
    author: { name: 'Helyx', type: 'community', verified: false },
    category: 'hypertrophy',
    subcategory: 'strength-hypertrophy',
    tags: ['intermediate', 'strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity', 'home-gym', 'ppl', 'pplul', '5-day'],
    durationWeeks: 12,
    ongoing: true,
    reviewEveryWeeks: 4,
    sessionsPerWeek: 5,
    sessionDurationMinutes: { min: 60, max: 85 },
    difficulty: 'intermediate',
    equipment: ['barbell', 'ez-bar', 'rack', 'bench', 'dumbbells', 'bands', 'pullup-bar', 'treadmill'],
    equipmentTier: 'home-gym',
    goals: ['strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity'],
    metrics: { strengthEmphasis: 80, hypertrophyEmphasis: 90, enduranceEmphasis: 5, conditioningEmphasis: 15, recoveryDemand: 70, weeklyVolumeScore: 80 },
    highlights: [
      'Push / Pull / Legs / Upper / Lower across five days',
      'Performance-based rep ranges instead of a fixed weekly wave',
      'Paused deadlift for productive training with limited plates',
      'Four-week reviews with deloads only when needed',
      'Easy walking supports conditioning without competing with recovery',
    ],
    expectedOutcomes: [
      'Stronger bench press, squat, overhead press and paused deadlift',
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
    performanceBaselines: {
      benchPress: ['90 kg × 6 × 4', '85 kg × 8, 8, 8, 6'],
      backSquat: ['100 kg × 6 × 4'],
      deadlift: ['Historical 1RM: 200 kg', 'Current heavy loading limited by available plates'],
    },
    dossier: {
      creator: 'Helyx',
      focus: 'Strength + Hypertrophy (home gym)',
      philosophy: 'Give every session one clear job, then let actual performance and recovery determine progression. Rep quality, total repetitions, RIR and repeatable technique matter more than obeying a predetermined calendar.',
    },
  },
];

export default shedPplulPrograms;
