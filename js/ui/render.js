// @ts-check
// =============================================================================
// RENDER TOOLKIT (js/ui/render.js)
//
// Small, dependency-free helpers to move the app off "rebuild everything with
// innerHTML on every render". Two primitives:
//
//   setHTML(el, html)              — assign innerHTML only when it actually
//                                    changed (memoised per element). Skips the
//                                    reparse/layout for unchanged subtrees, the
//                                    common case on a re-hydrate.
//
//   reconcileKeyed(container,...)  — keyed list reconciliation: reuse existing
//                                    child nodes by key, create only new ones,
//                                    remove stale ones, and reorder in place.
//                                    Preserves node identity (and thus focus,
//                                    scroll, one-time listeners) across renders.
//
// Pure DOM logic, unit-tested in tests/ui_render.test.js against a functional
// fake DOM. No app imports.
// =============================================================================

/**
 * Set el.innerHTML only if it differs from the last value this helper wrote.
 * @param {any} el
 * @param {string} html
 * @returns {boolean} true if the DOM was updated, false if skipped as unchanged
 */
export function setHTML(el, html) {
  if (!el) return false;
  if (el.__lastHTML === html) return false;
  el.__lastHTML = html;
  el.innerHTML = html;
  return true;
}

/**
 * Keyed list reconciliation against a container's children.
 *
 * @template T
 * @param {any} container
 * @param {T[]} items
 * @param {{
 *   key: (item: T) => string | number,
 *   create: (item: T) => any,
 *   update?: (node: any, item: T) => void,
 *   remove?: (node: any) => void,
 * }} opts
 * @returns {any} the container
 */
export function reconcileKeyed(container, items, { key, create, update, remove }) {
  if (!container) return container;

  // Index current children by their data-key.
  const existing = new Map();
  const kids = Array.from(container.children || []);
  for (const child of kids) {
    const k = child.getAttribute ? child.getAttribute('data-key') : null;
    if (k != null) existing.set(k, child);
  }

  const seen = new Set();
  let prev = null;

  for (const item of items) {
    const k = String(key(item));
    seen.add(k);

    let node = existing.get(k);
    if (!node) {
      node = create(item);
      if (node && node.setAttribute) node.setAttribute('data-key', k);
    }
    if (update) update(node, item);

    // Place node immediately after the previously-placed node (or at the head).
    const ref = prev ? prev.nextSibling : container.firstChild;
    if (node !== ref) container.insertBefore(node, ref || null);
    prev = node;
  }

  // Drop children whose key is no longer present.
  for (const [k, node] of existing) {
    if (!seen.has(k)) {
      if (remove) remove(node);
      else container.removeChild(node);
    }
  }

  return container;
}
