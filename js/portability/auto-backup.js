// @ts-check
// =============================================================================
// AUTOMATIC OFFLINE JSON BACKUPS (ANDROID)
//
// The native host owns the user-selected Storage Access Framework folder and
// bounded file rotation. JavaScript owns the portable export envelope so manual
// and automatic JSON backups contain the same state + GPS route records.
// =============================================================================

import { getAllRouteRecords } from '../db.js';
import { todayKey } from '../dates.js';
import { APP_VERSION } from '../constants.js';
import { wrapExport } from '../state/route-portability.js';
import { weekStartOf } from '../analytics/weekly-aggregate.js';
import { isRecoveryGatePending } from '../state/recovery-gate.js';

let callbackSeq = 0;
let _getState = null;
let _backupInFlight = null;
let _initialized = false;

function runtimeDefaults() {
  return {
    window: typeof window !== 'undefined' ? window : undefined,
    document: typeof document !== 'undefined' ? document : undefined,
    setTimeout: typeof setTimeout === 'function' ? setTimeout : undefined,
    clearTimeout: typeof clearTimeout === 'function' ? clearTimeout : undefined,
  };
}

function unavailableStatus() {
  return { status: 'unavailable', available: false, configured: false };
}

/**
 * WebKit's host timers are Web IDL methods: calling a stored `window.setTimeout`
 * with the runtime wrapper as `this` throws `TypeError: Illegal invocation`.
 * Keep the injectable test seam, but always invoke browser timers with their
 * real Window receiver.
 * @param {any} runtime
 * @param {Function} callback
 * @param {number} delay
 */
function scheduleTimeout(runtime, callback, delay) {
  const timer = runtime.setTimeout;
  if (typeof timer !== 'function') return undefined;
  return Reflect.apply(timer, runtime.window || globalThis, [callback, delay]);
}

/** @param {any} runtime @param {any} timerId */
function cancelTimeout(runtime, timerId) {
  const clear = runtime.clearTimeout;
  if (typeof clear === 'function' && timerId !== undefined) {
    Reflect.apply(clear, runtime.window || globalThis, [timerId]);
  }
}

/** @param {string} method @param {any[]} args @param {any} runtime @param {number} [timeoutMs] */
function nativeCall(method, args, runtime, timeoutMs = 120000) {
  const win = runtime.window;
  const bridge = win?.HybridAutoBackupBridge;
  if (!bridge || typeof bridge[method] !== 'function') return Promise.resolve(unavailableStatus());
  if (!win.__autoBackupCB) win.__autoBackupCB = {};
  const callbackId = `backup_${++callbackSeq}_${Date.now()}`;
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      cancelTimeout(runtime, timer);
      delete win.__autoBackupCB[callbackId];
      resolve(result && typeof result === 'object' ? result : { status: 'error', message: 'Android returned an invalid backup result.' });
    };
    const timer = scheduleTimeout(runtime, () => finish({ status: 'error', message: 'Automatic backup timed out.' }), timeoutMs);
    win.__autoBackupCB[callbackId] = (json) => {
      try { finish(JSON.parse(json || '{}')); }
      catch { finish({ status: 'error', message: 'Android returned an invalid backup result.' }); }
    };
    try { bridge[method](...args, callbackId); }
    catch (error) { finish({ status: 'error', message: error instanceof Error ? error.message : 'Automatic backup failed.' }); }
  });
}

/** @param {Partial<ReturnType<typeof runtimeDefaults>>} [providedRuntime] */
export function automaticBackupSupported(providedRuntime = {}) {
  const runtime = { ...runtimeDefaults(), ...providedRuntime };
  return !!runtime.window?.HybridAutoBackupBridge;
}

/** @param {Partial<ReturnType<typeof runtimeDefaults>>} [providedRuntime] */
export function getAutomaticBackupStatus(providedRuntime = {}) {
  const runtime = { ...runtimeDefaults(), ...providedRuntime };
  return nativeCall('getStatus', [], runtime, 15000);
}

/** @param {Partial<ReturnType<typeof runtimeDefaults>>} [providedRuntime] */
export function chooseAutomaticBackupFolder(providedRuntime = {}) {
  const runtime = { ...runtimeDefaults(), ...providedRuntime };
  return nativeCall('chooseFolder', [], runtime);
}

/** @param {Partial<ReturnType<typeof runtimeDefaults>>} [providedRuntime] */
export function disableAutomaticBackup(providedRuntime = {}) {
  const runtime = { ...runtimeDefaults(), ...providedRuntime };
  return nativeCall('disable', [], runtime, 15000);
}

/**
 * Build the exact versioned JSON envelope used by manual and automatic backup.
 * Refuse partial route reads: a backup is complete or it is not written.
 * @param {any} state
 * @param {{getRoutes?:()=>Promise<any[]>,appVersion?:string}} [deps]
 */
export async function buildCompleteBackup(state, deps = {}) {
  const getRoutes = deps.getRoutes || getAllRouteRecords;
  const routeRecords = await getRoutes();
  const payload = wrapExport(state, routeRecords, { appVersion: deps.appVersion || APP_VERSION });
  if (payload.routeRecords.length !== routeRecords.length) {
    throw new Error('Route validation did not preserve every route.');
  }
  return {
    payload,
    content: JSON.stringify(payload, null, 2),
    routeCount: routeRecords.length,
  };
}

/** @param {any} status @param {string} [dayKey] */
export function automaticBackupDue(status, dayKey = todayKey()) {
  return !!status?.configured && status.lastBackupDay !== dayKey;
}

/**
 * Write a full portable backup when Android has a configured folder.
 * @param {string} [reason]
 * @param {{force?:boolean,runtime?:Partial<ReturnType<typeof runtimeDefaults>>,getRoutes?:()=>Promise<any[]>,state?:any,dayKey?:string}} [options]
 */
export async function runAutomaticBackup(reason = 'manual', options = {}) {
  if (_backupInFlight) return _backupInFlight;
  const runtime = { ...runtimeDefaults(), ...(options.runtime || {}) };
  if (!automaticBackupSupported(runtime)) return unavailableStatus();
  if (isRecoveryGatePending()) {
    return {
      status: 'blocked',
      available: true,
      configured: false,
      message: 'Restore or set up your profile before writing a backup.',
    };
  }

  _backupInFlight = (async () => {
    const status = await getAutomaticBackupStatus(runtime);
    if (!status?.configured) return { ...status, status: status?.status || 'not-configured' };
    const dayKey = options.dayKey || todayKey();
    if (!options.force && reason === 'daily' && !automaticBackupDue(status, dayKey)) {
      return { status: 'current', available: true, configured: true, lastBackupAt: status.lastBackupAt, lastBackupDay: status.lastBackupDay };
    }
    const state = options.state || _getState?.();
    if (!state) return { status: 'error', available: true, configured: true, message: 'Training data is not ready.' };
    let complete;
    try { complete = await buildCompleteBackup(state, { getRoutes: options.getRoutes }); }
    catch (error) {
      return { status: 'error', available: true, configured: true, message: error instanceof Error ? error.message : 'Backup data could not be prepared.' };
    }
    return nativeCall('writeAutomaticBackup', [complete.content, dayKey, weekStartOf(dayKey), reason], runtime);
  })();

  try { return await _backupInFlight; }
  finally { _backupInFlight = null; }
}

/**
 * Attach once. Session checkpoints overwrite latest/current-day/current-week
 * files; boot performs only a once-per-day catch-up when one is due.
 * @param {()=>any} getState
 * @param {{document?:Document}} [provided]
 */
export function initAutomaticBackups(getState, provided = {}) {
  _getState = getState;
  if (_initialized) return;
  _initialized = true;
  const doc = provided.document || (typeof document !== 'undefined' ? document : null);
  doc?.addEventListener('session:finished', () => { void runAutomaticBackup('session', { force: true }); });
  doc?.addEventListener('backup:checkpoint', () => { void runAutomaticBackup('session', { force: true }); });
}

export function checkDailyAutomaticBackup() {
  return runAutomaticBackup('daily');
}
