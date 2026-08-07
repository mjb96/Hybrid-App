// @ts-check
// =============================================================================
// RUN NOTICES (Phase 2C)
//
// Pure copy model for the states a run tracker can be in that are NOT the run:
// blocked before it starts, failed while acquiring, and the standing truth
// about whether tracking survives the screen locking.
//
// Why these are not toasts. A toast is right for something that HAPPENED and is
// over ("Run saved ✓"). Every state here is a CONDITION that is still true
// after the message fades — a denied permission does not un-deny itself, and an
// athlete who looks down mid-warm-up has already missed it. Worse, the web
// error path returned the tracker to `showPanel('start')`, and the Quick
// Activity screen has no start panel: a denied permission left a full-screen
// view containing nothing but "← Cancel". The notice is what fills that screen.
//
// Copy rules followed here: name the condition, say what it means for THIS run,
// and give the one next action. Never blame the athlete, and never claim a
// capability the platform does not have — the web build genuinely cannot track
// with the screen locked, so it says so instead of letting the athlete find out
// by losing a run.
// =============================================================================

/** @typedef {{kind:string, title:string, body:string, retry:boolean}} RunNotice */

/**
 * A geolocation failure, as the athlete needs to understand it.
 *
 * Codes are the W3C `GeolocationPositionError` constants: 1 PERMISSION_DENIED,
 * 2 POSITION_UNAVAILABLE, 3 TIMEOUT. They were previously collapsed into one
 * message — "GPS unavailable — <message>" — which told a blocked athlete
 * nothing about the fact that only they can unblock it.
 *
 * @param {number|null|undefined} code
 * @returns {RunNotice}
 */
export function locationErrorNotice(code) {
  switch (Number(code)) {
    case 1:
      return {
        kind: 'permission',
        title: 'Location is turned off for Helyx',
        body: 'Tracking a run needs location access. Turn it on in your browser or device settings, then start the run again.',
        retry: true,
      };
    case 2:
      return {
        kind: 'unavailable',
        title: 'No GPS fix here',
        body: 'Your device could not find a location. A clear view of the sky usually fixes it — or log this run by distance and time instead.',
        retry: true,
      };
    case 3:
      return {
        kind: 'timeout',
        title: 'GPS is taking too long',
        body: 'No fix arrived in time. Try again outdoors, or log this run by distance and time instead.',
        retry: true,
      };
    default:
      return {
        kind: 'unknown',
        title: 'Could not start tracking',
        body: 'Something stopped GPS from starting. Try again, or log this run by distance and time instead.',
        retry: true,
      };
  }
}

/**
 * A start that never got as far as a position error.
 *
 * `native-busy` is deliberately not framed as a failure: it means Android is
 * protecting a recovered run's journal, and starting a new one would be the
 * destructive outcome, not the refusal.
 *
 * @param {string|null|undefined} reason
 * @returns {RunNotice|null} null when nothing blocked the start
 */
export function startBlockedNotice(reason) {
  switch (reason) {
    case 'permission':
      return locationErrorNotice(1);
    case 'unsupported':
      return {
        kind: 'unsupported',
        title: 'This browser cannot track runs',
        body: 'There is no GPS available here. You can still log a run by distance and time, or import it from your watch.',
        retry: false,
      };
    case 'native-busy':
      return {
        kind: 'native-busy',
        title: 'Finish the recovered run first',
        body: 'A previous run is still being saved. Finish or discard it, and this one can start straight after.',
        retry: false,
      };
    default:
      return null;
  }
}

/**
 * The standing truth about background tracking on THIS build.
 *
 * Stated up front rather than discovered by losing a run: the web/PWA build
 * uses `watchPosition` plus a screen wake lock and stops when the app leaves
 * the foreground, while the Android build runs a location foreground service
 * that keeps recording through a screen lock or an app switch.
 *
 * @param {{nativeAvailable?:boolean}} [env]
 * @returns {{kind:'background'|'foreground-only', text:string}}
 */
export function backgroundTrackingNotice({ nativeAvailable = false } = {}) {
  if (nativeAvailable) {
    return {
      kind: 'background',
      text: 'Keeps recording with the screen off',
    };
  }
  return {
    kind: 'foreground-only',
    text: 'Keep Helyx open — browser tracking stops if you switch apps or lock the screen',
  };
}

/**
 * A run rebuilt from the Android journal after the app was killed mid-session.
 *
 * The distinction that matters is whether anything is MISSING. Native reports
 * `restored: true` when it had to fall back to the last durably-journalled
 * point, which means a short stretch just before the restart is gone — an
 * athlete comparing this against their watch deserves to know that rather than
 * to conclude Helyx miscounted.
 *
 * @param {{restored?:boolean, status?:string}} [recovery]
 * @returns {RunNotice}
 */
export function runRecoveryNotice({ restored = false, status = 'TRACKING' } = {}) {
  if (status === 'FINALIZING') {
    return {
      kind: 'recovered-finalizing',
      title: 'Recovered — finish saving this run',
      body: 'Helyx restarted while this run was being saved. Finish below and it will be stored.',
      retry: false,
    };
  }
  if (restored) {
    return {
      kind: 'recovered-partial',
      title: 'Recovered to the last saved point',
      body: 'Helyx restarted mid-run. Everything up to the last saved GPS point is here; a short stretch just before the restart may be missing.',
      retry: false,
    };
  }
  return {
    kind: 'recovered',
    title: 'Run restored',
    body: 'Helyx restarted, but GPS kept recording the whole time — nothing is missing.',
    retry: false,
  };
}

/**
 * What happened to the run at the moment of saving, when it was not simply
 * "saved". Returns null for the ordinary success, so a caller can treat a
 * notice as "there is something the athlete must know".
 *
 * @param {{stateSaved?:boolean, routeSaved?:boolean, journalCleared?:boolean,
 *          hadRoute?:boolean, nativeProtected?:boolean}} outcome
 * @returns {RunNotice|null}
 */
export function runSaveNotice({
  stateSaved = true, routeSaved = true, journalCleared = true, hadRoute = true,
  nativeProtected = false,
} = {}) {
  if (!stateSaved) {
    return {
      kind: 'not-saved',
      title: 'This run could not be saved',
      body: nativeProtected
        // Android still holds the run in its journal, which is the difference
        // between "not saved yet" and "lost". Saying so is the whole point.
        ? 'Your device would not store it, so Helyx is keeping its Android recovery copy — the run is not lost. Free some space and restart Helyx to finish saving it.'
        : 'Your device would not store it — usually a full disk. Free some space and finish again; the run is still on screen until you do.',
      retry: false,
    };
  }
  if (hadRoute && !routeSaved) {
    return {
      kind: 'route-lost',
      title: 'Saved without its map',
      body: 'The distance, time and splits are recorded. Only the route map could not be stored, so this run has no map to open.',
      retry: false,
    };
  }
  if (!journalCleared) {
    return {
      kind: 'journal-open',
      title: 'Saved — recovery copy still open',
      body: 'The run is recorded. Android could not close its backup copy, so restart Helyx before your next run to clear it.',
      retry: false,
    };
  }
  return null;
}
