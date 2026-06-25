// @ts-check
// =============================================================================
// HEALTH CONNECT BRIDGE (js/health/health-bridge.js)
//
// Talks to the native Android JavascriptInterface `window.HybridHealthBridge`
// (see android/.../HybridHealthBridge.kt) using its callback-id protocol:
//
//   bridge.requestPermissions(typesJson, callbackId)
//   bridge.readHealthDataByDay(startIso, endIso, callbackId)
//      → native later calls window.__hcCB[callbackId](jsonString) once, then
//        deletes the key. We register the callback BEFORE each call.
//
// This module is the *only* place that knows the native contract. On the PWA /
// in a browser the bridge is absent and every entry point degrades gracefully
// (isHealthBridgeAvailable() === false) instead of faking a connected state.
//
// applyHealthDays() — the per-day → appState.healthConnect mapper — is pure and
// exported for unit testing without a device.
// =============================================================================

const PERM_TYPES = [
  'Steps', 'ActiveCaloriesBurned', 'SleepSession', 'HeartRate',
  'RestingHeartRate', 'HeartRateVariabilityRmssd', 'Weight',
  'ExerciseSession', 'HealthDataHistory',
];

const MAX_HISTORY_DAYS = 120; // cap each stored series so the state blob stays small

function bridge() {
  return (typeof window !== 'undefined') ? window.HybridHealthBridge : undefined;
}

/** True only when the real native interface is present. */
export function isHealthBridgeAvailable() {
  const b = bridge();
  return !!(b && typeof b.getAvailabilityStatus === 'function');
}

/** 'AVAILABLE' | 'NOT_INSTALLED' | 'NOT_SUPPORTED' (NOT_SUPPORTED when no bridge). */
export function getHealthAvailability() {
  const b = bridge();
  if (!b || typeof b.getAvailabilityStatus !== 'function') return 'NOT_SUPPORTED';
  try { return b.getAvailabilityStatus(); } catch { return 'NOT_SUPPORTED'; }
}

// ── callback-id protocol ────────────────────────────────────────────────────

if (typeof window !== 'undefined' && !window.__hcCB) window.__hcCB = {};
let _cbSeq = 0;

function callBridge(method, invoke, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const b = bridge();
    if (!b || typeof b[method] !== 'function') { reject(new Error('bridge-unavailable')); return; }
    const id = `cb_${++_cbSeq}_${Date.now()}`;
    const timer = setTimeout(() => { delete window.__hcCB[id]; reject(new Error('bridge-timeout')); }, timeoutMs);
    window.__hcCB[id] = (jsonStr) => {
      clearTimeout(timer);
      delete window.__hcCB[id];
      try { resolve(jsonStr ? JSON.parse(jsonStr) : null); }
      catch { resolve(null); } // tolerate a non-JSON payload rather than hang
    };
    try { invoke(b, id); }
    catch (e) { clearTimeout(timer); delete window.__hcCB[id]; reject(e); }
  });
}

/** Opens the Health Connect permission sheet. Resolves { granted:[], denied:[] }. */
export function requestHealthPermissions(types = PERM_TYPES) {
  return callBridge('requestPermissions', (b, id) => b.requestPermissions(JSON.stringify(types), id));
}

/** Reads per-calendar-day health buckets for [startIso, endIso). Resolves { days:[] }. */
export function readHealthDataByDay(startIso, endIso) {
  return callBridge('readHealthDataByDay', (b, id) => b.readHealthDataByDay(startIso, endIso, id));
}

// ── mapping (pure) ──────────────────────────────────────────────────────────

function upsertByDate(arr, date, fields) {
  const i = arr.findIndex(e => e && e.date === date);
  if (i >= 0) arr[i] = { ...arr[i], ...fields };
  else arr.push({ date, ...fields });
}

/**
 * Merge native per-day buckets into state.healthConnect.{hrv,restingHR,sleep,steps}.
 * Shapes match every reader in the app:
 *   hrv:       { date, rmssd, value }   (dashboard reads .rmssd, profile reads .value)
 *   restingHR: { date, bpm,   value }   (dashboard reads .bpm,   profile reads .value)
 *   sleep:     { date, hours }
 *   steps:     { date, value, count }
 * Idempotent: re-syncing the same days updates in place. Returns the count of
 * days that contributed at least one metric.
 * @param {any} state
 * @param {Array<any>} buckets
 */
export function applyHealthDays(state, buckets) {
  const hc = state.healthConnect || (state.healthConnect = {});
  for (const k of ['hrv', 'restingHR', 'sleep', 'steps']) {
    if (!Array.isArray(hc[k])) hc[k] = [];
  }

  let applied = 0;
  for (const d of (buckets || [])) {
    const date = d && d.date;
    if (!date) continue;
    let touched = false;

    if (d.hrvRmssd != null) { upsertByDate(hc.hrv, date, { rmssd: d.hrvRmssd, value: d.hrvRmssd }); touched = true; }
    if (d.restingHeartRate != null) { upsertByDate(hc.restingHR, date, { bpm: d.restingHeartRate, value: d.restingHeartRate }); touched = true; }
    if (Array.isArray(d.sleepSessions) && d.sleepSessions.length) {
      const ms = d.sleepSessions.reduce((s, ss) => s + (ss && ss.durationMs ? ss.durationMs : 0), 0);
      if (ms > 0) { upsertByDate(hc.sleep, date, { hours: Math.round((ms / 3600000) * 10) / 10 }); touched = true; }
    }
    if (d.steps != null) { upsertByDate(hc.steps, date, { value: d.steps, count: d.steps }); touched = true; }

    if (touched) applied++;
  }

  for (const k of ['hrv', 'restingHR', 'sleep', 'steps']) {
    hc[k].sort((a, b) => a.date.localeCompare(b.date));
    if (hc[k].length > MAX_HISTORY_DAYS) hc[k] = hc[k].slice(-MAX_HISTORY_DAYS);
  }
  return applied;
}

// ── high-level sync ─────────────────────────────────────────────────────────

/**
 * Pull the last `days` of Health Connect data through the bridge and merge it
 * into state. Marks connected/lastSync ONLY on a real successful read.
 * @param {any} state
 * @param {(suppressToast?: boolean) => any} [save]
 * @param {{ days?: number }} [opts]
 * @returns {Promise<{ dayCount: number }>}
 */
export async function syncHealthConnect(state, save, { days = 90 } = {}) {
  if (!isHealthBridgeAvailable()) throw new Error('bridge-unavailable');
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const result = await readHealthDataByDay(start.toISOString(), end.toISOString());
  const buckets = (result && result.days) || [];
  applyHealthDays(state, buckets);
  if (!state.healthConnect) state.healthConnect = {};
  state.healthConnect.connected = true;
  state.healthConnect.lastSync = Date.now();
  if (typeof save === 'function') await save(true);
  return { dayCount: buckets.length };
}

/** Request permission then immediately sync. Resolves the sync summary. */
export async function connectAndSync(state, save, { days = 90 } = {}) {
  if (!isHealthBridgeAvailable()) throw new Error('bridge-unavailable');
  await requestHealthPermissions();           // user grants in the native sheet
  return syncHealthConnect(state, save, { days });
}
