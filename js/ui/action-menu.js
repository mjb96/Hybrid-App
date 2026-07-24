// @ts-check
// =============================================================================
// ACTION MENU (js/ui/action-menu.js)
//
// A small anchored overflow ("⋯") menu for SECONDARY actions, so a utility like
// "Copy program" doesn't need a large primary button. Self-contained and
// leak-free: only one menu is open at a time, it closes on outside tap, Escape,
// Android/browser Back, a viewport resize, and after an item is chosen; it
// returns focus to the trigger and removes every listener it adds (nothing
// leaks across re-renders). Items are real <button role="menuitem"> controls
// carrying their own data-action/data-program-id, so the app's existing global
// click handler runs them — the menu only owns open/position/close.
// =============================================================================

import { escapeHtml } from '../util.js';

/** @type {null | { root: HTMLElement, trigger: HTMLElement, onDocClick: (e: Event) => void, onKey: (e: KeyboardEvent) => void }} */
let _state = null;

function buildItem(item) {
  const attrs = [
    'type="button"', 'role="menuitem"', 'class="action-menu__item"',
    item.action ? `data-action="${escapeHtml(item.action)}"` : '',
    item.programId != null ? `data-program-id="${escapeHtml(String(item.programId))}"` : '',
    item.danger ? 'data-danger="1"' : '',
  ].filter(Boolean).join(' ');
  const icon = item.icon ? `<span class="action-menu__icon" aria-hidden="true">${item.icon}</span>` : '';
  return `<button ${attrs}>${icon}<span>${escapeHtml(item.label)}</span></button>`;
}

export function isActionMenuOpen() { return !!_state; }

/**
 * Open an anchored action menu next to `trigger`.
 * @param {HTMLElement} trigger the button the menu is anchored to
 * @param {Array<{label:string, action?:string, programId?:string, icon?:string, danger?:boolean}>} items
 * @param {{ label?: string }} [opts]
 */
export function openActionMenu(trigger, items, opts = {}) {
  if (typeof document === 'undefined' || !trigger || !Array.isArray(items) || !items.length) return;
  closeActionMenu();

  const root = document.createElement('div');
  root.className = 'action-menu';
  root.setAttribute('role', 'menu');
  if (opts.label) root.setAttribute('aria-label', opts.label);
  root.innerHTML = items.map(buildItem).join('');
  document.body.appendChild(root);
  position(root, trigger);
  try { trigger.setAttribute('aria-expanded', 'true'); } catch { /* ignore */ }

  const firstItem = /** @type {HTMLElement|null} */ (root.querySelector('[role="menuitem"]'));
  if (firstItem) { try { firstItem.focus(); } catch { /* ignore */ } }

  // Close AFTER an item's action has run (the global click handler runs first).
  root.addEventListener('click', (e) => {
    if (/** @type {Element} */ (e.target).closest('[role="menuitem"]')) setTimeout(closeActionMenu, 0);
  });

  const onDocClick = (e) => {
    const t = /** @type {Node} */ (e.target);
    if (!root.contains(t) && t !== trigger && !trigger.contains(t)) closeActionMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeActionMenu(); try { trigger.focus(); } catch { /* ignore */ } }
  };

  // Defer the outside-tap listener so the opening click doesn't close it.
  setTimeout(() => { if (_state) document.addEventListener('click', onDocClick, true); }, 0);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', closeActionMenu);

  // Android hardware/gesture Back is routed through window.__onAndroidBack
  // (app.js), which checks isActionMenuOpen() first — so no per-menu history
  // entry is pushed here (that would collide with a modal opened by an item).
  _state = { root, trigger, onDocClick, onKey };
}

export function closeActionMenu() {
  const s = _state;
  if (!s) return;
  _state = null;
  document.removeEventListener('click', s.onDocClick, true);
  document.removeEventListener('keydown', s.onKey, true);
  window.removeEventListener('resize', closeActionMenu);
  s.root.remove();
  try { s.trigger.setAttribute('aria-expanded', 'false'); } catch { /* ignore */ }
}

// Anchor the menu under the trigger's top-right, clamped inside the visible
// viewport; flip above the trigger if it would collide with the bottom (e.g. the
// bottom navigation bar).
function position(root, trigger) {
  const r = trigger.getBoundingClientRect();
  const vw = window.innerWidth || 360;
  root.style.position = 'fixed';
  root.style.left = 'auto';
  root.style.top = `${Math.round(r.bottom + 6)}px`;
  root.style.right = `${Math.max(8, Math.round(vw - r.right))}px`;
  requestAnimationFrame(() => {
    if (!_state) return;
    const mr = root.getBoundingClientRect();
    const vh = window.innerHeight || 640;
    if (mr.bottom > vh - 8) {
      root.style.top = `${Math.round(Math.max(8, r.top - mr.height - 6))}px`;
    }
  });
}
