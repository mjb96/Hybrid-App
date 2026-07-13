// =============================================================================
// ROUTE STORAGE (js/db.js)
//
// GPS routes live in IndexedDB. v2 introduces stable, activation-aware records
// (see js/state/route-identity.js) so a route can no longer collide on the weak
// "week_day" coordinate:
//
//   • Store `routes` (keyPath `id`) holds rich records; index `by_slot` looks a
//     route up by (activation, week, day) without cross-activation collision.
//   • Legacy store `runMaps` (keyed "week_day") is RETAINED read-only — the v1→v2
//     upgrade copies its entries into `routes` (tagged activation `legacy`) but
//     never deletes them, so a failed/partial migration loses nothing and the
//     data is recoverable.
//
// Backward compatibility: routes written BEFORE the migration keep their prior
// (week, day) lookup semantics via the legacy fallback until overwritten; every
// route written after the migration is activation-isolated.
// =============================================================================
import {
  makeRouteRecord, legacyRecordsFromMap, slotKey, parseLegacyKey,
} from './state/route-identity.js';

const DB_NAME = 'HybridTrainingDB';
const DB_VERSION = 2;
const STORE_NAME = 'runMaps';   // legacy v1 store — retained
const ROUTES_STORE = 'routes';  // v2 rich-record store
const SLOT_INDEX = 'by_slot';

// Surfaced so callers/diagnostics can tell a genuine failure from an empty DB.
export const MIGRATION_META_KEY = '__migration_v2__';

// Delete the entire IndexedDB database holding GPS route coordinates. Used by
// account/data deletion — routes are sensitive location data and must not
// survive a "delete everything" action. Resolves true on success, false if
// IndexedDB is unavailable or the delete is blocked/errors (caller decides how
// to report). Never rejects, so a deletion flow can't hang on it.
export function clearRouteDatabase() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !indexedDB?.deleteDatabase) { resolve(false); return; }
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => done(true);
      req.onerror = () => done(false);
      // If another tab holds the DB open the delete is deferred ("blocked");
      // don't wait forever — report false so the caller can surface a partial.
      req.onblocked = () => done(false);
    } catch {
      done(false);
    }
  });
}

// Migrate legacy v1 "week_day" rows into the v2 `routes` store inside the upgrade
// transaction. Non-destructive: legacy rows are copied, never deleted. Records a
// meta row so a later read can confirm the migration ran. Runs synchronously off
// a cursor within the versionchange transaction.
function migrateV1toV2(upgradeTx) {
  let routes;
  try { routes = upgradeTx.objectStore(ROUTES_STORE); } catch { return; }
  if (!upgradeTx.db.objectStoreNames.contains(STORE_NAME)) {
    routes.put({ id: MIGRATION_META_KEY, migrated: 0, at: Date.now() });
    return;
  }
  const legacy = upgradeTx.objectStore(STORE_NAME);
  let migrated = 0;
  const cursorReq = legacy.openCursor();
  cursorReq.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const coords = cursor.value;
      if (Array.isArray(coords) && coords.length > 0) {
        const parsed = parseLegacyKey(String(cursor.key));
        const rec = makeRouteRecord({
          activationId: 'legacy',
          week: parsed ? parsed.week : String(cursor.key),
          day: parsed ? parsed.day : '',
          coordinates: coords,
          legacyKey: String(cursor.key),
        });
        routes.put(rec);
        migrated++;
      }
      cursor.continue();
    } else {
      routes.put({ id: MIGRATION_META_KEY, migrated, at: Date.now() });
    }
  };
}

function openDB() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (err) { reject(err); return; }

    let settled = false;
    req.onerror = (e) => {
      if (settled) return;
      settled = true;
      reject(e.target.error || new Error('IndexedDB open failed'));
    };
    // Another open connection at the old version is preventing the upgrade.
    // Reject with a recognisable error so the caller can surface it instead of
    // hanging forever.
    req.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB upgrade blocked by another open connection'));
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      // If a future version wants to upgrade, close so we don't block it.
      db.onversionchange = () => { try { db.close(); } catch (_) {} };
      // If we already rejected (e.g. the upgrade was blocked and later cleared),
      // this connection would leak and keep the event loop alive — close it.
      if (settled) { try { db.close(); } catch (_) {} return; }
      settled = true;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;
      // Keep the legacy store so nothing is lost (recovery + fallback reads).
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(ROUTES_STORE)) {
        const store = db.createObjectStore(ROUTES_STORE, { keyPath: 'id' });
        store.createIndex(SLOT_INDEX, 'slotKey', { unique: false });
      }
      if (e.oldVersion < 2) migrateV1toV2(tx);
    };
  });
}

function closeQuietly(db) { try { db.close(); } catch (_) {} }

// Records-for-slot via the by_slot index. Resolves [] on any store/txn issue.
function recordsForSlot(db, activationId, week, day) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ROUTES_STORE, 'readonly');
      const idx = tx.objectStore(ROUTES_STORE).index(SLOT_INDEX);
      const req = idx.getAll(slotKey(activationId, String(week), String(day)));
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

function latest(records) {
  let best = null;
  for (const r of records) if (!best || (r.updatedTs || 0) > (best.updatedTs || 0)) best = r;
  return best;
}

// Save (upsert) a route for a slot. Updates the existing record for
// (activation, week, day) in place — keeping its stable id — or creates a new
// one, so re-saving the same session never duplicates while different
// activations get distinct records. Returns the record id (or null on failure).
// ctx: { activationId, programId, startTs, localDate }
export async function saveMapToDB(week, day, coordinates, ctx = {}) {
  if (typeof indexedDB === 'undefined') return null;
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  let db;
  try { db = await openDB(); } catch { return null; }
  const activationId = ctx.activationId || 'legacy';
  const existing = latest(await recordsForSlot(db, activationId, week, day));
  const rec = makeRouteRecord({
    id: existing ? existing.id : undefined,
    activationId,
    programId: ctx.programId || (existing && existing.programId) || null,
    week, day,
    coordinates,
    startTs: existing ? existing.startTs : ctx.startTs,
    localDate: ctx.localDate || (existing && existing.localDate) || null,
  });
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ROUTES_STORE, 'readwrite');
      tx.objectStore(ROUTES_STORE).put(rec);
      tx.oncomplete = () => { closeQuietly(db); resolve(rec.id); };
      tx.onerror = () => { closeQuietly(db); resolve(null); };
    } catch { closeQuietly(db); resolve(null); }
  });
}

// Read the coordinates for a slot. Prefers the record for ctx.activationId; then
// falls back to a migrated `legacy` record; then to the raw v1 `runMaps` row —
// so pre-migration routes keep working exactly as before until overwritten.
export async function getMapFromDB(week, day, ctx = {}) {
  if (typeof indexedDB === 'undefined') return undefined;
  let db;
  try { db = await openDB(); } catch { return undefined; }

  if (ctx.activationId) {
    const rec = latest(await recordsForSlot(db, ctx.activationId, week, day));
    if (rec) { closeQuietly(db); return rec.coordinates; }
  }
  const legacyRec = latest(await recordsForSlot(db, 'legacy', week, day));
  if (legacyRec) { closeQuietly(db); return legacyRec.coordinates; }

  // Raw v1 store fallback (routes present before the migration ran).
  return new Promise((resolve) => {
    const done = (v) => { closeQuietly(db); resolve(v); };
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) { done(undefined); return; }
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(`${week}_${day}`);
      req.onsuccess = (e) => done(e.target.result);
      req.onerror = () => done(undefined);
    } catch { done(undefined); }
  });
}

// Dump every stored route as { "week_day": [[lat,lng],…] } for export/backup —
// the portable shape route-portability validates. Latest record wins per
// week_day slot. Resolves {} if IndexedDB is unavailable so export never fails.
export async function getAllRoutes() {
  if (typeof indexedDB === 'undefined') return {};
  let db;
  try { db = await openDB(); } catch { return {}; }
  return new Promise((resolve) => {
    /** @type {Record<string, any>} */
    const out = {};
    /** @type {Record<string, number>} */
    const seenTs = {};
    try {
      const tx = db.transaction(ROUTES_STORE, 'readonly');
      const req = tx.objectStore(ROUTES_STORE).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const r = cursor.value;
          if (r && r.id !== MIGRATION_META_KEY && Array.isArray(r.coordinates) && r.coordinates.length) {
            const k = `${r.week}_${r.day}`;
            if (!(k in seenTs) || (r.updatedTs || 0) >= seenTs[k]) {
              out[k] = r.coordinates;
              seenTs[k] = r.updatedTs || 0;
            }
          }
          cursor.continue();
        } else { closeQuietly(db); resolve(out); }
      };
      req.onerror = () => { closeQuietly(db); resolve(out); };
    } catch { closeQuietly(db); resolve(out); }
  });
}

// Restore routes from an export ({ "week_day": coords }). Idempotent: re-importing
// the same file upserts the same `imported` slot rather than appending. `coords`
// are already validated by sanitizeRoutes. Returns the number written.
export async function putRoutes(routes) {
  if (typeof indexedDB === 'undefined' || !routes) return 0;
  const recs = legacyRecordsFromMap(routes).map((r) => {
    // Deterministic id per imported slot so re-import overwrites (idempotent).
    const parsed = parseLegacyKey(r.legacyKey || '') || { week: r.week, day: r.day };
    return { ...r, id: `imp:${parsed.week}:${parsed.day}` };
  });
  if (recs.length === 0) return 0;
  let db;
  try { db = await openDB(); } catch { return 0; }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ROUTES_STORE, 'readwrite');
      const store = tx.objectStore(ROUTES_STORE);
      for (const r of recs) store.put(r);
      tx.oncomplete = () => { closeQuietly(db); resolve(recs.length); };
      tx.onerror = () => { closeQuietly(db); resolve(0); };
    } catch { closeQuietly(db); resolve(0); }
  });
}

// Delete the route(s) for a slot: the ctx.activationId record(s), plus the
// legacy `runMaps` row and any migrated `legacy` record for the same week/day so
// a "clear this day" leaves nothing behind.
export async function deleteMapFromDB(week, day, ctx = {}) {
  if (typeof indexedDB === 'undefined') return;
  let db;
  try { db = await openDB(); } catch { return; }

  const ids = [];
  if (ctx.activationId) {
    for (const r of await recordsForSlot(db, ctx.activationId, week, day)) ids.push(r.id);
  }
  for (const r of await recordsForSlot(db, 'legacy', week, day)) ids.push(r.id);

  await new Promise((resolve) => {
    try {
      const tx = db.transaction(ROUTES_STORE, 'readwrite');
      const store = tx.objectStore(ROUTES_STORE);
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
  // Also clear the raw v1 row if present.
  await new Promise((resolve) => {
    const done = () => { closeQuietly(db); resolve(); };
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) { done(); return; }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(`${week}_${day}`);
      tx.oncomplete = () => done();
      tx.onerror = () => done();
    } catch { done(); }
  });
}
