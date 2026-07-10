// @ts-check
// =============================================================================
// BRIDGE CALLBACK IDs
// -----------------------------------------------------------------------------
// The native Android bridges echo a JS-supplied callback id back into
// evaluateJavascript(), so the id MUST be safe to interpolate into a JS string.
// The native side (BridgeSafe.callbackId, Kotlin) accepts only this alphabet;
// keep this generator and that validator in lockstep.
// =============================================================================

// Mirrors android/.../BridgeSafe.kt — [A-Za-z0-9_-], 1..64 chars.
export const BRIDGE_CALLBACK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Generate a unique, injection-safe callback id.
 * @param {string} prefix short tag, e.g. 'perm' or 'n' (sanitised defensively)
 * @returns {string}
 */
export function makeBridgeCallbackId(prefix = 'cb') {
  const p = String(prefix).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'cb';
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `${p}_${Date.now().toString(36)}_${rand}`;
}
