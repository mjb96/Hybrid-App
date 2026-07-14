// @ts-check
// =============================================================================
// HEALTH CONNECT BRIDGE (js/health/health-bridge.js)
//
// Talks to the native Android JavascriptInterface `window.HybridHealthBridge`
// (see android/.../HybridHealthBridge.kt) using its callback-id protocol:
//
//   bridge.requestPermissions(fieldsJson, callbackId)
//   bridge.readHealthDataByDay(startIso, endIso, fieldsJson, callbackId)
//      → native later calls window.__hcCB[callbackId](jsonString) once, then
//        deletes the key. We register the callback BEFORE each call.
//
// The `fieldsJson` argument is a JSON array of SUPPORTED FIELD IDS from the
// shared contract in ./health-fields.js. It is the user's actual selection —
// the native side requests permissions and reads records for exactly those
// fields and no others. This module is the *only* place that knows the native
// contract. On the PWA / in a browser the bridge is absent and every entry
// point degrades gracefully (isHealthBridgeAvailable() === false) instead of
// faking a connected state.
//
// applyHealthDays() — the per-day → appState.healthConnect mapper — is pure and
// exported for unit testing without a device.
// =============================================================================

import {
  HEALTH_FIELD_IDS,
  fieldById,
  isSupportedField,
  selectedFieldIds,
} from './health-fields.js';

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

/** Keep only supported field ids; used to guard every native call. */
function sanitizeFields(fields) {
  const list = Array.isArray(fields) ? fields : HEALTH_FIELD_IDS;
  return list.filter(isSupportedField);
}

/**
 * Opens the Health Connect permission sheet for EXACTLY the given supported
 * fields. Resolves { granted:[fieldId], denied:[fieldId] }. Never requests a
 * field outside the supplied selection.
 */
export function requestHealthPermissions(fields = HEALTH_FIELD_IDS.slice()) {
  const ids = sanitizeFields(fields);
  return callBridge('requestPermissions', (b, id) => b.requestPermissions(JSON.stringify(ids), id));
}

/**
 * Reads per-calendar-day health buckets for [startIso, endIso) for EXACTLY the
 * given supported fields. Resolves { granted:[fieldId], days:[], errors:[fieldId] }.
 * `granted` reflects the permissions currently held (so a revocation shows up as
 * a shrinking list); `errors` lists selected fields whose read threw.
 */
export function readHealthDataByDay(startIso, endIso, fields = HEALTH_FIELD_IDS.slice()) {
  const ids = sanitizeFields(fields);
  return callBridge('readHealthDataByDay', (b, id) => b.readHealthDataByDay(startIso, endIso, JSON.stringify(ids), id));
}

// ── mapping (pure) ──────────────────────────────────────────────────────────

function upsertByDate(arr, date, fields) {
  const i = arr.findIndex(e => e && e.date === date);
  if (i >= 0) arr[i] = { ...arr[i], ...fields };
  else arr.push({ date, ...fields });
}

/**
 * Per-field extractor: a native per-day bucket → the stored series record, or
 * null when that field carries no value for the day. Shapes match every reader:
 *   steps:     { value, count }
 *   restingHR: { bpm,   value }
 *   hrv:       { rmssd, value }
 *   sleep:     { hours }
 * @type {Record<string, (bucket:any) => any|null>}
 */
const FIELD_EXTRACTORS = {
  steps: (d) => (d.steps != null ? { value: d.steps, count: d.steps } : null),
  restingHR: (d) => (d.restingHeartRate != null ? { bpm: d.restingHeartRate, value: d.restingHeartRate } : null),
  hrv: (d) => (d.hrvRmssd != null ? { rmssd: d.hrvRmssd, value: d.hrvRmssd } : null),
  sleep: (d) => {
    if (!Array.isArray(d.sleepSessions) || !d.sleepSessions.length) return null;
    const ms = d.sleepSessions.reduce((s, ss) => s + (ss && ss.durationMs ? ss.durationMs : 0), 0);
    return ms > 0 ? { hours: Math.round((ms / 3600000) * 10) / 10 } : null;
  },
};

/**
 * Merge native per-day buckets into state.healthConnect.{hrv,restingHR,sleep,steps},
 * but ONLY for the `fields` the user selected — an unselected field is never
 * written even if the native payload happens to carry it.
 * Idempotent: re-syncing the same days updates in place.
 * @param {any} state
 * @param {Array<any>} buckets
 * @param {string[]} [fields] selected supported field ids (defaults to all supported)
 * @returns {{ applied: number, perField: Record<string, { days:number, lastDate:string|null }> }}
 */
export function applyHealthDays(state, buckets, fields = HEALTH_FIELD_IDS.slice()) {
  const hc = state.healthConnect || (state.healthConnect = {});
  const selected = sanitizeFields(fields);

  for (const id of selected) {
    const sk = fieldById(id).seriesKey;
    if (!Array.isArray(hc[sk])) hc[sk] = [];
  }

  /** @type {Record<string, { days:number, lastDate:string|null }>} */
  const perField = {};
  for (const id of selected) perField[id] = { days: 0, lastDate: null };

  let applied = 0;
  for (const d of (buckets || [])) {
    const date = d && d.date;
    if (!date) continue;
    let touched = false;
    for (const id of selected) {
      const rec = FIELD_EXTRACTORS[id](d);
      if (rec) {
        upsertByDate(hc[fieldById(id).seriesKey], date, rec);
        perField[id].days++;
        if (!perField[id].lastDate || date > perField[id].lastDate) perField[id].lastDate = date;
        touched = true;
      }
    }
    if (touched) applied++;
  }

  for (const id of selected) {
    const sk = fieldById(id).seriesKey;
    hc[sk].sort((a, b) => a.date.localeCompare(b.date));
    if (hc[sk].length > MAX_HISTORY_DAYS) hc[sk] = hc[sk].slice(-MAX_HISTORY_DAYS);
  }
  return { applied, perField };
}

// ── per-field sync status ────────────────────────────────────────────────────

/**
 * Record honest per-field status into state.healthConnect.fieldStatus so
 * Settings can show the real outcome of the last permission/read for each field.
 * @param {any} hc state.healthConnect
 * @param {{ selected:string[], granted:string[], errors:string[], perField?:Record<string,{days:number,lastDate:string|null}> }} res
 */
export function updateFieldStatus(hc, { selected, granted, errors, perField }) {
  if (!hc.fieldStatus || typeof hc.fieldStatus !== 'object') hc.fieldStatus = {};
  const now = Date.now();
  const sel = new Set(selected || []);
  const grant = new Set(granted || []);
  const err = new Set(errors || []);
  for (const id of HEALTH_FIELD_IDS) {
    const prev = hc.fieldStatus[id] || {};
    if (!sel.has(id)) {
      hc.fieldStatus[id] = { selected: false, permission: 'unknown', error: false, days: 0, lastDate: prev.lastDate || null, updatedAt: now };
      continue;
    }
    const pf = (perField && perField[id]) || null;
    hc.fieldStatus[id] = {
      selected: true,
      permission: grant.has(id) ? 'granted' : 'denied',
      error: err.has(id),
      days: pf ? pf.days : (prev.days || 0),
      lastDate: pf && pf.lastDate ? pf.lastDate : (prev.lastDate || null),
      updatedAt: now,
    };
  }
  return hc.fieldStatus;
}

/**
 * Human-readable description of a per-field status entry (for Settings).
 * @param {any} status one entry from state.healthConnect.fieldStatus
 * @returns {{ text:string, tone:'ok'|'warn'|'muted' }}
 */
export function describeFieldStatus(status) {
  if (!status || status.selected === false) return { text: 'Off', tone: 'muted' };
  if (status.permission === 'denied') return { text: 'Permission needed', tone: 'warn' };
  if (status.error) return { text: 'Read error', tone: 'warn' };
  if (status.days > 0) return { text: `Synced · ${status.days} day${status.days === 1 ? '' : 's'}`, tone: 'ok' };
  return { text: 'No data yet', tone: 'muted' };
}

// ── high-level sync ─────────────────────────────────────────────────────────

/** Resolve the selected field ids: explicit arg wins, else state.syncFields. */
function resolveSelected(hc, fields) {
  const list = Array.isArray(fields) ? sanitizeFields(fields) : selectedFieldIds(hc && hc.syncFields);
  return list;
}

/**
 * Pull the last `days` of Health Connect data for the SELECTED fields through
 * the bridge and merge it into state. Marks connected/lastSync ONLY on a real
 * successful read, and records honest per-field status (granted/denied/error/
 * no-data). Never reads a field the user did not select.
 * @param {any} state
 * @param {(suppressToast?: boolean) => any} [save]
 * @param {{ days?: number, fields?: string[] }} [opts]
 * @returns {Promise<{ dayCount: number, fieldsWithData: number, granted: string[], errors: string[] }>}
 */
export async function syncHealthConnect(state, save, { days = 90, fields } = {}) {
  if (!isHealthBridgeAvailable()) throw new Error('bridge-unavailable');
  const hc = state.healthConnect || (state.healthConnect = {});
  const selected = resolveSelected(hc, fields);
  if (!selected.length) throw new Error('no-fields-selected');

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const result = (await readHealthDataByDay(start.toISOString(), end.toISOString(), selected)) || {};
  const buckets = Array.isArray(result.days) ? result.days : [];
  // Older/degraded native returns only { days }; assume selected were granted then.
  const granted = Array.isArray(result.granted) ? sanitizeFields(result.granted) : selected.slice();
  const errors = Array.isArray(result.errors) ? sanitizeFields(result.errors) : [];

  const { perField } = applyHealthDays(state, buckets, selected);
  updateFieldStatus(hc, { selected, granted, errors, perField });

  // Revocation honesty: if every selected field lost its permission, we are no
  // longer connected — do NOT claim a fresh sync while all fields read "Permission
  // needed". Preserve already-stored history; surface the revocation to the caller.
  if (!granted.length) {
    hc.connected = false;
    if (typeof save === 'function') await save(true);
    throw new Error('permissions-revoked');
  }

  hc.connected = true;
  hc.lastSync = Date.now();
  if (typeof save === 'function') await save(true);

  const fieldsWithData = selected.filter(id => perField[id] && perField[id].days > 0).length;
  return { dayCount: buckets.length, fieldsWithData, granted, errors };
}

/**
 * Request permission for the SELECTED fields, then sync. Resolves the sync
 * summary. Throws 'permissions-denied' (without claiming connected) when the
 * user grants nothing, and 'no-fields-selected' when the selection is empty.
 * @param {any} state
 * @param {(suppressToast?: boolean) => any} [save]
 * @param {{ days?: number, fields?: string[] }} [opts]
 */
export async function connectAndSync(state, save, { days = 90, fields } = {}) {
  if (!isHealthBridgeAvailable()) throw new Error('bridge-unavailable');
  const hc = state.healthConnect || (state.healthConnect = {});
  const selected = resolveSelected(hc, fields);
  if (!selected.length) throw new Error('no-fields-selected');

  const perm = (await requestHealthPermissions(selected)) || {};
  const granted = Array.isArray(perm.granted) ? sanitizeFields(perm.granted) : [];

  // Record the permission outcome honestly even if nothing was granted.
  updateFieldStatus(hc, { selected, granted, errors: [], perField: {} });

  if (!granted.length) {
    if (typeof save === 'function') await save(true);
    throw new Error('permissions-denied');
  }
  // Read only what the user selected; native filters to what is actually granted.
  return syncHealthConnect(state, save, { days, fields: selected });
}
