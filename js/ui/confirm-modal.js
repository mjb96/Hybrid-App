// @ts-check
// =============================================================================
// CONFIRM MODAL (js/ui/confirm-modal.js) — roadmap R15
//
// One styled, promise-based replacement for the native confirm() — which on a
// WebView renders as an unstyled OS dialog that breaks the premium feel. Self
// contained (injects its own styles once). Resolves true/false.
//
//   if (await confirmModal({ title, message, confirmLabel, danger:true })) …
// =============================================================================

let _stylesInjected = false;

function ensureStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'confirmModalStyles';
  s.textContent = `
  .cmodal-overlay {
    position: fixed; inset: 0; z-index: 4200;
    display: flex; align-items: center; justify-content: center; padding: 24px;
    background: rgba(5,8,16,0.62); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
    opacity: 0; transition: opacity .2s ease;
  }
  .cmodal-overlay.cmodal--in { opacity: 1; }
  .cmodal {
    width: 100%; max-width: 340px; padding: 22px 22px 18px;
    border-radius: 22px; text-align: left;
    background: linear-gradient(180deg, rgba(30,34,48,0.98), rgba(20,24,36,0.98));
    border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 24px 70px rgba(0,0,0,0.55);
    transform: scale(.94); transition: transform .22s cubic-bezier(.34,1.3,.64,1);
  }
  .cmodal--in .cmodal { transform: scale(1); }
  .cmodal__title { font-size: 1.05rem; font-weight: 800; color: var(--text-inverse,#f8fafc); margin-bottom: 8px; }
  .cmodal__msg { font-size: .82rem; line-height: 1.5; color: var(--text-muted,#94a3b8); white-space: pre-line; margin-bottom: 20px; }
  .cmodal__row { display: flex; gap: 10px; }
  .cmodal__btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 700; font-size: .86rem; cursor: pointer; border: 1px solid transparent; }
  .cmodal__btn--cancel { background: rgba(255,255,255,0.06); color: var(--text-secondary,#cbd5e1); border-color: rgba(255,255,255,0.12); }
  .cmodal__btn--ok { background: var(--color-blue,#3b82f6); color: #fff; }
  .cmodal__btn--danger { background: var(--color-red,#ef4444); color: #fff; }
  @media (prefers-reduced-motion: reduce) { .cmodal-overlay, .cmodal { transition: none !important; transform: none !important; } }`;
  document.head.appendChild(s);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {{title?:string, message?:string, confirmLabel?:string, cancelLabel?:string, danger?:boolean}} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmModal(opts = {}) {
  const { title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = opts;
  if (typeof document === 'undefined') return Promise.resolve(false);
  ensureStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cmodal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `
      <div class="cmodal">
        <div class="cmodal__title">${esc(title)}</div>
        ${message ? `<div class="cmodal__msg">${esc(message)}</div>` : ''}
        <div class="cmodal__row">
          <button class="cmodal__btn cmodal__btn--cancel" data-cm="cancel">${esc(cancelLabel)}</button>
          <button class="cmodal__btn cmodal__btn--${danger ? 'danger' : 'ok'}" data-cm="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('cmodal--in');
      const finish = () => { overlay.remove(); resolve(result); };
      // Respect reduced-motion (no transitionend fires when transition:none).
      setTimeout(finish, 200);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    overlay.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t === overlay) close(false);
      else if (t.closest('[data-cm="ok"]')) close(true);
      else if (t.closest('[data-cm="cancel"]')) close(false);
    });
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      overlay.classList.add('cmodal--in');
      /** @type {HTMLElement|null} */ (overlay.querySelector('[data-cm="ok"]'))?.focus();
    });
  });
}
