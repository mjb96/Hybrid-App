// ==========================================
// RECOVERY CHARTS — analytics/charts/recovery-charts.js
// ==========================================
import { uid, bezierPath, linearGradientV, gridLines, xAxisLabels, areaFill, dotSeries, refLine } from './chart-primitives.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// Generic time-series trend chart for recovery metrics.
// series: [{ date, value, ma7? }]
function renderTrendChart({ container, series, label, color, valueLabel, yMin, yMax, goodIsHigh = true, refValue = null, refLabel = '' }) {
  if (!container) return;
  if (!series || series.length < 2) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Log ${label.toLowerCase()} data to see trends.</p>`;
    return;
  }

  const W = 400, H = 155, PL = 44, PR = 15, PT = 18, PB = 28;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = series.length;

  const values = series.map(e => e.value).filter(v => v > 0);
  const minV   = yMin !== undefined ? yMin : Math.min(...values) * 0.95;
  const maxV   = yMax !== undefined ? yMax : Math.max(...values) * 1.05;
  const range  = Math.max(maxV - minV, 1);

  const toX = i => PL + (i / (n - 1)) * chartW;
  const toY = v => PT + chartH - ((v - minV) / range) * chartH;

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, color, 0.25, color, 0)}</defs>`;

  const pts    = series.map((e, i) => e.value > 0 ? [toX(i), toY(e.value)] : null).filter(Boolean);
  const smooth = pts.length >= 2 ? bezierPath(pts) : '';
  const area   = smooth ? areaFill(smooth, pts, PT + chartH, gId) : '';
  const line   = smooth ? `<path d="${smooth}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>` : '';
  const dots   = dotSeries(pts, color, 3.5);

  // 7-day MA line
  let maLine = '';
  const maSeries = series.filter(e => e.ma7 !== undefined);
  if (maSeries.length >= 2) {
    const maPts  = maSeries.map((e, i) => e.ma7 > 0 ? [toX(i), toY(e.ma7)] : null).filter(Boolean);
    const maSmooth = maPts.length >= 2 ? bezierPath(maPts) : '';
    maLine = maSmooth
      ? `<path d="${maSmooth}" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="2" stroke-dasharray="5,3" stroke-linecap="round"/>`
      : '';
  }

  // Reference line
  const refSvg = (refValue !== null && refValue > 0) ? refLine(toY(refValue), PL, W, PR, refLabel || refValue.toString(), 'rgba(255,255,255,0.4)', true) : '';

  // X labels (dates)
  const labels  = series.map(e => formatDate(e.date));
  const step    = n > 10 ? Math.ceil(n / 6) : 1;
  const toXLabel = i => toX(i);
  let xLbl = '';
  labels.forEach((lbl, i) => {
    if (i % step !== 0) return;
    xLbl += `<text x="${toXLabel(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.55)">${lbl}</text>`;
  });

  const ticks = [0.25, 0.5, 0.75, 1].map(p => minV + p * range);
  const grid  = gridLines(ticks, toY, PL, W, PR, v => Math.round(v));

  const legend = `<text x="${PL}" y="11" font-size="9" fill="${color}">${valueLabel || label}</text>
    ${maSeries.length >= 2 ? `<text x="${PL + 120}" y="11" font-size="9" fill="rgba(255,255,255,0.55)">- - 7d avg</text>` : ''}`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${defs}${grid}${refSvg}${area}${line}${maLine}${dots}${xLbl}${legend}</svg>`;
}

// Sleep trend (hours per night).
export function renderSleepTrendChart(container, sleepData) {
  renderTrendChart({
    container,
    series: sleepData,
    label: 'Sleep',
    color: '#818cf8',
    valueLabel: 'Sleep (hours)',
    yMin: 0,
    yMax: 12,
    refValue: 8,
    refLabel: '8h target',
    goodIsHigh: true,
  });
}

// HRV trend (RMSSD ms).
export function renderHRVTrendChart(container, hrvData) {
  renderTrendChart({
    container,
    series: hrvData,
    label: 'HRV (RMSSD)',
    color: '#10b981',
    valueLabel: 'HRV — RMSSD (ms)',
    goodIsHigh: true,
  });
}

// Resting HR trend.
export function renderRestingHRTrendChart(container, rhrData) {
  renderTrendChart({
    container,
    series: rhrData,
    label: 'Resting HR',
    color: '#ef4444',
    valueLabel: 'Resting HR (bpm)',
    goodIsHigh: false,
  });
}

// Daily recovery score trend (0–100).
export function renderRecoveryScoreTrendChart(container, recovScores) {
  if (!container) return;
  const series = recovScores.map(e => ({ date: e.date, value: e.value }));
  renderTrendChart({
    container,
    series,
    label: 'Recovery Score',
    color: '#3b82f6',
    valueLabel: 'Daily Recovery Score (0–100)',
    yMin: 0,
    yMax: 100,
    refValue: 70,
    refLabel: '70 Threshold',
    goodIsHigh: true,
  });
}

// Mood trend (1–5 scale).
export function renderMoodTrendChart(container, moodData) {
  renderTrendChart({
    container,
    series: moodData,
    label: 'Mood',
    color: '#f59e0b',
    valueLabel: 'Mood (1–5)',
    yMin: 0,
    yMax: 5,
    goodIsHigh: true,
  });
}

// Soreness trend (1–5 scale; lower is better).
export function renderSorenessTrendChart(container, sorenessData) {
  renderTrendChart({
    container,
    series: sorenessData,
    label: 'Soreness',
    color: '#f97316',
    valueLabel: 'Soreness (1–5) — lower is better',
    yMin: 0,
    yMax: 5,
    goodIsHigh: false,
  });
}

// Readiness ring — large visual readiness display.
export function renderReadinessRingLarge(container, score, status, color) {
  if (!container) return;
  if (score === null) {
    container.innerHTML = `<div class="flex-col flex-center p-4"><div class="text-muted text-sm">Log wellness + workouts for readiness score</div></div>`;
    return;
  }

  const pct   = score;
  const r     = 54, cx = 70, cy = 70;
  const circ  = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  const gap   = circ - dash;

  container.innerHTML = `
    <div class="flex-col flex-center">
      <svg viewBox="0 0 140 140" style="width:140px;height:140px;">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="12"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
          stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
          stroke-dashoffset="${(circ * 0.25).toFixed(2)}"
          stroke-linecap="round"
          transform="rotate(-90 ${cx} ${cy})"/>
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="28" font-weight="800" fill="${color}">${score}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.6)">${status}</text>
      </svg>
    </div>`;
}
