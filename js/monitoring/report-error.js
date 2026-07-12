// @ts-check
// =============================================================================
// OBSERVABLE ERROR HANDLING (js/monitoring/report-error.js)
//
// A bare `catch {}` is how the overtraining safety card silently died (an
// out-of-scope ReferenceError was swallowed, so the card never rendered and no
// one knew). This module is the deliberate alternative: when we CHOOSE to catch
// an error so the UI degrades instead of white-screening, the failure must still
// be OBSERVABLE — logged with context in dev/CI, reported to Sentry in
// production. Never silent.
//
// Leaf module: no imports, safe to use anywhere.
// =============================================================================

/** @type {((context:string, err:any)=>void)|null} */
let _testHook = null;
/** Test-only: observe every handled error (set null to clear). */
export function _setErrorHook(fn) { _testHook = fn; }

/**
 * Record an error we intentionally caught. Observable, best-effort, never throws.
 * @param {string} context  short identifier, e.g. 'home:overtraining-card'
 * @param {any} err
 */
export function reportHandledError(context, err) {
  // 1) Always visible in dev + CI (the smoke test fails on unexpected
  //    console.error, so a swallowed throw can no longer pass unnoticed).
  try { console.error(`[Helyx] handled error in ${context}:`, err && err.stack ? err.stack : err); } catch (_) { /* no console */ }
  // 2) Production telemetry (DSN-gated; scrubbed by the Sentry config).
  try {
    const S = (typeof window !== 'undefined') ? /** @type {any} */ (window).Sentry : null;
    if (S && typeof S.captureException === 'function') {
      S.captureException(err, { tags: { handled: 'true', context } });
    }
  } catch (_) { /* Sentry not ready */ }
  // 3) Test observability hook.
  if (_testHook) { try { _testHook(context, err); } catch (_) { /* hook must not break flow */ } }
}

/**
 * Run a render/compute fn; if it throws, report it (never silently) and return
 * `fallback` so one failed OPTIONAL card can't take down the whole screen.
 * @template T
 * @param {string} context
 * @param {() => T} fn
 * @param {T} [fallback]
 * @returns {T|undefined}
 */
export function renderSafely(context, fn, fallback = undefined) {
  try { return fn(); }
  catch (err) { reportHandledError(context, err); return fallback; }
}
