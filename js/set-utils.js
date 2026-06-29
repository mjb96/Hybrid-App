// @ts-check
// ==========================================
// SET UTILITIES (set-utils.js)
// Canonical helpers for interpreting a logged set. Leaf module (no imports) so
// every view can share one definition instead of re-inlining the predicate.
// ==========================================

/**
 * Canonical "is this set completed?" check. Tolerates every legacy encoding of
 * the `c` flag (`true`, `'true'`, `'on'`, `1`) that has appeared in stored data.
 * @param {any} s
 * @returns {boolean}
 */
export function isCompletedSet(s) {
  if (!s) return false;
  return s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
}

/**
 * Warm-up sets are excluded from volume / e1RM. Covers both the current `type`
 * marker and the legacy `isWarmup` flag.
 * @param {any} s
 * @returns {boolean}
 */
export function isWarmupSet(s) {
  return !!(s && (s.type === 'W' || s.isWarmup));
}

/**
 * Tonnage for a single set (weight × reps), coercing string inputs.
 * @param {any} s
 * @returns {number}
 */
export function setVolume(s) {
  return (parseFloat(s?.w) || 0) * (parseInt(s?.r, 10) || 0);
}

/**
 * Sum completed-set tonnage across a day's lifts object
 * (`{ liftName: [sets] }`). Warm-ups are excluded unless `includeWarmups`.
 * @param {Record<string, any[]>} dayLifts
 * @param {{ includeWarmups?: boolean }} [opts]
 * @returns {number}
 */
export function dayVolume(dayLifts, { includeWarmups = false } = {}) {
  let vol = 0;
  for (const lift in (dayLifts || {})) {
    const sets = dayLifts[lift];
    if (!Array.isArray(sets)) continue;
    for (const s of sets) {
      if (isCompletedSet(s) && (includeWarmups || !isWarmupSet(s))) vol += setVolume(s);
    }
  }
  return vol;
}
