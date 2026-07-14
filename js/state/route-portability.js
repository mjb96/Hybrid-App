// @ts-check
// =============================================================================
// ROUTE PORTABILITY — include GPS routes in export / import / backup
// -----------------------------------------------------------------------------
// GPS route coordinates live in IndexedDB (HybridTrainingDB → runMaps, keyed
// "week_day"), NOT in appState, so the plain JSON export used to silently drop
// them and import never restored them. This module makes routes portable:
//
//   • wrapExport(state, records) → versioned envelope { format, version, … }
//   • parseImport(parsed)        → { state, routeRecords, routes } for the new
//                                   envelope AND every legacy export shape
//   • sanitizeRoutes(raw)        → validated, size-capped { key: [[lat,lng],…] }
//
// Everything here is pure (no IndexedDB / DOM) so it is fully unit-tested. The
// IndexedDB read/write lives in js/db.js.
// =============================================================================
import { makeRouteRecord } from './route-identity.js';

export const EXPORT_FORMAT = 'helyx-export';
export const EXPORT_VERSION = 3;

// Guards against malformed or maliciously huge route payloads on import.
export const ROUTE_LIMITS = {
  maxRoutes: 5000,            // far beyond a heavy user's logged runs
  maxPointsPerRoute: 200000,  // a marathon at 1 Hz ≈ 15k points
  maxKeyLength: 64,
  maxIdLength: 256,
  maxMetaLength: 256,
};

const KEY_RE = /^\d+_[A-Za-z0-9]+$/; // "week_day", e.g. "12_mon"

function isFiniteNum(n) { return typeof n === 'number' && Number.isFinite(n); }

function validPoint(p) {
  if (!Array.isArray(p) || p.length < 2) return null;
  const lat = p[0], lng = p[1];
  if (!isFiniteNum(lat) || !isFiniteNum(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Normalise to a bare [lat, lng] pair — that is all the maps consume, and it
  // avoids persisting any extra per-point fields we didn't validate.
  return /** @type {[number, number]} */ ([lat, lng]);
}

function sanitizePoints(raw, limits) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const pts = [];
  for (const p of raw) {
    if (pts.length >= limits.maxPointsPerRoute) break;
    const norm = validPoint(p);
    if (norm) pts.push(norm);
  }
  return pts.length >= 2 ? pts : null;
}

/**
 * Validate + normalise a raw routes object into safe, size-capped data.
 * Silently drops anything malformed (a bad file must never crash import) and
 * enforces hard caps. Returns { routes, dropped } so callers can report.
 * @param {any} raw
 * @param {typeof ROUTE_LIMITS} [limits]
 * @returns {{ routes: Record<string, [number,number][]>, dropped: number }}
 */
export function sanitizeRoutes(raw, limits = ROUTE_LIMITS) {
  /** @type {Record<string, [number,number][]>} */
  const routes = {};
  let dropped = 0;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { routes, dropped };

  let count = 0;
  for (const key of Object.keys(raw)) {
    if (count >= limits.maxRoutes) { dropped++; continue; }
    if (typeof key !== 'string' || key.length > limits.maxKeyLength || !KEY_RE.test(key)) { dropped++; continue; }
    const pts = sanitizePoints(raw[key], limits);
    if (!pts) { dropped++; continue; }
    routes[key] = pts;
    count++;
  }
  return { routes, dropped };
}

function safeMeta(value, maxLength = ROUTE_LIMITS.maxMetaLength) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) return null;
  return value;
}

/**
 * Validate rich IndexedDB route records without collapsing same-day sessions.
 * Record ids are preserved so importing the same backup is idempotent.
 * @param {any} raw
 * @param {typeof ROUTE_LIMITS} [limits]
 */
export function sanitizeRouteRecords(raw, limits = ROUTE_LIMITS) {
  const routeRecords = [];
  let dropped = 0;
  if (!Array.isArray(raw)) return { routeRecords, dropped };
  const seen = new Set();
  for (const value of raw) {
    if (routeRecords.length >= limits.maxRoutes) { dropped++; continue; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { dropped++; continue; }
    const id = safeMeta(value.id, limits.maxIdLength);
    const week = typeof value.week === 'number' ? String(value.week) : safeMeta(value.week);
    const day = safeMeta(value.day, 16);
    const coordinates = sanitizePoints(value.coordinates, limits);
    if (!id || seen.has(id) || !week || !/^\d+$/.test(week) || !day || !/^[A-Za-z0-9]+$/.test(day) || !coordinates) {
      dropped++; continue;
    }
    const sessionId = safeMeta(value.sessionId, limits.maxIdLength);
    if (sessionId && id !== `route:${sessionId}`) { dropped++; continue; }
    const activationId = safeMeta(value.activationId) || 'legacy';
    const programId = safeMeta(value.programId);
    const localDate = safeMeta(value.localDate, 32);
    const startTs = Number(value.startTs);
    const updatedTs = Number(value.updatedTs);
    routeRecords.push(makeRouteRecord({
      id,
      sessionId: sessionId || undefined,
      activationId,
      programId: programId || undefined,
      week,
      day,
      localDate: localDate || undefined,
      startTs: Number.isFinite(startTs) && startTs > 0 ? startTs : undefined,
      updatedTs: Number.isFinite(updatedTs) && updatedTs > 0 ? updatedTs : undefined,
      legacyKey: safeMeta(value.legacyKey, limits.maxKeyLength) || undefined,
      coordinates,
    }));
    seen.add(id);
  }
  return { routeRecords, dropped };
}

/**
 * Wrap appState + routes in the versioned export envelope.
 * @param {any} state
 * @param {Record<string, [number,number][]>|any[]} [routePayload]
 * @param {{ appVersion?: string }} [meta]
 */
export function wrapExport(state, routePayload = {}, meta = {}) {
  const { routeRecords } = sanitizeRouteRecords(Array.isArray(routePayload) ? routePayload : []);
  const { routes } = sanitizeRoutes(Array.isArray(routePayload) ? {} : routePayload);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: meta.appVersion || null,
    state,
    routeRecords,
    routes,
  };
}

/**
 * Parse an imported file into state + route payloads, accepting:
 *   • v3 envelope: rich routeRecords (same-day sessions preserved)
 *   • v2 envelope: legacy { "week_day": coordinates } route map
 *   • legacy: a raw appState object (has currentWeek + weeks) — no routes
 * Returns null when the payload isn't a recognisable Helyx export.
 * @param {any} parsed
 * @returns {{ state: any, routeRecords: any[], routes: Record<string, [number,number][]>, legacy: boolean } | null}
 */
export function parseImport(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  // Versioned envelope. Sanitise both fields so malformed extras never reach DB.
  if (parsed.format === EXPORT_FORMAT && parsed.state && typeof parsed.state === 'object') {
    if (!isAppState(parsed.state)) return null;
    const { routes } = sanitizeRoutes(parsed.routes);
    const { routeRecords } = sanitizeRouteRecords(parsed.routeRecords);
    return { state: parsed.state, routeRecords, routes, legacy: false };
  }

  // Legacy raw-appState export (pre-routes). Keep importing these verbatim.
  if (isAppState(parsed)) {
    return { state: parsed, routeRecords: [], routes: {}, legacy: true };
  }
  return null;
}

function isAppState(o) {
  return o && typeof o === 'object' && o.currentWeek && o.weeks &&
    typeof o.weeks === 'object' && Object.keys(o.weeks).length > 0;
}
