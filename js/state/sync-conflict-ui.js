// =============================================================================
// SYNC CONFLICT UI — modal shown when this device is about to overwrite newer
// cloud data (another device wrote since we loaded). Lets the user choose which
// copy wins instead of silently clobbering history.
//
// Wiring: call initSyncConflictUI() once at bootstrap. It registers itself with
// state.js via setSyncConflictHandler; state.js invokes it on divergence.
// =============================================================================
import { setSyncConflictHandler, resolveSyncConflict } from '../state.js';
import { closeManagedModal, openManagedModal } from '../ui/modal-stack.js';

function _fmt(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown time';
  try { return new Date(t).toLocaleString(); } catch { return iso; }
}

let _open = false;

function _escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function _summary(label, summary) {
  if (!summary || (!summary.strengthDays && !summary.runs)) return `${label}: no dated training found`;
  const parts = [];
  if (summary.strengthDays) parts.push(`${summary.strengthDays} strength day${summary.strengthDays === 1 ? '' : 's'}`);
  if (summary.runs) parts.push(`${summary.runs} run${summary.runs === 1 ? '' : 's'}`);
  if (summary.latestDate) parts.push(`latest ${summary.latestDate}`);
  return `${label}: ${parts.join(' · ')}`;
}

function _showConflict({ serverUpdatedAt, cloudProtected = false, cloudSummary, deviceSummary } = {}) {
  if (_open) return;               // one prompt at a time
  if (typeof document === 'undefined') return;
  _open = true;

  const overlay = document.createElement('div');
  overlay.id = 'syncConflictOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Sync conflict');
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
      '<div style="margin:0 0 16px;padding:10px;border-radius:10px;background:rgba(255,255,255,.05);' +
        'font-size:.78rem;line-height:1.55;color:var(--text-secondary,#ccc);">' +
        '<div>' + _escape(_summary('Cloud', cloudSummary)) + '</div>' +
        '<div>' + _escape(_summary('This device', deviceSummary)) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button data-sync-choice="cloud" style="padding:11px;border-radius:10px;border:none;' +
          'font-weight:600;cursor:pointer;background:var(--accent-green,#2e7d32);color:#fff;">' +
          'Use newer cloud version</button>' +
        '<button data-sync-choice="local"' + (cloudProtected ? '' : ' disabled') + ' style="padding:11px;border-radius:10px;cursor:pointer;' +
          'font-weight:600;background:transparent;color:var(--text-primary,#fff);' +
          'border:1px solid var(--border,#444);">' +
          (cloudProtected ? 'Replace cloud with this device…' : 'Cloud copy could not be protected') + '</button>' +
        '<p data-sync-warning style="display:none;margin:0;color:#fbbf24;font-size:.78rem;line-height:1.45;">' +
          'This removes the newer cloud data. A recovery copy will remain in Settings. Tap again to confirm.</p>' +
      '</div>' +
    '</div>';

  const close = () => { closeManagedModal(overlay); overlay.remove(); _open = false; };

  let confirmLocal = false;
  let resolving = false;
  overlay.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-sync-choice]');
    if (!btn || resolving || btn.disabled) return; // backdrop does nothing (must choose)
    const choice = btn.getAttribute('data-sync-choice');
    if (choice === 'local' && !confirmLocal) {
      confirmLocal = true;
      btn.textContent = 'Confirm: replace cloud (recovery copy kept)';
      overlay.querySelector('[data-sync-warning]').style.display = '';
      return;
    }
    resolving = true;
    overlay.querySelectorAll('[data-sync-choice]').forEach((button) => { button.disabled = true; });
    try {
      const ok = await resolveSyncConflict(choice);
      if (ok) close();
      else {
        resolving = false;
        overlay.querySelectorAll('[data-sync-choice]').forEach((button) => { button.disabled = false; });
      }
    } catch (err) {
      resolving = false;
      overlay.querySelectorAll('[data-sync-choice]').forEach((button) => { button.disabled = false; });
      console.error('Sync conflict resolution failed:', err);
    }
  });

  document.body.appendChild(overlay);
  openManagedModal(overlay, { initialFocus: '[data-sync-choice="cloud"]', dismissible: false });
}

export function initSyncConflictUI() {
  setSyncConflictHandler(_showConflict);
}
