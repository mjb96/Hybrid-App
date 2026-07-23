// @ts-check
// Run Performance detail — the running counterpart to view-gym-performance.
// Reuses the shared `gym-performance` layout classes so the two Performance
// screens read as one system; only the data source and wording differ.
import {
  buildRunPerformance,
  RUN_PERFORMANCE_METRICS,
  RUN_PERFORMANCE_RANGES,
} from '../run-performance.js';
import { esc } from './screen-kit.js';

/** @type {'7d'|'4w'|'1y'} */
let selectedRange = '7d';
/** @type {'distance'|'time'|'sessions'} */
let selectedMetric = 'distance';
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

function distanceLabel(distanceKm, unit) {
  const distance = unit === 'mi' ? distanceKm * 0.621371 : distanceKm;
  return `${distance.toFixed(distance >= 100 ? 0 : 1)} ${unit}`;
}

function durationLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function paceLabel(paceSecPerKm, unit) {
  if (!(paceSecPerKm > 0)) return '';
  const pace = unit === 'mi' ? paceSecPerKm / 0.621371 : paceSecPerKm;
  const rounded = Math.round(pace);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')} /${unit}`;
}

function comparisonHTML(model) {
  const comparison = model.comparison;
  if (!comparison.isComparable) return `<p class="gym-performance__comparison is-muted">${esc(comparison.message)}</p>`;
  const arrow = comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '→';
  const tone = comparison.favorable === true ? ' is-favorable' : comparison.favorable === false ? ' is-unfavorable' : '';
  return `<p class="gym-performance__comparison${tone}"><strong>${arrow} ${Math.abs(comparison.percentageChange)}%</strong><span>${esc(comparison.comparisonLabel)}</span></p>`;
}

function chartHTML(model, selectedKey) {
  const max = Math.max(1, ...model.bins.map((bin) => Number(bin.value) || 0));
  return `<div class="gym-performance__chart" style="--gym-bin-count:${model.bins.length}" role="group" aria-label="${esc(RUN_PERFORMANCE_METRICS.find((item) => item.id === model.metric)?.label || 'Run')} history">
    ${model.bins.map((bin) => {
      const active = bin.key === selectedKey;
      const height = bin.value > 0 ? Math.max(8, (Number(bin.value) / max) * 100) : 2;
      return `<button type="button" class="gym-performance__bin${active ? ' is-selected' : ''}${bin.isFuture ? ' is-future' : ''}" data-run-point="${esc(bin.key)}" aria-pressed="${active}" ${bin.isFuture ? 'disabled' : ''} aria-label="${esc(binLabel(bin, model.range))}: ${esc(bin.formatted)}">
        <span class="gym-performance__bin-value">${active ? esc(bin.formatted) : ''}</span>
        <span class="gym-performance__track"><span class="gym-performance__bar" style="--gym-height:${height.toFixed(1)}%"></span></span>
        <span class="gym-performance__bin-label">${esc(binLabel(bin, model.range))}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function evidenceHTML(records, model) {
  if (!records.length) return '<div class="metric-evidence-empty"><strong>No runs in this part of the period</strong><p>Choose another bar to inspect its activities.</p></div>';
  return `<div class="metric-evidence-list">${[...records].reverse().map((record) => {
    const secondary = [
      distanceLabel(record.distanceKm, model.unit),
      record.durationSec ? durationLabel(record.durationSec) : 'Time not recorded',
      paceLabel(record.paceSecPerKm, model.unit),
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="metric-evidence-row" data-action="open-activity-detail" data-activity-id="${esc(record.activityId)}" aria-label="Open ${esc(record.title)} from ${esc(dateLabel(record.localDate, true))}">
      <span class="metric-evidence-row__main"><strong>${esc(record.title)}</strong><small>${esc(dateLabel(record.localDate, true))} · ${esc(secondary)}</small></span>
      <span class="metric-evidence-row__metric">View<b aria-hidden="true">›</b></span>
    </button>`;
  }).join('')}</div>`;
}

export function renderRunPerformance(state) {
  const root = document.getElementById('runPerformanceDetail');
  if (!root) return;
  const paint = () => {
    const offset = offsets.get(selectedRange) || 0;
    const model = buildRunPerformance(state, { range: selectedRange, metric: selectedMetric, offset });
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
      ? `Duration recorded for ${model.durationKnown} of ${model.recordCount} ${model.recordCount === 1 ? 'run' : 'runs'}`
      : 'No runs in this period';
    const excluded = [model.exclusions.future ? `${model.exclusions.future} future` : '', model.exclusions.undated ? `${model.exclusions.undated} undated` : ''].filter(Boolean).join(' · ');
    root.innerHTML = `<div class="gym-performance">
      <header class="metric-detail__header gym-performance__header">
        <span class="metric-detail__eyebrow">Run activity</span><h2>Run Performance</h2>
        <div class="gym-performance__period-nav"><button type="button" data-run-period="-1" aria-label="Previous period">‹</button><strong>${esc(periodLabel(model))}</strong><button type="button" data-run-period="1" aria-label="Next period" ${model.canGoNext ? '' : 'disabled'}>›</button></div>
        <div class="metric-detail__value">${esc(model.formattedTotal)}</div>
        <p>${model.recordCount} ${model.recordCount === 1 ? 'run' : 'runs'} in this period</p>
      </header>
      <div class="gym-performance__controls">
        <div class="metric-range" role="group" aria-label="Time range">${RUN_PERFORMANCE_RANGES.map((item) => `<button type="button" data-run-range="${item.id}" aria-pressed="${item.id === selectedRange}" class="${item.id === selectedRange ? 'is-selected' : ''}">${item.label}</button>`).join('')}</div>
        <div class="metric-range" role="group" aria-label="Run metric">${RUN_PERFORMANCE_METRICS.map((item) => `<button type="button" data-run-metric="${item.id}" aria-pressed="${item.id === selectedMetric}" class="${item.id === selectedMetric ? 'is-selected' : ''}">${item.label}</button>`).join('')}</div>
      </div>
      ${comparisonHTML(model)}
      <section class="metric-detail__section" aria-labelledby="runPerformanceChartTitle"><div class="metric-detail__section-head"><div><span>History</span><h3 id="runPerformanceChartTitle">${esc(RUN_PERFORMANCE_METRICS.find((item) => item.id === selectedMetric)?.label || 'Distance')}</h3></div></div>
        ${chartHTML(model, selectedKey)}${selected ? `<div class="metric-point-summary"><strong>${esc(selected.formatted)}</strong><span>${esc(dateLabel(selected.start, true))}${selected.end !== selected.start ? ` – ${esc(dateLabel(selected.end, true))}` : ''}</span></div>` : ''}
      </section>
      <section class="metric-detail__section" aria-labelledby="runPerformanceEvidenceTitle"><div class="metric-detail__section-head"><div><span>Evidence</span><h3 id="runPerformanceEvidenceTitle">Contributing runs</h3></div></div>${evidenceHTML(selected?.records || [], model)}</section>
      <details class="metric-method"><summary>How this is calculated</summary><p>Totals use every dated run and walk in the selected calendar period, including archived programs and independent activities. Pace is a distance-weighted average and lives in the Running metric detail, not here.</p><dl><div><dt>Duration coverage</dt><dd>${esc(coverage)}.</dd></div><div><dt>Excluded</dt><dd>${esc(excluded || 'No future or undated activities found.')}</dd></div></dl></details>
    </div>`;
    root.querySelectorAll('[data-run-range]').forEach((button) => button.addEventListener('click', () => {
      const value = button.getAttribute('data-run-range');
      selectedRange = value === '4w' || value === '1y' ? value : '7d'; paint();
    }));
    root.querySelectorAll('[data-run-metric]').forEach((button) => button.addEventListener('click', () => {
      const value = button.getAttribute('data-run-metric');
      selectedMetric = value === 'time' || value === 'sessions' ? value : 'distance'; paint();
    }));
    root.querySelectorAll('[data-run-period]').forEach((button) => button.addEventListener('click', () => {
      const delta = Number(button.getAttribute('data-run-period')) || 0;
      offsets.set(selectedRange, Math.min(0, (offsets.get(selectedRange) || 0) + delta)); paint();
    }));
    root.querySelectorAll('[data-run-point]').forEach((button) => button.addEventListener('click', () => {
      selectedBins.set(selectionId, button.getAttribute('data-run-point')); paint();
    }));
  };
  paint();
}
