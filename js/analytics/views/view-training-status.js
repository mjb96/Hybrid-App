// @ts-check
// ==========================================
// TRAINING STATUS VIEW (analytics/views/view-training-status.js)
// ==========================================
import { trainingStatus } from '../../brain/briefing.js';
import { computeLoadAnalytics } from '../calculations/load-calcs.js';

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
    <text x="${W - PR}" y="${PT + 5}" text-anchor="end" fill="#3b82f6" font-size="9" font-weight="bold">Fitness</text>
    <text x="${W - PR}" y="${PT + 16}" text-anchor="end" fill="#f59e0b" font-size="9" font-weight="bold">Fatigue</text>
  </svg>`;
}

function _monotonyLabel(m) {
  if (m === null) return 'No data';
  if (m > 2)   return 'High risk — vary load';
  if (m > 1.5) return 'Moderate — add variation';
  return 'Good variety';
}

function _consistencyLabel(c) {
  if (c === null) return '';
  if (c >= 80) return 'Excellent';
  if (c >= 60) return 'Good';
  if (c >= 40) return 'Inconsistent';
  return 'Sparse';
}

export function renderTrainingStatusAnalytics(data, getState, getDays) {
  const appState = getState();
  const days     = getDays();
  const maxWeek  = data.weekLabels.length;

  const la = computeLoadAnalytics(appState, days, maxWeek);
  const { currentATL: atl, currentCTL: ctl, currentTSB: tsb, currentRatio: acwr } = la;

  const hasData = ctl > 0;
  const { status, tone } = la.loadStatus;
  const color = TONE_COLOR[tone] || '#94a3b8';

  // ── Status hero card ──────────────────────────────────────────────────────
  const statusCard = document.getElementById('tsStatusCard');
  if (statusCard) {
    statusCard.innerHTML = `
      <article class="card-dark flex-col flex-center p-4" style="border:1px solid ${color}55;text-align:center;">
        <div class="text-xs text-muted mb-2">TRAINING STATUS</div>
        <div class="text-2xl font-heavy" style="color:${color};">${status}</div>
        ${hasData
          ? `<div class="text-xs text-muted mt-2">Load Ratio&nbsp;${acwr}&nbsp;·&nbsp;Safe zone 0.8–1.3</div>`
          : `<div class="text-xs text-muted mt-2">Log more sessions to unlock</div>`
        }
      </article>`;
  }

  // ── Primary metric grid — athlete-friendly labels ─────────────────────────
  const metricGrid = document.getElementById('tsMetricGrid');
  if (metricGrid) {
    const card = (label, value, border, sub = '') => `
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid ${border};">
        <div class="text-xs text-muted mb-1">${label}</div>
        <div class="text-lg font-heavy text-inverse">${value}</div>
        ${sub ? `<div class="text-xs text-muted mt-1">${sub}</div>` : ''}
      </article>`;

    const tsbBorder = tsb >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)';
    metricGrid.innerHTML =
      card('Fatigue',     hasData ? fmtLoad(atl)  : '—', 'rgba(245,158,11,0.35)',  '7-day load') +
      card('Fitness',     hasData ? fmtLoad(ctl)  : '—', 'rgba(59,130,246,0.35)',  '28-day fitness') +
      card('Form',        hasData ? (tsb >= 0 ? '+' : '') + fmtLoad(tsb) : '—', tsbBorder, 'Fitness − Fatigue') +
      card('Load Ratio',  hasData ? String(acwr)  : '—', 'rgba(148,163,184,0.25)', 'ACWR');
  }

  // ── Advanced metrics row ──────────────────────────────────────────────────
  let advEl = document.getElementById('tsAdvancedMetrics');
  if (!advEl) {
    advEl = document.createElement('div');
    advEl.id = 'tsAdvancedMetrics';
    const mg = document.getElementById('tsMetricGrid');
    if (mg) mg.insertAdjacentElement('afterend', advEl);
  }
  if (advEl) {
    const monotonyColor = la.monotony === null ? '#94a3b8'
      : la.monotony > 2   ? '#ef4444'
      : la.monotony > 1.5 ? '#f59e0b'
      : '#10b981';

    const consistencyColor = la.consistency === null ? '#94a3b8'
      : la.consistency >= 80 ? '#10b981'
      : la.consistency >= 60 ? '#f59e0b'
      : '#ef4444';

    const ac = (label, value, sub, clr) => `
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid ${clr}35;">
        <div class="text-xs text-muted mb-1">${label}</div>
        <div class="text-lg font-heavy" style="color:${clr};">${value}</div>
        ${sub ? `<div class="text-xs text-muted mt-1">${sub}</div>` : ''}
      </article>`;

    advEl.className = 'grid-3-col gap-2 mb-3 mt-2';
    advEl.innerHTML =
      ac('Monotony',    la.monotony    !== null ? la.monotony.toFixed(1) : '—',    _monotonyLabel(la.monotony),               monotonyColor)    +
      ac('Strain',      la.strain      !== null ? fmtLoad(la.strain)     : '—',    'Load × Monotony',                         '#a78bfa')         +
      ac('Consistency', la.consistency !== null ? la.consistency + '%'   : '—',    _consistencyLabel(la.consistency),         consistencyColor);
  }

  // ── Load distribution bar ─────────────────────────────────────────────────
  let distEl = document.getElementById('tsLoadDistribution');
  if (!distEl) {
    distEl = document.createElement('div');
    distEl.id = 'tsLoadDistribution';
    const adv = document.getElementById('tsAdvancedMetrics');
    if (adv) adv.insertAdjacentElement('afterend', distEl);
  }
  if (distEl) {
    if (la.distribution) {
      const { strength, endurance, totalLift, totalRun } = la.distribution;
      distEl.innerHTML = `
        <article class="card-dark p-3 mb-3">
          <div class="text-xs text-muted mb-2">Load Distribution</div>
          <div class="flex-between mb-1" style="font-size:0.8rem;font-weight:700;">
            <span style="color:#f59e0b;">Strength&nbsp;${strength}%</span>
            <span style="color:#3b82f6;">${endurance}% Endurance</span>
          </div>
          <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px;">
            <div style="width:${strength}%;background:#f59e0b;"></div>
            <div style="width:${endurance}%;background:#3b82f6;"></div>
          </div>
          <div class="flex-between text-xs text-muted">
            <span>Lift load: ${fmtLoad(totalLift)}</span>
            <span>Run load: ${fmtLoad(totalRun)}</span>
          </div>
        </article>`;
    } else {
      distEl.innerHTML = '';
    }
  }

  // ── Fitness / Fatigue trend chart ─────────────────────────────────────────
  const chartEl = document.getElementById('tsLoadChart');
  if (chartEl) {
    renderAtlCtlChart(chartEl, data.weekLabels, la.atlSeries, la.ctlSeries);
  }
}
