// @ts-check
// =============================================================================
// SET ENTRY (js/workout/set-entry.js) — roadmap Phase 2A
//
// Two of the set-row contract's requirements, modelled away from the DOM:
//
//   "previous values visible"
//   "invalid or incomplete input explained inline"
//
// PREVIOUS VALUES. The row already showed last time's numbers as input
// PLACEHOLDERS, which vanish the moment you type — exactly when you want to
// compare against them. `previousSetLabel` produces a label that can sit beside
// the field and stay put.
//
// VALIDATION. Completion previously only asked "is this field non-empty?", so
// `-50` and `0` reps were both accepted. Neither is a real set, and a negative
// weight is not merely cosmetic: `setVolume` is `parseFloat(w) * parseInt(r)`,
// so one mistyped minus subtracts from tonnage, weekly volume, muscle credits
// and every landmark comparison built on them. This is the guard for that.
//
// The bounds are deliberately asymmetric. Impossible values are ERRORS and
// block the tick. Merely surprising ones are WARNINGS that inform and get out
// of the way — an athlete really can rep 120 bodyweight squats, and a logger
// that argues with them is a logger they stop using.
//
// PURE. No DOM, no state mutation, no imports.
// =============================================================================

/**
 * Above these, a value is surprising but still possible, so it warns rather
 * than blocks. Weight is unit-agnostic on purpose: the app stores whatever unit
 * the athlete entered and never converts, so one bound has to cover both. It is
 * set at the loose (lbs) end so a legitimate heavy lbs load is never called
 * impossible — the cost of a missed warning is far lower than the cost of
 * refusing a real lift.
 */
export const SET_ENTRY_LIMITS = Object.freeze({
  maxReps: 100,
  maxWeight: 1500,
});

/**
 * @typedef {object} SetEntryMessage
 * @property {'weight'|'reps'} field
 * @property {'error'|'warning'} level
 * @property {string} text
 */

/**
 * Validate one set's entered values.
 *
 * @param {{weight?: any, reps?: any, type?: string, loadMode?: string}} entry
 * @returns {{ok: boolean, errors: SetEntryMessage[], warnings: SetEntryMessage[], firstErrorField: 'weight'|'reps'|null}}
 */
export function validateSetEntry(entry = {}) {
  /** @type {SetEntryMessage[]} */
  const errors = [];
  /** @type {SetEntryMessage[]} */
  const warnings = [];

  const rawWeight = String(entry.weight ?? '').trim();
  const rawReps = String(entry.reps ?? '').trim();
  // Bodyweight and assisted rows derive their effective load from body mass and
  // band assistance, so a blank weight there is normal, not incomplete.
  const weightRequired = (entry.loadMode || 'weighted') === 'weighted';

  if (!rawWeight) {
    if (weightRequired) errors.push({ field: 'weight', level: 'error', text: 'Enter the weight.' });
  } else {
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight)) {
      errors.push({ field: 'weight', level: 'error', text: 'Weight must be a number.' });
    } else if (weight < 0) {
      // The defect this whole module exists for.
      errors.push({ field: 'weight', level: 'error', text: 'Weight cannot be negative.' });
    } else if (weight > SET_ENTRY_LIMITS.maxWeight) {
      warnings.push({ field: 'weight', level: 'warning', text: `Over ${SET_ENTRY_LIMITS.maxWeight} — check the number.` });
    }
  }

  if (!rawReps) {
    errors.push({ field: 'reps', level: 'error', text: 'Enter the reps.' });
  } else {
    const reps = Number(rawReps);
    if (!Number.isFinite(reps)) {
      errors.push({ field: 'reps', level: 'error', text: 'Reps must be a number.' });
    } else if (!Number.isInteger(reps)) {
      errors.push({ field: 'reps', level: 'error', text: 'Whole reps only.' });
    } else if (reps < 1) {
      // A completed set of zero reps is a set that did not happen. It also reads
      // as done in the cockpit while isValidWorkingSet drops it from analytics —
      // the screen and the numbers would disagree.
      errors.push({ field: 'reps', level: 'error', text: 'At least 1 rep.' });
    } else if (reps > SET_ENTRY_LIMITS.maxReps) {
      warnings.push({ field: 'reps', level: 'warning', text: `Over ${SET_ENTRY_LIMITS.maxReps} reps — check the number.` });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    firstErrorField: errors.length ? errors[0].field : null,
  };
}

/**
 * The one message to show on the row. Errors outrank warnings; the weight field
 * is read before reps so the message order matches the row's own layout.
 * @param {ReturnType<typeof validateSetEntry>} result
 * @returns {SetEntryMessage|null}
 */
export function primarySetEntryMessage(result) {
  if (!result) return null;
  const ordered = [...result.errors, ...result.warnings];
  if (!ordered.length) return null;
  const byField = (field) => ordered.find((m) => m.field === field);
  return byField('weight') || byField('reps') || ordered[0];
}

/**
 * Last time's numbers for this set, formatted to sit next to the fields and
 * stay visible while typing.
 *
 * Returns null rather than a placeholder string when there is nothing to show:
 * a first-ever session must read as blank, not as "-- × --", which looks like
 * data that failed to load.
 *
 * @param {{w?: any, r?: any}|null|undefined} previousSet
 * @param {string} [unit] the athlete's own unit — this app never converts, it labels
 * @returns {{text: string, label: string}|null}
 */
export function previousSetLabel(previousSet, unit = 'kg') {
  if (!previousSet) return null;
  const weight = Number(String(previousSet.w ?? '').trim());
  const reps = Number(String(previousSet.r ?? '').trim());
  const hasWeight = Number.isFinite(weight) && weight > 0;
  const hasReps = Number.isFinite(reps) && reps > 0;
  if (!hasReps && !hasWeight) return null;

  const weightPart = hasWeight ? `${trimNumber(weight)}${unit}` : '';
  const repsPart = hasReps ? `${trimNumber(reps)}` : '';
  const text = hasWeight && hasReps ? `${weightPart} × ${repsPart}`
    : hasWeight ? weightPart
    : `${repsPart} reps`;

  return { text: `Last ${text}`, label: `Last time: ${text}` };
}

/** 100.0 → "100", 102.5 → "102.5". Stored weights are strings of both shapes. */
function trimNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
