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
import { showToast }   from './state.js';

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
let _liveMap   = null;   // Leaflet instance for the live tracking map
let _liveLine  = null;   // Leaflet Polyline
let _liveMarker = null;  // Leaflet CircleMarker (current position dot)

// Km split tracking
let _splits      = [];  // [{ lap, dist, time, avgHR, coordsStartIdx, coordsEndIdx }]
let _nextKmMark  = 1;   // next km boundary to detect
let _lapStartMs  = 0;   // elapsedMs() at the start of the current lap
let _lapStartIdx = 0;   // index into _coords at the start of the current lap

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

function buildLiveMap() {
  const el = document.getElementById('gpsLiveMap');
  if (!el || typeof L === 'undefined') return;
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
}

export function onWorkoutTabActivated() {
  if (_liveMap) setTimeout(() => _liveMap.invalidateSize(), 100);
}

export async function startTracking() {
  if (_status !== 'idle') return false;
  if (!navigator.geolocation) {
    showToast('GPS not supported on this device');
    return false;
  }

  _status      = 'waiting';
  _coords      = [];
  _distKm      = 0;
  _pausedMs    = 0;
  _startTime   = null;
  _splits      = [];
  _nextKmMark  = 1;
  _lapStartMs  = 0;
  _lapStartIdx = 0;
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
  _status    = 'paused';
  _pausedMs += Date.now() - _startTime;
  _startTime = null;
  clearInterval(_tickTimer);

  const btn = document.getElementById('gpsPauseBtn');
  if (btn) { btn.textContent = '▶ Resume'; btn.setAttribute('data-action', 'gps-resume'); }
}

export function resumeTracking() {
  if (_status !== 'paused') return;
  _status    = 'tracking';
  _startTime = Date.now();
  _tickTimer = setInterval(tickStats, TICK_MS);

  const btn = document.getElementById('gpsPauseBtn');
  if (btn) { btn.textContent = '⏸ Pause'; btn.setAttribute('data-action', 'gps-pause'); }
}

export async function stopTracking(week, day) {
  if (!isTracking()) return null;

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

  destroyLiveMap();
  showPanel('start');

  // Persist route
  if (finalCoords.length >= 2 && week && day) {
    try { await saveMapToDB(week, day, finalCoords); } catch (_) {}
  }

  // Auto-fill cockpit run inputs and derive pace
  const distInput = document.getElementById('runInputDist');
  const timeInput = document.getElementById('runInputTime');
  if (distInput) {
    distInput.value = finalDist.toFixed(2);
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

  showToast('Run tracked ✓ — add your RPE below');
  return { distKm: finalDist, timeStr: fmtTime(finalMs) };
}
