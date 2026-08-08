// @ts-check
// =============================================================================
// PROGRAM PROGRESSION EDITORS (js/programs/progression.js)
//
// Pure, DOM-free editors for a program's weekly progression — its
// `weeklyVolModifiers` map ({ '1': { sets, reps, intensityLabel }, … }). This is
// the lever that makes a forked/custom program
// genuinely re-programmable.
//
// Why per-WEEK and not per-LIFT: the cockpit resolves each lift's sets/reps via
// getWeekModifier(program, wk) → liftTarget() (js/schema.js + js/engine.js).
// For a custom/forked program the day `desc` is empty, so liftTarget falls back
// to the week modifier — meaning editing these values flows straight into the
// materialised set count and the cockpit target label. Per-lift structured
// fields would instead require migrating `day.lifts` from strings to objects
// across 150+ call sites, so that's deliberately out of scope here.
//
// Kept in its own module (no `document`) so it's unit-testable — the builder
// itself installs a module-level DOM listener and can't be imported under node.
// =============================================================================

const MIN_SETS = 1;
const MAX_SETS = 12;

/** Clamp a sets value to a sane integer, falling back to 3 on garbage. */
function clampSets(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_SETS, Math.max(MIN_SETS, v)) : 3;
}

/** The ordered week keys ('1'..'N') a program's progression should cover. */
export function weekKeys(program) {
  const total = parseInt(program?.totalWeeks, 10) || 12;
  return Array.from({ length: total }, (_, i) => String(i + 1));
}

/**
 * Guarantee `weeklyVolModifiers` exists and carries a well-formed entry for
 * every week 1..totalWeeks. Never deletes or overwrites existing values — only
 * fills gaps — so a forked catalog program keeps its authored progression and a
 * fresh custom program gets a full editable ladder. Idempotent.
 */
export function ensureWeeklyMods(program) {
  if (!program) return {};
  if (!program.weeklyVolModifiers || typeof program.weeklyVolModifiers !== 'object'
      || Array.isArray(program.weeklyVolModifiers)) {
    program.weeklyVolModifiers = {};
  }
  for (const k of weekKeys(program)) {
    const m = program.weeklyVolModifiers[k];
    if (!m || typeof m !== 'object') {
      program.weeklyVolModifiers[k] = { sets: 3, reps: 10, intensityLabel: 'Working Sets' };
    } else {
      if (m.sets == null) m.sets = 3;
      if (m.reps == null) m.reps = 10;
      if (m.intensityLabel == null) m.intensityLabel = 'Working Sets';
    }
  }
  return program.weeklyVolModifiers;
}

/**
 * Edit one field of one week. `sets` is clamped to an integer; `reps` keeps a
 * plain number when the input is purely numeric but tolerates a range string
 * ("8-10"); `intensityLabel` is free text. Returns the mutated modifier.
 */
export function setWeekField(program, wk, field, value) {
  if (!program) return null;
  ensureWeeklyMods(program);
  const m = program.weeklyVolModifiers[String(wk)];
  if (!m) return null;
  if (field === 'sets') {
    m.sets = clampSets(value);
  } else if (field === 'reps') {
    const s = String(value).trim();
    if (s) m.reps = /^\d+$/.test(s) ? Number(s) : s;
  } else if (field === 'intensityLabel') {
    m.intensityLabel = String(value);
  }
  return m;
}

/** True when a week's label reads as a deload. */
export function isDeloadWeek(mod) {
  return /deload/i.test(mod?.intensityLabel || '');
}

/**
 * Turn a week into a deload: roughly halve its sets (floor 2) and label it, so
 * both the cockpit volume and the Plan-timeline classification reflect it.
 */
export function markWeekDeload(program, wk) {
  ensureWeeklyMods(program);
  const m = program.weeklyVolModifiers[String(wk)];
  if (!m) return null;
  m.sets = clampSets(Math.max(2, Math.round((Number(m.sets) || 4) / 2)));
  m.intensityLabel = 'Deload week';
  return m;
}

// ── Broad progression shapes (Phase 4C "Simple" editing) ─────────────────────
//
// Filling in a 12-week grid by hand is 36 inputs before you have a programme,
// and it is the only way the builder offered to say "make this get harder". A
// SHAPE answers that question once and writes the same `weeklyVolModifiers` the
// per-week editor writes — no new stored field, no per-lift prescription, so the
// 4C ADR gate on normalised prescription DATA stays firmly shut.

/** @typedef {'steady'|'volume'|'intensity'} ProgressionShapeId */

export const PROGRESSION_SHAPES = Object.freeze([
  {
    id: 'steady',
    label: 'Keep it steady',
    blurb: 'Same sets and reps every week. Progress comes from adding weight.',
  },
  {
    id: 'volume',
    label: 'Build volume',
    blurb: 'Adds a set every few weeks, so the work goes up as you adapt.',
  },
  {
    id: 'intensity',
    label: 'Build intensity',
    blurb: 'Reps come down over the block so you can push the weight up.',
  },
]);

export const DELOAD_CADENCES = Object.freeze([
  { value: 0, label: 'No deloads' },
  { value: 4, label: 'Every 4th week' },
  { value: 6, label: 'Every 6th week' },
]);

/** The rep ladder an intensity block walks down, highest first. */
const INTENSITY_LADDER = [12, 10, 8, 6, 5];

function baseSets(program) {
  const first = program?.weeklyVolModifiers?.['1'];
  return clampSets(first?.sets ?? 3);
}

function baseReps(program) {
  const first = program?.weeklyVolModifiers?.['1'];
  const raw = first?.reps;
  if (raw == null || raw === '') return 10;
  return /^\d+$/.test(String(raw).trim()) ? Number(raw) : String(raw);
}

/** A numeric rep value to ladder from, even when the base is a range string. */
function numericBaseReps(program) {
  const raw = baseReps(program);
  if (typeof raw === 'number') return raw;
  const match = String(raw).match(/\d+/);
  return match ? Number(match[0]) : 10;
}

/**
 * What a shape would produce, week by week — WITHOUT touching the program.
 *
 * The builder shows this before anything is written, because "make this get
 * harder" is a change to every week at once and an athlete should see it before
 * agreeing to it.
 *
 * @param {any} program
 * @param {ProgressionShapeId} shape
 * @param {{ deloadEvery?: number }} [opts]
 * @returns {{ week:string, sets:number, reps:number|string, intensityLabel:string, deload:boolean }[]}
 */
export function planProgressionShape(program, shape, opts = {}) {
  const weeks = weekKeys(program);
  const deloadEvery = Math.max(0, Math.round(Number(opts.deloadEvery) || 0));
  const sets = baseSets(program);
  const reps = baseReps(program);
  const startReps = numericBaseReps(program);
  // Where on the ladder the athlete's own starting reps sit, so "build
  // intensity" walks down from what they chose rather than from a fixed 12.
  const ladderStart = Math.max(0, INTENSITY_LADDER.findIndex((r) => r <= startReps));

  // Weeks that are actually training weeks decide the ramp, so a deload does not
  // consume a step of the progression it is there to recover from.
  let trainingIndex = 0;

  return weeks.map((week) => {
    const n = Number(week);
    const isDeload = deloadEvery > 0 && n % deloadEvery === 0;
    if (isDeload) {
      return {
        week,
        sets: clampSets(Math.max(2, Math.round(sets / 2))),
        reps,
        intensityLabel: 'Deload week',
        deload: true,
      };
    }
    const step = trainingIndex++;
    if (shape === 'volume') {
      const added = Math.floor(step / 3);
      return {
        week,
        sets: clampSets(sets + added),
        reps,
        intensityLabel: added === 0 ? 'Working Sets' : `Volume +${added}`,
        deload: false,
      };
    }
    if (shape === 'intensity') {
      const rung = Math.min(INTENSITY_LADDER.length - 1, ladderStart + Math.floor(step / 2));
      return {
        week,
        sets,
        reps: INTENSITY_LADDER[rung],
        intensityLabel: rung >= INTENSITY_LADDER.length - 1 ? 'Peak' : rung > ladderStart ? 'Build' : 'Working Sets',
        deload: false,
      };
    }
    return { week, sets, reps, intensityLabel: 'Working Sets', deload: false };
  });
}

/**
 * Apply a shape across every week. Returns the previous `weeklyVolModifiers` so
 * the caller can offer a real Undo — 4C asks for edits that feel reversible, and
 * this one rewrites the whole block at once.
 *
 * @returns {{ applied:number, previous:Record<string, any> }}
 */
export function applyProgressionShape(program, shape, opts = {}) {
  ensureWeeklyMods(program);
  const previous = JSON.parse(JSON.stringify(program.weeklyVolModifiers));
  const plan = planProgressionShape(program, shape, opts);
  for (const row of plan) {
    program.weeklyVolModifiers[row.week] = {
      ...(program.weeklyVolModifiers[row.week] || {}),
      sets: row.sets,
      reps: row.reps,
      intensityLabel: row.intensityLabel,
    };
  }
  return { applied: plan.length, previous };
}

/** Put back exactly what `applyProgressionShape` replaced. */
export function restoreProgression(program, previous) {
  if (!program || !previous || typeof previous !== 'object') return false;
  program.weeklyVolModifiers = JSON.parse(JSON.stringify(previous));
  ensureWeeklyMods(program);
  return true;
}

/**
 * One plain sentence describing the block a shape produces, for the builder to
 * show before it writes anything. Ranges are collapsed so a 12-week plan reads
 * as a shape and not as a table.
 */
export function describeProgressionPlan(plan) {
  if (!plan?.length) return '';
  const training = plan.filter((row) => !row.deload);
  const deloads = plan.filter((row) => row.deload);
  if (!training.length) return 'Every week is a deload.';

  const firstSets = training[0].sets;
  const lastSets = training[training.length - 1].sets;
  const firstReps = training[0].reps;
  const lastReps = training[training.length - 1].reps;

  const setsPart = firstSets === lastSets ? `${firstSets} sets` : `${firstSets} → ${lastSets} sets`;
  const repsPart = String(firstReps) === String(lastReps) ? `${firstReps} reps` : `${firstReps} → ${lastReps} reps`;
  const deloadPart = deloads.length
    ? ` · ${deloads.length} deload week${deloads.length === 1 ? '' : 's'} (${deloads.map((d) => d.week).join(', ')})`
    : '';
  return `${setsPart} · ${repsPart} across ${training.length} training week${training.length === 1 ? '' : 's'}${deloadPart}`;
}
