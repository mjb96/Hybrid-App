// @ts-check
import { buildStrengthMetricDetail, collectStrengthHistory } from '../strength-detail.js';
import { esc } from './screen-kit.js';
import { metricMethodHTML } from './metric-contract.js';
import { weightUnitOf } from '../utils.js';

const ranges = new Map();
const selectedPoints = new Map();

function dateLabel(date, full = false) {
  if (!date) return 'Date unavailable';
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime()) ? date : value.toLocaleDateString(undefined,
    full ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

function comparisonHTML(model) {
  const c = model.comparison;
  if (!c) return '<p class="metric-detail__muted">This metric already expresses a period comparison.</p>';
  if (!c.isComparable) return `<p class="metric-detail__muted">${esc(c.message || 'Not enough previous data to compare')}.</p>`;
  const arrow = c.absoluteChange > 0 ? '↑' : c.absoluteChange < 0 ? '↓' : '→';
  return `<div class="metric-comparison metric-comparison--neutral"><strong>${arrow} ${Math.abs(c.percentageChange || 0)}%</strong><span>${esc(c.comparisonLabel)} · ${esc(c.previousStart)} – ${esc(c.previousEnd)}</span></div>`;
}

function chartHTML(model, selectedKey) {
  const points = model.series.filter((point) => point.value != null && Number.isFinite(Number(point.value)));
  const hasHistoricalEvidence = model.series.some((point) => point.evidence.length);
  if (!points.length || (model.empty && !hasHistoricalEvidence)) return `<div class="metric-chart-empty"><strong>No historical series yet</strong><p>${esc(model.definition.empty)}</p></div>`;
  const values = points.map((point) => Number(point.value));
  const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
  if (model.definition.unit === 'percent') {
    const width = 600, height = 190, padX = 24, padY = 20;
    const coords = points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2),
      y: height - padY - ((Number(point.value) - min) / span) * (height - padY * 2),
    }));
    const polyline = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    return `<div class="metric-line" role="group" aria-label="${esc(model.definition.label)} history">
      <svg class="metric-line__svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" class="metric-line__axis"/>
        ${coords.length > 1 ? `<polyline points="${polyline}" fill="none" stroke="${model.definition.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      </svg>
      <div class="metric-line__points" aria-hidden="true">${coords.map((point) => `<span class="metric-line__dot" style="--metric-x:${(point.x / width * 100).toFixed(2)}%;--metric-y:${(point.y / height * 100).toFixed(2)}%;--metric-color:${model.definition.color}"></span>`).join('')}</div>
      <div class="metric-line__inspectors">${coords.map((point) => {
        const active = point.key === selectedKey;
        return `<button type="button" class="metric-line__point${active ? ' is-selected' : ''}" data-strength-metric-point="${esc(point.key)}" aria-pressed="${active}" aria-label="Week of ${esc(dateLabel(point.weekStart, true))}: ${esc(point.formatted)}"><span>${esc(dateLabel(point.weekStart))}</span>${active ? `<strong>${esc(point.formatted)}</strong>` : ''}</button>`;
      }).join('')}</div>
    </div>`;
  }
  return `<div class="metric-bars" role="group" aria-label="${esc(model.definition.label)} history">
    ${points.map((point) => {
      const height = Math.max(point.value === 0 ? 2 : 10, ((Number(point.value) - min) / span) * 100);
      const active = point.key === selectedKey;
      return `<button type="button" class="metric-bars__point${active ? ' is-selected' : ''}" data-strength-metric-point="${esc(point.key)}" aria-pressed="${active}" aria-label="Week of ${esc(dateLabel(point.weekStart, true))}: ${esc(point.formatted)}">
        <span class="metric-bars__value">${active ? esc(point.formatted) : ''}</span>
        <span class="metric-bars__track"><span class="metric-bars__bar" style="--metric-height:${height.toFixed(1)}%;--metric-color:${model.definition.color}"></span></span>
        <span class="metric-bars__label">${esc(dateLabel(point.weekStart))}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function evidenceHTML(records, periodLabel, unit) {
  if (!records.length) return `<div class="metric-evidence-empty"><strong>No contributing workouts in ${esc(periodLabel)}</strong><p>Choose another chart point or log a dated strength workout.</p></div>`;
  return `<div class="metric-evidence-list">${[...records].reverse().slice(0, 50).map((record) =>
    `<button type="button" class="metric-evidence-row" data-action="open-activity-detail" data-activity-id="${esc(record.activityId)}" aria-label="Open ${esc(record.title)} from ${esc(dateLabel(record.date, true))}">
      <span class="metric-evidence-row__main"><strong>${esc(record.title)}</strong><small>${esc(dateLabel(record.date, true))} · ${record.workingSets} working sets</small></span>
      <span class="metric-evidence-row__metric">${Math.round(record.volumeKg).toLocaleString()} ${esc(unit)}<b aria-hidden="true">›</b></span>
    </button>`).join('')}</div>`;
}

export function renderStrengthMetricDetail(state, entity = {}) {
  const container = document.getElementById('strengthMetricDetail');
  if (!container) return;
  const metricId = entity.id || '';
  const history = collectStrengthHistory(state);
  let range = ranges.get(metricId) || '12w';
  const paint = () => {
    const model = buildStrengthMetricDetail(state, metricId, { range, history });
    if (!model) { container.innerHTML = '<div class="metric-chart-empty"><strong>Metric unavailable</strong><p>This Strength metric is not registered.</p></div>'; return; }
    const selectable = model.series.filter((point) => point.value != null && Number.isFinite(Number(point.value)));
    const hasHistoricalEvidence = model.series.some((point) => point.evidence.length);
    let selectedKey = selectedPoints.get(metricId);
    if (model.empty && !hasHistoricalEvidence) {
      selectedKey = null;
      selectedPoints.delete(metricId);
    } else if (!selectable.some((point) => point.key === selectedKey)) {
      selectedKey = [...selectable].reverse().find((point) => point.evidence.length)?.key || selectable[selectable.length - 1]?.key || null;
      if (selectedKey) selectedPoints.set(metricId, selectedKey);
    }
    const selected = model.series.find((point) => point.key === selectedKey) || null;
    const evidence = selected?.evidence || model.contributing;
    const periodLabel = selected ? `week of ${dateLabel(selected.weekStart, true)}` : model.period.label;
    container.innerHTML = `
      <header class="metric-detail__header"><span class="metric-detail__eyebrow">Strength metric</span><h2>${esc(model.definition.label)}</h2>
        <div class="metric-detail__value" style="color:${model.definition.color}">${esc(model.formattedValue)}</div>
        <div class="metric-detail__period"><strong>${esc(model.period.status)}</strong><span>${esc(model.period.label)}</span></div><p>${esc(model.interpretation)}</p></header>
      ${comparisonHTML(model)}
      <section class="metric-detail__section" aria-labelledby="strengthMetricHistoryTitle"><div class="metric-detail__section-head"><div><span>History</span><h3 id="strengthMetricHistoryTitle">${esc(model.rangeOptions.find((item) => item.id === range)?.label || '12 weeks')}</h3></div>
        <div class="metric-range" role="group" aria-label="History range">${model.rangeOptions.map((item) => `<button type="button" data-strength-metric-range="${item.id}" aria-pressed="${item.id === range}" class="${item.id === range ? 'is-selected' : ''}">${esc(item.label)}</button>`).join('')}</div></div>
        ${chartHTML(model, selectedKey)}${selected ? `<div class="metric-point-summary"><strong>${esc(selected.formatted)}</strong><span>Week of ${esc(dateLabel(selected.weekStart, true))}</span></div>` : ''}</section>
      <section class="metric-detail__section" aria-labelledby="strengthMetricEvidenceTitle"><div class="metric-detail__section-head"><div><span>Evidence</span><h3 id="strengthMetricEvidenceTitle">Contributing workouts</h3></div></div>${evidenceHTML(evidence, periodLabel, weightUnitOf(state))}</section>
      ${metricMethodHTML({
        metricId: model.metricId,
        calculation: model.definition.calculation,
        source: model.definition.source,
        // Strength evidence is logged by the athlete rather than measured by a
        // device, so it is stated as such instead of borrowing running's
        // device-confidence vocabulary.
        confidence: 'Logged working sets — depends on accurate weight and rep entry.',
        recordCount: model.recordCount,
        recordNoun: 'strength workout',
        exclusions: model.exclusions,
        limitations: model.definition.limitations,
      })}`;
    container.querySelectorAll('[data-strength-metric-range]').forEach((button) => button.addEventListener('click', () => {
      range = button.getAttribute('data-strength-metric-range') || '12w'; ranges.set(metricId, range); selectedPoints.delete(metricId); paint();
    }));
    container.querySelectorAll('[data-strength-metric-point]').forEach((button) => button.addEventListener('click', () => {
      selectedPoints.set(metricId, button.getAttribute('data-strength-metric-point')); paint();
    }));
  };
  paint();
}
