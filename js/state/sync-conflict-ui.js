// =============================================================================
// SYNC CONFLICT UI — modal shown when this device is about to overwrite newer
// cloud data (another device wrote since we loaded). Lets the user choose which
// copy wins instead of silently clobbering history.
//
// Wiring: call initSyncConflictUI() once at bootstrap. It registers itself with
// state.js via setSyncConflictHandler; state.js invokes it on divergence.
// =============================================================================
import { setSyncConflictHandler, resolveSyncConflict } from '../state.js';

function _fmt(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown time';
  try { return new Date(t).toLocaleString(); } catch { return iso; }
}

let _open = false;

function _showConflict({ serverUpdatedAt } = {}) {
  if (_open) return;               // one prompt at a time
  if (typeof document === 'undefined') return;
  _open = true;

  const overlay = document.createElement('div');
  overlay.id = 'syncConflictOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
    'justify-content:center;padding:24px;background:rgba(0,0,0,0.6);';

  overlay.innerHTML =
    '<div style="max-width:420px;width:100%;background:var(--bg-card,#1a1a1a);' +
    'color:var(--text-primary,#fff);border:1px solid var(--border,#333);' +
    'border-radius:14px;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,0.5);">' +
      '<h2 style="margin:0 0 8px;font-size:1.1rem;">Sync conflict</h2>' +
      '<p style="margin:0 0 16px;color:var(--text-muted,#aaa);font-size:0.9rem;line-height:1.5;">' +
        'Another device saved changes to the cloud at <strong>' + _fmt(serverUpdatedAt) + '</strong>, ' +
        'newer than what this device last loaded. Saving now would overwrite them. ' +
        'Which copy do you want to keep?' +
      '</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button data-sync-choice="cloud" style="padding:11px;border-radius:10px;border:none;' +
          'font-weight:600;cursor:pointer;background:var(--accent-green,#2e7d32);color:#fff;">' +
          'Use cloud version (discard this device’s unsynced changes)</button>' +
        '<button data-sync-choice="local" style="padding:11px;border-radius:10px;cursor:pointer;' +
          'font-weight:600;background:transparent;color:var(--text-primary,#fff);' +
          'border:1px solid var(--border,#444);">' +
          'Keep this device (overwrite the cloud)</button>' +
      '</div>' +
    '</div>';

  const close = () => { overlay.remove(); _open = false; };

  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-sync-choice]');
    if (!btn) return;              // clicking the backdrop does nothing (must choose)
    const choice = btn.getAttribute('data-sync-choice');
    close();
    Promise.resolve(resolveSyncConflict(choice)).catch((err) =>
      console.error('Sync conflict resolution failed:', err));
  });

  document.body.appendChild(overlay);
}

export function initSyncConflictUI() {
  setSyncConflictHandler(_showConflict);
}
