// @ts-check
// Shared accessibility/navigation contract for every dialog and sheet.

const FOCUSABLE = [
  'button:not([disabled])', '[href]', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** @type {Array<any>} */
const stack = [];
const options = new WeakMap();
const backgroundState = new Map();
let observer = null;
let listenersDocument = null;
let ignoreNextPop = false;
let scrollState = null;

function dialogFor(root) {
  const selector = root?.dataset?.modalDialog;
  const role = root?.getAttribute?.('role');
  return selector ? root.querySelector(selector) :
    (role === 'dialog' || role === 'alertdialog' || root?.matches?.('[role="dialog"],[role="alertdialog"]')
      ? root : root?.querySelector?.('[role="dialog"],[role="alertdialog"]'));
}

function focusables(root) {
  return [...(root?.querySelectorAll?.(FOCUSABLE) || [])].filter((el) =>
    !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

function setClosedSemantics(root) {
  const dialog = dialogFor(root);
  root.setAttribute?.('inert', '');
  root.setAttribute?.('aria-hidden', 'true');
  dialog?.removeAttribute('aria-modal');
}

function setOpenSemantics(root) {
  const dialog = dialogFor(root);
  root.removeAttribute?.('inert');
  root.setAttribute?.('aria-hidden', 'false');
  dialog?.setAttribute('aria-modal', 'true');
}

function declaredOpen(root) {
  const openClass = root.dataset.modalOpenClass || 'active';
  if (root.classList.contains(openClass)) return true;
  if (root.dataset.modalOpenStyle === 'true') {
    return root.style.display !== '' && root.style.display !== 'none';
  }
  return false;
}

function companionsFor(root) {
  const selector = root?.dataset?.modalCompanion;
  return selector ? [...document.querySelectorAll(selector)] : [];
}

function saveBackgroundElement(el) {
  if (backgroundState.has(el)) return;
  backgroundState.set(el, {
    inert: el.hasAttribute('inert'),
    ariaHidden: el.getAttribute('aria-hidden'),
  });
}

function applyBackground() {
  if (typeof document === 'undefined' || !document.body) return;
  const activePath = new Set();
  const companions = new Set();
  for (const entry of stack) {
    let node = entry.root;
    while (node && node !== document.body) { activePath.add(node); node = node.parentElement; }
    companionsFor(entry.root).forEach((el) => companions.add(el));
  }

  for (const child of [...document.body.children]) {
    saveBackgroundElement(child);
    const containsOpen = [...activePath].some((node) => child === node || child.contains(node));
    const isCompanion = companions.has(child);
    if (containsOpen) {
      child.removeAttribute('inert');
      child.setAttribute('aria-hidden', 'false');
    } else if (isCompanion) {
      child.removeAttribute('inert');
      child.setAttribute('aria-hidden', 'true');
    } else if (stack.length) {
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
    }
  }
}

function restoreBackground() {
  for (const [el, prior] of backgroundState) {
    if (!el?.isConnected) continue;
    if (prior.inert) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    if (prior.ariaHidden == null) el.removeAttribute('aria-hidden');
    else el.setAttribute('aria-hidden', prior.ariaHidden);
  }
  backgroundState.clear();
}

function lockScroll() {
  if (scrollState || typeof document === 'undefined') return;
  const body = document.body;
  const y = typeof window !== 'undefined' ? (window.scrollY || 0) : 0;
  scrollState = { y, position: body.style.position, top: body.style.top, width: body.style.width };
  body.style.position = 'fixed';
  body.style.top = `-${y}px`;
  body.style.width = '100%';
}

function unlockScroll() {
  if (!scrollState || typeof document === 'undefined') return;
  const prior = scrollState;
  scrollState = null;
  const body = document.body;
  body.style.position = prior.position;
  body.style.top = prior.top;
  body.style.width = prior.width;
  try { window.scrollTo(0, prior.y); } catch { /* unavailable in tests */ }
}

function focusEntry(entry) {
  const explicit = entry.opts.initialFocus;
  const target = typeof explicit === 'string' ? entry.root.querySelector(explicit) : explicit;
  const fallback = target || focusables(entry.root)[0] || dialogFor(entry.root);
  if (fallback && !fallback.hasAttribute?.('tabindex') && fallback === dialogFor(entry.root)) {
    fallback.setAttribute('tabindex', '-1');
  }
  try { fallback?.focus?.(); } catch { /* best effort */ }
}

function pushHistory(entry) {
  if (entry.opts.history === false || typeof history === 'undefined' || !history.pushState) return;
  try {
    history.pushState({ helyxModal: entry.root.id || true }, '');
    entry.historyPushed = true;
  } catch { /* unavailable */ }
}

function openEntry(root, opts = {}) {
  const existing = stack.find((entry) => entry.root === root);
  if (existing) return existing;
  // Capture the real closed/background state before modal semantics mutate the
  // root. Otherwise final restoration could accidentally remove its `inert`.
  if (stack.length === 0 && typeof document !== 'undefined' && document.body) {
    for (const child of [...document.body.children]) saveBackgroundElement(child);
  }
  const entry = {
    root,
    opts: { ...options.get(root), ...opts },
    previousFocus: typeof document !== 'undefined' ? document.activeElement : null,
    historyPushed: false,
    fromPop: false,
  };
  options.set(root, entry.opts);
  stack.push(entry);
  setOpenSemantics(root);
  if (stack.length === 1) lockScroll();
  applyBackground();
  pushHistory(entry);
  focusEntry(entry);
  return entry;
}

function closeEntry(entry) {
  const index = stack.indexOf(entry);
  if (index < 0) return;
  stack.splice(index, 1);
  setClosedSemantics(entry.root);

  if (entry.historyPushed && !entry.fromPop && typeof history !== 'undefined' && history.back) {
    ignoreNextPop = true;
    try { history.back(); } catch { ignoreNextPop = false; }
  }

  if (stack.length) {
    applyBackground();
    const top = stack[stack.length - 1];
    if (entry.previousFocus && top.root.contains(entry.previousFocus)) {
      try { entry.previousFocus.focus?.(); } catch { focusEntry(top); }
    } else {
      focusEntry(top);
    }
  } else {
    restoreBackground();
    if (typeof document !== 'undefined') {
      document.querySelectorAll('[data-modal-root]').forEach(setClosedSemantics);
      for (const child of [...document.body.children]) {
        const role = child.getAttribute?.('role');
        if (!child.hasAttribute('data-modal-root') && (role === 'dialog' || role === 'alertdialog')) {
          setClosedSemantics(child);
        }
      }
    }
    setClosedSemantics(entry.root);
    unlockScroll();
    try { entry.previousFocus?.focus?.(); } catch { /* best effort */ }
  }
}

function requestClose(entry, fromPop = false) {
  if (!entry) return false;
  if (entry.opts.dismissible === false || entry.root.dataset.modalDismissible === 'false') {
    // A blocking safety/data-choice dialog must not let browser Back escape it.
    // The history marker has already been consumed by popstate, so replace it.
    if (fromPop) { entry.historyPushed = false; pushHistory(entry); }
    focusEntry(entry);
    return true;
  }
  entry.fromPop = fromPop;
  if (typeof entry.opts.onRequestClose === 'function') {
    entry.opts.onRequestClose();
    return true;
  }
  const action = entry.root.dataset.modalCloseAction;
  const control = action
    ? entry.root.querySelector(`[data-action="${action}"]`)
    : entry.root.querySelector('[data-modal-close], [data-action^="close-"]');
  if (control) { control.click(); return true; }
  const openClass = entry.root.dataset.modalOpenClass || 'active';
  entry.root.classList.remove(openClass);
  if (entry.root.dataset.modalOpenStyle === 'true') entry.root.style.display = 'none';
  refreshModalStack();
  return true;
}

function onKeydown(event) {
  const entry = stack[stack.length - 1];
  if (!entry) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    requestClose(entry);
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusables(entry.root);
  if (!items.length) { event.preventDefault(); focusEntry(entry); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function onFocusin(event) {
  const entry = stack[stack.length - 1];
  if (entry && !entry.root.contains(event.target)) focusEntry(entry);
}

function onPopstate() {
  if (ignoreNextPop) { ignoreNextPop = false; return; }
  requestClose(stack[stack.length - 1], true);
}

export function refreshModalStack() {
  if (typeof document === 'undefined') return;
  const roots = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-modal-root]')]);
  for (const entry of [...stack]) {
    if (entry.root.hasAttribute('data-modal-root') && !declaredOpen(entry.root)) closeEntry(entry);
  }
  for (const root of roots) {
    if (declaredOpen(root)) openEntry(root, { history: root.dataset.modalHistory !== 'external' });
    else if (!stack.some((entry) => entry.root === root)) setClosedSemantics(root);
  }
}

export function initModalStack(doc = document) {
  if (!doc || listenersDocument === doc) { refreshModalStack(); return; }
  listenersDocument = doc;
  doc.addEventListener('keydown', onKeydown);
  doc.addEventListener('focusin', onFocusin);
  doc.defaultView?.addEventListener('popstate', onPopstate);
  observer?.disconnect();
  const Observer = doc.defaultView?.MutationObserver
    || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  if (Observer) {
    observer = new Observer(refreshModalStack);
    observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-modal-root'] });
  }
  refreshModalStack();
}

export function openManagedModal(root, opts = {}) {
  if (!root) return;
  openEntry(root, opts);
}

export function closeManagedModal(root) {
  const entry = stack.find((item) => item.root === root);
  if (entry) closeEntry(entry); else if (root) setClosedSemantics(root);
}

// Swap one open dialog for another while retaining a single browser-history
// marker. Closing and immediately opening two separate managed modals can race
// history.back() against the new pushState(), which may pop past the app entry
// entirely. A hand-off keeps Back/Escape semantics intact without navigating.
export function replaceManagedModal(currentRoot, nextRoot, opts = {}) {
  if (!nextRoot) return null;
  const current = stack.find((entry) => entry.root === currentRoot);
  const inheritedHistory = Boolean(current?.historyPushed);

  if (currentRoot) {
    const openClass = currentRoot.dataset.modalOpenClass || 'active';
    currentRoot.classList.remove(openClass);
    if (currentRoot.dataset.modalOpenStyle === 'true') currentRoot.style.display = 'none';
    if (current) {
      current.historyPushed = false;
      closeEntry(current);
    } else {
      setClosedSemantics(currentRoot);
    }
  }

  const nextOpenClass = nextRoot.dataset.modalOpenClass || 'active';
  nextRoot.classList.add(nextOpenClass);
  const next = openEntry(nextRoot, { ...opts, history: inheritedHistory ? false : opts.history });
  if (next && inheritedHistory) next.historyPushed = true;
  return next;
}

export function requestCloseTopModal() {
  return requestClose(stack[stack.length - 1]);
}

export function modalStackDepth() { return stack.length; }
