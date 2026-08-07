// @ts-check
// =============================================================================
import { closeManagedModal, openManagedModal } from './modal-stack.js';
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
  .cmodal__field { display: block; margin-bottom: 18px; }
  .cmodal__label { display: block; font-size: .72rem; font-weight: 700; color: var(--text-muted,#94a3b8); margin-bottom: 6px; }
  .cmodal__inputwrap { display: flex; align-items: center; gap: 8px; }
  .cmodal__input {
    flex: 1; min-height: 44px; padding: 10px 12px; border-radius: 12px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
    color: var(--text-inverse,#f8fafc); font-size: 1rem; font-weight: 700; outline: none;
  }
  .cmodal__input:focus { border-color: var(--color-blue,#3b82f6); }
  .cmodal__unit { font-size: .82rem; font-weight: 700; color: var(--text-muted,#94a3b8); }
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
      closeManagedModal(overlay);
      overlay.classList.remove('cmodal--in');
      const finish = () => {
        overlay.remove();
        resolve(result);
      };
      // Respect reduced-motion (no transitionend fires when transition:none).
      setTimeout(finish, 200);
    };
    overlay.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t === overlay) close(false);
      else if (t.closest('[data-cm="ok"]')) close(true);
      else if (t.closest('[data-cm="cancel"]')) close(false);
    });
    openManagedModal(overlay, {
      initialFocus: '[data-cm="ok"]',
      onRequestClose: () => close(false),
    });

    requestAnimationFrame(() => {
      overlay.classList.add('cmodal--in');
    });
  });
}

/**
 * Ask for one number, in the same styled dialog.
 *
 * Exists because the app used to substitute a hardcoded 75 kg whenever it
 * needed a body weight it had never been told. Refusing to invent it is right,
 * but refusing and then blocking the log is not — so the athlete is asked once,
 * at the moment the number is actually needed.
 *
 * @param {{title?:string, message?:string, label?:string, unit?:string,
 *          confirmLabel?:string, cancelLabel?:string, min?:number, max?:number}} [opts]
 * @returns {Promise<number|null>} the value, or null if dismissed
 */
export function numberPromptModal(opts = {}) {
  const {
    title = 'Enter a value', message = '', label = '', unit = '',
    confirmLabel = 'Save', cancelLabel = 'Cancel', min = 0, max = 1000,
  } = opts;
  if (typeof document === 'undefined') return Promise.resolve(null);
  ensureStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cmodal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `
      <div class="cmodal">
        <div class="cmodal__title">${esc(title)}</div>
        ${message ? `<div class="cmodal__msg">${esc(message)}</div>` : ''}
        <label class="cmodal__field">
          ${label ? `<span class="cmodal__label">${esc(label)}</span>` : ''}
          <span class="cmodal__inputwrap">
            <input class="cmodal__input" type="number" inputmode="decimal"
                   min="${min}" max="${max}" step="0.1" data-cm="input"
                   aria-label="${esc(label || title)}">
            ${unit ? `<span class="cmodal__unit">${esc(unit)}</span>` : ''}
          </span>
        </label>
        <div class="cmodal__row">
          <button class="cmodal__btn cmodal__btn--cancel" data-cm="cancel">${esc(cancelLabel)}</button>
          <button class="cmodal__btn cmodal__btn--ok" data-cm="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = /** @type {HTMLInputElement} */ (overlay.querySelector('[data-cm="input"]'));
    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      closeManagedModal(overlay);
      overlay.classList.remove('cmodal--in');
      setTimeout(() => { overlay.remove(); resolve(result); }, 200);
    };
    const submit = () => {
      const value = Number.parseFloat(input?.value ?? '');
      // A blank or nonsense entry is a dismissal, never a stored zero.
      if (!Number.isFinite(value) || value <= min || value > max) { close(null); return; }
      close(value);
    };
    overlay.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t === overlay) close(null);
      else if (t.closest('[data-cm="ok"]')) submit();
      else if (t.closest('[data-cm="cancel"]')) close(null);
    });
    overlay.addEventListener('keydown', (e) => {
      if (/** @type {KeyboardEvent} */ (e).key === 'Enter') { e.preventDefault(); submit(); }
    });
    openManagedModal(overlay, {
      initialFocus: '[data-cm="input"]',
      onRequestClose: () => close(null),
    });
    requestAnimationFrame(() => overlay.classList.add('cmodal--in'));
  });
}
