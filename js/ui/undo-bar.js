// @ts-check
// =============================================================================
// UNDO BAR — one owner for the transient "…deleted · Undo" strip.
//
// Extracted when a second surface needed it: Activities (delete an activity) and
// the workout cockpit (discard a day's workout). They share one DOM element, so
// two independent implementations would not merely duplicate ~20 lines — they
// would race for the same bar and the same timer, and whichever fired second
// would silently strand the first one's finalize(). A discarded workout whose
// finalize never ran means an orphaned GPS route left in IndexedDB.
//
// The contract, which is what makes it safe for destructive work:
//   - `undo`     restores the change. Called only if the athlete taps Undo.
//   - `finalize` commits the parts that cannot be reversed (deleting a stored
//     route). Called exactly once — on timeout, on Undo being declined by a
//     newer action, or when a second undoable action displaces this one.
// Nothing is ever finalized twice, and nothing is left unfinalized.
// =============================================================================

const WINDOW_MS = 10000;

/** @type {{ undo: () => any, finalize: () => any, timer: any } | null} */
let _pending = null;

// The bar is a side effect, not the mechanism. Guarding for a DOM-less host
// keeps the finalize-exactly-once contract unit-testable without a browser —
// that contract is the part where a mistake orphans a stored GPS route.
function bar() {
  return typeof document === 'undefined' ? null : document.getElementById('activityUndoBar');
}

function hideBar() {
  const el = bar();
  if (el) { el.classList.remove('show'); el.hidden = true; }
}

/**
 * Show the bar and hold a reversible change open for the undo window.
 *
 * Displacing an earlier pending change finalizes it first — the athlete moved
 * on, so the older change is now permanent, but its irreversible half must still
 * run.
 *
 * @param {string} message  Already-composed text, e.g. "Workout discarded".
 * @param {() => any} undo
 * @param {() => any} finalize
 */
export function showUndo(message, undo, finalize) {
  if (_pending) {
    clearTimeout(_pending.timer);
    const previous = _pending;
    _pending = null;
    Promise.resolve(previous.finalize()).catch(() => {});
  }
  const messageEl = typeof document === 'undefined'
    ? null : document.getElementById('activityUndoMessage');
  if (messageEl) messageEl.textContent = message;
  const el = bar();
  if (el) { el.hidden = false; el.classList.add('show'); }

  const pending = { undo, finalize, timer: /** @type {any} */ (null) };
  pending.timer = setTimeout(async () => {
    if (_pending !== pending) return;   // already undone or displaced
    _pending = null;
    hideBar();
    await Promise.resolve(finalize()).catch(() => {});
  }, WINDOW_MS);
  _pending = pending;
}

/**
 * Run the pending undo, if any. Returns true when something was restored, so a
 * caller can decide whether to re-render or toast.
 * @returns {Promise<boolean>}
 */
export function runUndo() {
  const pending = _pending;
  if (!pending) return Promise.resolve(false);
  clearTimeout(pending.timer);
  _pending = null;
  hideBar();
  // finalize is deliberately NOT called: the change is being reversed, so the
  // irreversible half must never happen.
  return Promise.resolve(pending.undo()).then(() => true);
}

/** Whether an undoable change is currently open (tests + callers). */
export function hasPendingUndo() { return _pending !== null; }

/**
 * Commit any pending change immediately without waiting out the window.
 * Used when navigating away, so an undo bar can never outlive its context.
 * @returns {Promise<void>}
 */
export function flushUndo() {
  const pending = _pending;
  if (!pending) return Promise.resolve();
  clearTimeout(pending.timer);
  _pending = null;
  hideBar();
  return Promise.resolve(pending.finalize()).then(() => {}, () => {});
}

/** Test seam — drop any pending change without running either half. */
export function __resetUndoForTests() {
  if (_pending) clearTimeout(_pending.timer);
  _pending = null;
}
