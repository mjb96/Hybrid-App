import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createGpsQualityState, ingestGpsQualityFix, sanitizeGpsQuality,
  summarizeGpsQuality,
} from '../js/gps/route-quality.js';

const fix = (lng, t, accuracyM = 8, lat = 0) => ({ lat, lng, accuracyM, timestampMs: t });

function replay(points, options = {}) {
  const state = createGpsQualityState();
  const results = points.map((point) => ingestGpsQualityFix(state, point, options));
  return { state, results, summary: summarizeGpsQuality(state) };
}

test('clean running fixes produce filtered distance and high confidence', () => {
  const points = [0, 0.0001, 0.0002, 0.0003, 0.0004].map((lng, i) => fix(lng, 1_000 + i * 1_000));
  const { results, summary } = replay(points);
  assert.ok(results.every((result) => result.accepted));
  assert.equal(summary.confidence, 'high');
  assert.equal(summary.acceptedPointCount, 5);
  assert.equal(summary.rejectedPointCount, 0);
  assert.ok(summary.filteredDistanceKm > 0.043 && summary.filteredDistanceKm < 0.046);
  assert.equal(summary.rawDistanceKm, summary.filteredDistanceKm);
  assert.equal(summary.distanceRemovedKm, 0);
});

test('sub-five-metre jitter is rejected without losing the next real movement', () => {
  const { results, summary } = replay([
    fix(0, 1_000), fix(0.00001, 2_000), fix(0.0001, 3_000),
  ]);
  assert.equal(results[1].reason, 'jitter');
  assert.equal(results[2].reason, 'movement');
  assert.equal(summary.rejected.jitter, 1);
  assert.ok(summary.filteredDistanceKm > 0.01);
});

test('poor-accuracy fixes are rejected and captured in the audit', () => {
  const { results, summary } = replay([
    fix(0, 1_000), fix(0.005, 2_000, 90), fix(0.0001, 3_000),
  ]);
  assert.equal(results[1].reason, 'poorAccuracy');
  assert.equal(summary.rejected.poorAccuracy, 1);
  assert.equal(summary.acceptedPointCount, 2);
  assert.ok(summary.distanceRemovedKm > 1);
});

test('teleport fixes do not poison the accepted anchor or inflate saved distance', () => {
  const { results, summary } = replay([
    fix(0, 1_000), fix(0.01, 2_000), fix(0.0001, 3_000),
  ]);
  assert.equal(results[1].reason, 'teleport');
  assert.equal(results[2].reason, 'movement');
  assert.equal(summary.rejected.teleport, 1);
  assert.ok(summary.rawDistanceKm > 2);
  assert.ok(summary.filteredDistanceKm > 0.01 && summary.filteredDistanceKm < 0.012);
  assert.ok(summary.distanceRemovedKm > 2);
});

test('out-of-order timestamps are rejected without changing the accepted anchor', () => {
  const { results, summary } = replay([
    fix(0, 2_000), fix(0.0001, 1_000), fix(0.0002, 4_000),
  ]);
  assert.equal(results[1].reason, 'timestamp');
  assert.equal(results[2].reason, 'movement');
  assert.equal(summary.rejected.timestamp, 1);
});

test('long collection gaps start a new segment without inventing distance', () => {
  const { results, summary } = replay([
    fix(0, 1_000), fix(0.005, 41_001), fix(0.0051, 42_001),
  ]);
  assert.equal(results[1].reason, 'segmentBreak');
  assert.equal(results[1].distanceM, 0);
  assert.equal(summary.segmentBreaks, 1);
  assert.ok(summary.filteredDistanceKm > 0.01 && summary.filteredDistanceKm < 0.012);
});

test('explicit pause/resume forces a segment break at the next accepted fix', () => {
  const state = createGpsQualityState();
  ingestGpsQualityFix(state, fix(0, 1_000));
  const resumed = ingestGpsQualityFix(state, fix(0.001, 2_000), { forceBreak: true });
  const moved = ingestGpsQualityFix(state, fix(0.0011, 3_000));
  assert.equal(resumed.reason, 'segmentBreak');
  assert.equal(moved.reason, 'movement');
  assert.equal(summarizeGpsQuality(state).segmentBreaks, 1);
});

test('replaying a recovered native journal gives the same filtered result', () => {
  const points = [
    fix(151.2, 1_000, 9, -33.86),
    fix(151.20001, 2_000, 9, -33.86),
    fix(151.20015, 3_000, 8, -33.86),
    fix(151.22, 4_000, 7, -33.86),
    fix(151.2003, 5_000, 8, -33.86),
    fix(151.20042, 6_000, 8, -33.86),
  ];
  const live = replay(points).summary;
  const recoveredState = createGpsQualityState();
  for (const chunk of [points.slice(0, 2), points.slice(2, 4), points.slice(4)]) {
    for (const point of chunk) ingestGpsQualityFix(recoveredState, point);
  }
  assert.deepEqual(summarizeGpsQuality(recoveredState), live);
  assert.equal(live.rejected.jitter, 1);
  assert.equal(live.rejected.teleport, 1);
});

test('walk mode can enforce a lower plausible-speed ceiling', () => {
  const { results } = replay([fix(0, 1_000), fix(0.0001, 2_000)], {
    limits: { maxSpeedMps: 5 },
  });
  assert.equal(results[1].reason, 'teleport');
});

test('quality sanitizer strips unknown fields and rejects inconsistent audits', () => {
  const clean = replay([0, 0.0001, 0.0002, 0.0003].map((lng, i) => fix(lng, 1_000 + i * 1_000))).summary;
  const sanitized = sanitizeGpsQuality({ ...clean, injected: '<script>' });
  assert.deepEqual(sanitized, clean);
  assert.equal(sanitizeGpsQuality({ ...clean, rejectedPointCount: 2 }), null);
  assert.equal(sanitizeGpsQuality({ ...clean, filteredDistanceKm: clean.rawDistanceKm + 1 }), null);
  assert.equal(sanitizeGpsQuality({ ...clean, rawPointCount: 3.5 }), null);
});
