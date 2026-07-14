// ==========================================
// FIT IMPORT CONTRACT TESTS (tests/garmin_fit_contract.test.js)
// R27: imported fields match FIT semantics (aerobic vs anaerobic Training Effect
// never conflate), out-of-range/missing values validate to null instead of fake
// zeros, and no failed destination save is ever presented as "Imported ✓".
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSessionStats, extractData } from '../js/garmin.js';

// A representative parsed FIT run (fit-parser 'list' mode, lengthUnit 'km').
function runFixture(extra = {}) {
  return {
    sessions: [{
      total_distance: 10.5,               // km (parser-converted)
      total_timer_time: 3000,             // 50:00
      total_training_effect: 3.4,         // AEROBIC TE
      total_anaerobic_training_effect: 1.2, // ANAEROBIC TE
      avg_heart_rate: 150, max_heart_rate: 178,
      total_ascent: 120, total_descent: 118, total_calories: 620,
      avg_running_cadence: 85,
      ...extra,
    }],
    laps: [
      { total_timer_time: 1500, total_distance: 5.25, avg_heart_rate: 148 },
      { total_timer_time: 1500, total_distance: 5.25, avg_heart_rate: 152 },
    ],
    records: [
      { position_lat: 610000000, position_long: -740000000, heart_rate: 150 },
      { position_lat: 610000100, position_long: -740000100, heart_rate: 190 },
    ],
  };
}

test('run: aerobic and anaerobic TE map to distinct, correct fields', () => {
  const r = extractSessionStats(runFixture(), true);
  assert.equal(r.ok, true);
  assert.equal(r.stats.trainingEffect, 3.4); // aerobic ← total_training_effect
  assert.equal(r.stats.anaerobicTE, 1.2);    // anaerobic ← total_anaerobic_training_effect
  assert.equal(r.distanceKm, 10.5);
  assert.equal(r.time, '50:00');
  assert.equal(r.stats.avgHR, 150);
  assert.equal(r.stats.maxHR, 178);
  assert.equal(r.stats.elevation, 120);
  assert.equal(r.stats.avgCadence, 85);
  assert.equal(r.stats.splits.length, 2);
});

test('aerobic TE never captures the anaerobic value (no substring conflation)', () => {
  // Only the anaerobic field is present. The old includes()-match let
  // trainingEffect grab total_anaerobic_training_effect; the exact contract must not.
  const r = extractSessionStats({
    sessions: [{ total_distance: 5, total_timer_time: 1500, total_anaerobic_training_effect: 2.0 }],
  }, true);
  assert.equal(r.stats.trainingEffect, null);
  assert.equal(r.stats.anaerobicTE, 2.0);
});

test('out-of-range and non-numeric values validate to null (no fake zeros)', () => {
  // No records here, so the HR-from-records fallback can't mask the rejection.
  const r = extractSessionStats({
    sessions: [{
      total_distance: 5, total_timer_time: 1500,
      total_training_effect: 99,     // >5 → rejected
      avg_heart_rate: 'oops',        // non-numeric → rejected
      max_heart_rate: NaN,           // NaN → rejected
      avg_running_cadence: -3,       // <0 → rejected
    }],
  }, true);
  assert.equal(r.stats.trainingEffect, null);
  assert.equal(r.stats.avgHR, null);
  assert.equal(r.stats.maxHR, null);
  assert.equal(r.stats.avgCadence, null);
});

test('missing training-effect fields stay null rather than 0', () => {
  const r = extractSessionStats({ sessions: [{ total_distance: 3, total_timer_time: 900 }] }, true);
  assert.equal(r.stats.trainingEffect, null);
  assert.equal(r.stats.anaerobicTE, null);
  assert.equal(r.stats.calories, null);
});

test('multi-session file picks the first session', () => {
  const r = extractSessionStats({
    sessions: [
      { total_distance: 1, total_timer_time: 600, total_training_effect: 2.1 },
      { total_distance: 9, total_timer_time: 9000, total_training_effect: 4.9 },
    ],
  }, true);
  assert.equal(r.distanceKm, 1);
  assert.equal(r.stats.trainingEffect, 2.1);
});

test('malformed input returns an honest failure, not a fake session', () => {
  assert.equal(extractSessionStats(null, true).ok, false);
  assert.equal(extractSessionStats({}, true).ok, false);
  assert.equal(extractSessionStats({ sessions: [] }, true).reason, 'no-session');
});

test('GPS records: semicircle coordinates convert to degrees; HR fallback fills avg/max', () => {
  const r = extractSessionStats(runFixture({ avg_heart_rate: undefined, max_heart_rate: undefined }), true);
  assert.equal(r.coordinates.length, 2);
  for (const [lat, lng] of r.coordinates) {
    assert.ok(Math.abs(lat) <= 90, 'lat in degrees');
    assert.ok(Math.abs(lng) <= 180, 'lng in degrees');
  }
  assert.equal(r.stats.avgHR, 170); // (150+190)/2 from records
  assert.equal(r.stats.maxHR, 190);
});

test('gym: laps with reps become gym sets', () => {
  const r = extractSessionStats({
    sessions: [{ total_timer_time: 2400, total_calories: 300, total_anaerobic_training_effect: 2.5 }],
    laps: [
      { total_reps: 10, weight: 60, category: 'Squat' },
      { total_reps: 8, weight: 80 },
      { total_timer_time: 60 }, // rest lap, no reps → skipped
    ],
  }, false);
  assert.equal(r.ok, true);
  assert.equal(r.stats.gymSets.length, 2);
  assert.equal(r.stats.gymSets[0].reps, 10);
  assert.equal(r.stats.anaerobicTE, 2.5);
});

// ── save-gating: success is claimed ONLY after a confirmed destination save ──

test('extractData reports success only when the save resolves truthy', async () => {
  const toasts = [];
  const toast = (m, isErr) => toasts.push({ m, isErr: !!isErr });
  const ok = await extractData(runFixture(), true, async () => true, toast);
  assert.equal(ok, true);
  assert.ok(toasts.some(t => /Imported/.test(t.m) && !t.isErr));
});

test('extractData does NOT claim success when the save returns false', async () => {
  const toasts = [];
  const toast = (m, isErr) => toasts.push({ m, isErr: !!isErr });
  const ok = await extractData(runFixture(), true, async () => false, toast);
  assert.equal(ok, false);
  assert.ok(!toasts.some(t => /Imported/.test(t.m)));
  assert.ok(toasts.some(t => t.isErr && /nothing was saved/.test(t.m)));
});

test('extractData surfaces a thrown save as failure, not success', async () => {
  const toasts = [];
  const toast = (m, isErr) => toasts.push({ m, isErr: !!isErr });
  const ok = await extractData(runFixture(), true, async () => { throw new Error('quota'); }, toast);
  assert.equal(ok, false);
  assert.ok(!toasts.some(t => /Imported/.test(t.m)));
});

test('extractData does not call the saver when no session is found', async () => {
  let called = false;
  const ok = await extractData({}, false, async () => { called = true; return true; }, () => {});
  assert.equal(ok, false);
  assert.equal(called, false);
});
