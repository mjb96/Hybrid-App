// =============================================================================
// ACTIVE RUN DISPLAY (Phase 2C) — the live run session's numbers and signal.
//
// Two contracts are worth pinning here. First, the live tracker must speak the
// athlete's own distance unit: it was the one surface in the app that did not,
// so a miles athlete watched kilometres climb and then saw the number change on
// Stop, because `stopTracking` fills the cockpit input in the display unit.
// Second, the signal readout must describe the CURRENT state — a run that was
// clean for twenty minutes and has had no fix for two is not "strong", and a
// paused run is not a GPS failure.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeRunStats, formatRunClock, gpsSignalPresentation, isActiveRunSession,
  runDistanceUnit,
} from '../js/gps/active-run-display.js';
import { GPS_ACCURACY_TIERS, GPS_QUALITY_LIMITS, summarizeGpsQuality, createGpsQualityState }
  from '../js/gps/route-quality.js';

// ── Unit resolution ─────────────────────────────────────────────────────────

test('distance unit follows the setting, defaulting to km', () => {
  assert.equal(runDistanceUnit({ settings: { distanceUnit: 'mi' } }), 'mi');
  assert.equal(runDistanceUnit({ settings: { distanceUnit: 'km' } }), 'km');
  assert.equal(runDistanceUnit({ settings: {} }), 'km');
  assert.equal(runDistanceUnit(null), 'km');
  // Anything unrecognised is km, never a raw pass-through.
  assert.equal(runDistanceUnit({ settings: { distanceUnit: 'miles' } }), 'km');
});

// ── Distance and pace in the athlete's unit ─────────────────────────────────

test('a km athlete sees kilometres and pace per km', () => {
  const stats = activeRunStats({ distKm: 5, elapsedMs: 25 * 60 * 1000, unit: 'km' });
  assert.equal(stats.distance, '5.00');
  assert.equal(stats.distanceLabel, 'KM');
  assert.equal(stats.pace, '5:00');
  assert.equal(stats.paceLabel, 'PACE /KM');
});

test('a miles athlete sees miles and pace per mile — not raw km', () => {
  const stats = activeRunStats({ distKm: 5, elapsedMs: 25 * 60 * 1000, unit: 'mi' });
  assert.equal(stats.distance, '3.11');           // 5 km = 3.107 mi
  assert.equal(stats.distanceLabel, 'MI');
  assert.equal(stats.paceLabel, 'PACE /MI');
  // 25:00 over 3.107 mi ≈ 8:03/mi, and emphatically not the 5:00 km pace.
  assert.equal(stats.pace, '8:03');
});

test('the live distance matches what Stop writes into the cockpit input', () => {
  // gps-tracker fills the input with `finalDist * 0.621371` to 2dp; the live
  // readout has to have been showing that same number a second earlier.
  const distKm = 7.3;
  const live = activeRunStats({ distKm, elapsedMs: 1, unit: 'mi' }).distance;
  assert.equal(live, (distKm * 0.621371).toFixed(2));
});

test('pace is withheld until there is enough distance to mean anything', () => {
  assert.equal(activeRunStats({ distKm: 0, elapsedMs: 30_000 }).pace, '—:——');
  assert.equal(activeRunStats({ distKm: 0.02, elapsedMs: 30_000 }).pace, '—:——');
  assert.notEqual(activeRunStats({ distKm: 0.5, elapsedMs: 150_000 }).pace, '—:——');
});

test('a rounded pace second carries instead of printing :60', () => {
  // 1 km in 5:59.6 must read 6:00, never 5:60.
  const stats = activeRunStats({ distKm: 1, elapsedMs: 359_600, unit: 'km' });
  assert.equal(stats.pace, '6:00');
});

test('stats survive missing and hostile input', () => {
  const stats = activeRunStats();
  assert.equal(stats.distance, '0.00');
  assert.equal(stats.time, '00:00');
  assert.equal(stats.pace, '—:——');
  assert.equal(activeRunStats({ distKm: -5, elapsedMs: -1 }).distance, '0.00');
  assert.equal(activeRunStats({ distKm: NaN, elapsedMs: NaN }).time, '00:00');
});

// ── Clock ───────────────────────────────────────────────────────────────────

test('the clock grows an hours field only once there is an hour', () => {
  assert.equal(formatRunClock(0), '00:00');
  assert.equal(formatRunClock(59_000), '00:59');
  assert.equal(formatRunClock(9 * 60 * 1000 + 5_000), '09:05');
  assert.equal(formatRunClock(3_600_000), '1:00:00');
  assert.equal(formatRunClock(3_725_000), '1:02:05');
});

// ── Live signal ─────────────────────────────────────────────────────────────

const fix = (accuracyM, ageMs = 0, now = 1_000_000) =>
  ({ accuracyM, timestampMs: now - ageMs });

test('waiting for the first fix reads as searching', () => {
  const s = gpsSignalPresentation({ status: 'waiting' }, 1_000_000);
  assert.equal(s.level, 'searching');
  assert.equal(s.tracking, false);
});

test('tracking with no accepted fix yet is still searching, not strong', () => {
  const s = gpsSignalPresentation(
    { status: 'tracking', lastAcceptedPoint: null, acceptedPointCount: 0 }, 1_000_000);
  assert.equal(s.level, 'searching');
});

test('accuracy tiers grade the signal and are shared with the saved grade', () => {
  const at = (accuracyM) => gpsSignalPresentation({
    status: 'tracking', acceptedPointCount: 5, lastAcceptedPoint: fix(accuracyM),
  }, 1_000_000).level;
  assert.equal(at(GPS_ACCURACY_TIERS.strongM), 'strong');
  assert.equal(at(GPS_ACCURACY_TIERS.strongM + 1), 'fair');
  assert.equal(at(GPS_ACCURACY_TIERS.fairM), 'fair');
  assert.equal(at(GPS_ACCURACY_TIERS.fairM + 1), 'weak');
});

test('the live grade and the finished-run grade agree on good accuracy', () => {
  // A run of clean fixes at exactly the strong threshold must not read "strong"
  // live and then be graded below "high" on save.
  const state = createGpsQualityState();
  state.acceptedPointCount = 6;
  state.acceptedAccuracyTotalM = GPS_ACCURACY_TIERS.strongM * 6;
  assert.equal(summarizeGpsQuality(state).confidence, 'high');
  assert.equal(gpsSignalPresentation({
    status: 'tracking', acceptedPointCount: 6,
    lastAcceptedPoint: fix(GPS_ACCURACY_TIERS.strongM),
  }, 1_000_000).level, 'strong');
});

test('the signal reports the last fix, not the best one the run ever had', () => {
  const stale = GPS_QUALITY_LIMITS.maxContinuityGapMs + 15_000;
  const s = gpsSignalPresentation({
    status: 'tracking', acceptedPointCount: 400, lastAcceptedPoint: fix(4, stale),
  }, 1_000_000);
  assert.equal(s.level, 'lost');
  assert.equal(s.tracking, false);
  assert.match(s.detail, /45s/);
});

test('a fix inside the continuity window is not called lost', () => {
  const s = gpsSignalPresentation({
    status: 'tracking', acceptedPointCount: 10,
    lastAcceptedPoint: fix(8, GPS_QUALITY_LIMITS.maxContinuityGapMs - 1),
  }, 1_000_000);
  assert.equal(s.level, 'strong');
});

test('a paused run is paused, never dressed up as signal loss', () => {
  // Fixes are deliberately not ingested while paused, so staleness there is the
  // app working correctly.
  const s = gpsSignalPresentation({
    status: 'paused', acceptedPointCount: 120,
    lastAcceptedPoint: fix(6, 10 * 60 * 1000),
  }, 1_000_000);
  assert.equal(s.level, 'paused');
  assert.equal(s.label, 'Paused');
  assert.equal(s.tracking, false);
  assert.match(s.detail, /±6 m/);
});

test('every signal state carries a label and a detail to render', () => {
  const inputs = [
    { status: 'waiting' },
    { status: 'tracking', acceptedPointCount: 0 },
    { status: 'tracking', acceptedPointCount: 3, lastAcceptedPoint: fix(5) },
    { status: 'tracking', acceptedPointCount: 3, lastAcceptedPoint: fix(60) },
    { status: 'tracking', acceptedPointCount: 3, lastAcceptedPoint: fix(5, 120_000) },
    { status: 'paused', acceptedPointCount: 0 },
  ];
  for (const input of inputs) {
    const s = gpsSignalPresentation(input, 1_000_000);
    assert.ok(s.label && s.detail, `empty presentation for ${JSON.stringify(input)}`);
    assert.equal(typeof s.tracking, 'boolean');
  }
});

// ── Focus mode ──────────────────────────────────────────────────────────────

test('focus mode covers waiting, not just recording', () => {
  // `waiting` records nothing yet, but the card is already the session.
  assert.equal(isActiveRunSession('waiting'), true);
  assert.equal(isActiveRunSession('tracking'), true);
  assert.equal(isActiveRunSession('paused'), true);
  assert.equal(isActiveRunSession('idle'), false);
  assert.equal(isActiveRunSession(''), false);
});
