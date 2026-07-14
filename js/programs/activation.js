// @ts-check
// =============================================================================
// PROGRAM ACTIVATION (js/programs/activation.js)
//
// Activating a program used to be a silent, one-tap, destructive action: the
// "Start This Program" CTA switched `activeProgramId` and re-seeded the current
// + future weeks with no confirmation, no statement of what happens to the
// program you were already running, and no guard for a workout in progress.
//
// This module makes activation a deliberate, honest step:
//   • buildActivationPlan() — PURE. Computes exactly what to tell the user
//     (natural-language summary, current-program impact, history-is-kept
//     reassurance, in-progress-workout warning, start-week choices). No DOM, no
//     raw ids, no "undefined"/0 for missing metadata. Unit-tested.
//   • confirmActivation() — a self-contained confirmation dialog that presents
//     the plan and resolves the user's choice ({ activate, startWeek }).
//   • activateProgramWithConfirm() — thin orchestrator: plan → confirm → apply.
//
// The actual state mutation (applyProgramSwitch) stays in app.js; this only
// gates it behind an explicit, reviewable choice.
// =============================================================================
import { DIFFICULTY_LABELS, CATEGORIES } from './catalog.js';
import { closeManagedModal, openManagedModal } from '../ui/modal-stack.js';

/**
 * Compute the activation plan shown to the user before switching programs.
 * Pure — pass the resolvers/flags in via `deps`.
 *
 * @param {any} state  appState
 * @param {string} programId
 * @param {{
 *   resolveProgram?: (id:string)=>any,
 *   resolveName?: (id:string)=>string|undefined,
 *   workoutInProgress?: boolean,
 * }} [deps]
 */
export function buildActivationPlan(state, programId, deps = {}) {
  const resolveProgram = deps.resolveProgram || (() => null);
  const resolveName = deps.resolveName || ((id) => id);
  const workoutInProgress = !!deps.workoutInProgress;

  const target = resolveProgram(programId) || null;
  const targetName = (resolveName(programId) || target?.name || 'this program');

  const weeks = Number(target?.durationWeeks || target?.totalWeeks) || null;
  const daysPerWeek = Number(target?.sessionsPerWeek) || null;
  const level = target?.difficulty ? (DIFFICULTY_LABELS[target.difficulty]?.label || null) : null;
  const type = target?.category ? (CATEGORIES[target.category]?.label || null) : null;

  const currentId = state?.activeProgramId || null;
  const hasCurrent = !!currentId;
  const currentName = hasCurrent ? (resolveName(currentId) || 'your current program') : null;
  const currentWeek = Math.max(1, parseInt(state?.currentWeek, 10) || 1);
  const sameAsCurrent = hasCurrent && currentId === programId;

  const mode = !hasCurrent ? 'first' : sameAsCurrent ? 'restart' : 'switch';

  // Natural-language summary — only include a field where the data actually
  // exists, so the sheet never shows "undefined", "0 weeks", or "— days/week".
  const summary = [];
  if (type && weeks) summary.push(`${weeks}-week ${type.toLowerCase()} block`);
  else if (weeks) summary.push(`${weeks}-week program`);
  else if (type) summary.push(type);
  if (daysPerWeek) summary.push(`${daysPerWeek} days/week`);
  if (level) summary.push(level);

  // What actually happens — calm, accurate wording (never implies history loss).
  const impact = [];
  if (mode === 'switch') impact.push({ tone: 'warn', text: `Replaces ${currentName} as your active program` });
  if (mode === 'restart') impact.push({ tone: 'info', text: `Restarts ${targetName} from the beginning` });
  impact.push({ tone: 'safe', text: 'Your logged history and completed weeks are kept' });
  if (workoutInProgress) {
    impact.push({ tone: 'warn', text: 'A workout is in progress — finish or discard it first to avoid mixing sessions' });
  }

  // Start-week choice. A freshly-activated program should begin at Week 1; when
  // replacing a program you're partway through, offer to keep the current week.
  const startWeekChoices = [
    { week: 1, label: weeks ? `Start at Week 1 of ${weeks}` : 'Start at Week 1', primary: true },
  ];
  if (mode === 'switch' && currentWeek > 1) {
    startWeekChoices.push({ week: currentWeek, label: `Keep Week ${currentWeek}`, primary: false });
  }

  const title = mode === 'first' ? `Start ${targetName}?`
    : mode === 'restart' ? `Restart ${targetName}?`
      : `Switch to ${targetName}?`;

  return {
    ok: !!target,
    programId, targetName, weeks, daysPerWeek, level, type,
    mode, currentId, currentName, currentWeek, sameAsCurrent,
    workoutInProgress, historyPreserved: true,
    title, summary, impact, startWeekChoices, defaultStartWeek: 1,
  };
}

// ── Confirmation dialog ──────────────────────────────────────────────────────
let _stylesInjected = false;
function ensureStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'activationConfirmStyles';
  s.textContent = `
  .actm-overlay { position: fixed; inset: 0; z-index: 4300; display: flex; align-items: center;
    justify-content: center; padding: 20px calc(20px + env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) calc(20px + env(safe-area-inset-left));
    background: rgba(5,8,16,0.64); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
    opacity: 0; transition: opacity .2s ease; }
  .actm-overlay.actm--in { opacity: 1; }
  .actm { width: 100%; max-width: 360px; max-height: 86dvh; overflow-y: auto; overscroll-behavior: contain;
    padding: 20px 20px 16px; border-radius: 22px; text-align: left;
    background: linear-gradient(180deg, rgba(30,34,48,0.98), rgba(18,22,34,0.98));
    border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 24px 70px rgba(0,0,0,0.55);
    transform: scale(.94); transition: transform .22s cubic-bezier(.34,1.3,.64,1); }
  .actm--in .actm { transform: scale(1); }
  .actm__title { font-size: 1.08rem; font-weight: 800; color: var(--text-inverse,#f8fafc); margin-bottom: 6px; }
  .actm__summary { font-size: .8rem; color: var(--text-secondary,#cbd5e1); margin-bottom: 14px; line-height: 1.5; }
  .actm__list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
  .actm__item { display: flex; gap: 8px; align-items: flex-start; font-size: .82rem; line-height: 1.45; color: var(--text-secondary,#cbd5e1); }
  .actm__ico { flex: 0 0 auto; margin-top: 1px; }
  .actm__item--warn .actm__ico { color: #f59e0b; }
  .actm__item--safe .actm__ico { color: #10b981; }
  .actm__item--info .actm__ico { color: #60a5fa; }
  .actm__btns { display: flex; flex-direction: column; gap: 8px; }
  .actm__btn { width: 100%; padding: 13px; border-radius: 13px; font-weight: 700; font-size: .88rem;
    cursor: pointer; border: 1px solid transparent; text-align: center; }
  .actm__btn--primary { background: var(--color-blue,#3b82f6); color: #fff; }
  .actm__btn--secondary { background: rgba(255,255,255,0.06); color: var(--text-inverse,#f8fafc); border-color: rgba(255,255,255,0.14); }
  .actm__btn--cancel { background: transparent; color: var(--text-muted,#94a3b8); }
  @media (prefers-reduced-motion: reduce) { .actm-overlay, .actm { transition: none !important; transform: none !important; } }`;
  document.head.appendChild(s);
}

const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _toneIcon = (tone) => (tone === 'safe' ? '✓' : tone === 'warn' ? '⚠' : '•');

/**
 * Present the activation plan and resolve the user's choice.
 * @param {ReturnType<typeof buildActivationPlan>} plan
 * @returns {Promise<{ activate: boolean, startWeek: number }>}
 */
export function confirmActivation(plan) {
  if (typeof document === 'undefined') return Promise.resolve({ activate: false, startWeek: 1 });
  ensureStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'actm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', plan.title);

    const summaryLine = plan.summary.length ? `<div class="actm__summary">${_esc(plan.summary.join(' · '))}</div>` : '';
    const impactHTML = plan.impact.map(i =>
      `<div class="actm__item actm__item--${i.tone}"><span class="actm__ico" aria-hidden="true">${_toneIcon(i.tone)}</span><span>${_esc(i.text)}</span></div>`
    ).join('');
    const btnsHTML = plan.startWeekChoices.map((c, idx) =>
      `<button class="actm__btn actm__btn--${c.primary ? 'primary' : 'secondary'}" data-act-week="${c.week}"${idx === 0 ? ' data-act-default="1"' : ''}>${_esc(c.label)}</button>`
    ).join('') + `<button class="actm__btn actm__btn--cancel" data-act-cancel="1">Cancel</button>`;

    overlay.innerHTML = `
      <div class="actm">
        <div class="actm__title">${_esc(plan.title)}</div>
        ${summaryLine}
        <div class="actm__list">${impactHTML}</div>
        <div class="actm__btns">${btnsHTML}</div>
      </div>`;
    document.body.appendChild(overlay);

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      closeManagedModal(overlay);
      overlay.classList.remove('actm--in');
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    };
    overlay.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t === overlay || t.closest('[data-act-cancel]')) return finish({ activate: false, startWeek: 1 });
      const weekBtn = t.closest('[data-act-week]');
      if (weekBtn) finish({ activate: true, startWeek: parseInt(weekBtn.getAttribute('data-act-week'), 10) || 1 });
    });
    openManagedModal(overlay, {
      initialFocus: '[data-act-default]',
      onRequestClose: () => finish({ activate: false, startWeek: 1 }),
    });

    requestAnimationFrame(() => {
      overlay.classList.add('actm--in');
    });
  });
}

/**
 * Orchestrate a confirmed activation. Returns true if the program was activated.
 * @param {any} state
 * @param {string} programId
 * @param {{
 *   resolveProgram:(id:string)=>any, resolveName:(id:string)=>string|undefined,
 *   workoutInProgress?:()=>boolean, apply:(id:string, startWeek:number)=>void,
 *   confirm?:(plan:any)=>Promise<{activate:boolean,startWeek:number}>,
 *   onError?:(msg:string)=>void,
 * }} deps
 * @returns {Promise<boolean>}
 */
export async function activateProgramWithConfirm(state, programId, deps) {
  const plan = buildActivationPlan(state, programId, {
    resolveProgram: deps.resolveProgram,
    resolveName: deps.resolveName,
    workoutInProgress: deps.workoutInProgress ? deps.workoutInProgress() : false,
  });
  if (!plan.ok) { deps.onError?.('That program could not be found.'); return false; }
  const choice = await (deps.confirm || confirmActivation)(plan);
  if (!choice || !choice.activate) return false;
  deps.apply(programId, choice.startWeek || 1);
  return true;
}
