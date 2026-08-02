// @ts-check
// =============================================================================
// JACKED & TAN: SHED EDITION — pure progression + notes model.
//
// A single, side-effect-free source of truth for the program's tiered
// progression (T1 rep-max + back-off, T2a percentage, T2b/T2c target-rep, T3
// target-rep, pull-up / Saturday-row double progression) and its authored notes
// (program / week / day / exercise). Every function here is pure so the detail
// view, the day preview and the tests all read the SAME numbers.
//
// This model is ADDITIVE metadata: the live workout cockpit still materialises
// sets from the program's `days{}` + `weeklyVolModifiers` exactly like every
// other catalog program (see js/schema.js + js/engine.js). Nothing here mutates
// state or the program definition, so existing saved programs and completed
// workouts are untouched.
// =============================================================================

export const JT_SHED_ID = 'jt_shed_edition';
export const JT_SHED_SIMPLIFIED_ID = 'jacked-tan-shed-simplified';
export const JT_SHED_WEEKS = 12;

/** Both the retired tiered plan and its discoverable simplified replacement. */
export function isJtShedProgram(program) {
  return program?.progressionModel === 'jt-shed'
    || program?.progressionModel === 'jt-shed-simplified';
}

/** The four T1 main lifts (each anchors one of the four main-lift days). */
export const T1_LIFTS = [
  'Back Squat',
  'Barbell Bench Press',
  'Conventional Deadlift',
  'Standing Barbell Overhead Press',
];

/** Lifts that run the T2a percentage progression on at least one day. */
export const T2A_LIFTS = [
  'Romanian Deadlift',
  'Standing Barbell Overhead Press',
  'Front Squat',
  'Close-Grip Bench Press',
];

/**
 * Lifts for which the athlete enters/confirms a training max at activation.
 * (T1 lifts + the T2a percentage lifts. Standing Barbell Overhead Press is both
 * a T1 lift and a Tuesday T2a lift but is only listed once.)
 */
export const TRAINING_MAX_LIFTS = [
  'Back Squat',
  'Barbell Bench Press',
  'Conventional Deadlift',
  'Standing Barbell Overhead Press',
  'Romanian Deadlift',
  'Front Squat',
  'Close-Grip Bench Press',
];

/** Human week labels / phase names (spec §Week notes). */
export const WEEK_LABELS = {
  1: 'Volume base — conservative rep-max selection',
  2: 'Build',
  3: 'Build',
  4: 'Intensification',
  5: 'Heavy accumulation',
  6: 'Pivot and heavy-single assessment',
  7: 'Block 2 volume',
  8: 'Block 2 build',
  9: 'Heavy doubles',
  10: 'Strength intensification',
  11: 'Heavy triples and singles',
  12: 'Assessment and consolidation',
};

// -----------------------------------------------------------------------------
// T1 — rep-max + back-off. Weeks 1–5 back-off % is of the TRAINING MAX; weeks
// 7–11 back-off % is of THAT DAY'S rep-max weight (basis: 'dayMax'). Weeks 6 and
// 12 carry no T1 back-off. Every back-off's final set may be a plus set.
// -----------------------------------------------------------------------------
/** @typedef {{ pct:number, sets:number, reps:number, basis:'tm'|'dayMax', plusSet:boolean }} T1Backoff */
/** @typedef {{ week:number, repMax:number|null, singleTop:boolean, assessment:boolean,
 *              trueMaxOptional:boolean, backoff:T1Backoff|null }} T1Week */

/** @type {Record<number, T1Week>} */
const T1_TABLE = {
  1:  { week: 1,  repMax: 10, singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 70,   sets: 3, reps: 6, basis: 'tm', plusSet: true } },
  2:  { week: 2,  repMax: 8,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 75,   sets: 3, reps: 5, basis: 'tm', plusSet: true } },
  3:  { week: 3,  repMax: 6,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 80,   sets: 3, reps: 4, basis: 'tm', plusSet: true } },
  4:  { week: 4,  repMax: 4,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 82.5, sets: 3, reps: 3, basis: 'tm', plusSet: true } },
  5:  { week: 5,  repMax: 2,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 85,   sets: 4, reps: 2, basis: 'tm', plusSet: true } },
  6:  { week: 6,  repMax: 1,  singleTop: true,  assessment: false, trueMaxOptional: false, backoff: null },
  7:  { week: 7,  repMax: 6,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 85,   sets: 5, reps: 3, basis: 'dayMax', plusSet: true } },
  8:  { week: 8,  repMax: 4,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 85,   sets: 5, reps: 2, basis: 'dayMax', plusSet: true } },
  9:  { week: 9,  repMax: 2,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 85,   sets: 5, reps: 1, basis: 'dayMax', plusSet: true } },
  10: { week: 10, repMax: 5,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 90,   sets: 3, reps: 2, basis: 'dayMax', plusSet: true } },
  11: { week: 11, repMax: 3,  singleTop: false, assessment: false, trueMaxOptional: false, backoff: { pct: 90,   sets: 3, reps: 1, basis: 'dayMax', plusSet: true } },
  12: { week: 12, repMax: null, singleTop: false, assessment: true, trueMaxOptional: true, backoff: null },
};

/**
 * T1 prescription for a program week (1–12).
 * @param {number} week
 * @returns {T1Week|null}
 */
export function t1Prescription(week) {
  const w = _wk(week);
  return w ? { ...T1_TABLE[w], backoff: T1_TABLE[w].backoff ? { ...T1_TABLE[w].backoff } : null } : null;
}

// -----------------------------------------------------------------------------
// T2a — percentage progression. Block 1 (weeks 1–5) % is of the original TM;
// block 2 (weeks 7–11) % is of the UPDATED TM (basis 'updatedTm'). Weeks 6 & 12
// carry no T2a work.
// -----------------------------------------------------------------------------
/** @typedef {{ week:number, pct:number, sets:number, reps:number, basis:'tm'|'updatedTm' }} T2aWeek */

/** @type {Record<number, T2aWeek|null>} */
const T2A_TABLE = {
  1:  { week: 1,  pct: 50,   sets: 4, reps: 10, basis: 'tm' },
  2:  { week: 2,  pct: 60,   sets: 4, reps: 8,  basis: 'tm' },
  3:  { week: 3,  pct: 70,   sets: 4, reps: 6,  basis: 'tm' },
  4:  { week: 4,  pct: 75,   sets: 5, reps: 4,  basis: 'tm' },
  5:  { week: 5,  pct: 80,   sets: 7, reps: 2,  basis: 'tm' },
  6:  null,
  7:  { week: 7,  pct: 70,   sets: 5, reps: 6,  basis: 'updatedTm' },
  8:  { week: 8,  pct: 75,   sets: 5, reps: 5,  basis: 'updatedTm' },
  9:  { week: 9,  pct: 80,   sets: 5, reps: 4,  basis: 'updatedTm' },
  10: { week: 10, pct: 82.5, sets: 6, reps: 3,  basis: 'updatedTm' },
  11: { week: 11, pct: 85,   sets: 7, reps: 2,  basis: 'updatedTm' },
  12: null,
};

/**
 * T2a prescription for a program week (1–12). Null when there is no T2a work.
 * @param {number} week
 * @returns {T2aWeek|null}
 */
export function t2aPrescription(week) {
  const w = _wk(week);
  return w && T2A_TABLE[w] ? { ...T2A_TABLE[w] } : null;
}

// -----------------------------------------------------------------------------
// T2b / T2c — one target-rep set + two max-rep sets at the same load.
// Week 6 = recovery-only, weeks 11–12 = none.
// -----------------------------------------------------------------------------
/** @typedef {{ week:number, target:number|null, maxRepSets:number, recovery:boolean, none:boolean }} TierRepWeek */

/** @type {Record<number, {target:number|null, recovery?:boolean, none?:boolean}>} */
const T2BC_TABLE = {
  1: { target: 15 }, 2: { target: 12 }, 3: { target: 10 }, 4: { target: 8 }, 5: { target: 6 },
  6: { target: null, recovery: true },
  7: { target: 15 }, 8: { target: 12 }, 9: { target: 10 }, 10: { target: 6 },
  11: { target: null, none: true }, 12: { target: null, none: true },
};

/**
 * Standard T2b/T2c target-rep prescription for a week.
 * @param {number} week
 * @returns {TierRepWeek|null}
 */
export function t2bcPrescription(week) {
  const w = _wk(week);
  if (!w) return null;
  const row = T2BC_TABLE[w];
  return {
    week: w,
    target: row.target,
    maxRepSets: row.target == null ? 0 : 2,
    recovery: !!row.recovery,
    none: !!row.none,
  };
}

// -----------------------------------------------------------------------------
// T3 — one target-rep set + two max-rep sets. Weeks 6 & 11 = 2 light sets, no
// max-rep sets. Week 7 = rest/optional. Week 12 = rest.
// -----------------------------------------------------------------------------
/** @typedef {{ week:number, target:number|null, maxRepSets:number, lightSets:number,
 *              lightApprox:number, light:boolean, rest:boolean, optionalLight:boolean }} T3Week */

/** @type {Record<number, {target:number|null, lightSets?:number, lightApprox?:number,
 *          rest?:boolean, optionalLight?:boolean}>} */
const T3_TABLE = {
  1: { target: 20 }, 2: { target: 18 }, 3: { target: 16 }, 4: { target: 14 }, 5: { target: 12 },
  6: { target: null, lightSets: 2, lightApprox: 10 },
  7: { target: null, rest: true, optionalLight: true },
  8: { target: 18 }, 9: { target: 16 }, 10: { target: 14 },
  11: { target: null, lightSets: 2, lightApprox: 12 },
  12: { target: null, rest: true },
};

/**
 * Standard T3 target-rep prescription for a week.
 * @param {number} week
 * @returns {T3Week|null}
 */
export function t3Prescription(week) {
  const w = _wk(week);
  if (!w) return null;
  const row = T3_TABLE[w];
  return {
    week: w,
    target: row.target,
    maxRepSets: row.target == null ? 0 : 2,
    lightSets: row.lightSets || 0,
    lightApprox: row.lightApprox || 0,
    light: !!row.lightSets,
    rest: !!row.rest,
    optionalLight: !!row.optionalLight,
  };
}

// -----------------------------------------------------------------------------
// Special double-progression schemes (do NOT use the target-rep tables).
// -----------------------------------------------------------------------------
/** Pull-Up (Tuesday T2c special): 3 sets of 6–10, double progression. */
export const PULLUP_SCHEME = Object.freeze({ sets: 3, minReps: 6, maxReps: 10, doubleProgression: true });
/** Saturday Chest-Supported Row (specialization compound): 4 sets of 8–12. */
export const SATURDAY_ROW_SCHEME = Object.freeze({ sets: 4, minReps: 8, maxReps: 12, doubleProgression: true });
/** Monday core (ab wheel / rollout): 3 sets of 6–15, double progression. */
export const MONDAY_CORE_SCHEME = Object.freeze({ sets: 3, minReps: 6, maxReps: 15, doubleProgression: true });
/** Saturday core (ab wheel / reverse crunch / weighted sit-up): 3 sets, double progression. */
export const SATURDAY_CORE_SCHEME = Object.freeze({ sets: 3, doubleProgression: true });

// -----------------------------------------------------------------------------
// Load maths — rounding + percentage loads with honest missing-TM handling.
// -----------------------------------------------------------------------------

/**
 * Round a load to the nearest increment (app convention: 2.5 kg). Guards against
 * NaN / non-finite / negative inputs so a percentage load never becomes NaN.
 * @param {number} weight
 * @param {number} [increment]
 * @returns {number|null} rounded load, or null if the input is not usable
 */
export function roundLoad(weight, increment = 2.5) {
  const w = Number(weight);
  const inc = Number(increment) > 0 ? Number(increment) : 2.5;
  if (!Number.isFinite(w) || w <= 0) return null;
  return Math.round(w / inc) * inc;
}

/**
 * Resolve a T2a working load for a week from a training max.
 * Returns a discriminated result so the UI can prompt instead of prescribing 0.
 * @param {number} week
 * @param {number|null|undefined} trainingMax
 * @param {{ increment?:number }} [opts]
 * @returns {{ hasWork:boolean, needsTrainingMax:boolean, load:number|null,
 *             pct:number|null, sets:number|null, reps:number|null, basis:string|null }}
 */
export function t2aLoad(week, trainingMax, opts = {}) {
  const p = t2aPrescription(week);
  if (!p) return { hasWork: false, needsTrainingMax: false, load: null, pct: null, sets: null, reps: null, basis: null };
  const tm = Number(trainingMax);
  if (!Number.isFinite(tm) || tm <= 0) {
    return { hasWork: true, needsTrainingMax: true, load: null, pct: p.pct, sets: p.sets, reps: p.reps, basis: p.basis };
  }
  const load = roundLoad((tm * p.pct) / 100, opts.increment);
  return { hasWork: true, needsTrainingMax: false, load, pct: p.pct, sets: p.sets, reps: p.reps, basis: p.basis };
}

/**
 * Resolve a T1 back-off load for a week. Weeks 1–5 use the training max; weeks
 * 7–11 use that day's achieved rep-max weight. Returns null load (with a
 * needs-flag) rather than a fabricated 0 when the required input is missing.
 * @param {number} week
 * @param {{ trainingMax?:number|null, dayRepMaxWeight?:number|null, increment?:number }} [inputs]
 * @returns {{ hasBackoff:boolean, needsTrainingMax:boolean, needsDayRepMax:boolean,
 *             load:number|null, pct:number|null, sets:number|null, reps:number|null,
 *             basis:string|null, plusSet:boolean }}
 */
export function t1BackoffLoad(week, inputs = {}) {
  const p = t1Prescription(week);
  const bo = p && p.backoff;
  if (!bo) {
    return { hasBackoff: false, needsTrainingMax: false, needsDayRepMax: false, load: null, pct: null, sets: null, reps: null, basis: null, plusSet: false };
  }
  const base = { hasBackoff: true, pct: bo.pct, sets: bo.sets, reps: bo.reps, basis: bo.basis, plusSet: bo.plusSet };
  if (bo.basis === 'tm') {
    const tm = Number(inputs.trainingMax);
    if (!Number.isFinite(tm) || tm <= 0) return { ...base, needsTrainingMax: true, needsDayRepMax: false, load: null };
    return { ...base, needsTrainingMax: false, needsDayRepMax: false, load: roundLoad((tm * bo.pct) / 100, inputs.increment) };
  }
  // basis === 'dayMax'
  const day = Number(inputs.dayRepMaxWeight);
  if (!Number.isFinite(day) || day <= 0) return { ...base, needsTrainingMax: false, needsDayRepMax: true, load: null };
  return { ...base, needsTrainingMax: false, needsDayRepMax: false, load: roundLoad((day * bo.pct) / 100, inputs.increment) };
}

/**
 * A conservative starting training max from a realistic current 1RM (≈90%),
 * rounded to the loading increment (spec §Program-level notes).
 * @param {number} current1RM
 * @param {{ increment?:number, factor?:number }} [opts]
 * @returns {number|null}
 */
export function suggestTrainingMax(current1RM, opts = {}) {
  const factor = Number(opts.factor) > 0 ? Number(opts.factor) : 0.9;
  return roundLoad(Number(current1RM) * factor, opts.increment);
}

// -----------------------------------------------------------------------------
// Notes accessors — read authored notes from the program object WITHOUT ever
// touching user-entered workout notes (those live in state.weeks[wk].notes[day]).
// -----------------------------------------------------------------------------

/** @param {any} program @returns {string[]} */
export function programNotes(program) {
  return Array.isArray(program?.programNotes) ? program.programNotes.slice() : [];
}

/** @param {any} program @param {number} week @returns {{ week:number, label:string, notes:string[] }} */
export function weekNote(program, week) {
  const w = _wk(week) || 1;
  const authored = program?.weekNotes && program.weekNotes[String(w)];
  return {
    week: w,
    label: (authored && authored.label) || WEEK_LABELS[w] || `Week ${w}`,
    notes: authored && Array.isArray(authored.notes) ? authored.notes.slice() : [],
  };
}

/** @param {any} program @param {string} dayKey @returns {string} */
export function dayNote(program, dayKey) {
  const d = program?.days && program.days[dayKey];
  return (d && (d.coachNote || d.desc)) || '';
}

/**
 * Authored per-day exercise metadata (tier · progression label · coaching
 * notes), used by the detail view and tests. A lift's tier can differ by day
 * (e.g. Chest-Supported Dumbbell Row is T2c on Monday but a specialization
 * compound on Saturday), so this is keyed by day rather than by a flat name map.
 * @param {any} program @param {string} dayKey
 * @returns {Array<{ name:string, tier:string, progression:string, notes:string[] }>}
 */
export function dayExercises(program, dayKey) {
  const list = program?.dayExercises && program.dayExercises[dayKey];
  if (!Array.isArray(list)) return [];
  return list.map((ex) => ({
    name: ex.name,
    tier: ex.tier || '',
    progression: ex.progression || '',
    notes: Array.isArray(ex.notes) ? ex.notes.slice() : [],
  }));
}

// -----------------------------------------------------------------------------
// CENTRAL PRESCRIPTION RESOLVER
// Given a program + week + day + exercise, resolve the ONE structured
// prescription every surface must agree on (preview, cockpit label, set-row
// count, week brief). Pure — no state, no mutation. The resolved `sets` is the
// number of set rows to materialise; per-set roles live in `setPlan` and are a
// RENDER concern only (never stamped onto stored sets, which stay plain
// {w,r,c} so draft/reconcile/warmup predicates are unaffected).
// -----------------------------------------------------------------------------

/** ~1–2 reps in reserve. */
const RIR = '1–2';

const SIMPLIFIED_MAIN_BY_DAY = Object.freeze({
  mon: 'Barbell Bench Press',
  tue: 'Back Squat',
  thu: 'Standing Barbell Overhead Press',
  fri: 'Conventional Deadlift',
});

const SIMPLIFIED_ACCESSORY_TABLE = Object.freeze({
  'mon:Pull-Up': { sets: 3, min: 5, max: 10 },
  'mon:Standing Barbell Overhead Press': { sets: 2, min: 8, max: 10 },
  'mon:Incline Dumbbell Press': { sets: 2, min: 8, max: 12 },
  'mon:Dumbbell Lateral Raise': { sets: 3, min: 12, max: 20 },
  'mon:Band Triceps Pushdown': { sets: 2, min: 12, max: 20 },
  'mon:Band Face Pull': { sets: 2, min: 15, max: 25 },
  'tue:Romanian Deadlift': { sets: 3, min: 8, max: 10 },
  'tue:Dumbbell Bulgarian Split Squat': { sets: 2, min: 8, max: 12 },
  'tue:Chest-Supported Dumbbell Row': { sets: 3, min: 8, max: 12 },
  'tue:Band Leg Curl': { sets: 2, min: 15, max: 25 },
  'tue:Barbell Standing Calf Raise': { sets: 3, min: 10, max: 20 },
  'tue:Ab Wheel Rollout': { sets: 2, min: 6, max: 15 },
  'thu:Close-Grip Bench Press': { sets: 3, min: 6, max: 10 },
  'thu:One-Arm Dumbbell Row': { sets: 3, min: 8, max: 12 },
  'thu:Dumbbell Rear-Delt Raise': { sets: 2, min: 15, max: 25 },
  'thu:Dumbbell Skull Crusher': { sets: 2, min: 10, max: 15 },
  'fri:Front Squat': { sets: 3, min: 6, max: 8 },
  'fri:Reverse Lunge': { sets: 2, min: 8, max: 12 },
  'fri:Band Leg Curl': { sets: 3, min: 12, max: 20 },
  'fri:Seated Dumbbell Calf Raise': { sets: 3, min: 12, max: 20 },
  'fri:EZ-Bar Curl': { sets: 2, min: 8, max: 15 },
  'sat:Chest-Supported Dumbbell Row': { sets: 3, min: 8, max: 12 },
  'sat:Band Lat Pulldown': { sets: 3, min: 12, max: 20 },
  'sat:EZ-Bar Curl': { sets: 3, min: 8, max: 15 },
  'sat:Band Triceps Pushdown': { sets: 3, min: 12, max: 20 },
  'sat:Dumbbell Lateral Raise': { sets: 3, min: 12, max: 20 },
  'sat:Band Face Pull': { sets: 2, min: 15, max: 25 },
  'sat:Ab Wheel Rollout': { sets: 3, min: 6, max: 15 },
});

/** @type {Record<number, any>} */
const SIMPLIFIED_WEEK_TABLE = {
  1:  { phase: 'Volume & technique', rir: '3', main: { sets: 4, reps: 8 }, deadlift: { sets: 3, reps: 6 } },
  2:  { phase: 'Volume & technique', rir: '2', main: { sets: 4, reps: 8 }, deadlift: { sets: 3, reps: 6 } },
  3:  { phase: 'Volume & technique', rir: '1–2', main: { sets: 4, reps: 8 }, deadlift: { sets: 3, reps: 6 } },
  4:  { phase: 'Deload', rir: '4+', deload: true, main: { sets: 2, reps: 8 }, deadlift: { sets: 2, reps: 6 } },
  5:  { phase: 'Strength & hypertrophy', rir: '3', main: { sets: 4, reps: 6 }, deadlift: { sets: 3, reps: 4 } },
  6:  { phase: 'Strength & hypertrophy', rir: '2', main: { sets: 4, reps: 6 }, deadlift: { sets: 3, reps: 4 } },
  7:  { phase: 'Strength & hypertrophy', rir: '1', main: { sets: 4, reps: 6 }, deadlift: { sets: 3, reps: 4 } },
  8:  { phase: 'Deload', rir: '4+', deload: true, main: { sets: 2, reps: 6 }, deadlift: { sets: 2, reps: 4 } },
  9:  { phase: 'Intensification', rir: '3', main: { sets: 5, reps: 4 }, deadlift: { sets: 4, reps: 3 } },
  10: { phase: 'Intensification', rir: '2', main: { sets: 5, reps: 4 }, deadlift: { sets: 4, reps: 3 } },
  11: { phase: 'Intensification', rir: '1', main: { sets: 5, reps: 4 }, deadlift: { sets: 4, reps: 3 } },
  12: { phase: 'Controlled rep-PR assessment', rir: '1', assessment: true, main: { sets: 1, reps: 4 }, deadlift: { sets: 1, reps: 3 } },
};

/**
 * Public, detached week description for the simplified program's detail view
 * and tests. The `main` row applies to bench/squat/OHP; `deadlift` is separate.
 */
export function simplifiedWeekPlan(week) {
  const w = _wk(week);
  if (!w) return null;
  const row = SIMPLIFIED_WEEK_TABLE[w];
  return {
    week: w,
    phase: row.phase,
    rir: row.rir,
    deload: !!row.deload,
    assessment: !!row.assessment,
    main: { ...row.main },
    deadlift: { ...row.deadlift },
    accessoryScale: row.deload || row.assessment ? 0.5 : 1,
  };
}

function simplifiedPrescription(program, week, dayKey, name) {
  const plan = simplifiedWeekPlan(week);
  if (!plan) return null;
  const meta = dayExercises(program, dayKey).find((exercise) => exercise.name === name);
  if (!meta) return null;

  const shared = {
    tier: meta.tier || '',
    percentage: null,
    percentageSource: null,
    repMaxTarget: null,
    backoffSets: null,
    backoffReps: null,
    isPlusSet: false,
    mrsCount: 0,
    loadMode: name === 'Pull-Up' ? 'bodyweight' : null,
    load: null,
    needsTrainingMax: false,
  };

  if (SIMPLIFIED_MAIN_BY_DAY[dayKey] === name) {
    const target = name === 'Conventional Deadlift' ? plan.deadlift : plan.main;
    if (plan.assessment) {
      return {
        ...shared,
        scheme: 'simplified-main',
        progressionType: 'controlled-rep-pr',
        sets: 1,
        targetReps: target.reps,
        repRange: [target.reps, target.reps],
        rirTarget: '1',
        doubleProgression: false,
        displayLabel: `1 controlled rep-PR set · ${target.reps}+ reps · stop at 1 RIR`,
        setPlan: [{ role: 'assessment', reps: `${target.reps}+` }],
      };
    }
    return {
      ...shared,
      scheme: 'simplified-main',
      progressionType: plan.deload ? 'deload-straight-sets' : 'fixed-rep-block',
      sets: target.sets,
      targetReps: target.reps,
      repRange: [target.reps, target.reps],
      rirTarget: plan.rir,
      doubleProgression: false,
      displayLabel: `${target.sets} × ${target.reps} · ${plan.rir} RIR${plan.deload ? ' · reduce load 10–15%' : ''}`,
      setPlan: Array.from({ length: target.sets }, () => ({ role: 'work', reps: target.reps })),
    };
  }

  const accessory = SIMPLIFIED_ACCESSORY_TABLE[`${dayKey}:${name}`];
  if (!accessory) return null;
  const reduced = plan.deload || plan.assessment;
  const sets = reduced ? Math.max(1, Math.ceil(accessory.sets / 2)) : accessory.sets;
  const rir = plan.deload ? '4+' : plan.assessment ? '2–3' : '2';
  return {
    ...shared,
    scheme: 'simplified-accessory',
    progressionType: 'double-progression',
    sets,
    targetReps: accessory.min,
    repRange: [accessory.min, accessory.max],
    rirTarget: rir,
    doubleProgression: true,
    displayLabel: `${sets} × ${accessory.min}–${accessory.max} · double progression${reduced ? ' · reduced volume' : ''}`,
    setPlan: Array.from({ length: sets }, () => ({ role: 'work', reps: `${accessory.min}–${accessory.max}` })),
  };
}

/**
 * Map an exercise (by day + name + authored tier) to its progression scheme.
 * Driven by the explicit authored tier metadata, not by guessing from the load
 * type — so a percentage lift is only T2a because its tier says so.
 * @param {string} dayKey @param {string} name @param {string} tier
 * @returns {'t1'|'t2a'|'t2bc'|'t3'|'pullup'|'spec_row'|'core_mon'|'core_sat'|null}
 */
export function jtSchemeFor(dayKey, name, tier) {
  const t = String(tier || '');
  if (name === 'Pull-Up') return 'pullup';               // T2c special — NOT the target-rep table
  if (t === 'Specialization') return 'spec_row';         // Saturday chest-supported row 4×8–12
  if (t === 'Core') return dayKey === 'mon' ? 'core_mon' : 'core_sat';
  if (t.startsWith('T1')) return 't1';
  if (t.startsWith('T2a')) return 't2a';
  if (t.startsWith('T2b') || t.startsWith('T2c')) return 't2bc';
  if (t.startsWith('T3')) return 't3';
  return null;
}

const _pct = (p) => (p == null ? '' : (Number.isInteger(p) ? `${p}%` : `${p}%`));

/**
 * Resolve the structured prescription for one exercise in one week.
 * @param {any} program
 * @param {number} week
 * @param {string} dayKey
 * @param {string} name
 * @param {{ trainingMax?:number|null, dayRepMaxWeight?:number|null, increment?:number }} [opts]
 * @returns {null | {
 *   scheme:string, tier:string, progressionType:string,
 *   sets:number, targetReps:(number|null), repRange:(number[]|null),
 *   percentage:(number|null), percentageSource:(string|null),
 *   repMaxTarget:(number|null), backoffSets:(number|null), backoffReps:(number|null),
 *   isPlusSet:boolean, mrsCount:number, rirTarget:string,
 *   loadMode:(string|null), doubleProgression:boolean,
 *   load:(number|null), needsTrainingMax:boolean,
 *   displayLabel:string, setPlan:Array<{role:string, reps?:(number|string), pct?:number, plus?:boolean}>
 * }}
 */
export function resolveJtPrescription(program, week, dayKey, name, opts = {}) {
  if (program?.progressionModel === 'jt-shed-simplified') {
    return simplifiedPrescription(program, week, dayKey, name);
  }
  if (program?.progressionModel !== 'jt-shed') return null;
  const w = _wk(week);
  if (!w) return null;
  const meta = dayExercises(program, dayKey).find((e) => e.name === name);
  const tier = meta?.tier || '';
  const scheme = jtSchemeFor(dayKey, name, tier);
  if (!scheme) return null;

  const base = {
    scheme, tier, progressionType: scheme,
    sets: 0, targetReps: null, repRange: null,
    percentage: null, percentageSource: null,
    repMaxTarget: null, backoffSets: null, backoffReps: null,
    isPlusSet: false, mrsCount: 0, rirTarget: RIR,
    loadMode: null, doubleProgression: false,
    load: null, needsTrainingMax: false,
    displayLabel: '', setPlan: [],
  };

  if (scheme === 't1') {
    const p = t1Prescription(w);
    if (p.assessment) {
      return { ...base, progressionType: 't1-assessment', sets: 1, repMaxTarget: null,
        displayLabel: '1RM / 2RM / 3RM or rep-PR assessment (true 1RM optional)',
        setPlan: [{ role: 'assessment', reps: '1–3' }] };
    }
    if (p.singleTop) {
      return { ...base, progressionType: 't1-single', sets: 1, repMaxTarget: 1,
        displayLabel: 'Work to a controlled heavy single (no back-off)',
        setPlan: [{ role: 'repmax', reps: 1 }] };
    }
    const bo = p.backoff;
    const load = t1BackoffLoad(w, { trainingMax: opts.trainingMax, dayRepMaxWeight: opts.dayRepMaxWeight, increment: opts.increment });
    const basisTxt = bo.basis === 'dayMax' ? ' of day-max' : '';
    const setPlan = [{ role: 'repmax', reps: p.repMax }];
    for (let i = 0; i < bo.sets; i++) {
      setPlan.push({ role: i === bo.sets - 1 && bo.plusSet ? 'plus' : 'backoff', reps: bo.reps, pct: bo.pct, plus: i === bo.sets - 1 && bo.plusSet });
    }
    return { ...base, progressionType: 't1', sets: 1 + bo.sets, repMaxTarget: p.repMax,
      targetReps: p.repMax, backoffSets: bo.sets, backoffReps: bo.reps,
      percentage: bo.pct, percentageSource: bo.basis === 'dayMax' ? 'dayRepMax' : 'trainingMax',
      isPlusSet: bo.plusSet, load: load.load, needsTrainingMax: !!load.needsTrainingMax,
      displayLabel: `${p.repMax}RM + ${bo.sets}×${bo.reps} @ ${_pct(bo.pct)}${basisTxt}${bo.plusSet ? ' (+)' : ''}`,
      setPlan };
  }

  if (scheme === 't2a') {
    const p = t2aPrescription(w);
    if (!p) return { ...base, progressionType: 't2a-none', sets: 0, displayLabel: 'No T2a work this week' };
    const load = t2aLoad(w, opts.trainingMax, { increment: opts.increment });
    return { ...base, progressionType: 't2a', sets: p.sets, targetReps: p.reps,
      percentage: p.pct, percentageSource: p.basis === 'updatedTm' ? 'updatedTrainingMax' : 'trainingMax',
      load: load.load, needsTrainingMax: !!load.needsTrainingMax,
      displayLabel: `${p.sets} × ${p.reps} @ ${_pct(p.pct)}`,
      setPlan: Array.from({ length: p.sets }, () => ({ role: 'work', reps: p.reps, pct: p.pct })) };
  }

  if (scheme === 't2bc') {
    const p = t2bcPrescription(w);
    if (p.none) return { ...base, progressionType: 't2bc-none', sets: 0, displayLabel: 'No T2b/T2c work this week' };
    if (p.recovery) return { ...base, progressionType: 't2bc-recovery', sets: 2, repRange: [10, 12],
      displayLabel: 'Recovery-only — 2 light sets', setPlan: [{ role: 'light' }, { role: 'light' }] };
    return { ...base, progressionType: 't2bc', sets: 3, targetReps: p.target, mrsCount: 2,
      displayLabel: `${p.target}RM + 2 MRS`,
      setPlan: [{ role: 'target', reps: p.target }, { role: 'mrs' }, { role: 'mrs' }] };
  }

  if (scheme === 't3') {
    const p = t3Prescription(w);
    if (p.rest) return { ...base, progressionType: 't3-rest', sets: 0,
      displayLabel: p.optionalLight ? 'Rest or optional very light pump work' : 'Rest' };
    if (p.light) return { ...base, progressionType: 't3-light', sets: p.lightSets, repRange: [p.lightApprox, p.lightApprox],
      displayLabel: `${p.lightSets} × ~${p.lightApprox} (light, no max-rep sets)`,
      setPlan: Array.from({ length: p.lightSets }, () => ({ role: 'light', reps: p.lightApprox })) };
    return { ...base, progressionType: 't3', sets: 3, targetReps: p.target, mrsCount: 2,
      displayLabel: `${p.target}RM + 2 MRS`,
      setPlan: [{ role: 'target', reps: p.target }, { role: 'mrs' }, { role: 'mrs' }] };
  }

  if (scheme === 'pullup') {
    return { ...base, progressionType: 'double-progression', sets: PULLUP_SCHEME.sets,
      repRange: [PULLUP_SCHEME.minReps, PULLUP_SCHEME.maxReps], doubleProgression: true, loadMode: 'bodyweight',
      displayLabel: `${PULLUP_SCHEME.sets} × ${PULLUP_SCHEME.minReps}–${PULLUP_SCHEME.maxReps} (double progression)`,
      setPlan: Array.from({ length: PULLUP_SCHEME.sets }, () => ({ role: 'work', reps: `${PULLUP_SCHEME.minReps}–${PULLUP_SCHEME.maxReps}` })) };
  }

  if (scheme === 'spec_row') {
    return { ...base, progressionType: 'double-progression', sets: SATURDAY_ROW_SCHEME.sets,
      repRange: [SATURDAY_ROW_SCHEME.minReps, SATURDAY_ROW_SCHEME.maxReps], doubleProgression: true,
      displayLabel: `${SATURDAY_ROW_SCHEME.sets} × ${SATURDAY_ROW_SCHEME.minReps}–${SATURDAY_ROW_SCHEME.maxReps} (double progression)`,
      setPlan: Array.from({ length: SATURDAY_ROW_SCHEME.sets }, () => ({ role: 'work', reps: `${SATURDAY_ROW_SCHEME.minReps}–${SATURDAY_ROW_SCHEME.maxReps}` })) };
  }

  if (scheme === 'core_mon') {
    return { ...base, progressionType: 'double-progression', sets: MONDAY_CORE_SCHEME.sets,
      repRange: [MONDAY_CORE_SCHEME.minReps, MONDAY_CORE_SCHEME.maxReps], doubleProgression: true,
      displayLabel: `${MONDAY_CORE_SCHEME.sets} × ${MONDAY_CORE_SCHEME.minReps}–${MONDAY_CORE_SCHEME.maxReps} (double progression)`,
      setPlan: Array.from({ length: MONDAY_CORE_SCHEME.sets }, () => ({ role: 'work', reps: `${MONDAY_CORE_SCHEME.minReps}–${MONDAY_CORE_SCHEME.maxReps}` })) };
  }

  if (scheme === 'core_sat') {
    return { ...base, progressionType: 'double-progression', sets: SATURDAY_CORE_SCHEME.sets, doubleProgression: true,
      displayLabel: `${SATURDAY_CORE_SCHEME.sets} sets (double progression)`,
      setPlan: Array.from({ length: SATURDAY_CORE_SCHEME.sets }, () => ({ role: 'work' })) };
  }

  return null;
}

/**
 * Turn a resolved `setPlan` into per-row role tags for the live logger. Purely a
 * RENDER helper — it never touches stored sets. The cockpit maps these onto the
 * materialised WORKING set rows in order (warm-ups skipped), so a row's role is
 * derived from the structured prescription, not guessed from raw set position.
 *
 * A plain straight-set `work` role returns `null` (no tag) so ordinary sets stay
 * uncluttered; the meaningful roles (top set / back-off / plus / target / MRS /
 * light / assessment) each get a short label + stable slug for the data-attribute
 * and CSS. MRS rows are numbered in order (MRS 1, MRS 2).
 * @param {Array<{role:string, reps?:(number|string), pct?:number, plus?:boolean}>} setPlan
 * @returns {Array<null | { role:string, label:string, emphasis:boolean }>}
 */
export function jtSetRoleTags(setPlan) {
  if (!Array.isArray(setPlan)) return [];
  let mrs = 0;
  return setPlan.map((s) => {
    const role = s && s.role;
    switch (role) {
      case 'repmax':
        return { role: 'repmax', label: s.reps != null ? `Top set · ${s.reps}RM` : 'Top set', emphasis: true };
      case 'backoff':
        return { role: 'backoff', label: 'Back-off', emphasis: false };
      case 'plus':
        return { role: 'plus', label: 'Back-off +', emphasis: true };
      case 'target':
        return { role: 'target', label: s.reps != null ? `Target · ${s.reps}` : 'Target', emphasis: true };
      case 'mrs':
        mrs += 1;
        return { role: 'mrs', label: `MRS ${mrs}`, emphasis: false };
      case 'light':
        return { role: 'light', label: 'Light', emphasis: false };
      case 'assessment':
        return { role: 'assessment', label: 'Assessment', emphasis: true };
      // Plain straight-set work needs no tag — the card label already states the
      // full sets×reps (e.g. "4 × 10 @ 50%"), so tagging every row is just noise.
      case 'work':
      default:
        return null;
    }
  });
}

/**
 * Role descriptors to STAMP onto the materialised set objects so a row's role
 * travels with the row (stable across warm-up insertion / set removal), and the
 * completed snapshot is self-describing for history. Aligned to the resolved
 * `setPlan`; a plain `work` entry stamps nothing (returns null) so straight-set
 * tiers and non-J&T programs keep byte-identical plain `{w,r,c}` scaffolding.
 *
 * The stamp is prescription METADATA only — it carries no user input, and the
 * draft/warmup/reconcile predicates deliberately ignore it (they key off
 * w/r/type/rpe/rir/bw/band/loadMode), so a fresh role-stamped day is still not
 * mis-detected as a started draft.
 * @returns {Array<null | { role:string, roleReps?:number|null, boPct?:number|null, boSrc?:string|null }>}
 */
export function jtStoredRolesFor(program, week, dayKey, name, opts = {}) {
  const p = resolveJtPrescription(program, week, dayKey, name, opts);
  if (!p || !Array.isArray(p.setPlan)) return [];
  return p.setPlan.map((s) => {
    switch (s && s.role) {
      case 'repmax':
        return { role: 'repmax', roleReps: typeof s.reps === 'number' ? s.reps : null };
      case 'backoff':
        return { role: 'backoff', boPct: s.pct ?? p.percentage ?? null, boSrc: p.percentageSource || null };
      case 'plus':
        return { role: 'plus', boPct: s.pct ?? p.percentage ?? null, boSrc: p.percentageSource || null };
      case 'target':
        return { role: 'target', roleReps: typeof s.reps === 'number' ? s.reps : null };
      case 'mrs':
        return { role: 'mrs' };
      case 'light':
        return { role: 'light' };
      case 'assessment':
        return { role: 'assessment' };
      default:
        return null; // 'work' — straight sets stay untagged/unstamped
    }
  });
}

/**
 * Build a single role tag from a STORED set (`set.role` + `set.roleReps` /
 * `set.boPct` / `set.boSrc`). This is the render source of truth once a set has
 * been materialised, so labels survive row edits and match the completed
 * snapshot in history. Returns null for an unrolled/`work`/warm-up set.
 * @param {any} set
 * @param {number} [mrsOrdinal] 1-based MRS number (the caller counts them in order)
 * @returns {null | { role:string, label:string, emphasis:boolean, boPct?:number|null, boSrc?:string|null }}
 */
export function jtStoredRoleTag(set, mrsOrdinal = 1) {
  const role = set && set.role;
  switch (role) {
    case 'repmax':
      return { role, label: set.roleReps != null ? `Top set · ${set.roleReps}RM` : 'Top set', emphasis: true };
    case 'backoff':
      return { role, label: 'Back-off', emphasis: false, boPct: set.boPct ?? null, boSrc: set.boSrc ?? null };
    case 'plus':
      return { role, label: 'Back-off +', emphasis: true, boPct: set.boPct ?? null, boSrc: set.boSrc ?? null };
    case 'target':
      return { role, label: set.roleReps != null ? `Target · ${set.roleReps}` : 'Target', emphasis: true };
    case 'mrs':
      return { role, label: `MRS ${mrsOrdinal}`, emphasis: false };
    case 'light':
      return { role, label: 'Light', emphasis: false };
    case 'assessment':
      return { role, label: 'Assessment', emphasis: true };
    default:
      return null;
  }
}

/**
 * Suggested T1 back-off load from THAT DAY's top-set weight (Block 2, weeks
 * 7–11: 85% or 90% of the entered rep-max load), rounded to the app increment.
 * Returns null (never NaN/0) when the top-set or percentage is missing, so the
 * caller shows an empty suggestion rather than a fabricated load.
 * @param {number|null|undefined} topWeight
 * @param {number|null|undefined} pct
 * @param {{ increment?:number }} [opts]
 * @returns {number|null}
 */
export function jtBackoffFromTopSet(topWeight, pct, opts = {}) {
  const w = Number(topWeight);
  const p = Number(pct);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(p) || p <= 0) return null;
  return roundLoad((w * p) / 100, opts.increment);
}

/**
 * The {sets, reps, label} triple the cockpit/preview need. `reps` is the primary
 * numeric target used for the label + auto-progression rep goal; `label` is the
 * full tier-aware prescription string. Returns null for non-J&T / unknown lifts
 * so callers fall back to the generic liftTarget.
 * @returns {null | { sets:number, reps:(number|string), label:string, prescription:any }}
 */
export function jtLiftTarget(program, week, dayKey, name, opts = {}) {
  const p = resolveJtPrescription(program, week, dayKey, name, opts);
  if (!p) return null;
  const reps = p.targetReps != null ? p.targetReps
    : (p.repRange ? `${p.repRange[0]}–${p.repRange[1]}` : (p.repMaxTarget != null ? p.repMaxTarget : ''));
  return { sets: p.sets, reps, label: p.displayLabel, prescription: p };
}

// -----------------------------------------------------------------------------
function _wk(week) {
  const w = Math.floor(Number(week));
  return Number.isFinite(w) && w >= 1 && w <= JT_SHED_WEEKS ? w : null;
}
