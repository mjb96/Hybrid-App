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
