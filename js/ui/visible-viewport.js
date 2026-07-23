// @ts-check
// =============================================================================
// VISIBLE VIEWPORT HEIGHT
//
// On a phone, an open on-screen keyboard shrinks the area the user can actually
// see, but `100vh`/`100dvh` and `window.innerHeight` keep reporting the FULL
// screen height. A fixed, top-anchored panel sized with those units therefore
// runs its scroll area behind the keyboard. `window.visualViewport.height` is
// the real visible height, so this helper publishes it as the
// `--visible-viewport-height` CSS custom property and keeps it fresh while the
// keyboard opens/closes, the page scrolls, or the device rotates.
//
// It is deliberately dependency-free and injectable (pass a window-like object)
// so the sizing maths can be unit-tested without a real browser keyboard.
// =============================================================================

const CSS_VAR = '--visible-viewport-height';

/** The real visible viewport height in CSS pixels, or null when unknown. */
export function visibleViewportHeight(win) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  if (!w) return null;
  const vv = w.visualViewport;
  const raw = vv && Number.isFinite(vv.height) ? vv.height : w.innerHeight;
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

/** Write the current visible viewport height to the CSS custom property. */
export function applyVisibleViewportHeight(win, doc) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  const d = doc || (w && w.document) || (typeof document !== 'undefined' ? document : undefined);
  const h = visibleViewportHeight(w);
  if (h == null || !d?.documentElement) return null;
  d.documentElement.style.setProperty(CSS_VAR, `${Math.round(h)}px`);
  return h;
}

/** Remove the CSS custom property so no stale height lingers after close. */
export function clearVisibleViewportHeight(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : undefined);
  d?.documentElement?.style.removeProperty(CSS_VAR);
}

/**
 * Start tracking the visible viewport height. Applies it immediately and on
 * every visualViewport resize/scroll, orientation change and window resize.
 * Returns a teardown function that detaches every listener and clears the CSS
 * property — the caller MUST call it when the panel closes.
 * @returns {() => void}
 */
export function trackVisibleViewport(win) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  if (!w) return () => {};
  const d = w.document;
  const update = () => applyVisibleViewportHeight(w, d);
  update();

  /** @type {Array<[any, string]>} */
  const bound = [];
  const add = (target, event) => {
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener(event, update);
      bound.push([target, event]);
    }
  };
  add(w.visualViewport, 'resize');
  add(w.visualViewport, 'scroll');
  add(w, 'resize');
  add(w, 'orientationchange');

  return () => {
    for (const [target, event] of bound) {
      try { target.removeEventListener(event, update); } catch { /* best effort */ }
    }
    clearVisibleViewportHeight(d);
  };
}
