// Phase 3.2 — IndexedDB route storage: non-destructive v1→v2 migration, stable
// activation-aware identity, blocked-upgrade safety, deletion, export/import.
// Runs against fake-indexeddb (dev-only). See docs/archive/HARDENING_PLAN-legacy-2026-07-13.md §3.2.
import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveMapToDB, getMapFromDB, deleteMapFromDB, getAllRoutes, putRoutes,
  getAllRouteRecords, putRouteRecords,
} from '../js/db.js';

const DB_NAME = 'HybridTrainingDB';

function delDb() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// Seed a v1 database (legacy `runMaps` store keyed "week_day"), then close it.
function seedV1(entries) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('runMaps')) db.createObjectStore('runMaps');
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('runMaps', 'readwrite');
      const store = tx.objectStore('runMaps');
      for (const [k, v] of Object.entries(entries)) store.put(v, k);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

// Open a raw v1 connection and keep it open (no versionchange handler) so a
// subsequent v2 upgrade is BLOCKED. Returns the live db for later close.
function holdV1Open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('runMaps')) db.createObjectStore('runMaps');
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => { await delDb(); });

test('legacy week_day routes survive the v1→v2 migration and stay readable', async () => {
  const coords = [[1, 1], [2, 2], [3, 3]];
  await seedV1({ '1_mon': coords, '2_wed': [[4, 4], [5, 5]] });

  // First db.js call triggers the v2 upgrade + migration.
  const got = await getMapFromDB(1, 'mon');
  assert.deepEqual(got, coords);

  const all = await getAllRoutes();
  assert.deepEqual(all['1_mon'], coords);
  assert.deepEqual(all['2_wed'], [[4, 4], [5, 5]]);
});

test('two activations sharing Week 1 / Monday do NOT collide (no overwrite)', async () => {
  const cA = [[10, 10], [11, 11]];
  const cB = [[20, 20], [21, 21]];
  await saveMapToDB(1, 'mon', cA, { activationId: 'act_A' });
  await saveMapToDB(1, 'mon', cB, { activationId: 'act_B' });

  assert.deepEqual(await getMapFromDB(1, 'mon', { activationId: 'act_A' }), cA);
  assert.deepEqual(await getMapFromDB(1, 'mon', { activationId: 'act_B' }), cB);
});

test('re-saving the same slot upserts in place (no duplicate record)', async () => {
  await saveMapToDB(1, 'mon', [[1, 1], [2, 2]], { activationId: 'act_A' });
  await saveMapToDB(1, 'mon', [[9, 9], [8, 8]], { activationId: 'act_A' });

  assert.deepEqual(await getMapFromDB(1, 'mon', { activationId: 'act_A' }), [[9, 9], [8, 8]]);
  const all = await getAllRoutes();
  // Exactly one export entry for the slot (latest coords).
  assert.deepEqual(all['1_mon'], [[9, 9], [8, 8]]);
});

test('two sessions in the same activation/week/day keep independent routes', async () => {
  const first = [[1, 1], [2, 2]];
  const second = [[8, 8], [9, 9]];
  await saveMapToDB(1, 'mon', first, { activationId: 'act_A', sessionId: 'run_a', startTs: 100 });
  await saveMapToDB(1, 'mon', second, { activationId: 'act_A', sessionId: 'run_b', startTs: 200 });

  assert.deepEqual(await getMapFromDB(1, 'mon', { activationId: 'act_A', sessionId: 'run_a' }), first);
  assert.deepEqual(await getMapFromDB(1, 'mon', { activationId: 'act_A', sessionId: 'run_b' }), second);
  const records = await getAllRouteRecords();
  assert.equal(records.length, 2);
  assert.deepEqual(new Set(records.map((r) => r.sessionId)), new Set(['run_a', 'run_b']));
});

test('route records retain compact GPS quality audit metadata', async () => {
  const quality = { version: 1, confidence: 'high', rawPointCount: 4 };
  await saveMapToDB(1, 'tue', [[1, 1], [2, 2]], {
    activationId: 'act_A', sessionId: 'run_quality', quality,
  });
  const record = (await getAllRouteRecords()).find((item) => item.sessionId === 'run_quality');
  assert.deepEqual(record.quality, quality);
});

test('deleting one session route leaves its same-slot sibling intact', async () => {
  await saveMapToDB(2, 'wed', [[1, 1], [2, 2]], { activationId: 'act_A', sessionId: 'run_a' });
  await saveMapToDB(2, 'wed', [[3, 3], [4, 4]], { activationId: 'act_A', sessionId: 'run_b' });
  await deleteMapFromDB(2, 'wed', { activationId: 'act_A', sessionId: 'run_a' });
  assert.equal(await getMapFromDB(2, 'wed', { activationId: 'act_A', sessionId: 'run_a' }), undefined);
  assert.deepEqual(await getMapFromDB(2, 'wed', { activationId: 'act_A', sessionId: 'run_b' }), [[3, 3], [4, 4]]);
});

test('deleteMapFromDB clears the slot for its activation', async () => {
  await saveMapToDB(3, 'fri', [[1, 1], [2, 2]], { activationId: 'act_A' });
  assert.ok(await getMapFromDB(3, 'fri', { activationId: 'act_A' }));

  await deleteMapFromDB(3, 'fri', { activationId: 'act_A' });
  assert.equal(await getMapFromDB(3, 'fri', { activationId: 'act_A' }), undefined);
});

test('export → import round-trips routes after migration', async () => {
  await seedV1({ '1_mon': [[1, 1], [2, 2]], '4_sat': [[3, 3], [4, 4]] });
  const exported = await getAllRoutes();   // triggers migration + reads
  assert.equal(Object.keys(exported).length, 2);

  await delDb();
  const written = await putRoutes(exported);
  assert.equal(written, 2);
  assert.deepEqual(await getMapFromDB(1, 'mon'), [[1, 1], [2, 2]]);
  assert.deepEqual(await getMapFromDB(4, 'sat'), [[3, 3], [4, 4]]);
});

test('rich-record export/import preserves two same-day session routes', async () => {
  await saveMapToDB(4, 'sat', [[1, 1], [2, 2]], { activationId: 'act_A', sessionId: 'run_a', startTs: 100 });
  await saveMapToDB(4, 'sat', [[3, 3], [4, 4]], { activationId: 'act_A', sessionId: 'run_b', startTs: 200 });
  const exported = await getAllRouteRecords();
  await delDb();
  assert.equal(await putRouteRecords(exported), 2);
  assert.deepEqual(await getMapFromDB(4, 'sat', { activationId: 'act_A', sessionId: 'run_a' }), [[1, 1], [2, 2]]);
  assert.deepEqual(await getMapFromDB(4, 'sat', { activationId: 'act_A', sessionId: 'run_b' }), [[3, 3], [4, 4]]);
});

test('a blocked upgrade fails safe (no throw, safe default) instead of hanging', async () => {
  const held = await holdV1Open();   // keeps v1 open → v2 upgrade is blocked
  try {
    // openDB rejects on block (onblocked handler); saveMapToDB swallows it and
    // returns null promptly rather than hanging waiting for the upgrade.
    const id = await saveMapToDB(1, 'mon', [[1, 1], [2, 2]], { activationId: 'act_A' });
    assert.equal(id, null);
  } finally {
    // Releasing the block lets the deferred upgrade complete; openDB's guard
    // closes that late connection so nothing leaks.
    held.close();
  }
});
