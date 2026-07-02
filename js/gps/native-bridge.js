// ==========================================
// NATIVE GPS BRIDGE ADAPTER (js/gps/native-bridge.js)
//
// Thin, testable wrapper around window.HybridGpsBridge (Android WebView only).
// The native side runs a location foreground service that keeps collecting
// GPS fixes while the WebView is frozen (screen locked, app switched); JS
// pulls buffered fixes with getPointsSince(seq) whenever it's awake.
//
// Everything window-touching is lazy so this module imports cleanly in Node.
// ==========================================

function _bridge() {
  if (typeof window === 'undefined') return null;
  const b = window.HybridGpsBridge;
  if (!b || typeof b.startRun !== 'function' || typeof b.getPointsSince !== 'function') return null;
  return b;
}

export function isNativeGpsAvailable() {
  return _bridge() !== null;
}

/**
 * Parse + validate a getPointsSince() payload. Native sends:
 *   { seq, status: "IDLE"|"TRACKING"|"PAUSED", elapsedMs, points: [[lat,lng,acc,t],…] }
 * Returns a normalized { seq, status, elapsedMs, points:[{lat,lng,acc,t}] } —
 * never throws, degrades to an empty payload on garbage so one bad drain can't
 * kill a live run.
 */
export function parseDrainPayload(json, prevSeq = 0) {
  const empty = { seq: prevSeq, status: 'IDLE', elapsedMs: 0, points: [] };
  if (typeof json !== 'string' || !json) return empty;
  let raw;
  try { raw = JSON.parse(json); } catch { return empty; }
  if (!raw || typeof raw !== 'object') return empty;

  const status = (raw.status === 'TRACKING' || raw.status === 'PAUSED') ? raw.status : 'IDLE';
  const seq = Number.isInteger(raw.seq) && raw.seq >= 0 ? raw.seq : prevSeq;
  const elapsedMs = Number.isFinite(raw.elapsedMs) && raw.elapsedMs >= 0 ? raw.elapsedMs : 0;

  const points = [];
  if (Array.isArray(raw.points)) {
    for (const p of raw.points) {
      if (!Array.isArray(p) || p.length < 4) continue;
      const [lat, lng, acc, t] = p;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      points.push({ lat, lng, acc: Number.isFinite(acc) ? acc : 9999, t: Number.isFinite(t) ? t : 0 });
    }
  }
  return { seq, status, elapsedMs, points };
}

/**
 * Resolve true/false once the OS location-permission dialog is answered.
 * Uses the same callback-registry pattern as the Health Connect bridge.
 */
export function ensureLocationPermission() {
  const b = _bridge();
  if (!b) return Promise.resolve(false);
  if (b.hasLocationPermission()) return Promise.resolve(true);
  return new Promise((resolve) => {
    if (!window.__gpsCB) window.__gpsCB = {};
    const id = 'perm_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    // Native never answering (dialog dismissed by process death) must not hang
    // the Start button forever.
    const timer = setTimeout(() => {
      if (window.__gpsCB[id]) { delete window.__gpsCB[id]; resolve(false); }
    }, 120000);
    window.__gpsCB[id] = (result) => {
      clearTimeout(timer);
      resolve(result === 'true');
    };
    try { b.requestLocationPermission(id); }
    catch { clearTimeout(timer); delete window.__gpsCB[id]; resolve(false); }
  });
}

export function nativeStartRun() {
  const b = _bridge();
  if (!b) return false;
  try { return b.startRun() === true; } catch { return false; }
}

export function nativePauseRun()  { try { _bridge()?.pauseRun(); }  catch {} }
export function nativeResumeRun() { try { _bridge()?.resumeRun(); } catch {} }
export function nativeStopRun()   { try { _bridge()?.stopRun(); }   catch {} }

/** Drain fixes with index >= seq. Never throws; empty payload on failure. */
export function nativeDrainSince(seq) {
  const b = _bridge();
  if (!b) return parseDrainPayload(null, seq);
  let json = null;
  try { json = b.getPointsSince(seq); } catch {}
  return parseDrainPayload(json, seq);
}
