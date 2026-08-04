// @ts-check
// Metric-specific Running detail: range, inspectable history, comparison,
// calculation disclosure and exact Activity Detail evidence.
import { buildRunningMetricDetail, collectRunningHistory } from '../running-detail.js';
import { esc } from './screen-kit.js';
import { metricMethodHTML } from './metric-contract.js';

const rangeByMetric = new Map();
const selectedPointByMetric = new Map();

/** @param {string} date @param {Intl.DateTimeFormatOptions} [options] */
function dateLabel(date, options = { day: 'numeric', month: 'short' }) {
  if (!date) return 'Date unavailable';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, options);
}

function fullDateLabel(date) {
  return dateLabel(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function comparisonHTML(model) {
  const comparison = model.comparison;
  if (!comparison) return '<p class="metric-detail__muted">No honest previous-period comparison is available for this scope.</p>';
  if (!comparison.isComparable) return `<p class="metric-detail__muted">${esc(comparison.message || 'Not enough previous data to compare')}.</p>`;
  const pct = Math.abs(comparison.percentageChange || 0);
  const arrow = comparison.absoluteChange > 0 ? '↑' : comparison.absoluteChange < 0 ? '↓' : '→';
  const tone = comparison.absoluteChange === 0 ? 'neutral' : comparison.favorable ? 'good' : 'caution';
  return `<div class="metric-comparison metric-comparison--${tone}">
    <strong>${arrow} ${pct}%</strong>
    <span>${esc(comparison.comparisonLabel)} · previous ${esc(String(comparison.previousStart))} – ${esc(String(comparison.previousEnd))}</span>
  </div>`;
}

function dailyBreakdownHTML(model) {
  if (!model.dailyBreakdown?.length) return '';
  return `<section class="metric-detail__section" aria-labelledby="runningMetricDailyTitle">
    <div class="metric-detail__section-head"><div><span>Selected week</span><h3 id="runningMetricDailyTitle">Daily breakdown</h3></div></div>
    <div class="metric-daily-strip" role="list">
      ${model.dailyBreakdown.map((day) => `<div class="metric-daily-strip__day${day.upcoming ? ' is-upcoming' : ''}" role="listitem">
        <span>${esc(dateLabel(day.date, { weekday: 'short' }))}</span>
        <strong>${esc(day.formatted)}</strong>
      </div>`).join('')}
    </div>
  </section>`;
}

function hasDiscreteBars(model) {
  return ['distance', 'duration', 'duration-minutes', 'count', 'elevation', 'load'].includes(model.definition.unit)
    && !['running.form'].includes(model.metricId);
}

function chartHTML(model, selectedKey) {
  const points = model.series.filter((point) => point.value != null && Number.isFinite(Number(point.value)));
  const hasHistoricalEvidence = model.series.some((point) => point.evidence?.length);
  if (!points.length || (model.empty && !hasHistoricalEvidence)) {
    return `<div class="metric-chart-empty"><strong>No historical series yet</strong><p>${esc(model.definition.empty)}</p></div>`;
  }
  const values = points.map((point) => Number(point.value));
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const aria = `${model.definition.label} history for ${model.rangeOptions.find((entry) => entry.id === model.range)?.label || model.range}`;

  if (hasDiscreteBars(model)) {
    return `<div class="metric-bars" role="group" aria-label="${esc(aria)}">
      ${points.map((point) => {
        const height = Math.max(point.value === 0 ? 2 : 10, ((Number(point.value) - Math.min(0, min)) / span) * 100);
        const active = point.key === selectedKey;
        return `<button type="button" class="metric-bars__point${active ? ' is-selected' : ''}" data-metric-point="${esc(point.key)}" aria-pressed="${active}" aria-label="Week of ${esc(fullDateLabel(point.weekStart))}: ${esc(point.formatted)}">
          <span class="metric-bars__value">${active ? esc(point.formatted) : ''}</span>
          <span class="metric-bars__track"><span class="metric-bars__bar" style="--metric-height:${height.toFixed(1)}%;--metric-color:${model.definition.color}"></span></span>
          <span class="metric-bars__label">${esc(dateLabel(point.weekStart))}</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  const width = 600, height = 190, padX = 24, padY = 20;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((Number(point.value) - min) / span) * (height - padY * 2);
    return { ...point, x, y };
  });
  const polyline = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  return `<div class="metric-line" role="group" aria-label="${esc(aria)}">
    <svg class="metric-line__svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" class="metric-line__axis"/>
      ${coords.length > 1 ? `<polyline points="${polyline}" fill="none" stroke="${model.definition.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    </svg>
    <div class="metric-line__points" aria-hidden="true">
      ${coords.map((point) => `<span class="metric-line__dot" style="--metric-x:${(point.x / width * 100).toFixed(2)}%;--metric-y:${(point.y / height * 100).toFixed(2)}%;--metric-color:${model.definition.color}"></span>`).join('')}
    </div>
    <div class="metric-line__inspectors">
      ${coords.map((point) => {
        const active = point.key === selectedKey;
        return `<button type="button" class="metric-line__point${active ? ' is-selected' : ''}" data-metric-point="${esc(point.key)}" aria-pressed="${active}" aria-label="Week of ${esc(fullDateLabel(point.weekStart))}: ${esc(point.formatted)}">
          <span>${esc(dateLabel(point.weekStart))}</span>${active ? `<strong>${esc(point.formatted)}</strong>` : ''}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function evidenceHTML(model, point) {
  const evidence = point ? (point.evidence || []) : model.contributing;
  const period = point ? `${fullDateLabel(point.weekStart)} – ${fullDateLabel(point.weekEnd)}` : model.period.label;
  if (!evidence.length) {
    return `<div class="metric-evidence-empty"><strong>No contributing activities in ${esc(period)}</strong><p>Choose another chart point or log the required source data.</p></div>`;
  }
  return `<div class="metric-evidence-list">
    ${evidence.slice(-50).reverse().map((record) => `<button type="button" class="metric-evidence-row" data-action="open-activity-detail" data-activity-id="${esc(record.activityId)}" aria-label="Open ${esc(record.title)} from ${esc(fullDateLabel(record.date))}">
      <span class="metric-evidence-row__main"><strong>${esc(record.title)}</strong><small>${esc(fullDateLabel(record.date))} · ${esc(record.sourceLabel)}</small></span>
      <span class="metric-evidence-row__metric">${record.distanceKm > 0 ? `${record.distanceKm.toFixed(2)} km` : 'View'}<b aria-hidden="true">›</b></span>
    </button>`).join('')}
  </div>`;
}

function racePredictionsHTML(model) {
  const predictions = model.racePredictions;
  if (!predictions) return '';
  return `<div class="metric-projection-grid">
    ${Object.values(predictions).map((race) => `<div><span>${esc(race.dist)}</span><strong>${esc(race.time)}</strong><small>${esc(race.pace)}</small></div>`).join('')}
  </div>`;
}

export function renderRunningMetricDetail(state, entity = {}) {
  const container = document.getElementById('runningMetricDetail');
  if (!container) return;
  const metricId = entity.id || '';
  const history = collectRunningHistory(state);
  let range = rangeByMetric.get(metricId) || '12w';

  const paint = () => {
    const model = buildRunningMetricDetail(state, metricId, { range, history });
    if (!model) {
      container.innerHTML = '<div class="metric-chart-empty"><strong>Metric unavailable</strong><p>This running metric is not registered.</p></div>';
      return;
    }
    const hasHistoricalEvidence = model.series.some((point) => point.evidence?.length);
    const selectable = model.empty && !hasHistoricalEvidence
      ? []
      : model.series.filter((point) => point.value != null && Number.isFinite(Number(point.value)));
    let selectedKey = selectedPointByMetric.get(metricId);
    if (!selectable.some((point) => point.key === selectedKey)) {
      selectedKey = [...selectable].reverse().find((point) => point.evidence?.length)?.key || selectable[selectable.length - 1]?.key || null;
      if (selectedKey) selectedPointByMetric.set(metricId, selectedKey);
    }
    const selectedPoint = model.series.find((point) => point.key === selectedKey) || null;
    // Pace-derived metrics exclude activities without usable pace; that
    // category is running-specific, so it is passed to the shared footer
    // rather than being dropped by it.
    const paceIneligible = model.exclusions.paceIneligible
      && ['running.average-pace', 'running.best-pace', 'running.vdot', 'running.fitness-trend'].includes(metricId)
      ? [`${model.exclusions.paceIneligible} pace-ineligible`]
      : [];

    container.innerHTML = `
      <header class="metric-detail__header">
        <span class="metric-detail__eyebrow">Running metric</span>
        <h2>${esc(model.definition.label)}</h2>
        <div class="metric-detail__value" style="color:${model.definition.color}">${esc(model.formattedValue)}</div>
        <div class="metric-detail__period"><strong>${esc(model.period.status)}</strong><span>${esc(model.period.label)}</span></div>
        <p>${esc(model.interpretation)}</p>
      </header>
      ${comparisonHTML(model)}
      ${dailyBreakdownHTML(model)}
      ${racePredictionsHTML(model)}
      <section class="metric-detail__section" aria-labelledby="runningMetricHistoryTitle">
        <div class="metric-detail__section-head">
          <div><span>History</span><h3 id="runningMetricHistoryTitle">${esc(model.rangeOptions.find((entry) => entry.id === model.range)?.label || '12 weeks')}</h3></div>
          <div class="metric-range" role="group" aria-label="History range">
            ${model.rangeOptions.map((option) => `<button type="button" data-metric-range="${option.id}" aria-pressed="${option.id === model.range}" class="${option.id === model.range ? 'is-selected' : ''}">${esc(option.label)}</button>`).join('')}
          </div>
        </div>
        ${chartHTML(model, selectedKey)}
        ${selectedPoint ? `<div class="metric-point-summary"><strong>${esc(selectedPoint.formatted)}</strong><span>Week of ${esc(fullDateLabel(selectedPoint.weekStart))}</span></div>` : ''}
      </section>
      <section class="metric-detail__section" aria-labelledby="runningMetricEvidenceTitle">
        <div class="metric-detail__section-head"><div><span>Evidence</span><h3 id="runningMetricEvidenceTitle">Contributing activities</h3></div></div>
        ${evidenceHTML(model, selectedPoint)}
      </section>
      ${metricMethodHTML({
        metricId: model.metricId,
        calculation: model.definition.calculation,
        source: model.dataSource,
        confidence: model.confidence,
        recordCount: model.recordCount,
        recordNoun: 'independent activity',
        recordNounPlural: 'independent activities',
        exclusions: model.exclusions,
        extraExclusions: paceIneligible,
        limitations: model.definition.limitations,
      })}`;

    container.querySelectorAll('[data-metric-range]').forEach((button) => {
      button.addEventListener('click', () => {
        range = button.getAttribute('data-metric-range') || '12w';
        rangeByMetric.set(metricId, range);
        selectedPointByMetric.delete(metricId);
        paint();
      });
    });
    container.querySelectorAll('[data-metric-point]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedPointByMetric.set(metricId, button.getAttribute('data-metric-point'));
        paint();
      });
    });
  };

  paint();
}
