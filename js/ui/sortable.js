// @ts-check
// =============================================================================
// SORTABLE — one premium drag-to-reorder engine for the whole app.
//
// Replaces three ad-hoc implementations (dashboard tiles, workout exercises,
// profile sections) with a single Pointer-Events engine that feels native:
//   • press-and-hold (or grab a handle) to pick up — the item lifts with a
//     scale + shadow and follows the finger 1:1,
//   • a placeholder holds the slot and the other items FLIP-animate to make
//     room (no abrupt jumps),
//   • auto-scrolls when you drag near the top/bottom edge,
//   • haptic tick on pick-up, each reorder step, and drop,
//   • suppresses the tap that would otherwise fire after a drag.
//
// Event-delegated from the container, so dynamically re-rendered children
// (e.g. the reconciled tile grid) are draggable without re-binding.
//
// createSortable(container, {
//   itemSelector,            // CSS selector for draggable children
//   handleSelector?,         // if set, drag only starts from this sub-element
//   layout?: 'grid'|'list',  // insertion geometry (default 'list')
//   holdDelay?,              // ms press-and-hold before pick-up (default 240;
//                            //   ignored — 0 — when a handle is used)
//   onReorder?(orderedItems) // called once on drop if the order changed
// }) => { destroy() }
// =============================================================================

const FLIP_MS = 220;
const FLIP_EASE = 'cubic-bezier(0.2, 0, 0, 1)';

function haptic(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

export function createSortable(container, opts) {
  if (!container || container.__sortable) return container && container.__sortable;
  const {
    itemSelector,
    handleSelector = null,
    layout = 'list',
    holdDelay = 240,
    directChildrenOnly = false,
    onReorder = null,
  } = opts || {};

  // Resolve the top-level sortable unit for an element. With directChildrenOnly
  // (e.g. workout supersets wrap nested exercises) we climb to the direct child
  // of the container rather than matching a nested item.
  const topLevel = (el) => {
    let n = el && el.closest && el.closest(itemSelector);
    if (!n || !container.contains(n)) return null;
    if (directChildrenOnly) {
      while (n && n.parentNode !== container) n = n.parentNode;
      if (!n || !n.matches || !n.matches(itemSelector)) return null;
    }
    return n;
  };
  const allItems = () => [...container.querySelectorAll(itemSelector)]
    .filter(n => !directChildrenOnly || n.parentNode === container);

  let pending = null;   // { item, startX, startY, pointerId } before pick-up
  let holdTimer = null;
  let state = null;     // active drag state
  let suppressClickUntil = 0;

  const itemFrom = (t) => topLevel(t);

  // ---- press / hold detection -------------------------------------------
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (state || pending) return;
    const item = itemFrom(e.target);
    if (!item) return;
    if (handleSelector && !(e.target.closest && e.target.closest(handleSelector))) return;

    pending = { item, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    window.addEventListener('pointermove', onPendingMove, { passive: true });
    window.addEventListener('pointerup', onPendingCancel, { passive: true });
    window.addEventListener('pointercancel', onPendingCancel, { passive: true });

    if (handleSelector) {
      engage(e);                                   // handle = clear intent → grab now
    } else {
      holdTimer = setTimeout(() => engage({ clientX: pending.startX, clientY: pending.startY, pointerId: pending.pointerId }), holdDelay);
    }
  }

  function onPendingMove(e) {
    if (!pending) return;
    const moved = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
    if (moved > 8) clearPending();                 // it's a scroll / swipe, not a hold
  }

  function onPendingCancel() { clearPending(); }

  function clearPending() {
    clearTimeout(holdTimer); holdTimer = null;
    window.removeEventListener('pointermove', onPendingMove);
    window.removeEventListener('pointerup', onPendingCancel);
    window.removeEventListener('pointercancel', onPendingCancel);
    pending = null;
  }

  // ---- pick up ----------------------------------------------------------
  function engage(e) {
    if (!pending || state) return;
    const item = pending.item;
    clearPending();

    const rect = item.getBoundingClientRect();
    const cs = getComputedStyle(item);

    const placeholder = document.createElement(item.tagName);
    placeholder.className = 'sortable-placeholder';
    placeholder.style.width = rect.width + 'px';
    placeholder.style.height = rect.height + 'px';
    if (cs.gridColumn && cs.gridColumn !== 'auto') placeholder.style.gridColumn = cs.gridColumn;
    item.parentNode.insertBefore(placeholder, item);

    state = {
      item, placeholder, pointerId: e.pointerId,
      grabDX: e.clientX - rect.left,
      grabDY: e.clientY - rect.top,
      last: { x: e.clientX, y: e.clientY },
      origCss: item.style.cssText,
      moved: false, raf: 0,
    };

    item.style.position = 'fixed';
    item.style.zIndex = '1200';
    item.style.left = rect.left + 'px';
    item.style.top = rect.top + 'px';
    item.style.width = rect.width + 'px';
    item.style.height = rect.height + 'px';
    item.style.margin = '0';
    item.style.pointerEvents = 'none';
    item.style.willChange = 'left, top, transform';
    item.classList.add('sortable-dragging');
    container.classList.add('sortable-active');

    try { item.setPointerCapture && item.setPointerCapture(e.pointerId); } catch (_) {}
    haptic(14);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });

    follow(e.clientX, e.clientY, false);
    state.raf = requestAnimationFrame(autoScrollTick);
  }

  function follow(cx, cy, lifted = true) {
    if (!state) return;
    state.item.style.left = (cx - state.grabDX) + 'px';
    state.item.style.top = (cy - state.grabDY) + 'px';
    state.item.style.transform = lifted ? 'scale(1.045)' : 'scale(1.045)';
  }

  function onMove(e) {
    if (!state) return;
    e.preventDefault();
    state.moved = true;
    state.last = { x: e.clientX, y: e.clientY };
    follow(e.clientX, e.clientY);
    reorderUnder(e.clientX, e.clientY);
  }

  // ---- reorder with FLIP -------------------------------------------------
  function reorderUnder(cx, cy) {
    if (!state) return;
    const under = document.elementFromPoint(cx, cy);
    const over = topLevel(under);
    if (!over || over === state.item) return;

    const r = over.getBoundingClientRect();
    let after;
    if (layout === 'grid') {
      after = cy > r.bottom ? true : cy < r.top ? false : cx > (r.left + r.width / 2);
    } else {
      after = cy > (r.top + r.height / 2);
    }
    const ref = after ? over.nextSibling : over;
    if (ref === state.placeholder) return;          // already in place

    // FLIP: snapshot, move, animate the delta away.
    const movers = [...allItems(), state.placeholder].filter(n => n && n !== state.item);
    const before = movers.map(n => [n, n.getBoundingClientRect()]);
    over.parentNode.insertBefore(state.placeholder, ref);
    for (const [n, b] of before) {
      const a = n.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (!dx && !dy) continue;
      n.style.transition = 'none';
      n.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        n.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASE}`;
        n.style.transform = '';
      });
    }
    haptic(5);
  }

  // ---- auto-scroll near edges -------------------------------------------
  function autoScrollTick() {
    if (!state) return;
    const { y, x } = state.last;
    const margin = 72, speed = 14;
    let dv = 0;
    if (y < margin) dv = -speed * (1 - y / margin);
    else if (y > window.innerHeight - margin) dv = speed * (1 - (window.innerHeight - y) / margin);
    if (dv) {
      window.scrollBy(0, dv);
      follow(x, y);
      reorderUnder(x, y);
    }
    state.raf = requestAnimationFrame(autoScrollTick);
  }

  // ---- drop --------------------------------------------------------------
  function onUp() {
    if (!state) return;
    const st = state; state = null;
    cancelAnimationFrame(st.raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);

    const dest = st.placeholder.getBoundingClientRect();
    st.item.style.transition = `left ${FLIP_MS}ms ${FLIP_EASE}, top ${FLIP_MS}ms ${FLIP_EASE}, transform ${FLIP_MS}ms ${FLIP_EASE}`;
    st.item.style.left = dest.left + 'px';
    st.item.style.top = dest.top + 'px';
    st.item.style.transform = 'scale(1)';

    let done = false;
    const finish = () => {
      if (done) return; done = true;
      st.item.removeEventListener('transitionend', finish);
      if (st.placeholder.parentNode) st.placeholder.parentNode.insertBefore(st.item, st.placeholder);
      st.placeholder.remove();
      st.item.style.cssText = st.origCss;
      st.item.classList.remove('sortable-dragging');
      container.classList.remove('sortable-active');
      try { st.item.releasePointerCapture && st.item.releasePointerCapture(st.pointerId); } catch (_) {}
      if (st.moved) {
        suppressClickUntil = Date.now() + 400;
        haptic(14);
        onReorder && onReorder(allItems());
      }
    };
    st.item.addEventListener('transitionend', finish);
    setTimeout(finish, FLIP_MS + 60);              // fallback if transitionend is missed
  }

  // Swallow the click that a touch/mouse drag would otherwise synthesise.
  function onClickCapture(e) {
    if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); }
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('click', onClickCapture, true);

  const api = {
    destroy() {
      clearPending();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('click', onClickCapture, true);
      container.__sortable = null;
    },
  };
  container.__sortable = api;
  return api;
}
