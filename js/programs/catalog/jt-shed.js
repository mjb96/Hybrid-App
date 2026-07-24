// @ts-check
// =============================================================================
// JACKED & TAN: SHED EDITION — home-gym adaptation of Jacked & Tan 2.0.
//
// Standard catalog shape (days{} + weeklyVolModifiers{}) so the existing engine,
// activation, cockpit, day-preview and persistence handle it exactly like every
// other program — no parallel program model. The tiered per-exercise/per-week
// progression maths and the authored notes live in ../jt-shed-model.js and are
// surfaced additively via the extra fields below (programNotes, weekNotes,
// dayExercises). Those extra fields are ignored by every existing consumer, so
// backward compatibility with saved programs and completed workouts is intact.
//
// day.lifts stay BARE STRINGS (do not migrate to objects). The weeklyVolModifiers
// set/rep pair tracks the T1 main lift (top rep-max set + back-off sets) for each
// week; per-exercise/per-week detail is authored in dayExercises + the model and
// rendered in the program detail view.
// =============================================================================

const accent = '#f59e0b';

/** Program-level coaching notes (spec §Program-level notes). */
const PROGRAM_NOTES = [
  'Use conservative current training maxes rather than historical lifetime bests.',
  'A training max should generally be ~90% of a realistic current 1RM, or a technically clean 1–2RM performed around RPE 8–9.',
  'T1 rep-max sets stop before technical failure — keep ~1–2 reps in reserve on rep-max and max-rep sets.',
  'Week 12 testing does not require a true 1RM. A strong 2RM, 3RM or rep PR is acceptable when training alone.',
  'Use properly positioned rack safeties for squats and bench presses.',
  'Where available loading becomes insufficient, use pauses, controlled eccentrics or deficits rather than adding poor-quality reps.',
  'Do not introduce multiple intensity techniques at the same time.',
  'Saturday is a bodybuilding and specialization day, not a fifth maximal-strength day.',
];

/** Per-week phase label + instructions (spec §Week notes). */
const WEEK_NOTES = {
  '1':  { label: 'Volume base — conservative rep-max selection', notes: ['Pick rep-max weights you could stop 1–2 reps short of.', 'T1: work to a controlled 10RM, then 70% TM 3×6 (last set may be a plus set).', 'T2a: 50% TM 4×10. T2b/T2c target 15. T3 target 20.'] },
  '2':  { label: 'Build', notes: ['T1: controlled 8RM, then 75% TM 3×5+.', 'T2a: 60% TM 4×8. T2b/T2c target 12. T3 target 18.'] },
  '3':  { label: 'Build', notes: ['T1: controlled 6RM, then 80% TM 3×4+.', 'T2a: 70% TM 4×6. T2b/T2c target 10. T3 target 16.'] },
  '4':  { label: 'Intensification', notes: ['T1: controlled 4RM, then 82.5% TM 3×3+.', 'T2a: 75% TM 5×4. T2b/T2c target 8. T3 target 14.'] },
  '5':  { label: 'Heavy accumulation', notes: ['T1: controlled 2RM, then 85% TM 4×2+.', 'T2a: 80% TM 7×2. T2b/T2c target 6. T3 target 12.'] },
  '6':  { label: 'Pivot and heavy-single assessment', notes: ['T1: work to a controlled heavy single — not a technical grinder. No T1 back-off.', 'No T2a work. T2b/T2c recovery-only. T3: 2 light sets of ~10, no max-rep sets.'] },
  '7':  { label: 'Block 2 volume', notes: ['Block 2 back-off % is of THAT DAY’S rep-max weight, not the training max.', 'T1: controlled 6RM, then 5×3 at 85% of the day’s rep-max (last set may be a plus set).', 'T2a: 70% updated TM 5×6. T2b/T2c target 15. T3: rest or optional very light pump work.'] },
  '8':  { label: 'Block 2 build', notes: ['T1: controlled 4RM, then 5×2 at 85% of the day’s rep-max.', 'T2a: 75% updated TM 5×5. T2b/T2c target 12. T3 target 18.'] },
  '9':  { label: 'Heavy doubles', notes: ['T1: controlled 2RM, then 5×1 at 85% of the day’s rep-max.', 'T2a: 80% updated TM 5×4. T2b/T2c target 10. T3 target 16.'] },
  '10': { label: 'Strength intensification', notes: ['T1: controlled 5RM, then 3×2 at 90% of the day’s rep-max.', 'T2a: 82.5% updated TM 6×3. T2b/T2c target 6. T3 target 14.'] },
  '11': { label: 'Heavy triples and singles', notes: ['T1: controlled 3RM, then 3×1 at 90% of the day’s rep-max.', 'T2a: 85% updated TM 7×2. No T2b/T2c work. T3: 2 light sets of ~12, no max-rep sets.'] },
  '12': { label: 'Assessment and consolidation', notes: ['T1: controlled 1RM, 2RM, 3RM or rep-PR assessment — a true 1RM is optional. No T1 back-off.', 'No T2a and no T2b/T2c work. T3: rest.'] },
};

const RM = 'Rest';
const restDay = (title = 'Rest') => ({ title, badge: 'Recovery', color: 'var(--text-muted)', desc: 'Rest and recover — no training scheduled.', runs: RM, lifts: [] });

const days = {
  mon: {
    title: 'Squat & Posterior Chain', badge: 'T1 Squat', color: 'var(--accent-green)',
    desc: 'Heavy squat work followed by posterior-chain, unilateral-leg and upper-back training. Keep the chest-supported row strict so the lower back is not unnecessarily fatigued after squats and Romanian deadlifts.',
    runs: RM,
    lifts: ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Chest-Supported Dumbbell Row', 'Band Leg Curl', 'Barbell Standing Calf Raise', 'Ab Wheel Rollout'],
  },
  tue: {
    title: 'Bench & Upper Push', badge: 'T1 Bench', color: 'var(--accent-blue)',
    desc: 'Bench-strength day with vertical pressing, chest hypertrophy and balanced vertical pulling. Pull-ups are the primary vertical-pull movement on this day.',
    runs: RM,
    lifts: ['Barbell Bench Press', 'Standing Barbell Overhead Press', 'Incline Dumbbell Press', 'Pull-Up', 'Dumbbell Lateral Raise', 'Band Triceps Pushdown', 'Band Face Pull'],
  },
  wed: restDay(),
  thu: {
    title: 'Deadlift & Lower Body', badge: 'T1 Deadlift', color: 'var(--accent-green)',
    desc: 'Heavy hinge work with a second weekly quad exposure. Keep the barbell row strict and avoid allowing the session to become dominated by lower-back fatigue.',
    runs: RM,
    lifts: ['Conventional Deadlift', 'Front Squat', 'Barbell Row', 'Reverse Lunge', 'Band Leg Curl', 'Seated Dumbbell Calf Raise', 'EZ-Bar Curl'],
  },
  fri: {
    title: 'Overhead Press & Upper Body', badge: 'T1 OHP', color: 'var(--accent-amber)',
    desc: 'Primary overhead-strength day with secondary bench work, horizontal pulling, lat isolation and direct shoulder and triceps work.',
    runs: RM,
    lifts: ['Standing Barbell Overhead Press', 'Close-Grip Bench Press', 'One-Arm Dumbbell Row', 'Dumbbell Pullover', 'Dumbbell Lateral Raise', 'Dumbbell Skull Crusher', 'Dumbbell Rear-Delt Raise'],
  },
  sat: {
    title: 'Back, Arms, Delts & Core', badge: 'Bodybuilding', color: 'var(--accent-pink)',
    desc: 'Lower-systemic-fatigue bodybuilding session. Produce a strong pump without turning this into another main-lift day. Keep the session to ~50–65 minutes.',
    runs: RM,
    lifts: ['Chest-Supported Dumbbell Row', 'Band Lat Pulldown', 'EZ-Bar Curl', 'Band Triceps Pushdown', 'Dumbbell Hammer Curl', 'Dumbbell Lateral Raise', 'Band Face Pull', 'Ab Wheel Rollout'],
  },
  sun: restDay(),
};

/**
 * Authored per-day exercise metadata for the detail view + tests. Names match
 * the bare strings in days[*].lifts (order-aligned). Tier can differ by day.
 */
const dayExercises = {
  mon: [
    { name: 'Back Squat', tier: 'T1', progression: 'T1 weekly progression', notes: ['Use rack safeties.', 'Rep-max sets stop before form deteriorates.', 'Keep ~1–2 reps in reserve.'] },
    { name: 'Romanian Deadlift', tier: 'T2a', progression: 'T2a percentage progression', notes: ['Maintain a controlled eccentric.', 'Stop the descent when hamstring tension or spinal position begins to change.', 'Do not turn this into a conventional deadlift.'] },
    { name: 'Dumbbell Bulgarian Split Squat', tier: 'T2b', progression: 'Target-rep set plus two max-rep sets', notes: ['Reps are per leg.', 'Use the same load for all three sets.', 'Stop each set with ~1–2 reps in reserve.'] },
    { name: 'Chest-Supported Dumbbell Row', tier: 'T2c', progression: 'Target-rep set plus two max-rep sets', notes: ['Keep the chest supported throughout.', 'Use a full stretch and avoid shrugging the weight.'] },
    { name: 'Band Leg Curl', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: ['Control both the curling and lowering phases.', 'Secure the band before beginning.'] },
    { name: 'Barbell Standing Calf Raise', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: ['Pause in the stretched and contracted positions.', 'Avoid bouncing.'] },
    { name: 'Ab Wheel Rollout', tier: 'Core', progression: '3 sets of 6–15 using double progression', notes: ['Ab wheel or barbell rollout.', 'Maintain posterior pelvic control.', 'End the set when the lower back begins to extend.'] },
  ],
  tue: [
    { name: 'Barbell Bench Press', tier: 'T1', progression: 'T1 weekly progression', notes: ['Use rack safeties when training alone.', 'Keep the setup and pause standardised.', 'Stop rep-max sets before bar path or position deteriorates.'] },
    { name: 'Standing Barbell Overhead Press', tier: 'T2a', progression: 'T2a percentage progression', notes: ['Avoid excessive layback.', 'Start each rep from a consistent position.'] },
    { name: 'Incline Dumbbell Press', tier: 'T2b', progression: 'Target-rep set plus two max-rep sets', notes: ['Use a moderate bench angle.', 'Keep ~1–2 reps in reserve.'] },
    { name: 'Pull-Up', tier: 'T2c (special)', progression: '3 sets of 6–10 using double progression', notes: ['Full-range controlled reps.', 'Use band assistance when fewer than six clean reps are available.', 'Add external load when 3×10 is achieved with ~1–2 reps in reserve.', 'Does NOT use the standard 15/12/10/8/6 target progression.', 'Record assistance-band level or added weight as part of the performance.'] },
    { name: 'Dumbbell Lateral Raise', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: ['Controlled reps.', 'Do not turn the movement into a shrug.'] },
    { name: 'Band Triceps Pushdown', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: ['Keep the upper arms relatively fixed.', 'Record the band or resistance configuration where supported.'] },
    { name: 'Band Face Pull', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: ['Pull toward the forehead or upper face.', 'Finish with external rotation, not only scapular retraction.'] },
  ],
  thu: [
    { name: 'Conventional Deadlift', tier: 'T1', progression: 'T1 weekly progression', notes: ['Reset position between reps where appropriate.', 'Stop before technical breakdown.', 'If plate load becomes insufficient, use ONE of: a 2-second pause below the knee; a small deficit; a controlled 3-second eccentric.', 'Do not combine all intensity variations simultaneously.'] },
    { name: 'Front Squat', tier: 'T2a', progression: 'T2a percentage progression', notes: ['Use a clean cross-arm or straps-assisted front-rack position.', 'A 2-second paused high-bar squat is an approved substitution if front-rack mobility is limiting.'] },
    { name: 'Barbell Row', tier: 'T2b', progression: 'Target-rep set plus two max-rep sets', notes: ['Keep the torso angle consistent.', 'Do not progressively turn later reps into upright shrugs.'] },
    { name: 'Reverse Lunge', tier: 'T2c', progression: 'Target-rep set plus two max-rep sets', notes: ['Dumbbell reverse lunge — reps are per leg.', 'If the session becomes excessively long, an alternate prescription of 3 straight sets of 8–12 is allowed.'] },
    { name: 'Band Leg Curl', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
    { name: 'Seated Dumbbell Calf Raise', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: ['Pause in the stretched position.', 'Record dumbbell load consistently.'] },
    { name: 'EZ-Bar Curl', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
  ],
  fri: [
    { name: 'Standing Barbell Overhead Press', tier: 'T1', progression: 'T1 weekly progression', notes: [] },
    { name: 'Close-Grip Bench Press', tier: 'T2a', progression: 'T2a percentage progression', notes: ['Use a comfortable grip slightly inside the normal bench grip.', 'Do not use an excessively narrow grip.', 'Keep shoulders and wrists comfortable.'] },
    { name: 'One-Arm Dumbbell Row', tier: 'T2b', progression: 'Target-rep set plus two max-rep sets', notes: ['Reps are per side.', 'Avoid excessive torso rotation.'] },
    { name: 'Dumbbell Pullover', tier: 'T2c', progression: 'Target-rep set plus two max-rep sets', notes: ['Default to dumbbell pullover when it can be performed without shoulder discomfort.', 'Straight-arm band pulldown is the approved alternative.', 'Keep the movement lat-focused and controlled.'] },
    { name: 'Dumbbell Lateral Raise', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
    { name: 'Dumbbell Skull Crusher', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: ['Use a comfortable elbow path.', 'Reduce range slightly if deep elbow flexion causes discomfort.'] },
    { name: 'Dumbbell Rear-Delt Raise', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
  ],
  sat: [
    { name: 'Chest-Supported Dumbbell Row', tier: 'Specialization', progression: '4 sets of 8–12 using double progression', notes: ['Add load once all four sets reach 12 controlled reps.', 'Keep ~1–2 reps in reserve.'] },
    { name: 'Band Lat Pulldown', tier: 'T2b', progression: 'Target-rep set plus two max-rep sets', notes: ['Stays in the program alongside Tuesday pull-ups.', 'Use it as the higher-rep, lower-fatigue vertical-pull movement.', 'Secure the band to the top of the rack.', 'Use a full overhead stretch.'] },
    { name: 'EZ-Bar Curl', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
    { name: 'Band Triceps Pushdown', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
    { name: 'Dumbbell Hammer Curl', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
    { name: 'Dumbbell Lateral Raise', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
    { name: 'Band Face Pull', tier: 'T3', progression: 'T3 target-rep set plus two max-rep sets', notes: [] },
    { name: 'Ab Wheel Rollout', tier: 'Core', progression: '3 sets using double progression', notes: ['Ab wheel, reverse crunch or weighted sit-up — pick one and keep the prescription intact.'] },
  ],
};

// weeklyVolModifiers track the T1 main lift for the week: sets = top rep-max set
// + T1 back-off sets, reps = the week's rep-max target. Accessory tiers carry
// their own per-week schemes in the model/detail view.
const weeklyVolModifiers = {
  '1':  { sets: 4, reps: 10, intensityLabel: 'Volume base — T1 to 10RM, then 70% TM 3×6+ · T2a 50% 4×10' },
  '2':  { sets: 4, reps: 8,  intensityLabel: 'Build — T1 to 8RM, then 75% TM 3×5+ · T2a 60% 4×8' },
  '3':  { sets: 4, reps: 6,  intensityLabel: 'Build — T1 to 6RM, then 80% TM 3×4+ · T2a 70% 4×6' },
  '4':  { sets: 4, reps: 4,  intensityLabel: 'Intensification — T1 to 4RM, then 82.5% TM 3×3+ · T2a 75% 5×4' },
  '5':  { sets: 5, reps: 2,  intensityLabel: 'Heavy accumulation — T1 to 2RM, then 85% TM 4×2+ · T2a 80% 7×2' },
  '6':  { sets: 1, reps: 1,  intensityLabel: 'Pivot — T1 heavy single, no back-off · no T2a · T3 light' },
  '7':  { sets: 6, reps: 6,  intensityLabel: 'Block 2 volume — T1 6RM, then 5×3 @85% day-max · T2a 70% 5×6' },
  '8':  { sets: 6, reps: 4,  intensityLabel: 'Block 2 build — T1 4RM, then 5×2 @85% day-max · T2a 75% 5×5' },
  '9':  { sets: 6, reps: 2,  intensityLabel: 'Heavy doubles — T1 2RM, then 5×1 @85% day-max · T2a 80% 5×4' },
  '10': { sets: 4, reps: 5,  intensityLabel: 'Strength intensification — T1 5RM, then 3×2 @90% day-max · T2a 82.5% 6×3' },
  '11': { sets: 4, reps: 3,  intensityLabel: 'Heavy triples & singles — T1 3RM, then 3×1 @90% day-max · T2a 85% 7×2' },
  '12': { sets: 1, reps: 3,  intensityLabel: 'Assessment — T1 1/2/3RM or rep PR (true 1RM optional), no back-off' },
};

/** @type {any[]} */
export default [
  {
    id: 'jt_shed_edition',
    name: 'Jacked & Tan: Shed Edition',
    tagline: 'A five-day home-gym adaptation of Jacked & Tan 2.0',
    description: 'A five-day home-gym adaptation of Jacked & Tan 2.0. Four sessions are built around back squat, bench press, deadlift and overhead press. The fifth session develops the back, arms, delts and core without adding another highly fatiguing main-lift day.',
    author: { name: 'Helyx', type: 'community', verified: false },
    category: 'hypertrophy',
    subcategory: 'strength-hypertrophy',
    tags: ['intermediate', 'strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity', 'home-gym', 'jacked-and-tan', 'tiered', '5-day'],
    durationWeeks: 12,
    sessionsPerWeek: 5,
    sessionDurationMinutes: { min: 55, max: 80 },
    difficulty: 'intermediate',
    equipment: ['barbell', 'ez-bar', 'rack', 'bench', 'dumbbells', 'bands', 'pullup-bar'],
    equipmentTier: 'home-gym',
    goals: ['strength', 'hypertrophy', 'muscle-gain', 'body-composition', 'work-capacity'],
    metrics: { strengthEmphasis: 80, hypertrophyEmphasis: 85, enduranceEmphasis: 10, conditioningEmphasis: 25, recoveryDemand: 70, weeklyVolumeScore: 80 },
    highlights: ['4 main-lift days + 1 bodybuilding day', 'T1 rep-max + back-off progression', 'Percentage-based T2a work', 'Home-gym equipment only'],
    expectedOutcomes: ['Bigger, stronger squat/bench/deadlift/press', 'Added muscle across back, arms and delts', 'Improved body composition', 'More work capacity'],
    popularity: 60, rating: 0, ratingCount: 0, completionRate: 0, enrolledCount: 0,
    featured: false, verified: false, isNew: true,
    coverGradient: ['#2a1a05', '#3d2a0a'], accentColor: accent, icon: '🏝️',
    collections: ['hypertrophy-collection', 'home-gym'],
    days,
    weeklyVolModifiers,
    // ── Additive J&T metadata (ignored by existing consumers) ────────────────
    programNotes: PROGRAM_NOTES,
    weekNotes: WEEK_NOTES,
    dayExercises,
    trainingMaxLifts: ['Back Squat', 'Barbell Bench Press', 'Conventional Deadlift', 'Standing Barbell Overhead Press', 'Romanian Deadlift', 'Front Squat', 'Close-Grip Bench Press'],
    progressionModel: 'jt-shed',
    dossier: { creator: 'Helyx', focus: 'Strength + Hypertrophy (home gym)', philosophy: 'Adapt the Jacked & Tan 2.0 tier structure to a home gym: four main-lift days plus a lower-fatigue back/arms/delts/core day.' },
  },
];
