// @ts-check
// =============================================================================
// HAPTICS — light, semantic vibration feedback for key moments.
// Uses the Web Vibration API (works in the Android WebView once the VIBRATE
// permission is declared). No-ops silently where unsupported or disabled.
// =============================================================================

let _enabled = true;

/** Enable/disable all haptics (e.g. from a settings toggle). */
export function setHapticsEnabled(on) { _enabled = !!on; }

/** @param {number | number[]} pattern */
function _vibrate(pattern) {
  if (!_enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* ignore — haptics are best-effort */ }
}

/** Light confirmation — a set logged, a primary action committed. */
export function hapticTick()     { _vibrate(12); }
/** Subtle selection — toggles, chip taps. */
export function hapticSelect()   { _vibrate(8); }
/** Positive milestone — a new personal record. */
export function hapticSuccess()  { _vibrate([25, 40, 70]); }
/** Attention — a rest period has finished. */
export function hapticRestDone() { _vibrate([70, 90, 70]); }
/** Warning / failed action. */
export function hapticWarn()     { _vibrate([40, 50, 40]); }
