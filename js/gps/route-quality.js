// @ts-check
// =============================================================================
// GPS ROUTE QUALITY
// Pure, deterministic point screening shared by web + Android GPS ingestion.
// Raw fixes remain in the native active-session journal until save acknowledgement;
// completed sessions retain a compact raw-vs-filtered audit, not duplicate location data.
// =============================================================================

export const GPS_QUALITY_LIMITS = Object.freeze({
  maxAccuracyM: 50,
  minMovementM: 5,
  maxSpeedMps: 12.5, // 45 km/h: generous enough for sprinting, rejects teleports
  maxContinuityGapMs: 30_000,
});

const REASONS = ['invalid', 'poorAccuracy', 'jitter', 'timestamp', 'teleport'];

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Great-circle distance in metres between normalized fixes. */
export function gpsDistanceM(a, b) {
  const R = 6_371_000;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function normalizeFix(raw) {
  const lat = finite(raw?.lat);
  const lng = finite(raw?.lng);
  const accuracyM = finite(raw?.accuracyM ?? raw?.acc);
  const timestampMs = finite(raw?.timestampMs ?? raw?.t);
  if (lat == null || lng == null || accuracyM == null || timestampMs == null ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
      accuracyM < 0 || timestampMs <= 0) return null;
  return { lat, lng, accuracyM, timestampMs };
}

export function createGpsQualityState() {
  return {
    rawPointCount: 0,
    acceptedPointCount: 0,
    rawDistanceM: 0,
    filteredDistanceM: 0,
    acceptedAccuracyTotalM: 0,
    maxObservedSpeedMps: 0,
    segmentBreaks: 0,
    rejected: { invalid: 0, poorAccuracy: 0, jitter: 0, timestamp: 0, teleport: 0 },
    lastRawPoint: null,
    lastAcceptedPoint: null,
  };
}

function reject(state, reason, point = null) {
  state.rejected[reason] += 1;
  return { accepted: false, reason, distanceM: 0, breakSegment: false, point };
}

/**
 * Screen one raw fix and mutate only the supplied ephemeral accumulator.
 * `forceBreak` is used after an explicit pause/resume: the next good point
 * becomes a new anchor, so movement while paused is never invented.
 */
export function ingestGpsQualityFix(state, raw, options = {}) {
  const target = state || createGpsQualityState();
  const limits = { ...GPS_QUALITY_LIMITS, ...(options.limits || {}) };
  target.rawPointCount += 1;
  const point = normalizeFix(raw);
  if (!point) return reject(target, 'invalid');

  if (target.lastRawPoint) target.rawDistanceM += gpsDistanceM(target.lastRawPoint, point);
  target.lastRawPoint = point;

  if (point.accuracyM > limits.maxAccuracyM) return reject(target, 'poorAccuracy', point);

  const previous = target.lastAcceptedPoint;
  if (!previous) {
    target.lastAcceptedPoint = point;
    target.acceptedPointCount += 1;
    target.acceptedAccuracyTotalM += point.accuracyM;
    return { accepted: true, reason: 'anchor', distanceM: 0, breakSegment: false, point };
  }

  const dtMs = point.timestampMs - previous.timestampMs;
  if (dtMs <= 0) return reject(target, 'timestamp', point);

  if (options.forceBreak || dtMs > limits.maxContinuityGapMs) {
    target.lastAcceptedPoint = point;
    target.acceptedPointCount += 1;
    target.acceptedAccuracyTotalM += point.accuracyM;
    target.segmentBreaks += 1;
    return { accepted: true, reason: 'segmentBreak', distanceM: 0, breakSegment: true, point };
  }

  const distanceM = gpsDistanceM(previous, point);
  if (distanceM < limits.minMovementM) return reject(target, 'jitter', point);

  const speedMps = distanceM / (dtMs / 1000);
  target.maxObservedSpeedMps = Math.max(target.maxObservedSpeedMps, speedMps);
  if (speedMps > limits.maxSpeedMps) return reject(target, 'teleport', point);

  target.lastAcceptedPoint = point;
  target.acceptedPointCount += 1;
  target.acceptedAccuracyTotalM += point.accuracyM;
  target.filteredDistanceM += distanceM;
  return { accepted: true, reason: 'movement', distanceM, breakSegment: false, point };
}

/** Compact, portable evidence attached to the run session and route record. */
export function summarizeGpsQuality(state) {
  const source = state || createGpsQualityState();
  const rejected = Object.fromEntries(REASONS.map((key) => [key, Math.max(0, Number(source.rejected?.[key]) || 0)]));
  const rejectedPointCount = Object.values(rejected).reduce((sum, value) => sum + value, 0);
  const signalRejects = rejected.invalid + rejected.poorAccuracy + rejected.timestamp + rejected.teleport;
  const evidenceCount = source.acceptedPointCount + signalRejects;
  const signalRejectRatio = evidenceCount ? signalRejects / evidenceCount : 1;
  const avgAccuracyM = source.acceptedPointCount
    ? source.acceptedAccuracyTotalM / source.acceptedPointCount
    : null;

  let confidence = 'insufficient';
  if (source.acceptedPointCount >= 2) {
    const clean = signalRejects === 0 && source.segmentBreaks === 0 && avgAccuracyM <= 20;
    const usable = source.acceptedPointCount >= 4 && signalRejectRatio <= 0.25 &&
      avgAccuracyM <= 35 && source.segmentBreaks <= 2;
    confidence = clean ? 'high' : (usable ? 'medium' : 'low');
  }

  return {
    version: 1,
    confidence,
    rawPointCount: Math.max(0, Number(source.rawPointCount) || 0),
    acceptedPointCount: Math.max(0, Number(source.acceptedPointCount) || 0),
    rejectedPointCount,
    rejected,
    rawDistanceKm: round(Math.max(0, Number(source.rawDistanceM) || 0) / 1000),
    filteredDistanceKm: round(Math.max(0, Number(source.filteredDistanceM) || 0) / 1000),
    distanceRemovedKm: round(Math.max(0, (Number(source.rawDistanceM) || 0) - (Number(source.filteredDistanceM) || 0)) / 1000),
    avgAccuracyM: avgAccuracyM == null ? null : round(avgAccuracyM, 1),
    maxObservedSpeedMps: round(Math.max(0, Number(source.maxObservedSpeedMps) || 0), 1),
    segmentBreaks: Math.max(0, Number(source.segmentBreaks) || 0),
  };
}

/** Validate imported route-quality metadata and strip unknown fields. */
export function sanitizeGpsQuality(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return null;
  const confidence = ['high', 'medium', 'low', 'insufficient'].includes(raw.confidence)
    ? raw.confidence : null;
  const nonNegative = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const count = (value) => {
    const n = nonNegative(value);
    return n != null && Number.isInteger(n) ? n : null;
  };
  const rawPointCount = count(raw.rawPointCount);
  const acceptedPointCount = count(raw.acceptedPointCount);
  const rejectedPointCount = count(raw.rejectedPointCount);
  const rawDistanceKm = nonNegative(raw.rawDistanceKm);
  const filteredDistanceKm = nonNegative(raw.filteredDistanceKm);
  const distanceRemovedKm = nonNegative(raw.distanceRemovedKm);
  const maxObservedSpeedMps = nonNegative(raw.maxObservedSpeedMps);
  const segmentBreaks = count(raw.segmentBreaks);
  const avgAccuracyM = raw.avgAccuracyM == null ? null : nonNegative(raw.avgAccuracyM);
  if (!confidence || [rawPointCount, acceptedPointCount, rejectedPointCount, rawDistanceKm,
    filteredDistanceKm, distanceRemovedKm, maxObservedSpeedMps, segmentBreaks].some((v) => v == null) ||
    (raw.avgAccuracyM != null && avgAccuracyM == null)) return null;

  const rejected = {};
  for (const key of REASONS) {
    const value = count(raw.rejected?.[key]);
    if (value == null) return null;
    rejected[key] = value;
  }
  const reasonTotal = Object.values(rejected).reduce((sum, value) => sum + value, 0);
  const expectedRemoved = Math.max(0, rawDistanceKm - filteredDistanceKm);
  if (reasonTotal !== rejectedPointCount || acceptedPointCount + rejectedPointCount !== rawPointCount ||
      filteredDistanceKm > rawDistanceKm + 0.001 || Math.abs(distanceRemovedKm - expectedRemoved) > 0.01) return null;
  return {
    version: 1, confidence, rawPointCount, acceptedPointCount, rejectedPointCount,
    rejected, rawDistanceKm, filteredDistanceKm, distanceRemovedKm,
    avgAccuracyM, maxObservedSpeedMps, segmentBreaks,
  };
}
