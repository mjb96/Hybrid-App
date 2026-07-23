// @ts-check
// Recovery trends detail — the recovery counterpart to view-run-performance.
// Reuses the shared `gym-performance` layout classes. Because recovery values are
// averages of manual check-ins, an empty period/bin is shown as an honest "—"
// rather than a misleading zero.
import {
  buildRecoveryPerformance,
  RECOVERY_PERFORMANCE_METRICS,
  RECOVERY_PERFORMANCE_RANGES,
} from '../recovery-performance.js';
import { esc } from './screen-kit.js';

/** @type {'7d'|'4w'|'1y'} */
let selectedRange = '7d';
/** @type {'sleep'|'mood'|'soreness'} */
let selectedMetric = 'sleep';
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

// Recovery averages have no meaning without a check-in, so an empty bucket reads
// as "—", and its bar collapses to the baseline.
function binText(bin) { return bin.records.length ? bin.formatted : '—'; }

function comparisonHTML(model) {
  const comparison = model.comparison;
  if (!comparison.isComparable) return `<p class="gym-performance__comparison is-muted">${esc(comparison.message || 'No check-ins to compare yet')}</p>`;
  const arrow = comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '→';
  const tone = comparison.favorable === true ? ' is-favorable' : comparison.favorable === false ? ' is-unfavorable' : '';
  return `<p class="gym-performance__comparison${tone}"><strong>${arrow} ${Math.abs(comparison.percentageChange)}%</strong><span>${esc(comparison.comparisonLabel)}</span></p>`;
}

function chartHTML(model, selectedKey) {
  const max = Math.max(1, ...model.bins.map((bin) => (bin.records.length ? Number(bin.value) || 0 : 0)));
  return `<div class="gym-performance__chart" style="--gym-bin-count:${model.bins.length}" role="group" aria-label="${esc(model.metricLabel)} history">
    ${model.bins.map((bin) => {
      const active = bin.key === selectedKey;
      const has = bin.records.length > 0;
      const height = has && bin.value > 0 ? Math.max(8, (Number(bin.value) / max) * 100) : 2;
      return `<button type="button" class="gym-performance__bin${active ? ' is-selected' : ''}${bin.isFuture ? ' is-future' : ''}" data-recovery-point="${esc(bin.key)}" aria-pressed="${active}" ${bin.isFuture ? 'disabled' : ''} aria-label="${esc(binLabel(bin, model.range))}: ${esc(binText(bin))}">
        <span class="gym-performance__bin-value">${active ? esc(binText(bin)) : ''}</span>
        <span class="gym-performance__track"><span class="gym-performance__bar" style="--gym-height:${height.toFixed(1)}%"></span></span>
        <span class="gym-performance__bin-label">${esc(binLabel(bin, model.range))}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function evidenceHTML(records, model) {
  if (!records.length) return '<div class="metric-evidence-empty"><strong>No check-ins in this part of the period</strong><p>Log sleep, mood and soreness from the Recovery screen to build this trend.</p></div>';
  const field = model.metric;
  return `<div class="metric-evidence-list">${[...records].sort((a, b) => b.localDate.localeCompare(a.localDate)).map((record) => {
    const value = field === 'sleep' ? `${(Number(record.sleep) || 0).toFixed(1)} h`
      : `${Number(record[field]) || 0} / 5`;
    const context = [
      record.sleep ? `${(Number(record.sleep) || 0).toFixed(1)} h sleep` : '',
      record.mood ? `mood ${record.mood}/5` : '',
      record.soreness ? `soreness ${record.soreness}/5` : '',
    ].filter(Boolean).join(' · ');
    return `<div class="metric-evidence-row metric-evidence-row--static">
      <span class="metric-evidence-row__main"><strong>${esc(dateLabel(record.localDate, true))}</strong><small>${esc(context)}</small></span>
      <span class="metric-evidence-row__metric">${esc(value)}</span>
    </div>`;
  }).join('')}</div>`;
}

export function renderRecoveryPerformance(state) {
  const root = document.getElementById('recoveryPerformanceDetail');
  if (!root) return;
  const paint = () => {
    const offset = offsets.get(selectedRange) || 0;
    const model = buildRecoveryPerformance(state, { range: selectedRange, metric: selectedMetric, offset });
    const selectionId = `${selectedRange}:${offset}:${selectedMetric}`;
    let selectedKey = selectedBins.get(selectionId);
    if (!model.bins.some((bin) => bin.key === selectedKey && !bin.isFuture)) {
      selectedKey = [...model.bins].reverse().find((bin) => bin.records.length)?.key
        || [...model.bins].reverse().find((bin) => !bin.isFuture)?.key
        || null;
      if (selectedKey) selectedBins.set(selectionId, selectedKey);
    }
    const selected = model.bins.find((bin) => bin.key === selectedKey) || null;
    const headline = model.recordCount ? model.formattedTotal : '—';
    const excluded = [model.exclusions.future ? `${model.exclusions.future} future` : '', model.exclusions.undated ? `${model.exclusions.undated} undated` : ''].filter(Boolean).join(' · ');
    root.innerHTML = `<div class="gym-performance">
      <header class="metric-detail__header gym-performance__header">
        <span class="metric-detail__eyebrow">Recovery check-ins</span><h2>Recovery Trends</h2>
        <div class="gym-performance__period-nav"><button type="button" data-recovery-period="-1" aria-label="Previous period">‹</button><strong>${esc(periodLabel(model))}</strong><button type="button" data-recovery-period="1" aria-label="Next period" ${model.canGoNext ? '' : 'disabled'}>›</button></div>
        <div class="metric-detail__value">${esc(headline)}</div>
        <p>${model.recordCount} check-in${model.recordCount === 1 ? '' : 's'} with ${esc(model.metricLabel.toLowerCase())} in this period</p>
      </header>
      <div class="gym-performance__controls">
        <div class="metric-range" role="group" aria-label="Time range">${RECOVERY_PERFORMANCE_RANGES.map((item) => `<button type="button" data-recovery-range="${item.id}" aria-pressed="${item.id === selectedRange}" class="${item.id === selectedRange ? 'is-selected' : ''}">${item.label}</button>`).join('')}</div>
        <div class="metric-range" role="group" aria-label="Recovery metric">${RECOVERY_PERFORMANCE_METRICS.map((item) => `<button type="button" data-recovery-metric="${item.id}" aria-pressed="${item.id === selectedMetric}" class="${item.id === selectedMetric ? 'is-selected' : ''}">${item.label}</button>`).join('')}</div>
      </div>
      ${comparisonHTML(model)}
      <section class="metric-detail__section" aria-labelledby="recoveryPerformanceChartTitle"><div class="metric-detail__section-head"><div><span>History</span><h3 id="recoveryPerformanceChartTitle">Average ${esc(model.metricLabel)}</h3></div></div>
        ${chartHTML(model, selectedKey)}${selected ? `<div class="metric-point-summary"><strong>${esc(binText(selected))}</strong><span>${esc(dateLabel(selected.start, true))}${selected.end !== selected.start ? ` – ${esc(dateLabel(selected.end, true))}` : ''}</span></div>` : ''}
      </section>
      <section class="metric-detail__section" aria-labelledby="recoveryPerformanceEvidenceTitle"><div class="metric-detail__section-head"><div><span>Evidence</span><h3 id="recoveryPerformanceEvidenceTitle">Contributing check-ins</h3></div></div>${evidenceHTML(selected?.records || [], model)}</section>
      <details class="metric-method"><summary>How this is calculated</summary><p>Each bar is the average of your logged ${esc(model.metricLabel.toLowerCase())} check-ins in that bucket${model.inverse ? ' — for soreness a lower value is the better direction' : ''}. Days without a ${esc(model.metricLabel.toLowerCase())} entry are not counted, so an empty bucket means no check-in, not a zero.</p><dl><div><dt>Excluded</dt><dd>${esc(excluded || 'No future or undated check-ins found.')}</dd></div></dl></details>
    </div>`;
    root.querySelectorAll('[data-recovery-range]').forEach((button) => button.addEventListener('click', () => {
      const value = button.getAttribute('data-recovery-range');
      selectedRange = value === '4w' || value === '1y' ? value : '7d'; paint();
    }));
    root.querySelectorAll('[data-recovery-metric]').forEach((button) => button.addEventListener('click', () => {
      const value = button.getAttribute('data-recovery-metric');
      selectedMetric = value === 'mood' || value === 'soreness' ? value : 'sleep'; paint();
    }));
    root.querySelectorAll('[data-recovery-period]').forEach((button) => button.addEventListener('click', () => {
      const delta = Number(button.getAttribute('data-recovery-period')) || 0;
      offsets.set(selectedRange, Math.min(0, (offsets.get(selectedRange) || 0) + delta)); paint();
    }));
    root.querySelectorAll('[data-recovery-point]').forEach((button) => button.addEventListener('click', () => {
      selectedBins.set(selectionId, button.getAttribute('data-recovery-point')); paint();
    }));
  };
  paint();
}
