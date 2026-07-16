// Stable route identity (pure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newRouteId, slotKey, parseLegacyKey, makeRouteRecord,
  legacyRecordsFromMap, latestForSlot, ROUTE_RECORD_VERSION,
} from '../js/state/route-identity.js';

test('newRouteId returns unique, non-empty ids', () => {
  const a = newRouteId(), b = newRouteId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test('slotKey does NOT collide across activations for the same week/day', () => {
  const a = slotKey('act_1', 1, 'mon');
  const b = slotKey('act_2', 1, 'mon');
  assert.notEqual(a, b);
  // stable & stringified
  assert.equal(slotKey('act_1', '1', 'mon'), a);
  // missing activation → shared legacy space
  assert.equal(slotKey(null, 1, 'mon'), 'legacy|1|mon');
});

test('parseLegacyKey handles week_day and rejects junk', () => {
  assert.deepEqual(parseLegacyKey('12_mon'), { week: '12', day: 'mon' });
  assert.equal(parseLegacyKey('mon'), null);
  assert.equal(parseLegacyKey('1_'), null);
  assert.equal(parseLegacyKey(null), null);
});

test('makeRouteRecord fills stable id, slotKey, version and keeps metadata', () => {
  const quality = { version: 1, confidence: 'high' };
  const r = makeRouteRecord({
    activationId: 'act_9', programId: 'hybrid_engine', week: 1, day: 'mon',
    coordinates: [[1, 2], [3, 4]], updatedTs: 1000, startTs: 900, legacyKey: '1_mon', quality,
  });
  assert.equal(r.version, ROUTE_RECORD_VERSION);
  assert.equal(r.slotKey, 'act_9|1|mon');
  assert.equal(r.week, '1');
  assert.equal(r.programId, 'hybrid_engine');
  assert.equal(r.startTs, 900);
  assert.equal(r.legacyKey, '1_mon');
  assert.equal(r.quality, quality);
  assert.ok(r.id);
  assert.deepEqual(r.coordinates, [[1, 2], [3, 4]]);
});

test('a session-linked route uses a deterministic primary key', () => {
  const r = makeRouteRecord({
    sessionId: 'run_abc', activationId: 'act_9', week: 1, day: 'mon',
    coordinates: [[1, 2], [3, 4]], updatedTs: 1000,
  });
  assert.equal(r.id, 'route:run_abc');
  assert.equal(r.sessionId, 'run_abc');
});

test('legacyRecordsFromMap migrates each route to a distinct legacy record', () => {
  const recs = legacyRecordsFromMap(
    { '1_mon': [[0, 0], [1, 1]], '2_wed': [[2, 2], [3, 3]] },
    { now: 5000 },
  );
  assert.equal(recs.length, 2);
  for (const r of recs) {
    assert.equal(r.activationId, 'legacy');
    assert.equal(r.version, ROUTE_RECORD_VERSION);
    assert.ok(r.legacyKey);
    assert.ok(r.id);
  }
  // distinct ids (no overwrite even if two slots normalise similarly)
  assert.notEqual(recs[0].id, recs[1].id);
  // empty/invalid entries are skipped
  assert.equal(legacyRecordsFromMap({ '1_mon': [] }).length, 0);
  assert.equal(legacyRecordsFromMap(null).length, 0);
});

test('latestForSlot returns the newest matching record', () => {
  const recs = [
    makeRouteRecord({ activationId: 'a', week: 1, day: 'mon', coordinates: [[0, 0]], updatedTs: 1 }),
    makeRouteRecord({ activationId: 'a', week: 1, day: 'mon', coordinates: [[9, 9]], updatedTs: 5 }),
    makeRouteRecord({ activationId: 'b', week: 1, day: 'mon', coordinates: [[3, 3]], updatedTs: 9 }),
  ];
  const best = latestForSlot(recs, 'a', 1, 'mon');
  assert.equal(best.updatedTs, 5);
  assert.equal(latestForSlot(recs, 'zzz', 1, 'mon'), null);
});
