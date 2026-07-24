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
export const JT_SHED_WEEKS = 12;

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
function _wk(week) {
  const w = Math.floor(Number(week));
  return Number.isFinite(w) && w >= 1 && w <= JT_SHED_WEEKS ? w : null;
}
