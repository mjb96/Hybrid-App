// @ts-check
// =============================================================================
// HEALTH CONNECT SUPPORTED-FIELD CONTRACT (js/health/health-fields.js)
//
// THE single source of truth for which Health Connect fields Helyx supports.
// This contract is shared, unchanged, by every layer:
//   Settings toggles → permission requests → native record reads → returned
//   per-day payload keys → stored appState.healthConnect series → per-field
//   sync status.
//
// A field belongs here ONLY if it has a complete end-to-end path: a Settings
// toggle, a Health Connect read permission, a native record read, a returned
// payload key, a stored series, and at least one app consumer. If any link is
// missing the field is NOT supported and must not be presented as a control.
//
// VO₂ max used to have a Settings toggle and read-side consumers but NO
// ingestion path (the native bridge never returned it), so connecting could
// never populate it. That fake control was removed rather than faked; it is
// intentionally absent from this contract. The same id vocabulary
// ('steps' | 'restingHR' | 'hrv' | 'sleep') is used verbatim by the native
// contract (android/.../HealthFieldContract.kt) so the two never diverge.
// =============================================================================

/**
 * @typedef {Object} HealthField
 * @property {string} id         Stable id shared JS↔native↔settings (the toggle key).
 * @property {string} label      Human label shown next to the Settings toggle.
 * @property {string} seriesKey  Key under state.healthConnect that stores the series.
 * @property {string} payloadKey Key on each native per-day bucket carrying the value.
 */

/** @type {ReadonlyArray<HealthField>} */
export const HEALTH_FIELDS = Object.freeze([
  Object.freeze({ id: 'steps',     label: 'Daily Steps',                  seriesKey: 'steps',     payloadKey: 'steps' }),
  Object.freeze({ id: 'restingHR', label: 'Resting Heart Rate',           seriesKey: 'restingHR', payloadKey: 'restingHeartRate' }),
  Object.freeze({ id: 'hrv',       label: 'Heart Rate Variability (HRV)', seriesKey: 'hrv',       payloadKey: 'hrvRmssd' }),
  Object.freeze({ id: 'sleep',     label: 'Sleep Duration',               seriesKey: 'sleep',     payloadKey: 'sleepSessions' }),
]);

/** @type {ReadonlyArray<string>} Ordered supported field ids. */
export const HEALTH_FIELD_IDS = Object.freeze(HEALTH_FIELDS.map(f => f.id));

/** True only for a field with a real end-to-end path in the contract. */
export function isSupportedField(id) {
  return HEALTH_FIELD_IDS.includes(id);
}

/** The field descriptor for `id`, or null when unsupported. */
export function fieldById(id) {
  return HEALTH_FIELDS.find(f => f.id === id) || null;
}

/**
 * Normalize a persisted syncFields map onto the supported contract:
 *   - drops any unsupported keys (e.g. legacy `vo2max`);
 *   - defaults a missing supported key to enabled (opt-out model);
 *   - coerces to booleans.
 * Returns a fresh object keyed by exactly the supported ids.
 * @param {Record<string, any>|null|undefined} syncFields
 * @returns {Record<string, boolean>}
 */
export function normalizeSyncFields(syncFields) {
  const src = (syncFields && typeof syncFields === 'object') ? syncFields : {};
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const id of HEALTH_FIELD_IDS) out[id] = src[id] !== false;
  return out;
}

/** A fresh default syncFields map (every supported field enabled). */
export function defaultSyncFields() {
  return normalizeSyncFields(null);
}

/**
 * The ordered list of field ids the user has actually selected: supported AND
 * enabled. This is the ONLY set that may drive permission requests and reads —
 * never request or read a field outside it.
 * @param {Record<string, any>|null|undefined} syncFields
 * @returns {string[]}
 */
export function selectedFieldIds(syncFields) {
  const norm = normalizeSyncFields(syncFields);
  return HEALTH_FIELD_IDS.filter(id => norm[id]);
}
