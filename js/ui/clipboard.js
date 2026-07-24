// @ts-check
// =============================================================================
// TEXT CLIPBOARD (js/ui/clipboard.js)
//
// One robust "copy this text" primitive, so features don't each reinvent a
// slightly different clipboard path. Preference order:
//   1. navigator.clipboard.writeText  — secure contexts / modern browsers;
//   2. a hidden <textarea> + execCommand('copy') — Android WebView, installed
//      PWAs, and insecure/restricted contexts where the async API is missing or
//      throws.
// It resolves true ONLY when the copy actually succeeded, so callers never claim
// success on a silent failure (they can then fall back to a select-and-copy UI).
// Selection and focus are restored after the legacy path.
// =============================================================================

/**
 * Copy plain text to the clipboard. Resolves true only on a confirmed copy.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text) {
  const str = text == null ? '' : String(text);
  if (!str) return false;

  // 1. Async Clipboard API. Guarded because it throws in insecure contexts and
  //    when permission is denied.
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  return legacyCopy(str);
}

/** Hidden-textarea + execCommand fallback. Returns true only on success. */
function legacyCopy(str) {
  if (typeof document === 'undefined' || !document.body) return false;
  const previouslyFocused = /** @type {any} */ (document.activeElement);
  const ta = document.createElement('textarea');
  ta.value = str;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);

  let ok = false;
  try {
    ta.focus();
    ta.select();
    if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, str.length);
    ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
  } catch {
    ok = false;
  }

  ta.remove();
  // Restore focus to whatever the user was on before the copy.
  try { if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus(); } catch { /* best effort */ }
  return ok;
}
