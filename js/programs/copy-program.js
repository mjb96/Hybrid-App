// @ts-check
// =============================================================================
// COPY PROGRAM AS TEXT (js/programs/copy-program.js)
//
// The UI controller behind the "📋 Copy program" action on Program Detail and
// the Active Program view. It resolves the CURRENT program by its stable id
// (personal definition wins over the catalog source — never the pre-edit
// built-in), builds the GPT-friendly text with the pure serializer, copies it,
// and reports honestly:
//   • success  → toast "Program copied";
//   • failure  → a select-and-copy preview modal + an honest failure message.
//
// It never mutates program or app state — copying is read-only.
// =============================================================================

import { appState, getProgramById } from '../state.js';
import { getCatalogEntry } from './catalog.js';
import { buildProgramExportText } from './program-export.js';
import { copyTextToClipboard } from '../ui/clipboard.js';
import { showToast } from '../toast.js';
import { openManagedModal, closeManagedModal } from '../ui/modal-stack.js';
import { escapeHtml } from '../util.js';

const SUCCESS_MESSAGE = 'Program copied';
const FAILURE_MESSAGE = 'Couldn’t access the clipboard — select and copy the text below';

/**
 * Build the copyable text for a program id, resolving the personal/edited
 * definition and (for the active program) its current week. Pure aside from
 * reading app state; returns null when the program can't be resolved.
 * @param {string} programId
 * @param {{ mode?: 'ai'|'plain' }} [opts]
 */
export function buildProgramTextForId(programId, opts = {}) {
  const program = getProgramById(programId);
  if (!program) return null;
  const isActive = appState?.activeProgramId === programId;
  const activeWeek = isActive ? (appState?.currentWeek ?? null) : null;
  const sourceName = program.sourceProgramId ? (getCatalogEntry(program.sourceProgramId)?.name || null) : null;
  return buildProgramExportText(program, { mode: opts.mode || 'ai', activeWeek, sourceName });
}

/**
 * Copy a program's text to the clipboard, falling back to a preview modal.
 * @param {string} programId
 * @param {{ mode?: 'ai'|'plain' }} [opts]
 * @returns {Promise<{ ok: boolean, text: string } | null>}
 */
export async function copyProgramAsText(programId, opts = {}) {
  const text = buildProgramTextForId(programId, opts);
  if (text == null) {
    showToast('Could not load this program to copy.', true);
    return null;
  }
  const ok = await copyTextToClipboard(text);
  if (ok) {
    showToast(SUCCESS_MESSAGE);
  } else {
    showToast(FAILURE_MESSAGE, true);
    openProgramTextModal(text);
  }
  return { ok, text };
}

// ── Fallback / preview modal ────────────────────────────────────────────────

let _trigger = null;

function ensureModal() {
  let root = document.getElementById('programTextModal');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'programTextModal';
  root.className = 'modal-overlay program-text-modal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'programTextModalTitle');
  root.setAttribute('data-modal-root', '');
  root.setAttribute('data-modal-close-action', 'close-program-text');
  root.setAttribute('inert', '');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="modal-content program-text-modal__panel">
      <div class="program-text-modal__head">
        <h2 id="programTextModalTitle">Copy program</h2>
        <button data-action="close-program-text" aria-label="Close">×</button>
      </div>
      <p class="program-text-modal__hint">Select all, then copy, and paste it into ChatGPT.</p>
      <textarea id="programTextModalArea" class="program-text-modal__area" readonly aria-label="Program text"></textarea>
      <div class="program-text-modal__actions">
        <button class="btn-pad" data-action="program-text-select-all">Select all</button>
        <button class="btn-pad btn-blue" data-action="program-text-copy">Copy</button>
        <button class="btn-pad" data-action="close-program-text">Close</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

export function openProgramTextModal(text) {
  const root = ensureModal();
  const area = /** @type {HTMLTextAreaElement|null} */ (root.querySelector('#programTextModalArea'));
  if (area) area.value = String(text || '');
  _trigger = /** @type {any} */ (document.activeElement);
  root.classList.add('active');
  openManagedModal(root, { initialFocus: '#programTextModalArea' });
  if (area) { try { area.focus(); area.select(); } catch { /* best effort */ } }
}

export function closeProgramTextModal() {
  const root = document.getElementById('programTextModal');
  if (!root) return;
  root.classList.remove('active');
  closeManagedModal(root);
  const trigger = _trigger;
  _trigger = null;
  try { if (trigger && trigger.focus) trigger.focus(); } catch { /* best effort */ }
}

function selectAllProgramText() {
  const area = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('programTextModalArea'));
  if (!area) return;
  try { area.focus(); area.select(); area.setSelectionRange(0, area.value.length); } catch { /* best effort */ }
}

async function copyFromModal() {
  const area = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('programTextModalArea'));
  if (!area) return;
  const ok = await copyTextToClipboard(area.value);
  if (ok) { showToast(SUCCESS_MESSAGE); closeProgramTextModal(); }
  else { selectAllProgramText(); showToast(FAILURE_MESSAGE, true); }
}

/** Route the modal's own data-action buttons. Called from the global handler. */
export function handleProgramTextAction(action) {
  if (action === 'close-program-text') { closeProgramTextModal(); return true; }
  if (action === 'program-text-select-all') { selectAllProgramText(); return true; }
  if (action === 'program-text-copy') { copyFromModal(); return true; }
  return false;
}
