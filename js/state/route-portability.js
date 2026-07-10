// @ts-check
// =============================================================================
// ROUTE PORTABILITY — include GPS routes in export / import / backup
// -----------------------------------------------------------------------------
// GPS route coordinates live in IndexedDB (HybridTrainingDB → runMaps, keyed
// "week_day"), NOT in appState, so the plain JSON export used to silently drop
// them and import never restored them. This module makes routes portable:
//
//   • wrapExport(state, routes)  → versioned envelope { format, version, … }
//   • parseImport(parsed)        → { state, routes } for BOTH the new envelope
//                                   AND legacy raw-appState exports (bw-compat)
//   • sanitizeRoutes(raw)        → validated, size-capped { key: [[lat,lng],…] }
//
// Everything here is pure (no IndexedDB / DOM) so it is fully unit-tested. The
// IndexedDB read/write lives in js/db.js.
// =============================================================================

export const EXPORT_FORMAT = 'helyx-export';
export const EXPORT_VERSION = 2;

// Guards against malformed or maliciously huge route payloads on import.
export const ROUTE_LIMITS = {
  maxRoutes: 5000,            // far beyond a heavy user's logged runs
  maxPointsPerRoute: 200000,  // a marathon at 1 Hz ≈ 15k points
  maxKeyLength: 64,
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
    const val = raw[key];
    if (!Array.isArray(val) || val.length < 2) { dropped++; continue; }

    /** @type {[number, number][]} */
    const pts = [];
    for (const p of val) {
      if (pts.length >= limits.maxPointsPerRoute) break;
      const norm = validPoint(p);
      if (norm) pts.push(norm);
    }
    if (pts.length < 2) { dropped++; continue; } // a route needs at least 2 points
    routes[key] = pts;
    count++;
  }
  return { routes, dropped };
}

/**
 * Wrap appState + routes in the versioned export envelope.
 * @param {any} state
 * @param {Record<string, [number,number][]>} [routes]
 * @param {{ appVersion?: string }} [meta]
 */
export function wrapExport(state, routes = {}, meta = {}) {
  const { routes: safe } = sanitizeRoutes(routes);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: meta.appVersion || null,
    state,
    routes: safe,
  };
}

/**
 * Parse an imported file into { state, routes }, accepting:
 *   • v2 envelope: { format:'helyx-export', version, state, routes }
 *   • legacy: a raw appState object (has currentWeek + weeks) — no routes
 * Returns null when the payload isn't a recognisable Helyx export.
 * @param {any} parsed
 * @returns {{ state: any, routes: Record<string, [number,number][]>, legacy: boolean } | null}
 */
export function parseImport(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  // v2+ envelope
  if (parsed.format === EXPORT_FORMAT && parsed.state && typeof parsed.state === 'object') {
    if (!isAppState(parsed.state)) return null;
    const { routes } = sanitizeRoutes(parsed.routes);
    return { state: parsed.state, routes, legacy: false };
  }

  // Legacy raw-appState export (pre-routes). Keep importing these verbatim.
  if (isAppState(parsed)) {
    return { state: parsed, routes: {}, legacy: true };
  }
  return null;
}

function isAppState(o) {
  return o && typeof o === 'object' && o.currentWeek && o.weeks &&
    typeof o.weeks === 'object' && Object.keys(o.weeks).length > 0;
}
