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
import { makeBridgeCallbackId } from '../util/bridge-callback-id.js';

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
 *   { seq, status: "IDLE"|"TRACKING"|"PAUSED"|"FINALIZING"|"RECOVERY_ERROR",
 *     elapsedMs, durable, restored, points: [[lat,lng,acc,t],…] }
 * Returns a normalized { seq, status, elapsedMs, durable, restored, points } —
 * never throws, degrades to an empty payload on garbage so one bad drain can't
 * kill a live run.
 */
export function parseDrainPayload(json, prevSeq = 0) {
  const empty = { seq: prevSeq, status: 'IDLE', elapsedMs: 0, durable: false, restored: false, points: [] };
  if (typeof json !== 'string' || !json) return empty;
  let raw;
  try { raw = JSON.parse(json); } catch { return empty; }
  if (!raw || typeof raw !== 'object') return empty;

  const status = (raw.status === 'TRACKING' || raw.status === 'PAUSED' ||
    raw.status === 'FINALIZING' || raw.status === 'RECOVERY_ERROR')
    ? raw.status : 'IDLE';
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
  return { seq, status, elapsedMs, durable: raw.durable === true, restored: raw.restored === true, points };
}

/**
 * Translate a normalized drain payload into tracker actions. An empty/garbled
 * bridge response normalizes to IDLE, so durability is meaningful only while
 * native reports an active session.
 */
export function nativeDrainDisposition(payload) {
  const status = payload?.status || 'IDLE';
  const active = status === 'TRACKING' || status === 'PAUSED' || status === 'FINALIZING';
  return {
    recoveryError: status === 'RECOVERY_ERROR',
    shouldPause: status === 'PAUSED' || status === 'FINALIZING',
    durabilityFailed: active && payload?.durable !== true,
  };
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
    const id = makeBridgeCallbackId('perm');
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

export function nativePauseRun()  { try { return _bridge()?.pauseRun() === true; } catch { return false; } }
export function nativeResumeRun() { try { return _bridge()?.resumeRun() === true; } catch { return false; } }
export function nativeStopRun()   { try { return _bridge()?.stopRun() === true; } catch { return false; } }
export function nativeCompleteRun() { try { return _bridge()?.completeRun() === true; } catch { return false; } }
export function nativeDiscardRun()  { try { return _bridge()?.discardRun() === true; } catch { return false; } }

/** Drain fixes with index >= seq. Never throws; empty payload on failure. */
export function nativeDrainSince(seq) {
  const b = _bridge();
  if (!b) return parseDrainPayload(null, seq);
  let json = null;
  try { json = b.getPointsSince(seq); } catch {}
  return parseDrainPayload(json, seq);
}
