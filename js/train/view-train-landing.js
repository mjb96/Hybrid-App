// @ts-check
// =============================================================================
// TRAIN LANDING VIEW (js/train/view-train-landing.js) — roadmap Phase 0/2
//
// Renders the Train landing: one dominant Today card with a single primary
// action, the quick starts that were previously hidden behind a sheet, and the
// recent activity that was not on this screen at all.
//
// Presentation only — every value comes from buildTrainLanding.
// =============================================================================

import { esc } from '../analytics/views/screen-kit.js';
import { icon } from '../ui/icons.js';

function todayCardHTML(today, resumable) {
  const primary = today.primary;
  const secondary = today.secondary;

  const primaryAttrs = primary
    ? `data-action="${esc(primary.action)}"${primary.target ? ` data-target="${esc(primary.target)}"` : ''}${primary.day ? ` data-day="${esc(primary.day)}"` : ''}`
    : '';

  return `<article class="tl-today tl-today--${esc(today.tone || 'quiet')}">
    <div class="tl-today__eyebrow">${esc(today.eyebrow || 'Today')}${resumable ? '<span class="tl-today__pip" aria-hidden="true"></span>' : ''}</div>
    <h2 class="tl-today__title">${esc(today.title || 'Today')}</h2>
    ${today.meta ? `<p class="tl-today__meta">${esc(today.meta)}</p>` : ''}
    ${today.guidance ? `<p class="tl-today__guidance">${esc(today.guidance)}</p>` : ''}
    ${primary ? `<button type="button" class="tl-today__primary" ${primaryAttrs}>${esc(primary.label)}</button>` : ''}
    ${secondary ? `<button type="button" class="tl-today__secondary" data-action="${esc(secondary.action)}"${secondary.target ? ` data-target="${esc(secondary.target)}"` : ''}${secondary.day ? ` data-day="${esc(secondary.day)}"` : ''}>${esc(secondary.label)}</button>` : ''}
  </article>`;
}

function quickStartHTML(actions) {
  return `<section class="tl-section" aria-labelledby="trainQuickStartTitle">
    <h3 id="trainQuickStartTitle" class="tl-section__title">Start something else</h3>
    <div class="tl-quick">
      ${actions.map((item) => `<button type="button" class="tl-quick__item" data-action="${esc(item.action)}" aria-label="${esc(item.hint)}">
        <span class="tl-quick__icon">${icon(item.icon, { size: 20 })}</span>
        <span class="tl-quick__label">${esc(item.label)}</span>
      </button>`).join('')}
    </div>
  </section>`;
}

function recentHTML(recent, hasHistory) {
  if (!hasHistory) {
    return `<section class="tl-section" aria-labelledby="trainRecentTitle">
      <h3 id="trainRecentTitle" class="tl-section__title">Recent</h3>
      <p class="tl-empty">Nothing logged yet. Your finished sessions appear here, newest first.</p>
    </section>`;
  }
  return `<section class="tl-section" aria-labelledby="trainRecentTitle">
    <div class="tl-section__head">
      <h3 id="trainRecentTitle" class="tl-section__title">Recent</h3>
      <button type="button" class="tl-section__more" data-action="open-analytics" data-context="activity">All activity →</button>
    </div>
    <div class="tl-recent">
      ${recent.map((row) => `<button type="button" class="tl-recent__row" data-action="open-activity-detail" data-activity-id="${esc(row.id)}">
        <span class="tl-recent__body">
          <span class="tl-recent__title">${esc(row.title)}</span>
          <span class="tl-recent__meta">${esc(row.dateLabel)}${row.subtitle ? ` · ${esc(row.subtitle)}` : ''}</span>
        </span>
        <span class="tl-recent__arrow" aria-hidden="true">›</span>
      </button>`).join('')}
    </div>
  </section>`;
}

/**
 * @param {HTMLElement|null} container
 * @param {ReturnType<import('./train-landing.js').buildTrainLanding>} model
 */
export function renderTrainLanding(container, model) {
  if (!container || !model) return;
  container.innerHTML = `
    <div class="tl-head">
      <span class="tl-kicker">Train</span>
    </div>
    ${todayCardHTML(model.today, model.resumable)}
    ${quickStartHTML(model.quickStart)}
    ${recentHTML(model.recent, model.hasHistory)}`;
}
