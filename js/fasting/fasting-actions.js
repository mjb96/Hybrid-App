// @ts-check
// =============================================================================
// FASTING CLICK ACTIONS (js/fasting/fasting-actions.js) — roadmap R16
//
// Extracted verbatim from app.js's global click router to shrink that
// god-module. Behaviour is unchanged; this is a mechanical relocation of one
// cohesive domain. `openAnalyticsView` lives in app.js, so it is passed in via
// ctx to avoid an import cycle.
// =============================================================================
import { appState, saveStateToLocalStorage } from '../state.js';
import { startFast, stopFast, editFastStartTime, stopFastAtTime, editHistoryFast } from '../fasting.js';
import {
  renderHome,
  openFastingDetail, closeFastingDetail,
  openHistoryEditPanel, closeHistoryEditPanel,
} from '../home.js';

// Every action this router owns — app.js delegates when the action is in here.
export const FASTING_ACTIONS = new Set([
  'fast-start', 'fast-stop', 'fast-set-protocol',
  'fast-edit-start-time', 'fast-cancel-edit-start', 'fast-save-start-time',
  'fast-edit-end-time', 'fast-cancel-edit-end', 'fast-save-end-time',
  'open-fasting-detail', 'close-fasting-detail',
  'open-fasting-analytics', 'open-fasting-education',
  'fast-edit-history', 'fast-save-history', 'fast-cancel-history-edit',
  'fa-edu-cat', 'fa-edu-article', 'fa-edu-back',
  'fa-cal-prev', 'fa-cal-next',
  'fa-tab-overview', 'fa-tab-stats',
]);

/**
 * @param {string} action
 * @param {HTMLElement} target
 * @param {{ openAnalyticsView: (ctx: string) => void }} ctx
 */
export function handleFastingClickAction(action, target, ctx) {
  const { openAnalyticsView } = ctx;

  if (action === 'fast-start') {
    const goalEl = document.getElementById('fastingGoalSelect') ?? document.getElementById('fastingSheetGoalSelect');
    const goal = goalEl ? parseInt(/** @type {HTMLInputElement} */(goalEl).value, 10) : (appState.fastingSession?.goal ?? appState.settings?.fastingDefault ?? 16);
    startFast(appState, goal, () => saveStateToLocalStorage(true));
    renderHome();
    openFastingDetail();
  }
  else if (action === 'fast-stop') {
    stopFast(appState, () => saveStateToLocalStorage(true));
    closeFastingDetail();
    renderHome();
  }
  else if (action === 'fast-set-protocol') {
    // DOM-only: pick a protocol before starting. The hidden goal input feeds
    // fast-start; no state is written until the fast actually begins.
    const goal = target.dataset.goal;
    const input = /** @type {HTMLInputElement} */ (document.getElementById('fastingSheetGoalSelect'));
    if (input && goal) input.value = goal;
    document.querySelectorAll('.fasting-chip').forEach(c =>
      c.classList.toggle('fasting-chip--active', c === target));
    const caution = document.getElementById('fastingProtocolCaution');
    if (caution) caution.style.display = target.dataset.caution === '1' ? '' : 'none';
  }
  else if (action === 'fast-edit-start-time') {
    const sp = document.getElementById('fastingEditStartPanel');
    const ep = document.getElementById('fastingEditEndPanel');
    if (ep) ep.style.display = 'none';
    if (sp) sp.style.display = sp.style.display === 'none' ? '' : 'none';
  }
  else if (action === 'fast-cancel-edit-start') {
    const panel = document.getElementById('fastingEditStartPanel');
    if (panel) panel.style.display = 'none';
  }
  else if (action === 'fast-save-start-time') {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('fastingStartTimeInput'));
    if (input?.value) {
      editFastStartTime(appState, input.value, () => saveStateToLocalStorage(true));
      openFastingDetail();
      renderHome();
    }
  }
  else if (action === 'fast-edit-end-time') {
    const sp = document.getElementById('fastingEditStartPanel');
    const ep = document.getElementById('fastingEditEndPanel');
    if (sp) sp.style.display = 'none';
    if (ep) ep.style.display = ep.style.display === 'none' ? '' : 'none';
  }
  else if (action === 'fast-cancel-edit-end') {
    const panel = document.getElementById('fastingEditEndPanel');
    if (panel) panel.style.display = 'none';
  }
  else if (action === 'fast-save-end-time') {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('fastingEndTimeInput'));
    if (input?.value) {
      stopFastAtTime(appState, input.value, () => saveStateToLocalStorage(true));
      closeFastingDetail();
      renderHome();
    }
  }
  else if (action === 'open-fasting-detail')   { openFastingDetail(); }
  else if (action === 'close-fasting-detail')  { closeFastingDetail(); }
  else if (action === 'open-fasting-analytics') { closeFastingDetail(); openAnalyticsView('fasting'); }
  else if (action === 'open-fasting-education') {
    // Deep-link the "Fasting Knowledge" section, which now lives in the Stats tab.
    closeFastingDetail();
    import('../analytics/views/view-fasting.js').then(m => {
      m.setFastingTab('stats');
      openAnalyticsView('fasting');
      setTimeout(() => document.getElementById('fa-edu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    });
  }
  else if (action === 'fa-tab-overview' || action === 'fa-tab-stats') {
    import('../analytics/views/view-fasting.js').then(m => m.handleFastingTabAction(action, () => appState));
  }
  else if (action === 'fast-edit-history') {
    const idx = parseInt(target.dataset.index, 10);
    openHistoryEditPanel(idx, appState);
  }
  else if (action === 'fast-save-history') {
    const idx = parseInt(target.dataset.index, 10);
    const startInput = /** @type {HTMLInputElement} */ (document.getElementById('fhrEditStart'));
    const endInput   = /** @type {HTMLInputElement} */ (document.getElementById('fhrEditEnd'));
    if (startInput && endInput) {
      const ok = editHistoryFast(appState, idx, startInput.value, endInput.value, () => saveStateToLocalStorage(true));
      if (ok) { closeHistoryEditPanel(); openFastingDetail(); }
    }
  }
  else if (action === 'fast-cancel-history-edit') { closeHistoryEditPanel(); }
  else if (action === 'fa-edu-cat' || action === 'fa-edu-article' || action === 'fa-edu-back') {
    import('../analytics/views/view-fasting.js').then(m => m.handleFastingEduAction(action, target, () => appState));
  }
  else if (action === 'fa-cal-prev' || action === 'fa-cal-next') {
    import('../analytics/views/view-fasting.js').then(m => m.handleFastingCalAction(action, () => appState));
  }
}
