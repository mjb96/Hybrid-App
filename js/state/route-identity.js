// @ts-check
// =============================================================================
// ROUTE IDENTITY (js/state/route-identity.js)
//
// GPS routes used to be stored in IndexedDB keyed ONLY by "week_day" (e.g.
// "1_mon"). That coordinate is not unique: two program runs (activations) that
// both reach Week 1 / Monday, or two runs on the same day, collide on one key —
// the later write silently overwrites the earlier route (location-data loss),
// and a fresh program's Week 1 could surface a previous program's route (the
// same cross-activation leak the workout logger fixed with activation identity).
//
// This module gives every route a STABLE id plus the metadata needed to attribute
// it unambiguously: activation, program, calendar date, timestamps, and a
// composite `slotKey` (activation + week + day) used to look a route up without
// colliding across activations. Pure — no IndexedDB, no DOM — so the record shape
// and the legacy migration transform are fully unit-testable. The IndexedDB
// read/write lives in js/db.js.
// =============================================================================

export const ROUTE_RECORD_VERSION = 2;

/** Stable, collision-resistant id for one route. Uses crypto.randomUUID when
 *  available (secure-context browsers + the Android WebView + Node ≥ 16.7),
 *  with a time+random fallback so it never throws in an odd environment. */
export function newRouteId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) { /* fall through to the manual fallback */ }
  const rnd = () => Math.random().toString(16).slice(2).padStart(8, '0').slice(0, 8);
  return `r-${Date.now().toString(16)}-${rnd()}-${rnd()}`;
}

/** Composite lookup key: identifies a route slot WITHOUT colliding across
 *  activations. A missing activation is treated as the shared legacy space. */
export function slotKey(activationId, week, day) {
  return `${activationId || 'legacy'}|${week}|${day}`;
}

/** Parse a legacy "week_day" key ("12_mon") → { week, day }, or null if it
 *  isn't in that shape. day may be any alnum token; week is the leading digits. */
export function parseLegacyKey(key) {
  if (typeof key !== 'string') return null;
  const m = /^(\d+)_([A-Za-z0-9]+)$/.exec(key);
  if (!m) return null;
  return { week: m[1], day: m[2] };
}

/**
 * Build a normalised route record. Fills id/updatedTs/version/slotKey; keeps the
 * caller's activation/program/date metadata. `coordinates` is stored verbatim
 * (js/db.js and route-portability validate/cap points on the way in/out).
 * @param {{
 *   id?: string, activationId?: string, programId?: string,
 *   week: string|number, day: string, coordinates: any[],
 *   startTs?: number, updatedTs?: number, localDate?: string, legacyKey?: string,
 * }} input
 */
export function makeRouteRecord(input) {
  const week = String(input.week);
  const day = String(input.day);
  const activationId = input.activationId || 'legacy';
  const now = Number.isFinite(input.updatedTs) ? Number(input.updatedTs) : Date.now();
  return {
    id: input.id || newRouteId(),
    activationId,
    programId: input.programId || null,
    week,
    day,
    localDate: input.localDate || null,
    startTs: Number.isFinite(input.startTs) ? Number(input.startTs) : now,
    updatedTs: now,
    version: ROUTE_RECORD_VERSION,
    legacyKey: input.legacyKey || null,
    slotKey: slotKey(activationId, week, day),
    coordinates: Array.isArray(input.coordinates) ? input.coordinates : [],
  };
}

/**
 * Transform a legacy `{ "week_day": coords }` map into stable-id records for the
 * v1→v2 IndexedDB migration. Every legacy route becomes ONE record under the
 * shared `legacy` activation, tagged with its original key so nothing is lost and
 * a collision (two legacy keys that normalise the same) still yields two records
 * with distinct ids rather than an overwrite.
 * @param {Record<string, any[]>} legacyMap
 * @param {{ now?: number }} [opts]
 */
export function legacyRecordsFromMap(legacyMap, opts = {}) {
  const out = [];
  if (!legacyMap || typeof legacyMap !== 'object') return out;
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  for (const key of Object.keys(legacyMap)) {
    const coords = legacyMap[key];
    if (!Array.isArray(coords) || coords.length === 0) continue;
    const parsed = parseLegacyKey(key);
    out.push(makeRouteRecord({
      activationId: 'legacy',
      week: parsed ? parsed.week : key,
      day: parsed ? parsed.day : '',
      coordinates: coords,
      legacyKey: key,
      updatedTs: now,
    }));
  }
  return out;
}

/** Pick the most recently updated record for a slot from a record list, or null.
 *  Used by reads when several records share (activation, week, day). */
export function latestForSlot(records, activationId, week, day) {
  const want = slotKey(activationId, week, day);
  let best = null;
  for (const r of records || []) {
    if (!r || r.slotKey !== want) continue;
    if (!best || (r.updatedTs || 0) > (best.updatedTs || 0)) best = r;
  }
  return best;
}
