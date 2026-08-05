// @ts-check
// =============================================================================
// RECOVERY METRIC DETAIL VIEW (analytics/views/view-recovery-metric.js) — 3D
//
// The Recovery domain's first inspectable screens. Uses the shared Phase 3C
// contract footer, so sleep/HRV/resting-HR details state Source, Confidence,
// "How to read it", Included history and Excluded exactly like Running and
// Strength — one implementation, not a fourth hand-rolled copy.
//
// The one thing this view must not get wrong: for resting heart rate and
// soreness a DOWNWARD move is the good one. It reads `comparison.favourable`
// from the model rather than colouring by direction, so "↓ 9%" is green on
// resting HR and amber on sleep.
// =============================================================================

import { esc } from './screen-kit.js';
import { metricMethodHTML } from './metric-contract.js';
import {
  buildRecoveryMetricDetail, formatRecoveryValue, RECOVERY_RANGE_OPTIONS,
} from '../recovery-detail.js';

/** @type {Map<string,string>} */
const ranges = new Map();

/** @type {Intl.DateTimeFormatOptions} */
const SHORT_DATE = { day: 'numeric', month: 'short' };
/** @type {Intl.DateTimeFormatOptions} */
const FULL_DATE = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

/** @param {string} iso @param {Intl.DateTimeFormatOptions} [opts] */
const dateLabel = (iso, opts = SHORT_DATE) => {
  const value = new Date(`${iso}T12:00:00`);
  return Number.isNaN(value.getTime()) ? String(iso) : value.toLocaleDateString(undefined, opts);
};

function comparisonHTML(model) {
  const c = model.comparison;
  if (!c) return '';
  if (!c.isComparable) {
    return `<p class="metric-detail__muted">${esc(c.message || 'Not enough previous data to compare')}.</p>`;
  }
  const pct = Math.abs(c.percentageChange || 0);
  const arrow = c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : '→';
  // Tone comes from `favourable`, never from direction — down is GOOD for
  // resting HR and soreness, and colouring by direction would invert them.
  const tone = c.favourable == null ? 'neutral' : c.favourable ? 'good' : 'caution';
  return `<div class="metric-comparison metric-comparison--${tone}">
    <strong>${arrow} ${pct}%</strong>
    <span>vs previous ${esc(String(c.previousStart))} – ${esc(String(c.previousEnd))}</span>
  </div>`;
}

function chartHTML(model) {
  const points = model.series.filter((p) => Number.isFinite(Number(p.value)));
  if (points.length < 2) {
    return `<div class="metric-chart-empty"><strong>Not enough readings yet</strong><p>${esc(model.definition.empty)}</p></div>`;
  }
  const values = points.map((p) => Number(p.value));
  const max = Math.max(...values);
  const min = Math.min(...values);
  // Recovery values rarely start at zero (a 50bpm resting HR is not "half" of
  // 100), so the axis is framed on the observed range with a little padding —
  // a zero-based axis would flatten every meaningful movement.
  const span = (max - min) || 1;
  const pad = span * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const w = 100;
  const h = 34;
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? 0 : (i / (points.length - 1)) * w;
    const y = h - ((Number(p.value) - lo) / (hi - lo)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<div class="rm-chart">
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img"
         aria-label="${esc(model.definition.label)} across ${points.length} readings, from ${esc(formatRecoveryValue(model.definition, min))} to ${esc(formatRecoveryValue(model.definition, max))}">
      <polyline points="${coords}" fill="none" stroke="${esc(model.definition.color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="rm-chart__axis">
      <span>${esc(dateLabel(points[0].date))}</span>
      <span>${esc(dateLabel(points[points.length - 1].date))}</span>
    </div>
    <div class="rm-chart__range">
      <span>Low ${esc(formatRecoveryValue(model.definition, min))}</span>
      <span>High ${esc(formatRecoveryValue(model.definition, max))}</span>
    </div>
  </div>`;
}

function evidenceHTML(model) {
  if (!model.contributing.length) {
    return `<div class="metric-evidence-empty"><strong>No readings in this period</strong><p>${esc(model.definition.empty)}</p></div>`;
  }
  return `<div class="metric-evidence-list">
    ${model.contributing.slice(0, 30).map((row) => `<div class="metric-evidence-row metric-evidence-row--static">
      <span class="metric-evidence-row__main">
        <strong>${esc(formatRecoveryValue(model.definition, row.value))}</strong>
        <small>${esc(dateLabel(row.date, FULL_DATE))} · ${esc(row.sourceLabel)}</small>
      </span>
    </div>`).join('')}
    ${model.contributing.length > 30 ? `<p class="metric-detail__muted">Showing the 30 most recent of ${model.contributing.length} readings.</p>` : ''}
  </div>`;
}

/**
 * @param {any} state
 * @param {{id?:string, name?:string}} entity
 */
export function renderRecoveryMetricDetail(state, entity) {
  const container = document.getElementById('recoveryMetricDetail');
  if (!container) return;
  const metricId = entity?.id || '';

  const paint = () => {
    const range = ranges.get(metricId) || '4w';
    const model = buildRecoveryMetricDetail(state, metricId, { range });
    if (!model) {
      container.innerHTML = '<div class="metric-chart-empty"><strong>Metric unavailable</strong><p>This recovery metric is not registered.</p></div>';
      return;
    }

    const extraExclusions = model.exclusions.implausible
      ? [`${model.exclusions.implausible} outside a plausible range`]
      : [];

    container.innerHTML = `
      <header class="metric-detail__header">
        <span class="metric-detail__eyebrow">Recovery metric</span>
        <h2>${esc(model.definition.label)}</h2>
        <div class="metric-detail__value" style="color:${esc(model.definition.color)}">${esc(formatRecoveryValue(model.definition, model.value))}</div>
        <div class="metric-detail__period"><strong>${model.readingCount} reading${model.readingCount === 1 ? '' : 's'}</strong><span>${esc(model.period.label)}</span></div>
        <p>${esc(model.interpretation)}</p>
      </header>
      ${comparisonHTML(model)}
      <section class="metric-detail__section" aria-labelledby="recoveryMetricHistoryTitle">
        <div class="metric-detail__section-head">
          <div><span>History</span><h3 id="recoveryMetricHistoryTitle">${esc(RECOVERY_RANGE_OPTIONS.find((r) => r.id === range)?.label || '4 weeks')}</h3></div>
          <div class="metric-range" role="group" aria-label="History range">
            ${RECOVERY_RANGE_OPTIONS.map((r) => `<button type="button" data-recovery-metric-range="${esc(r.id)}" aria-pressed="${r.id === range}" class="${r.id === range ? 'is-selected' : ''}">${esc(r.label)}</button>`).join('')}
          </div>
        </div>
        ${chartHTML(model)}
      </section>
      <section class="metric-detail__section" aria-labelledby="recoveryMetricEvidenceTitle">
        <div class="metric-detail__section-head"><div><span>Evidence</span><h3 id="recoveryMetricEvidenceTitle">Contributing readings</h3></div></div>
        ${evidenceHTML(model)}
      </section>
      ${metricMethodHTML({
        metricId: model.metricId,
        calculation: model.definition.calculation,
        source: model.definition.source,
        confidence: model.definition.confidence,
        recordCount: model.recordCount,
        recordNoun: 'reading',
        exclusions: { future: model.exclusions.future },
        extraExclusions,
        limitations: model.definition.limitations,
      })}`;

    container.querySelectorAll('[data-recovery-metric-range]').forEach((button) => {
      button.addEventListener('click', () => {
        ranges.set(metricId, button.getAttribute('data-recovery-metric-range') || '4w');
        paint();
      });
    });
  };

  paint();
}
