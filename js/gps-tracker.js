// ==========================================
// HYBRID ENGINE — GPS RUN TRACKER (js/gps-tracker.js)
//
// State machine: idle → waiting → tracking → paused → idle
//
// Public API:
//   initGpsTracker()         — call once on app start
//   onWorkoutTabActivated()  — call when workout tab becomes visible
//   startTracking()          — Promise<{ ok, reason }>; reason feeds run-notices
//   pauseTracking()
//   resumeTracking()
//   stopTracking(week, day)  — Promise<{ distKm, timeStr } | null>
//   isTracking()             — boolean
//
// Dispatches: CustomEvent 'gps:route-saved' { detail: { week, day, distKm } }
// ==========================================
import { saveMapToDB } from './db.js';
import { showToast, appState, saveStateToLocalStorage, verifyWeekStorageSchema } from './state.js';
import { ensureLeaflet } from './ui/leaflet-loader.js';
import { confirmModal } from './ui/confirm-modal.js';
import {
  isNativeGpsAvailable, ensureLocationPermission,
  nativeStartRun, nativePauseRun, nativeResumeRun, nativeStopRun, nativeCompleteRun,
  nativeDiscardRun, nativeDrainSince, nativeDrainDisposition,
} from './gps/native-bridge.js';
import { newRunSessionId, upsertRunSession } from './state/run-sessions.js';
import {
  createGpsQualityState, ingestGpsQualityFix, summarizeGpsQuality,
} from './gps/route-quality.js';
import {
  activeRunStats, formatRunClock, gpsSignalPresentation, isActiveRunSession,
  runDistanceUnit,
} from './gps/active-run-display.js';
import {
  backgroundTrackingNotice, locationErrorNotice, runRecoveryNotice, runSaveNotice,
  startBlockedNotice,
} from './gps/run-notices.js';

// ── Tuning constants ──────────────────────────────────────────────────────
const TICK_MS          = 1000; // stats update interval

// ── UI scopes ───────────────────────────────────────────────────────────────
// The tracker drives two surfaces with the same state machine: the in-program
// workout cockpit and the standalone Quick Start "Activity" screen. Each owns a
// distinct set of element IDs; `_scope` selects which one live updates target.
const UI = {
  cockpit:  { start: 'gpsStartPanel', wait: 'gpsWaitPanel', live: 'gpsLivePanel',
              map: 'gpsLiveMap', time: 'gpsStatTime', dist: 'gpsStatDist',
              pace: 'gpsStatPace', pauseBtn: 'gpsPauseBtn',
              distLabel: 'gpsDistUnitLabel', paceLabel: 'gpsPaceUnitLabel',
              signal: 'gpsSignal', signalLabel: 'gpsSignalLabel',
              signalDetail: 'gpsSignalDetail', notice: 'gpsNotice',
              noticeTitle: 'gpsNoticeTitle', noticeBody: 'gpsNoticeBody',
              noticeRetry: 'gpsNoticeRetry', background: 'gpsBackgroundNote' },
  // The Quick Activity screen has no start panel — the run is already started
  // by the time it opens (Home Quick Start), so `showPanel('start')` there only
  // has to take the live panel down. It named a `qsStartPanel` that has never
  // existed in the markup; `null` says that, a phantom ID does not.
  activity: { start: null, wait: 'qsWaitPanel', live: 'qsLivePanel',
              map: 'qsLiveMap', time: 'qsStatTime', dist: 'qsStatDist',
              pace: 'qsStatPace', pauseBtn: 'qsPauseBtn',
              distLabel: 'qsDistUnitLabel', paceLabel: 'qsPaceUnitLabel',
              signal: 'qsSignal', signalLabel: 'qsSignalLabel',
              signalDetail: 'qsSignalDetail', notice: 'qsNotice',
              noticeTitle: 'qsNoticeTitle', noticeBody: 'qsNoticeBody',
              noticeRetry: 'qsNoticeRetry', background: 'qsBackgroundNote' },
};
let _scope = 'cockpit';
function ui() { return UI[_scope] || UI.cockpit; }

// ── Module state ──────────────────────────────────────────────────────────
let _status    = 'idle'; // idle | waiting | tracking | paused
let _watchId   = null;
let _startTime = null;   // Date.now() at start of current segment
let _pausedMs  = 0;      // accumulated ms from completed segments
let _coords    = [];     // [[lat, lng], …]
let _distKm    = 0;
let _wakeLock  = null;
let _tickTimer = null;
let _activityType = 'run'; // 'run' | 'walk' — tags the logged activity
let _quickActivity = false; // true when launched via Home Quick Start (auto-open recap on stop)
let _sessionId = null;      // stable across pause/reload; links state ↔ IndexedDB route
let _sessionStartTs = null; // original session start, never the last resumed segment
let _sessionContext = {};   // { week, day, localDate }
let _qualityState = createGpsQualityState();
let _forceSegmentBreak = false;
let _liveMap   = null;   // Leaflet instance for the live tracking map
let _liveLine  = null;   // Leaflet Polyline
let _liveMarker = null;  // Leaflet CircleMarker (current position dot)

// Km split tracking
let _splits      = [];  // [{ lap, dist, time, avgHR, coordsStartIdx, coordsEndIdx }]
let _nextKmMark  = 1;   // next km boundary to detect
let _lapStartMs  = 0;   // elapsedMs() at the start of the current lap
let _lapStartIdx = 0;   // index into _coords at the start of the current lap

// Native mode (Android WebView): GPS is collected by a location foreground
// service that keeps running while the WebView is frozen (screen lock, app
// switch). JS drains buffered fixes by sequence cursor whenever it's awake,
// so a frozen stretch is caught up losslessly instead of lost.
let _nativeMode      = false;
let _nativeSeq       = 0;  // drain cursor into the native point buffer
let _nativeElapsedMs = 0;  // native service is the source of truth for run time
let _drainTimer      = null;
let _nativeFinalizing = false;
let _nativeDurabilityWarned = false;
const ACTIVE_GPS_STORAGE_KEY = 'hybrid_engine_v2_state_active_gps_session';

function readStoredSessionIdentity() {
  try {
    const raw = localStorage.getItem(ACTIVE_GPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) { return null; }
}

function writeStoredSessionIdentity(value) {
  try { localStorage.setItem(ACTIVE_GPS_STORAGE_KEY, JSON.stringify(value)); } catch (_) {}
}

function beginSessionIdentity(activityType, quickStart, ctx = {}) {
  _sessionId = newRunSessionId();
  _sessionStartTs = Date.now();
  _sessionContext = { ...ctx };
  writeStoredSessionIdentity({
    sessionId: _sessionId,
    startTs: _sessionStartTs,
    activityType,
    quickStart: !!quickStart,
    context: _sessionContext,
  });
}

function clearSessionIdentity() {
  _sessionId = null;
  _sessionStartTs = null;
  _sessionContext = {};
  try { localStorage.removeItem(ACTIVE_GPS_STORAGE_KEY); } catch (_) {}
}

// ── Math helpers ──────────────────────────────────────────────────────────

function elapsedMs() {
  if (_nativeMode) return _nativeElapsedMs; // refreshed on every drain tick
  if (!_startTime) return _pausedMs;
  return _pausedMs + (Date.now() - _startTime);
}

// The saved `time` string and the on-screen clock are the same format by
// construction — they were two implementations of it before.
const fmtTime = formatRunClock;

// ── Wake Lock ─────────────────────────────────────────────────────────────

async function acquireWakeLock() {
  if (!navigator.wakeLock) return null;
  try {
    const lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { _wakeLock = null; });
    return lock;
  } catch (_) { return null; }
}

async function releaseWakeLock() {
  if (!_wakeLock) return;
  try { await _wakeLock.release(); } catch (_) {}
  _wakeLock = null;
}

// Re-acquire if the system released it (e.g. battery saver kicked in).
document.addEventListener('visibilitychange', async () => {
  if (_status === 'tracking' && document.visibilityState === 'visible' && !_wakeLock) {
    _wakeLock = await acquireWakeLock();
  }
});

// ── Leaflet live map ──────────────────────────────────────────────────────

async function buildLiveMap() {
  const mapId = ui().map;
  const el = document.getElementById(mapId);
  if (!el) return;
  try { await ensureLeaflet(); } catch { return; }
  if (typeof L === 'undefined') return;
  if (_liveMap) { _liveMap.remove(); }
  _liveMap    = L.map(mapId, { zoomControl: true, dragging: true, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: true });
  _liveLine   = L.polyline([], { color: '#f43f5e', weight: 4, opacity: 0.9 }).addTo(_liveMap);
  _liveMarker = null;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(_liveMap);
}

function pushToLiveMap(lat, lng) {
  if (!_liveMap || !_liveLine) return;
  _liveLine.addLatLng([lat, lng]);
  if (!_liveMarker) {
    _liveMarker = L.circleMarker([lat, lng], { radius: 7, color: '#fff', fillColor: '#f43f5e', fillOpacity: 1, weight: 2 }).addTo(_liveMap);
    _liveMap.setView([lat, lng], 15);
  } else {
    _liveMarker.setLatLng([lat, lng]);
    _liveMap.panTo([lat, lng]);
  }
}

function destroyLiveMap() {
  if (_liveMap) { _liveMap.remove(); }
  _liveMap = null; _liveLine = null; _liveMarker = null;
}

// ── Stats UI ──────────────────────────────────────────────────────────────

function tickStats() {
  const u = ui();
  const stats = activeRunStats({
    distKm: _distKm,
    elapsedMs: elapsedMs(),
    unit: runDistanceUnit(appState),
  });
  const timeEl = document.getElementById(u.time);
  const distEl = document.getElementById(u.dist);
  const paceEl = document.getElementById(u.pace);
  if (timeEl) timeEl.textContent = stats.time;
  if (distEl) distEl.textContent = stats.distance;
  if (paceEl) paceEl.textContent = stats.pace;
  tickSignal();
}

// The unit is a setting, not a per-tick value: written when a panel opens.
function applyUnitLabels() {
  const u = ui();
  const stats = activeRunStats({ unit: runDistanceUnit(appState) });
  const distLabel = document.getElementById(u.distLabel);
  const paceLabel = document.getElementById(u.paceLabel);
  if (distLabel) distLabel.textContent = stats.distanceLabel;
  if (paceLabel) paceLabel.textContent = stats.paceLabel;
}

function tickSignal() {
  const u = ui();
  const host = document.getElementById(u.signal);
  if (!host) return;
  const signal = gpsSignalPresentation({
    status: _status,
    lastAcceptedPoint: _qualityState?.lastAcceptedPoint,
    acceptedPointCount: _qualityState?.acceptedPointCount || 0,
  });
  host.dataset.level = signal.level;
  const labelEl = document.getElementById(u.signalLabel);
  const detailEl = document.getElementById(u.signalDetail);
  if (labelEl) labelEl.textContent = signal.label;
  if (detailEl) detailEl.textContent = signal.detail;
  host.setAttribute('aria-label', `${signal.label} — ${signal.detail}`);
}

// Focus mode: while a run session owns the screen, the cockpit's run card shows
// the session and nothing competing with it. Setup, manual entry and the watch
// import are hidden by CSS, not removed — `stopTracking` fills those same
// inputs for review the moment the run ends.
function applyRunFocusMode() {
  const panel = document.getElementById('cockpitRunPanel');
  if (!panel) return;
  panel.classList.toggle(
    'run-session-active',
    _scope === 'cockpit' && isActiveRunSession(_status),
  );
}

// ── Panel visibility ──────────────────────────────────────────────────────

function showPanel(which) {
  const u = ui();
  const start = u.start ? document.getElementById(u.start) : null;
  const wait  = document.getElementById(u.wait);
  const live  = document.getElementById(u.live);
  const notice = document.getElementById(u.notice);
  if (start) start.style.display = which === 'start' ? 'flex' : 'none';
  if (wait)  wait.style.display  = which === 'wait'  ? 'flex' : 'none';
  if (live)  live.style.display  = which === 'live'  ? 'block' : 'none';
  if (notice && which !== 'notice') notice.hidden = true;
  applyUnitLabels();
  tickSignal();
  applyRunFocusMode();
  applyBackgroundNotice();
}

/**
 * Show a blocking condition where the run would have been.
 *
 * This is the fix for a genuine dead end: the web error path returned to
 * `showPanel('start')`, and the Quick Activity scope has no start panel — so a
 * denied permission left a full-screen view holding nothing but "← Cancel".
 * The notice IS that screen's content now. On the cockpit the start panel stays
 * available beneath it, because "Start →" is the retry.
 *
 * @param {import('./gps/run-notices.js').RunNotice|null} notice
 */
function showRunNotice(notice) {
  const host = document.getElementById(ui().notice);
  if (!notice) { if (host) host.hidden = true; return; }
  showPanel(_scope === 'cockpit' ? 'start' : 'notice');
  renderNotice(notice);
}

/**
 * A notice that explains the run currently ON the screen, rather than replacing
 * it — a recovered session is still live, so it must not be sent back to the
 * start panel. Left standing until the next `showPanel`, which is the run
 * ending: pause and resume do not change panels.
 *
 * @param {import('./gps/run-notices.js').RunNotice|null} notice
 */
function showInfoNotice(notice) {
  if (!notice) return;
  renderNotice(notice);
}

/** @param {import('./gps/run-notices.js').RunNotice} notice */
function renderNotice(notice) {
  const u = ui();
  const host = document.getElementById(u.notice);
  if (!host) {
    // No notice element on this surface: a toast is a poor substitute, but
    // silence here would be a blank screen.
    showToast(`${notice.title} — ${notice.body}`, true);
    return;
  }
  host.hidden = false;
  host.dataset.kind = notice.kind;
  const titleEl = document.getElementById(u.noticeTitle);
  const bodyEl = document.getElementById(u.noticeBody);
  const retryEl = document.getElementById(u.noticeRetry);
  if (titleEl) titleEl.textContent = notice.title;
  if (bodyEl) bodyEl.textContent = notice.body;
  // The cockpit's own "Start →" is the retry; a second one would be two
  // buttons doing the same thing.
  if (retryEl) retryEl.hidden = _scope === 'cockpit' || !notice.retry;
}

/** The standing platform truth, shown wherever a run is started or running. */
function applyBackgroundNotice() {
  const u = ui();
  const el = document.getElementById(u.background);
  if (!el) return;
  const notice = backgroundTrackingNotice({ nativeAvailable: isNativeGpsAvailable() });
  el.textContent = notice.text;
  el.dataset.kind = notice.kind;
}

// ── Geolocation callbacks ─────────────────────────────────────────────────

function onPosition(pos) {
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  ingestFix(lat, lng, accuracy, Number(pos.timestamp) || Date.now());
}

// Shared fix pipeline for both sources (web watchPosition + native drain):
// deterministic quality screening, waiting→tracking transition, and
// filtered distance/split accumulation. Completed runs retain only a compact
// raw-vs-filtered audit summary, not a duplicate raw location stream.
function ingestFix(lat, lng, accuracy, timestampMs) {
  if (_status !== 'waiting' && _status !== 'tracking') return;
  const result = ingestGpsQualityFix(_qualityState, {
    lat, lng, accuracyM: accuracy, timestampMs,
  }, {
    forceBreak: _forceSegmentBreak,
    limits: _activityType === 'walk' ? { maxSpeedMps: 5 } : {},
  });
  if (!result.accepted) return;
  _forceSegmentBreak = false;

  // Transition from waiting on first valid fix
  if (_status === 'waiting') {
    _status    = 'tracking';
    _startTime = Date.now();
    showPanel('live');
    buildLiveMap();
    _tickTimer = setInterval(tickStats, TICK_MS);
  }

  if (_status !== 'tracking') return;

  const point = [result.point.lat, result.point.lng];
  if (_coords.length > 0) {
    _distKm += result.distanceM / 1000;

    // Detect km boundary crossings (may cross multiple in one jump)
    while (_distKm >= _nextKmMark) {
      const nowMs = elapsedMs();
      _splits.push({
        lap: _nextKmMark,
        dist: 1.0,
        time: Math.round((nowMs - _lapStartMs) / 1000),
        avgHR: '--',
        coordsStartIdx: _lapStartIdx,
        coordsEndIdx: _coords.length,  // index of point about to be pushed
      });
      _lapStartMs  = nowMs;
      _lapStartIdx = _coords.length;
      _nextKmMark++;
    }
  }
  _coords.push(point);
  pushToLiveMap(result.point.lat, result.point.lng);
  tickStats();
}

// Pull buffered fixes from the native service and feed them through the shared
// pipeline. Runs every TICK_MS while awake and immediately on wake-up; a long
// frozen stretch (screen locked for 30 min) is replayed in one call.
function drainNative() {
  if (!_nativeMode) return;
  const payload = nativeDrainSince(_nativeSeq);
  const disposition = nativeDrainDisposition(payload);
  _nativeSeq       = payload.seq;
  _nativeElapsedMs = payload.elapsedMs;
  for (const p of payload.points) ingestFix(p.lat, p.lng, p.acc, p.t);
  if (disposition.shouldPause && _status !== 'paused') {
    showRecoveredPausedState(payload.status);
  }
  if (disposition.durabilityFailed && !_nativeDurabilityWarned) {
    _nativeDurabilityWarned = true;
    showToast('Tracking paused — Android could not safely journal this run', true);
  }
  if (_status === 'tracking') tickStats();
}

function showRecoveredPausedState(nativeStatus) {
  _nativeFinalizing = nativeStatus === 'FINALIZING';
  _status = 'paused';
  _startTime = null;
  clearInterval(_tickTimer); _tickTimer = null;
  showPanel('live');
  if (!_liveMap && _coords.length) buildLiveMap();
  tickStats();
  const btn = document.getElementById(ui().pauseBtn);
  if (!btn) return;
  btn.style.display = '';
  if (_nativeFinalizing) {
    btn.textContent = 'Recovered — finish below';
    btn.setAttribute('data-action', 'gps-stop');
  } else {
    btn.textContent = '▶ Resume';
    btn.setAttribute('data-action', 'gps-resume');
  }
}

document.addEventListener('visibilitychange', () => {
  // Waking from a frozen WebView: catch up on everything native collected.
  if (_nativeMode && document.visibilityState === 'visible') drainNative();
});

function onPositionError(err) {
  if (_status !== 'waiting' && _status !== 'tracking') return;
  console.warn('GPS error:', err?.code, err?.message);

  // Mid-run errors are NOT fatal: the run holds the distance already recorded,
  // and the live signal chip ages into "No signal" on its own. Tearing the
  // session down here would throw away work over a transient dropout.
  if (_status === 'tracking') { tickSignal(); return; }

  _status = 'idle';
  clearSessionIdentity();
  // A permission denial is a condition, not an event — it is still true after a
  // toast fades, and on the Quick Activity screen `showPanel('start')` had
  // nothing to show, leaving a blank full-screen view.
  showRunNotice(locationErrorNotice(err?.code));
}

// ── Public API ────────────────────────────────────────────────────────────

export function isTracking() {
  return _status === 'tracking' || _status === 'paused';
}

/**
 * Is a run session on screen right now — including `waiting`, before the first
 * fix lands? `isTracking()` deliberately excludes that state (nothing is being
 * recorded yet), but the UI must already be treating the card as the session.
 */
export function hasActiveRunSession() {
  return isActiveRunSession(_status);
}

export function initGpsTracker() {
  showPanel('start');
  recoverNativeRun();
}

// If Android killed the activity mid-run, the foreground service kept tracking
// and holds the full point buffer. Rebuild the JS run state from it so the
// user comes back to a live run instead of a lost one.
function recoverNativeRun() {
  if (!isNativeGpsAvailable()) return;
  const p = nativeDrainSince(0);
  if (p.status === 'RECOVERY_ERROR') {
    resolveNativeRecoveryError();
    return;
  }
  if (p.status !== 'TRACKING' && p.status !== 'PAUSED' && p.status !== 'FINALIZING') return;

  _nativeMode      = true;
  _nativeSeq       = 0;
  _nativeElapsedMs = p.elapsedMs;
  _nativeFinalizing = p.status === 'FINALIZING';
  _nativeDurabilityWarned = !p.durable;
  _coords = []; _distKm = 0; _splits = [];
  _qualityState = createGpsQualityState();
  _forceSegmentBreak = false;
  _nextKmMark = 1; _lapStartMs = 0; _lapStartIdx = 0;
  const saved = readStoredSessionIdentity() || {};
  _sessionId = saved.sessionId || newRunSessionId();
  _sessionStartTs = Number(saved.startTs) || Math.max(1, Date.now() - p.elapsedMs);
  _sessionContext = saved.context && typeof saved.context === 'object' ? { ...saved.context } : {};
  _activityType = saved.activityType === 'walk' ? 'walk' : 'run';
  _quickActivity = !!saved.quickStart;
  _scope = _quickActivity ? 'activity' : 'cockpit';
  writeStoredSessionIdentity({
    sessionId: _sessionId, startTs: _sessionStartTs, activityType: _activityType,
    quickStart: _quickActivity, context: _sessionContext,
  });
  _status = 'waiting';           // ingestFix transitions to live on first valid fix
  showPanel('wait');
  drainNative();                 // replay everything collected so far
  if (p.status === 'PAUSED' || p.status === 'FINALIZING') showRecoveredPausedState(p.status);
  _drainTimer = setInterval(drainNative, TICK_MS);
  document.dispatchEvent(new CustomEvent('gps:recovered', {
    detail: { quickActivity: _quickActivity, activityType: _activityType, status: p.status },
  }));
  // Whether a stretch of the run is MISSING is not something to learn from a
  // toast that has already faded by the time the athlete picks the phone up —
  // it is the fact they need when this run disagrees with their watch. The
  // notice explains the session that is on screen, so it does not send a
  // recovered live run back to the start panel.
  showInfoNotice(runRecoveryNotice({ restored: p.restored, status: p.status }));
}

async function resolveNativeRecoveryError() {
  const discard = await confirmModal({
    title: 'Run recovery needs attention',
    message: 'Android found a damaged active-run journal. It will stay protected and no new run will overwrite it unless you explicitly discard it.',
    confirmLabel: 'Discard damaged recovery',
    cancelLabel: 'Keep protected',
    danger: true,
  });
  if (!discard) {
    showToast('Recovery copy kept — restart Helyx when you are ready to decide');
    return;
  }
  if (!nativeDiscardRun()) {
    showToast('Could not discard the damaged recovery copy', true);
    return;
  }
  clearSessionIdentity();
  showPanel('start');
  showToast('Damaged recovery copy discarded');
}

export function onWorkoutTabActivated() {
  if (_liveMap) setTimeout(() => _liveMap.invalidateSize(), 100);
}

/**
 * Begin a run.
 *
 * Returns `{ ok, reason }` rather than a bare boolean: every caller previously
 * ignored the boolean, so a refused start left the athlete on whatever screen
 * had already been opened for it — on Quick Start, a blank one. The reason is
 * what `startBlockedNotice` turns into something readable.
 *
 * @returns {Promise<{ok:boolean, reason:string|null}>}
 */
export async function startTracking(activityType = 'run', quickStart = false, ctx = {}) {
  if (_status !== 'idle') return { ok: false, reason: 'busy' };

  // 'walk' or 'run' — tags the logged activity (Quick Start from Home passes
  // this; the in-program run tracker defaults to 'run').
  _activityType = activityType === 'walk' ? 'walk' : 'run';
  _quickActivity = !!quickStart;
  // Quick Start drives the standalone Activity screen; in-program runs drive
  // the workout cockpit. Pick which element set the live UI updates.
  _scope = quickStart ? 'activity' : 'cockpit';

  _coords      = [];
  _distKm      = 0;
  _pausedMs    = 0;
  _startTime   = null;
  _splits      = [];
  _nextKmMark  = 1;
  _lapStartMs  = 0;
  _lapStartIdx = 0;
  _nativeMode      = false;
  _nativeSeq       = 0;
  _nativeElapsedMs = 0;
  _nativeFinalizing = false;
  _nativeDurabilityWarned = false;
  _qualityState = createGpsQualityState();
  _forceSegmentBreak = false;

  // Preferred path (Android app): the native foreground service keeps GPS
  // alive when the screen locks or the user switches apps. No wake lock
  // needed — the screen is allowed to sleep.
  if (isNativeGpsAvailable()) {
    const granted = await ensureLocationPermission();
    if (!granted) {
      showRunNotice(startBlockedNotice('permission'));
      return { ok: false, reason: 'permission' };
    }
    if (nativeStartRun()) {
      beginSessionIdentity(_activityType, _quickActivity, ctx);
      _nativeMode = true;
      _status     = 'waiting';
      showPanel('wait');
      _drainTimer = setInterval(drainNative, TICK_MS);
      return { ok: true, reason: null };
    }
    // Do not silently fall back: native may be protecting a recovered journal or
    // reporting that durable storage is unavailable.
    showRunNotice(startBlockedNotice('native-busy'));
    return { ok: false, reason: 'native-busy' };
  }

  // Web fallback (browser/PWA): watchPosition + screen wake lock. Honest
  // limitation: tracking stops if the app leaves the foreground — stated on the
  // start panel by `applyBackgroundNotice`, not left to be discovered.
  if (!navigator.geolocation) {
    showRunNotice(startBlockedNotice('unsupported'));
    return { ok: false, reason: 'unsupported' };
  }

  _status = 'waiting';
  beginSessionIdentity(_activityType, _quickActivity, ctx);
  showPanel('wait');

  _wakeLock = await acquireWakeLock();

  _watchId = navigator.geolocation.watchPosition(
    onPosition,
    onPositionError,
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
  );

  return { ok: true, reason: null };
}

// Abort the current activity WITHOUT saving anything (Quick Start "Cancel").
// Tears down timers/watch/wake-lock/native run and resets state. Never touches
// persisted run data — nothing is written until stopTracking().
export function cancelTracking() {
  if (_status === 'idle') return;
  if (_nativeMode && !nativeDiscardRun()) {
    showToast('Could not discard safely — the recovery copy is still protected', true);
    return;
  }
  if (_drainTimer) { clearInterval(_drainTimer); _drainTimer = null; }
  if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  clearInterval(_tickTimer); _tickTimer = null;
  releaseWakeLock();

  _status = 'idle';
  _startTime = null; _pausedMs = 0;
  _coords = []; _distKm = 0;
  _splits = []; _nextKmMark = 1; _lapStartMs = 0; _lapStartIdx = 0;
  _nativeMode = false; _nativeSeq = 0; _nativeElapsedMs = 0;
  _nativeFinalizing = false; _nativeDurabilityWarned = false;
  _qualityState = createGpsQualityState(); _forceSegmentBreak = false;
  clearSessionIdentity();

  destroyLiveMap();
  showPanel('start');
  _activityType = 'run';
  _quickActivity = false;
  _scope = 'cockpit';
}

export function pauseTracking() {
  if (_status !== 'tracking') return;
  if (_nativeMode && !nativePauseRun()) {
    showToast('Could not pause safely — try again', true);
    return;
  }
  _status = 'paused';
  if (!_nativeMode && _startTime) {
    _pausedMs += Date.now() - _startTime;
  }
  _startTime = null;
  _forceSegmentBreak = true;
  clearInterval(_tickTimer);

  const btn = document.getElementById(ui().pauseBtn);
  if (btn) { btn.style.display = ''; btn.textContent = '▶ Resume'; btn.setAttribute('data-action', 'gps-resume'); }
  // The stats tick is stopped while paused, so the signal chip has to be told
  // once — otherwise it sits on the last live grade and then ages into
  // "No signal" for a run that is merely paused.
  tickSignal();
}

export function resumeTracking() {
  if (_status !== 'paused' || _nativeFinalizing) return;
  if (_nativeMode && !nativeResumeRun()) {
    showToast('Run remains paused — Android could not reopen its journal', true);
    return;
  }
  _status    = 'tracking';
  _startTime = Date.now();
  _forceSegmentBreak = true;
  _tickTimer = setInterval(tickStats, TICK_MS);

  const btn = document.getElementById(ui().pauseBtn);
  if (btn) { btn.style.display = ''; btn.textContent = '⏸ Pause'; btn.setAttribute('data-action', 'gps-pause'); }
  tickSignal();
}

export async function stopTracking(week, day) {
  if (!isTracking()) return null;

  if (_nativeMode) {
    drainNative();      // catch any fixes still buffered in the service
    if (!nativeStopRun()) {
      showToast('Could not stop safely — tracking remains protected', true);
      return null;
    }
  }
  if (_drainTimer) { clearInterval(_drainTimer); _drainTimer = null; }
  if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  clearInterval(_tickTimer); _tickTimer = null;
  await releaseWakeLock();

  const finalMs     = elapsedMs();
  const finalDist   = _distKm;
  const finalCoords = [..._coords];
  const finalSplits = [..._splits];
  const finalQuality = summarizeGpsQuality(_qualityState);
  const sessionId = _sessionId || newRunSessionId();
  const sessionStartTs = _sessionStartTs || Math.max(1, Date.now() - finalMs);
  const finalWeek = String(_sessionContext.week || week || '');
  const finalDay = String(_sessionContext.day || day || '');
  const localDate = _sessionContext.localDate || null;
  const wasQuick = _quickActivity;
  const wasNative = _nativeMode;
  const activityType = _activityType;

  _status      = 'idle';
  _startTime   = null;
  _pausedMs    = 0;
  _splits      = [];
  _nextKmMark  = 1;
  _lapStartMs  = 0;
  _lapStartIdx = 0;
  _nativeMode      = false;
  _nativeSeq       = 0;
  _nativeElapsedMs = 0;
  _nativeFinalizing = false;
  _nativeDurabilityWarned = false;
  _qualityState = createGpsQualityState();
  _forceSegmentBreak = false;

  destroyLiveMap();
  showPanel('start');

  const typeLabel = _activityType === 'walk' ? 'Walk' : 'Run';

  // Persist the route under the exact run session. Two runs in the same
  // activation/week/day now receive distinct records instead of slot-upserting.
  let routeId = null;
  let routeSaveFailed = false;
  if (finalCoords.length >= 2 && finalWeek && finalDay) {
    try {
      routeId = await saveMapToDB(finalWeek, finalDay, finalCoords, {
        sessionId,
        activationId: appState.activeActivationId,
        programId: appState.activeProgramId,
        startTs: sessionStartTs,
        localDate,
        quality: finalQuality,
      });
      if (!routeId) routeSaveFailed = true;
    } catch (_) { routeSaveFailed = true; }
  }

  // Persist the factual session immediately for BOTH quick and in-program GPS.
  // The cockpit may enrich this same sessionId with RPE/notes afterwards.
  let stateSaved = false;
  if (finalWeek && finalDay) {
    verifyWeekStorageSchema(finalWeek);
    upsertRunSession(appState.weeks[finalWeek], finalDay, {
      sessionId,
      dist: finalDist,
      time: fmtTime(finalMs),
      type: activityType,
      splits: finalSplits,
      routeId,
      gpsQuality: finalQuality,
    }, {
      sessionId,
      source: 'gps',
      localDate,
      startTs: sessionStartTs,
    });
    if (localDate) {
      if (!appState.weeks[finalWeek].dates) appState.weeks[finalWeek].dates = {};
      appState.weeks[finalWeek].dates[finalDay] = localDate;
    }
    stateSaved = await saveStateToLocalStorage(true);
  } else {
    stateSaved = await saveStateToLocalStorage(true);
  }
  const savedSession = !!(finalWeek && finalDay && stateSaved);
  const nativeJournalCleared = !wasNative ||
    (!routeSaveFailed && savedSession && nativeCompleteRun());
  if (nativeJournalCleared) clearSessionIdentity();
  _activityType = 'run'; // reset for the next session

  // In-program run: auto-fill the cockpit run inputs so the user can review +
  // commit. A Quick Start has no cockpit open, so skip this and persist below.
  if (!wasQuick) {
    const distInput = document.getElementById('runInputDist');
    const timeInput = document.getElementById('runInputTime');
    if (distInput) {
      // finalDist is km; fill the box in the user's configured unit so the
      // cockpit's km<->display conversion round-trips correctly.
      const unit = appState?.settings?.distanceUnit === 'mi' ? 'mi' : 'km';
      const dispDist = unit === 'mi' ? finalDist * 0.621371 : finalDist;
      distInput.value = dispDist.toFixed(2);
      distInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (timeInput) {
      timeInput.value = fmtTime(finalMs);
      timeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  document.dispatchEvent(
    new CustomEvent('gps:route-saved', {
      detail: {
        week: finalWeek, day: finalDay, sessionId, routeId,
        distKm: finalDist, splits: finalSplits, coords: finalCoords,
        gpsQuality: finalQuality,
        quickActivity: wasQuick,
      },
    })
  );

  // What went wrong at save time is a CONDITION the athlete has to act on
  // (free space, restart, this run has no map) — so on the cockpit it becomes a
  // notice that stays put. A Quick Start closes straight into its recap with no
  // run card to hold a notice, so there it remains a toast.
  const saveNotice = runSaveNotice({
    stateSaved: stateSaved && !(wasNative && !savedSession),
    routeSaved: !routeSaveFailed,
    journalCleared: nativeJournalCleared,
    hadRoute: finalCoords.length >= 2 && !!finalWeek && !!finalDay,
    nativeProtected: wasNative,
  });

  // A Home Quick Start is a standalone activity with no cockpit to review, so
  // surface the recap for this exact session immediately.
  if (saveNotice) {
    if (wasQuick) showToast(`${saveNotice.title} — ${saveNotice.body}`, true);
    else showRunNotice(saveNotice);
  } else if (wasQuick && finalWeek && finalDay) {
    showToast(`${typeLabel} saved ✓`);
    try { document.dispatchEvent(new CustomEvent('session:finished', { detail: { week: finalWeek, day: finalDay, sessionId } })); } catch (_) {}
  } else {
    showToast(`${typeLabel} tracked ✓ — add your RPE below`);
  }
  _quickActivity = false;
  _scope = 'cockpit'; // back to the default surface for the next session

  return { sessionId, routeId, distKm: finalDist, timeStr: fmtTime(finalMs), gpsQuality: finalQuality };
}
