// ==========================================
// TRAINING STATUS VIEW (analytics/views/view-training-status.js)
// ==========================================
import { trainingStatus } from '../../brain/briefing.js';
import { weeklyLoadMetricsSeries } from '../../brain/load_models.js';

const TONE_COLOR = {
  progress: '#10b981',
  neutral:  '#94a3b8',
  caution:  '#f59e0b',
  warning:  '#ef4444',
};

function fmtLoad(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderAtlCtlChart(container, weekLabels, atlSeries, ctlSeries) {
  if (!container) return;
  const W = 400, H = 130, PL = 44, PR = 12, PT = 14, PB = 30;
  const n = weekLabels.length;
  if (!n) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center;">No load data yet.</p>';
    return;
  }

  const allVals = [...atlSeries, ...ctlSeries].filter(v => v > 0);
  const maxVal  = allVals.length ? Math.max(...allVals) * 1.1 : 1;

  const cx = i => PL + (n < 2 ? (W - PL - PR) / 2 : (i / (n - 1)) * (W - PL - PR));
  const cy = v => PT + (1 - Math.min(v, maxVal) / maxVal) * (H - PT - PB);

  const polyline = (series, color) =>
    `<polyline points="${series.map((v, i) => `${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ')}"
       fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

  const labels = weekLabels.map((lbl, i) => {
    if (n > 8 && i % 2 !== 0 && i !== n - 1) return '';
    return `<text x="${cx(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="9">${lbl}</text>`;
  }).join('');

  const yTick = v =>
    `<line x1="${PL - 4}" y1="${cy(v).toFixed(1)}" x2="${W - PR}" y2="${cy(v).toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
     <text x="${(PL - 6).toFixed(1)}" y="${(cy(v) + 3).toFixed(1)}" text-anchor="end" fill="rgba(255,255,255,0.35)" font-size="8">${fmtLoad(v)}</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg">
    ${yTick(maxVal / 2)}
    ${yTick(maxVal)}
    <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H - PB}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    ${polyline(ctlSeries, '#3b82f6')}
    ${polyline(atlSeries, '#f59e0b')}
    ${labels}
    <text x="${W - PR}" y="${PT + 5}" text-anchor="end" fill="#3b82f6" font-size="9" font-weight="bold">CTL</text>
    <text x="${W - PR}" y="${PT + 16}" text-anchor="end" fill="#f59e0b" font-size="9" font-weight="bold">ATL</text>
  </svg>`;
}

export function renderTrainingStatusAnalytics(data, getState, getDays) {
  const appState    = getState();
  const days        = getDays();
  const maxWeek     = data.weekLabels.length;
  const loadMetrics = appState.loadMetrics || { atl: 0, ctl: 0 };

  const { atl, ctl } = loadMetrics;
  const tsb     = ctl - atl;
  const hasData = ctl > 0;
  const acwr    = hasData ? Math.round((atl / ctl) * 100) / 100 : 0;
  const { status, tone } = trainingStatus({ hasData, acwr });
  const color = TONE_COLOR[tone] || '#94a3b8';

  const statusCard = document.getElementById('tsStatusCard');
  if (statusCard) {
    statusCard.innerHTML = `
      <article class="card-dark flex-col flex-center p-4" style="border:1px solid ${color}55;text-align:center;">
        <div class="text-xs text-muted mb-2">TRAINING STATUS</div>
        <div class="text-2xl font-heavy" style="color:${color};">${status}</div>
        ${hasData
          ? `<div class="text-xs text-muted mt-2">ACWR&nbsp;${acwr}</div>`
          : `<div class="text-xs text-muted mt-2">Log more sessions to unlock</div>`
        }
      </article>`;
  }

  const metricGrid = document.getElementById('tsMetricGrid');
  if (metricGrid) {
    const card = (label, value, border) => `
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid ${border};">
        <div class="text-xs text-muted mb-1">${label}</div>
        <div class="text-lg font-heavy text-inverse">${value}</div>
      </article>`;

    const tsbBorder = tsb >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)';
    metricGrid.innerHTML =
      card('ATL (7d)',   hasData ? fmtLoad(atl) : '—', 'rgba(245,158,11,0.35)') +
      card('CTL (28d)',  hasData ? fmtLoad(ctl) : '—', 'rgba(59,130,246,0.35)') +
      card('Form (TSB)', hasData ? (tsb >= 0 ? '+' : '') + fmtLoad(tsb) : '—', tsbBorder) +
      card('ACWR',       hasData ? String(acwr) : '—', 'rgba(148,163,184,0.25)');
  }

  const chartEl = document.getElementById('tsLoadChart');
  if (chartEl) {
    const { atl: atlSeries, ctl: ctlSeries } = weeklyLoadMetricsSeries(appState, days, maxWeek);
    renderAtlCtlChart(chartEl, data.weekLabels, atlSeries, ctlSeries);
  }
}
