// @ts-check
// =============================================================================
// ACTIVE RUN DISPLAY (Phase 2C)
//
// Pure presentation model for the live run session — the numbers and the signal
// state, with no DOM and no module state. Two surfaces render it (the workout
// cockpit and the standalone Quick Activity screen), so keeping the model here
// is what stops them drifting apart.
//
// Two rules this module exists to enforce:
//
//  1. The live run speaks the athlete's own distance unit. Everything else in
//     the app converts km to the configured unit at the display boundary; the
//     live tracker did not, so a miles athlete watched a km number climb and
//     then saw it change the moment they hit Stop (`stopTracking` fills the
//     cockpit input in the display unit). The run is the one moment those
//     numbers are being watched continuously — it is the worst place to be
//     inconsistent.
//  2. "Is it actually tracking me?" is answered from the LAST ACCEPTED fix, not
//     from the whole-run summary. `summarizeGpsQuality` grades a finished run;
//     mid-run the athlete needs the current state, and a run that was clean for
//     20 minutes and has had no fix for the last two should not read as good.
//     Accuracy tiers come from `route-quality.js` so the live grade and the
//     saved grade can never disagree about what "good accuracy" means.
// =============================================================================
import { GPS_ACCURACY_TIERS, GPS_QUALITY_LIMITS } from './route-quality.js';

const KM_TO_MI = 0.621371;

/** Pace is meaningless over a few metres of GPS noise; km-based on purpose. */
const MIN_PACE_DISTANCE_KM = 0.05;

/**
 * Normalise the configured distance unit.
 * @param {any} state
 * @returns {'km'|'mi'}
 */
export function runDistanceUnit(state) {
  return state?.settings?.distanceUnit === 'mi' ? 'mi' : 'km';
}

/**
 * @param {number} ms
 * @returns {string} `m:ss`, or `h:mm:ss` once past an hour.
 */
export function formatRunClock(ms) {
  const totalSec = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * The live numbers, already in the athlete's unit.
 *
 * @param {{distKm?:number, elapsedMs?:number, unit?:'km'|'mi'}} input
 * @returns {{time:string, distance:string, pace:string,
 *            distanceLabel:string, paceLabel:string, unit:'km'|'mi'}}
 */
export function activeRunStats({ distKm = 0, elapsedMs = 0, unit = 'km' } = {}) {
  const safeUnit = unit === 'mi' ? 'mi' : 'km';
  const km = Math.max(0, Number(distKm) || 0);
  const ms = Math.max(0, Number(elapsedMs) || 0);
  const shown = safeUnit === 'mi' ? km * KM_TO_MI : km;

  let pace = '—:——';
  if (km >= MIN_PACE_DISTANCE_KM && shown > 0) {
    const secPerUnit = ms / 1000 / shown;
    const m = Math.floor(secPerUnit / 60);
    const s = Math.round(secPerUnit % 60);
    // 59.5s rounds to 60 — carry it rather than printing "5:60".
    const carried = s === 60 ? { m: m + 1, s: 0 } : { m, s };
    pace = `${carried.m}:${String(carried.s).padStart(2, '0')}`;
  }

  return {
    time: formatRunClock(ms),
    distance: shown.toFixed(2),
    pace,
    distanceLabel: safeUnit.toUpperCase(),
    paceLabel: `PACE /${safeUnit.toUpperCase()}`,
    unit: safeUnit,
  };
}

/**
 * Live signal state, derived from the most recent ACCEPTED fix.
 *
 * A paused run is reported as paused rather than as signal loss: fixes are
 * deliberately not ingested while paused, so growing staleness there is the
 * app working correctly and must not be dressed up as a GPS problem.
 *
 * @param {{status?:string, lastAcceptedPoint?:{accuracyM?:number, timestampMs?:number}|null,
 *          acceptedPointCount?:number}} input
 * @param {number} [nowMs]
 * @returns {{level:'searching'|'paused'|'lost'|'strong'|'fair'|'weak',
 *            label:string, detail:string, tracking:boolean}}
 */
export function gpsSignalPresentation(input = {}, nowMs = Date.now()) {
  const { status, lastAcceptedPoint, acceptedPointCount = 0 } = input;

  if (status === 'waiting') {
    return {
      level: 'searching', label: 'Searching',
      detail: 'Waiting for a GPS fix', tracking: false,
    };
  }

  const accuracyM = Number(lastAcceptedPoint?.accuracyM);
  const timestampMs = Number(lastAcceptedPoint?.timestampMs);
  const haveFix = acceptedPointCount > 0 &&
    Number.isFinite(accuracyM) && Number.isFinite(timestampMs);

  if (status === 'paused') {
    return {
      level: 'paused', label: 'Paused',
      detail: haveFix ? `Last fix ±${Math.round(accuracyM)} m` : 'No fix recorded yet',
      tracking: false,
    };
  }

  if (!haveFix) {
    return {
      level: 'searching', label: 'Searching',
      detail: 'Waiting for a GPS fix', tracking: false,
    };
  }

  const staleMs = Math.max(0, nowMs - timestampMs);
  if (staleMs > GPS_QUALITY_LIMITS.maxContinuityGapMs) {
    return {
      level: 'lost', label: 'No signal',
      detail: `No fix for ${Math.round(staleMs / 1000)}s`,
      tracking: false,
    };
  }

  const detail = `±${Math.round(accuracyM)} m`;
  if (accuracyM <= GPS_ACCURACY_TIERS.strongM) {
    return { level: 'strong', label: 'GPS strong', detail, tracking: true };
  }
  if (accuracyM <= GPS_ACCURACY_TIERS.fairM) {
    return { level: 'fair', label: 'GPS fair', detail, tracking: true };
  }
  return { level: 'weak', label: 'GPS weak', detail, tracking: true };
}

/**
 * Is a run session occupying the screen right now?
 *
 * Drives the cockpit's focus mode: while this is true the run card shows the
 * session and its controls only, and the setup/import/manual-entry controls
 * step out of the way. They are not removed — a finished run comes straight
 * back to them for review.
 *
 * @param {string} status
 */
export function isActiveRunSession(status) {
  return status === 'waiting' || status === 'tracking' || status === 'paused';
}
