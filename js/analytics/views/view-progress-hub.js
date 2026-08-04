// @ts-check
// =============================================================================
// PROGRESS HUB VIEW (analytics/views/view-progress-hub.js) — roadmap Phase 3A
//
// Renders the Progress landing model as four domain cards, each answering the
// roadmap's ordered questions on the surface itself: what the headline is, how
// it compares, what it means, and where the evidence lives. Secondary
// destinations keep their entry points but lose equal visual weight.
//
// Presentation only — every number comes from buildProgressLanding.
// =============================================================================

import { esc, spark } from './screen-kit.js';
import { icon } from '../../ui/icons.js';

const DOMAIN_ICON = {
  consistency: 'calendar',
  strength: 'dumbbell',
  running: 'activity',
  recovery: 'heart',
};

// Semantic, and deliberately restrained: a down week is information, not danger.
// Red stays reserved for destructive actions and genuine warnings (roadmap §6).
const TONE_COLOR = {
  up: 'var(--color-green, #10b981)',
  down: 'var(--color-amber, #f59e0b)',
  flat: 'var(--text-muted)',
  none: 'var(--text-muted)',
};

const TONE_GLYPH = { up: '↑', down: '↓', flat: '→', none: '' };

function domainCard(domain) {
  const { headline, delta, support, interpretation } = domain;
  const tone = delta?.tone || 'none';
  const glyph = TONE_GLYPH[tone] || '';

  const deltaHTML = delta
    ? `<p class="ph-card__delta" style="color:${TONE_COLOR[tone]}">${glyph ? `<span aria-hidden="true">${glyph}</span> ` : ''}${esc(delta.text)}</p>`
    : '';

  const supportHTML = support ? `<p class="ph-card__support">${esc(support)}</p>` : '';

  // spark() returns '' with fewer than two real points, so a sparse domain
  // shows no line rather than a misleading flat one. The label is what makes
  // the shape readable — a line with no stated period explains nothing.
  const sparkSVG = domain.trend ? spark(domain.trend.values, TONE_COLOR[tone] === TONE_COLOR.none ? 'var(--color-blue, #3b82f6)' : TONE_COLOR[tone]) : '';
  const trendHTML = sparkSVG
    ? `<span class="ph-card__trend">${sparkSVG}<small>${esc(domain.trend.label)}</small></span>`
    : '';

  return `<button type="button" class="ph-card${domain.empty ? ' ph-card--empty' : ''}"
      data-action="open-analytics" data-context="${esc(domain.context)}" data-parent-context="hub"
      aria-label="${esc(domain.title)}: ${esc(headline.value)}${headline.unit ? ` ${esc(headline.unit)}` : ''}. ${esc(interpretation)}">
    <span class="ph-card__head">
      <span class="ph-card__icon">${icon(DOMAIN_ICON[domain.id] || 'gauge', { size: 18 })}</span>
      <span class="ph-card__title">${esc(domain.title)}</span>
      <span class="ph-card__arrow" aria-hidden="true">→</span>
    </span>
    <span class="ph-card__value">${esc(headline.value)}${headline.unit ? `<span class="ph-card__unit">${esc(headline.unit)}</span>` : ''}</span>
    ${deltaHTML}
    ${trendHTML}
    ${supportHTML}
    <p class="ph-card__say">${esc(interpretation)}</p>
  </button>`;
}

function secondaryRow(entry) {
  return `<button type="button" class="hub-link hub-link--quiet"
      data-action="open-analytics" data-context="${esc(entry.id)}" data-parent-context="hub">
    <span class="hub-link__label">
      <span class="hub-link__title">${esc(entry.title)}</span>
      <span class="hub-link__desc">${esc(entry.desc)}</span>
    </span>
    <span class="hub-link__arrow" aria-hidden="true">→</span>
  </button>`;
}

/**
 * @param {HTMLElement|null} container
 * @param {ReturnType<import('../progress-landing.js').buildProgressLanding>} model
 */
export function renderProgressHub(container, model) {
  if (!container || !model) return;

  const intro = model.allEmpty
    ? `<p class="ph-empty">Nothing is logged yet. Finish a workout or a run and this page starts explaining what changed, and why.</p>`
    : '';

  container.innerHTML = `
    <div class="hub-head">
      <h2 class="hub-title">Progress</h2>
      <p class="hub-sub">${esc(model.periodLabel)} · ${esc(model.weekStart)} to ${esc(model.weekEnd)}</p>
    </div>
    ${intro}
    <div class="ph-grid">${model.domains.map(domainCard).join('')}</div>
    <h3 class="section-header mt-4">More detail</h3>
    <div class="hub-group">${model.secondary.map(secondaryRow).join('')}</div>
    <details class="an-method mt-3">
      <summary>How this page is calculated</summary>
      <p>Every figure here covers one <strong>calendar</strong> week (Monday to Sunday), attributed by the real date each session was logged — not by your program week counter, so an archived program's sessions still count towards the week they happened in.</p>
      <p>A part-finished week is only ever compared with the same elapsed days of the previous week, so a Tuesday is never measured against a full seven days. Strength comparisons are same-exercise only. Estimates are labelled as estimates.</p>
    </details>`;
}
