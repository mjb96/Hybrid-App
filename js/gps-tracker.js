// ==========================================
// HYBRID ENGINE — GPS RUN TRACKER (js/gps-tracker.js)
//
// State machine: idle → waiting → tracking → paused → idle
//
// Public API:
//   initGpsTracker()         — call once on app start
//   onWorkoutTabActivated()  — call when workout tab becomes visible
//   startTracking()          — Promise<boolean>
//   pauseTracking()
//   resumeTracking()
//   stopTracking(week, day)  — Promise<{ distKm, timeStr } | null>
//   isTracking()             — boolean
//
// Dispatches: CustomEvent 'gps:route-saved' { detail: { week, day, distKm } }
// ==========================================
import { saveMapToDB } from './db.js';
import { showToast, appState, saveStateToLocalStorage } from './state.js';
import { ensureLeaflet } from './ui/leaflet-loader.js';
import {
  isNativeGpsAvailable, ensureLocationPermission,
  nativeStartRun, nativePauseRun, nativeResumeRun, nativeStopRun, nativeDrainSince,
} from './gps/native-bridge.js';

// ── Tuning constants ──────────────────────────────────────────────────────
const MAX_ACCURACY_M   = 50;   // discard readings worse than 50 m accuracy
const MIN_POINT_DIST_M = 5;    // skip points within 5 m of the last (GPS jitter)
const TICK_MS          = 1000; // stats update interval

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

// ── Math helpers ──────────────────────────────────────────────────────────

function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function elapsedMs() {
  if (_nativeMode) return _nativeElapsedMs; // refreshed on every drain tick
  if (!_startTime) return _pausedMs;
  return _pausedMs + (Date.now() - _startTime);
}

function fmtTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h  = Math.floor(totalSec / 3600);
  const m  = Math.floor((totalSec % 3600) / 60);
  const s  = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtPace(distKm, ms) {
  if (distKm < 0.05) return '—:——';
  const sPerKm = ms / 1000 / distKm;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  const el = document.getElementById('gpsLiveMap');
  if (!el) return;
  try { await ensureLeaflet(); } catch { return; }
  if (typeof L === 'undefined') return;
  if (_liveMap) { _liveMap.remove(); }
  _liveMap    = L.map('gpsLiveMap', { zoomControl: true, dragging: true, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: true });
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
  const ms = elapsedMs();
  const timeEl = document.getElementById('gpsStatTime');
  const distEl = document.getElementById('gpsStatDist');
  const paceEl = document.getElementById('gpsStatPace');
  if (timeEl) timeEl.textContent = fmtTime(ms);
  if (distEl) distEl.textContent = _distKm.toFixed(2);
  if (paceEl) paceEl.textContent = fmtPace(_distKm, ms);
}

// ── Panel visibility ──────────────────────────────────────────────────────

function showPanel(which) {
  const start = document.getElementById('gpsStartPanel');
  const wait  = document.getElementById('gpsWaitPanel');
  const live  = document.getElementById('gpsLivePanel');
  if (start) start.style.display = which === 'start' ? 'flex' : 'none';
  if (wait)  wait.style.display  = which === 'wait'  ? 'flex' : 'none';
  if (live)  live.style.display  = which === 'live'  ? 'block' : 'none';
}

// ── Geolocation callbacks ─────────────────────────────────────────────────

function onPosition(pos) {
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  ingestFix(lat, lng, accuracy);
}

// Shared fix pipeline for both sources (web watchPosition + native drain):
// accuracy filter, waiting→tracking transition, distance/split accumulation.
function ingestFix(lat, lng, accuracy) {
  if (accuracy > MAX_ACCURACY_M) return;

  // Transition from waiting on first valid fix
  if (_status === 'waiting') {
    _status    = 'tracking';
    _startTime = Date.now();
    showPanel('live');
    buildLiveMap();
    _tickTimer = setInterval(tickStats, TICK_MS);
  }

  if (_status !== 'tracking') return;

  const point = [lat, lng];
  if (_coords.length > 0) {
    const segM = haversineKm(_coords[_coords.length - 1], point) * 1000;
    if (segM < MIN_POINT_DIST_M) return;
    _distKm += segM / 1000;

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
  pushToLiveMap(lat, lng);
  tickStats();
}

// Pull buffered fixes from the native service and feed them through the shared
// pipeline. Runs every TICK_MS while awake and immediately on wake-up; a long
// frozen stretch (screen locked for 30 min) is replayed in one call.
function drainNative() {
  if (!_nativeMode) return;
  const payload = nativeDrainSince(_nativeSeq);
  _nativeSeq       = payload.seq;
  _nativeElapsedMs = payload.elapsedMs;
  for (const p of payload.points) ingestFix(p.lat, p.lng, p.acc);
  if (_status === 'tracking') tickStats();
}

document.addEventListener('visibilitychange', () => {
  // Waking from a frozen WebView: catch up on everything native collected.
  if (_nativeMode && document.visibilityState === 'visible') drainNative();
});

function onPositionError(err) {
  if (_status !== 'waiting' && _status !== 'tracking') return;
  const msg = err.code === 1 ? 'location permission denied' : err.message;
  console.warn('GPS error:', msg);
  if (_status === 'waiting') {
    _status = 'idle';
    showPanel('start');
    showToast('GPS unavailable — ' + msg);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export function isTracking() {
  return _status === 'tracking' || _status === 'paused';
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
  if (p.status !== 'TRACKING' && p.status !== 'PAUSED') return;

  _nativeMode      = true;
  _nativeSeq       = 0;
  _nativeElapsedMs = p.elapsedMs;
  _coords = []; _distKm = 0; _splits = [];
  _nextKmMark = 1; _lapStartMs = 0; _lapStartIdx = 0;
  _status = 'waiting';           // ingestFix transitions to live on first valid fix
  showPanel('wait');
  drainNative();                 // replay everything collected so far
  _drainTimer = setInterval(drainNative, TICK_MS);
  if (p.status === 'PAUSED' && _status === 'tracking') pauseTracking();
  showToast('Run restored — GPS kept tracking ✓');
}

export function onWorkoutTabActivated() {
  if (_liveMap) setTimeout(() => _liveMap.invalidateSize(), 100);
}

export async function startTracking(activityType = 'run') {
  if (_status !== 'idle') return false;

  // 'walk' or 'run' — tags the logged activity (Quick Start from Home passes
  // this; the in-program run tracker defaults to 'run').
  _activityType = activityType === 'walk' ? 'walk' : 'run';

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

  // Preferred path (Android app): the native foreground service keeps GPS
  // alive when the screen locks or the user switches apps. No wake lock
  // needed — the screen is allowed to sleep.
  if (isNativeGpsAvailable()) {
    const granted = await ensureLocationPermission();
    if (!granted) {
      showToast('Location permission is needed to track runs');
      return false;
    }
    if (nativeStartRun()) {
      _nativeMode = true;
      _status     = 'waiting';
      showPanel('wait');
      _drainTimer = setInterval(drainNative, TICK_MS);
      return true;
    }
    // Native start failed unexpectedly — fall back to web tracking below.
  }

  // Web fallback (browser/PWA): watchPosition + screen wake lock. Honest
  // limitation: tracking stops if the app leaves the foreground.
  if (!navigator.geolocation) {
    showToast('GPS not supported on this device');
    return false;
  }

  _status = 'waiting';
  showPanel('wait');

  _wakeLock = await acquireWakeLock();

  _watchId = navigator.geolocation.watchPosition(
    onPosition,
    onPositionError,
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
  );

  return true;
}

export function pauseTracking() {
  if (_status !== 'tracking') return;
  _status = 'paused';
  if (_nativeMode) {
    nativePauseRun();               // service stops GPS while paused (battery)
  } else if (_startTime) {
    _pausedMs += Date.now() - _startTime;
  }
  _startTime = null;
  clearInterval(_tickTimer);

  const btn = document.getElementById('gpsPauseBtn');
  if (btn) { btn.textContent = '▶ Resume'; btn.setAttribute('data-action', 'gps-resume'); }
}

export function resumeTracking() {
  if (_status !== 'paused') return;
  _status    = 'tracking';
  if (_nativeMode) nativeResumeRun();
  _startTime = Date.now();
  _tickTimer = setInterval(tickStats, TICK_MS);

  const btn = document.getElementById('gpsPauseBtn');
  if (btn) { btn.textContent = '⏸ Pause'; btn.setAttribute('data-action', 'gps-pause'); }
}

export async function stopTracking(week, day) {
  if (!isTracking()) return null;

  if (_nativeMode) {
    drainNative();      // catch any fixes still buffered in the service
    nativeStopRun();    // dismisses the persistent notification
  }
  if (_drainTimer) { clearInterval(_drainTimer); _drainTimer = null; }
  if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  clearInterval(_tickTimer); _tickTimer = null;
  await releaseWakeLock();

  const finalMs     = elapsedMs();
  const finalDist   = _distKm;
  const finalCoords = [..._coords];
  const finalSplits = [..._splits];

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

  destroyLiveMap();
  showPanel('start');

  const typeLabel = _activityType === 'walk' ? 'Walk' : 'Run';

  // Persist route
  if (finalCoords.length >= 2 && week && day) {
    try { await saveMapToDB(week, day, finalCoords); } catch (_) {}
  }

  // Tag the day's activity (walk vs run) and persist immediately, so a Quick
  // Start walk is saved even if the user never opens the cockpit to commit.
  // The cockpit commit merges ...existing, so this tag survives a later edit.
  if (week && day) {
    if (!appState.weeks[week]) appState.weeks[week] = {};
    if (!appState.weeks[week].runs) appState.weeks[week].runs = {};
    const existingRun = appState.weeks[week].runs[day] || {};
    appState.weeks[week].runs[day] = { ...existingRun, type: _activityType };
    saveStateToLocalStorage(true);
  }
  _activityType = 'run'; // reset for the next session

  // Auto-fill cockpit run inputs and derive pace
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

  document.dispatchEvent(
    new CustomEvent('gps:route-saved', {
      detail: { week, day, distKm: finalDist, splits: finalSplits, coords: finalCoords },
    })
  );

  showToast(`${typeLabel} tracked ✓ — add your RPE below`);
  return { distKm: finalDist, timeStr: fmtTime(finalMs) };
}
