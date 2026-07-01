// ==========================================
// NATIVE GPS ADAPTER TEST (tests/gps_native.test.js)
// Phase 2: the drain-payload contract between the Android foreground service
// and the JS run tracker. A bad payload must never kill a live run, and the
// module must import cleanly without a window. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isNativeGpsAvailable,
  parseDrainPayload,
  ensureLocationPermission,
  nativeStartRun,
  nativeDrainSince,
} from '../js/gps/native-bridge.js';

test('no window → native GPS unavailable, safe no-op fallbacks', async () => {
  assert.equal(isNativeGpsAvailable(), false);
  assert.equal(nativeStartRun(), false);
  assert.equal(await ensureLocationPermission(), false);
  const drained = nativeDrainSince(7);
  assert.deepEqual(drained, { seq: 7, status: 'IDLE', elapsedMs: 0, points: [] });
});

test('parses a valid tracking payload', () => {
  const json = JSON.stringify({
    seq: 3,
    status: 'TRACKING',
    elapsedMs: 65000,
    points: [
      [51.5007, -0.1246, 8.5, 1751370000000],
      [51.5009, -0.1244, 12.0, 1751370001000],
    ],
  });
  const p = parseDrainPayload(json, 1);
  assert.equal(p.seq, 3);
  assert.equal(p.status, 'TRACKING');
  assert.equal(p.elapsedMs, 65000);
  assert.equal(p.points.length, 2);
  assert.deepEqual(p.points[0], { lat: 51.5007, lng: -0.1246, acc: 8.5, t: 1751370000000 });
});

test('garbage payloads degrade to empty, keeping the previous cursor', () => {
  for (const bad of [null, undefined, '', 'not json', '42', '"str"', '[]']) {
    const p = parseDrainPayload(bad, 5);
    assert.equal(p.seq, 5, `seq kept for ${JSON.stringify(bad)}`);
    assert.deepEqual(p.points, []);
    assert.equal(p.status, 'IDLE');
  }
});

test('malformed points are skipped, valid ones kept', () => {
  const json = JSON.stringify({
    seq: 4,
    status: 'TRACKING',
    elapsedMs: 1000,
    points: [
      [51.5, -0.12, 5, 1],       // valid
      [200, 0, 5, 1],            // lat out of range
      [0, -999, 5, 1],           // lng out of range
      ['a', 'b', 'c', 'd'],      // non-numeric
      [51.6],                    // too short
      'nope',                    // not an array
      [51.7, -0.13, null, null], // missing acc/t → defaulted
    ],
  });
  const p = parseDrainPayload(json);
  assert.equal(p.points.length, 2);
  assert.equal(p.points[1].lat, 51.7);
  assert.equal(p.points[1].acc, 9999); // defaulted so the accuracy filter drops it
});

test('unknown status normalizes to IDLE; bad seq/elapsed clamp safely', () => {
  const p = parseDrainPayload(JSON.stringify({ seq: -2, status: 'BANANA', elapsedMs: -5, points: [] }), 9);
  assert.equal(p.status, 'IDLE');
  assert.equal(p.seq, 9);        // negative seq rejected → cursor kept
  assert.equal(p.elapsedMs, 0);
});

test('PAUSED status round-trips (recovery path relies on it)', () => {
  const p = parseDrainPayload(JSON.stringify({ seq: 10, status: 'PAUSED', elapsedMs: 120000, points: [] }));
  assert.equal(p.status, 'PAUSED');
  assert.equal(p.elapsedMs, 120000);
});
