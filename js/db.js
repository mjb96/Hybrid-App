const DB_NAME = 'HybridTrainingDB';
const DB_VERSION = 1;
const STORE_NAME = 'runMaps';

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

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject('Database error: ' + e.target.errorCode);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// Key format will be "week_day" (e.g., "1_mon")
export async function saveMapToDB(week, day, coordinates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = `${week}_${day}`;
    store.put(coordinates, key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getMapFromDB(week, day) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const key = `${week}_${day}`;
    const request = store.get(key);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Dump every stored route as { "week_day": [[lat,lng],…] } for export/backup.
// Resolves {} if IndexedDB is unavailable so export never fails on it.
export async function getAllRoutes() {
  if (typeof indexedDB === 'undefined') return {};
  let db;
  try { db = await openDB(); } catch { return {}; }
  return new Promise((resolve) => {
    /** @type {Record<string, any>} */
    const out = {};
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { out[String(cursor.key)] = cursor.value; cursor.continue(); }
        else resolve(out);
      };
      req.onerror = () => resolve(out);
    } catch { resolve(out); }
  });
}

// Restore routes from an export. Keyed by "week_day" so re-importing the same
// file is idempotent (no duplicate routes) — it overwrites the same key rather
// than appending. Returns the number written. `coords` are already validated by
// sanitizeRoutes before this is called.
export async function putRoutes(routes) {
  if (typeof indexedDB === 'undefined' || !routes) return 0;
  const entries = Object.entries(routes);
  if (entries.length === 0) return 0;
  let db;
  try { db = await openDB(); } catch { return 0; }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const [key, coords] of entries) {
        const [week, day] = key.split('_');
        // Store under the same "week_day" key format saveMapToDB uses.
        store.put(coords, `${week}_${day}`);
      }
      tx.oncomplete = () => resolve(entries.length);
      tx.onerror = () => resolve(0);
    } catch { resolve(0); }
  });
}

export async function deleteMapFromDB(week, day) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = `${week}_${day}`;
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}
