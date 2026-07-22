// @ts-check
import {
  buildGymPerformance,
  GYM_PERFORMANCE_METRICS,
  GYM_PERFORMANCE_RANGES,
} from '../gym-performance.js';
import { formatStrengthDuration } from '../../strength/duration.js';
import { esc } from './screen-kit.js';

/** @type {'7d'|'4w'|'1y'} */
let selectedRange = '7d';
/** @type {'time'|'sessions'|'sets'|'volume'} */
let selectedMetric = 'time';
const offsets = new Map([['7d', 0], ['4w', 0], ['1y', 0]]);
const selectedBins = new Map();

function dateLabel(date, full = false) {
  if (!date) return 'Date unavailable';
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime()) ? date : value.toLocaleDateString(undefined,
    full ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' });
}

function periodLabel(model) {
  if (model.range === '1y') return String(model.period.start).slice(0, 4);
  return `${dateLabel(model.period.start)} – ${dateLabel(model.period.end)}`;
}

function binLabel(bin, range) {
  const value = new Date(`${bin.start}T12:00:00`);
  if (Number.isNaN(value.getTime())) return bin.start;
  if (range === '1y') return value.toLocaleDateString(undefined, { month: 'short' });
  if (range === '7d') return value.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
  return value.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function comparisonHTML(model) {
  const comparison = model.comparison;
  if (!comparison.isComparable) return `<p class="gym-performance__comparison is-muted">${esc(comparison.message)}</p>`;
  const arrow = comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '→';
  return `<p class="gym-performance__comparison"><strong>${arrow} ${Math.abs(comparison.percentageChange)}%</strong><span>${esc(comparison.comparisonLabel)}</span></p>`;
}

function chartHTML(model, selectedKey) {
  const max = Math.max(1, ...model.bins.map((bin) => Number(bin.value) || 0));
  return `<div class="gym-performance__chart" style="--gym-bin-count:${model.bins.length}" role="group" aria-label="${esc(GYM_PERFORMANCE_METRICS.find((item) => item.id === model.metric)?.label || 'Gym')} history">
    ${model.bins.map((bin) => {
      const active = bin.key === selectedKey;
      const height = bin.value > 0 ? Math.max(8, (Number(bin.value) / max) * 100) : 2;
      return `<button type="button" class="gym-performance__bin${active ? ' is-selected' : ''}${bin.isFuture ? ' is-future' : ''}" data-gym-point="${esc(bin.key)}" aria-pressed="${active}" ${bin.isFuture ? 'disabled' : ''} aria-label="${esc(binLabel(bin, model.range))}: ${esc(bin.formatted)}">
        <span class="gym-performance__bin-value">${active ? esc(bin.formatted) : ''}</span>
        <span class="gym-performance__track"><span class="gym-performance__bar" style="--gym-height:${height.toFixed(1)}%"></span></span>
        <span class="gym-performance__bin-label">${esc(binLabel(bin, model.range))}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function evidenceHTML(records, model) {
  if (!records.length) return '<div class="metric-evidence-empty"><strong>No workouts in this part of the period</strong><p>Choose another bar to inspect its activities.</p></div>';
  return `<div class="metric-evidence-list">${[...records].reverse().map((record) => {
    const duration = record.durationSeconds ? formatStrengthDuration(record.durationSeconds) : 'Time not recorded';
    const secondary = [duration, record.workingSets ? `${record.workingSets} sets` : '', record.volume ? `${record.volume.toLocaleString()} ${model.unit}` : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="metric-evidence-row" data-action="open-activity-detail" data-activity-id="${esc(record.id)}" aria-label="Open ${esc(record.title)} from ${esc(dateLabel(record.localDate, true))}">
      <span class="metric-evidence-row__main"><strong>${esc(record.title)}</strong><small>${esc(dateLabel(record.localDate, true))} · ${esc(secondary)}</small></span>
      <span class="metric-evidence-row__metric">View<b aria-hidden="true">›</b></span>
    </button>`;
  }).join('')}</div>`;
}

export function renderGymPerformance(state) {
  const root = document.getElementById('gymPerformanceDetail');
  if (!root) return;
  const paint = () => {
    const offset = offsets.get(selectedRange) || 0;
    const model = buildGymPerformance(state, { range: selectedRange, metric: selectedMetric, offset });
    const selectionId = `${selectedRange}:${offset}:${selectedMetric}`;
    let selectedKey = selectedBins.get(selectionId);
    if (!model.bins.some((bin) => bin.key === selectedKey && !bin.isFuture)) {
      selectedKey = [...model.bins].reverse().find((bin) => bin.records.length)?.key
        || [...model.bins].reverse().find((bin) => !bin.isFuture)?.key
        || null;
      if (selectedKey) selectedBins.set(selectionId, selectedKey);
    }
    const selected = model.bins.find((bin) => bin.key === selectedKey) || null;
    const coverage = model.recordCount
      ? `Duration recorded for ${model.durationKnown} of ${model.recordCount} ${model.recordCount === 1 ? 'workout' : 'workouts'}`
      : 'No gym workouts in this period';
    const excluded = [model.exclusions.future ? `${model.exclusions.future} future` : '', model.exclusions.undated ? `${model.exclusions.undated} undated` : ''].filter(Boolean).join(' · ');
    root.innerHTML = `<div class="gym-performance">
      <header class="metric-detail__header gym-performance__header">
        <span class="metric-detail__eyebrow">Gym activity</span><h2>Gym Performance</h2>
        <div class="gym-performance__period-nav"><button type="button" data-gym-period="-1" aria-label="Previous period">‹</button><strong>${esc(periodLabel(model))}</strong><button type="button" data-gym-period="1" aria-label="Next period" ${model.canGoNext ? '' : 'disabled'}>›</button></div>
        <div class="metric-detail__value">${esc(model.formattedTotal)}</div>
        <p>${model.recordCount} ${model.recordCount === 1 ? 'workout' : 'workouts'} in this period</p>
      </header>
      <div class="gym-performance__controls">
        <div class="metric-range" role="group" aria-label="Time range">${GYM_PERFORMANCE_RANGES.map((item) => `<button type="button" data-gym-range="${item.id}" aria-pressed="${item.id === selectedRange}" class="${item.id === selectedRange ? 'is-selected' : ''}">${item.label}</button>`).join('')}</div>
        <div class="metric-range" role="group" aria-label="Gym metric">${GYM_PERFORMANCE_METRICS.map((item) => `<button type="button" data-gym-metric="${item.id}" aria-pressed="${item.id === selectedMetric}" class="${item.id === selectedMetric ? 'is-selected' : ''}">${item.label}</button>`).join('')}</div>
      </div>
      ${comparisonHTML(model)}
      <section class="metric-detail__section" aria-labelledby="gymPerformanceChartTitle"><div class="metric-detail__section-head"><div><span>History</span><h3 id="gymPerformanceChartTitle">${esc(GYM_PERFORMANCE_METRICS.find((item) => item.id === selectedMetric)?.label || 'Time')}</h3></div></div>
        ${chartHTML(model, selectedKey)}${selected ? `<div class="metric-point-summary"><strong>${esc(selected.formatted)}</strong><span>${esc(dateLabel(selected.start, true))}${selected.end !== selected.start ? ` – ${esc(dateLabel(selected.end, true))}` : ''}</span></div>` : ''}
      </section>
      <section class="metric-detail__section" aria-labelledby="gymPerformanceEvidenceTitle"><div class="metric-detail__section-head"><div><span>Evidence</span><h3 id="gymPerformanceEvidenceTitle">Contributing workouts</h3></div></div>${evidenceHTML(selected?.records || [], model)}</section>
      <details class="metric-method"><summary>How this is calculated</summary><p>Totals use every dated gym or strength activity in the selected calendar period, including archived programs and independent workouts. Warm-ups do not count as working sets or volume.</p><dl><div><dt>Duration coverage</dt><dd>${esc(coverage)}.</dd></div><div><dt>Excluded</dt><dd>${esc(excluded || 'No future or undated activities found.')}</dd></div></dl></details>
    </div>`;
    root.querySelectorAll('[data-gym-range]').forEach((button) => button.addEventListener('click', () => {
      const value = button.getAttribute('data-gym-range');
      selectedRange = value === '4w' || value === '1y' ? value : '7d'; paint();
    }));
    root.querySelectorAll('[data-gym-metric]').forEach((button) => button.addEventListener('click', () => {
      const value = button.getAttribute('data-gym-metric');
      selectedMetric = value === 'sessions' || value === 'sets' || value === 'volume' ? value : 'time'; paint();
    }));
    root.querySelectorAll('[data-gym-period]').forEach((button) => button.addEventListener('click', () => {
      const delta = Number(button.getAttribute('data-gym-period')) || 0;
      offsets.set(selectedRange, Math.min(0, (offsets.get(selectedRange) || 0) + delta)); paint();
    }));
    root.querySelectorAll('[data-gym-point]').forEach((button) => button.addEventListener('click', () => {
      selectedBins.set(selectionId, button.getAttribute('data-gym-point')); paint();
    }));
  };
  paint();
}
