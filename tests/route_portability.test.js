// ==========================================
// ROUTE PORTABILITY TEST (tests/route_portability.test.js)
// ------------------------------------------
// GPS routes live in IndexedDB, not appState, so they used to vanish on
// export/import. These prove the versioned envelope carries them, validates
// them, survives round-trips, stays backward-compatible with legacy exports,
// and rejects malformed / oversized / duplicate-prone payloads.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  wrapExport, parseImport, sanitizeRoutes, EXPORT_FORMAT, EXPORT_VERSION, ROUTE_LIMITS,
} from '../js/state/route-portability.js';

const sampleState = () => ({ currentWeek: '3', weeks: { 1: { lifts: {} }, 3: { runs: {} } } });
const sampleRoutes = () => ({
  '1_mon': [[51.5, -0.12], [51.51, -0.13], [51.52, -0.14]],
  '3_wed': [[40.0, -70.0], [40.01, -70.01]],
});

test('export → import round-trips state AND routes', () => {
  const wrapped = wrapExport(sampleState(), sampleRoutes());
  assert.equal(wrapped.format, EXPORT_FORMAT);
  assert.equal(wrapped.version, EXPORT_VERSION);
  const parsed = parseImport(JSON.parse(JSON.stringify(wrapped)));
  assert.ok(parsed);
  assert.equal(parsed.legacy, false);
  assert.equal(parsed.state.currentWeek, '3');
  assert.deepEqual(parsed.routes['1_mon'], [[51.5, -0.12], [51.51, -0.13], [51.52, -0.14]]);
  assert.equal(Object.keys(parsed.routes).length, 2);
});

test('legacy raw-appState export still imports (no routes)', () => {
  const parsed = parseImport(sampleState()); // pre-v2 shape
  assert.ok(parsed);
  assert.equal(parsed.legacy, true);
  assert.deepEqual(parsed.routes, {});
  assert.equal(parsed.state.currentWeek, '3');
});

test('an export with no routes yields an empty routes map, not undefined', () => {
  const wrapped = wrapExport(sampleState(), {});
  const parsed = parseImport(wrapped);
  assert.deepEqual(parsed.routes, {});
});

test('re-importing the same file is idempotent by key (no duplicate routes)', () => {
  const wrapped = wrapExport(sampleState(), sampleRoutes());
  const a = parseImport(wrapped).routes;
  const b = parseImport(wrapped).routes;
  // Same keys, same data — a putRoutes(a) then putRoutes(b) overwrites by key.
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.deepEqual(a, b);
});

test('malformed points/routes are dropped, valid ones kept', () => {
  const { routes, dropped } = sanitizeRoutes({
    '1_mon': [[51.5, -0.1], [51.6, -0.2]],       // ok
    '2_tue': [[999, 0], ['x', 'y'], [10, 10]],    // only 1 valid point → dropped
    '3_bad key!': [[1, 2], [3, 4]],               // bad key → dropped
    '4_wed': 'not-an-array',                       // dropped
    '5_thu': [[1, 2]],                             // <2 points → dropped
  });
  assert.deepEqual(Object.keys(routes), ['1_mon']);
  assert.ok(dropped >= 4);
});

test('out-of-range coordinates are rejected', () => {
  const { routes } = sanitizeRoutes({ '1_mon': [[91, 0], [0, 181], [45, 45]] });
  // Only [45,45] is valid → route has <2 points → dropped entirely.
  assert.deepEqual(routes, {});
});

test('oversized route is capped, not accepted wholesale', () => {
  const huge = Array.from({ length: ROUTE_LIMITS.maxPointsPerRoute + 500 }, (_, i) => [10 + i * 1e-6, 10]);
  const { routes } = sanitizeRoutes({ '1_mon': huge });
  assert.equal(routes['1_mon'].length, ROUTE_LIMITS.maxPointsPerRoute);
});

test('too many routes are capped', () => {
  const many = {};
  for (let i = 0; i < ROUTE_LIMITS.maxRoutes + 50; i++) many[`${i}_mon`] = [[10, 10], [11, 11]];
  const { routes } = sanitizeRoutes(many);
  assert.ok(Object.keys(routes).length <= ROUTE_LIMITS.maxRoutes);
});

test('extra per-point fields are stripped to [lat,lng]', () => {
  const { routes } = sanitizeRoutes({ '1_mon': [[51.5, -0.1, 5, 12345], [51.6, -0.2, 3, 12346]] });
  assert.deepEqual(routes['1_mon'], [[51.5, -0.1], [51.6, -0.2]]);
});

test('garbage / non-object payloads import as null (rejected)', () => {
  assert.equal(parseImport(null), null);
  assert.equal(parseImport('nope'), null);
  assert.equal(parseImport({ format: EXPORT_FORMAT, state: { junk: true } }), null);
  assert.equal(parseImport({ random: 1 }), null);
});
