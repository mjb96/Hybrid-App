// ==========================================
// LOAD FOCUS VIEW (analytics/views/view-load-focus.js)
// ==========================================
import { recoveryCostBreakdown } from '../../brain/load_models.js';

// ── Performance Management Chart (ATL / CTL / TSB) ──────────────────────────

function computePMC(weeklyLoads) {
  const n    = weeklyLoads.length;
  const atl  = new Array(n).fill(0);
  const ctl  = new Array(n).fill(0);
  const tsb  = new Array(n).fill(0);
  const aAtl = 1 - Math.exp(-1);      // ~0.632 — 7-day time constant
  const aCtl = 1 - Math.exp(-1 / 6);  // ~0.154 — 42-day time constant
  for (let i = 0; i < n; i++) {
    const load = weeklyLoads[i] || 0;
    atl[i] = aAtl * load + (1 - aAtl) * (i > 0 ? atl[i - 1] : 0);
    ctl[i] = aCtl * load + (1 - aCtl) * (i > 0 ? ctl[i - 1] : 0);
    tsb[i] = ctl[i] - atl[i];
  }
  return { atl, ctl, tsb };
}

function renderPMCChart(container, weekLabels, atl, ctl, tsb) {
  if (!container || !weekLabels.length) return;
  const W = 400, H = 160, PL = 38, PR = 12, PT = 12, PB = 28;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;

  const allVals = [...atl, ...ctl, ...tsb.filter(v => v >= 0)];
  const minVal  = Math.min(0, ...tsb);
  const maxVal  = Math.max(1, ...allVals);
  const range   = maxVal - minVal || 1;

  const xOf = i => PL + (i / (weekLabels.length - 1 || 1)) * innerW;
  const yOf = v => PT + innerH - ((v - minVal) / range) * innerH;

  const line = (arr, color, dashed = false) => {
    if (arr.every(v => v === 0)) return '';
    const d = arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" ${dashed ? 'stroke-dasharray="4,3"' : ''} opacity="0.85"/>`;
  };

  const zeroY = yOf(0).toFixed(1);
  let labels = '';
  weekLabels.forEach((lbl, i) => {
    if (weekLabels.length <= 12 || i % 2 === 0 || i === weekLabels.length - 1) {
      labels += `<text x="${xOf(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="9">${lbl}</text>`;
    }
  });

  // Y-axis ticks
  const tick = v => {
    const y = yOf(v).toFixed(1);
    return `<text x="${PL - 4}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="rgba(255,255,255,0.35)" font-size="8">${Math.round(v)}</text>
            <line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  };
  const tickVals = [minVal, 0, maxVal * 0.5, maxVal].filter((v, i, a) => a.indexOf(v) === i);

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg">
    ${tickVals.map(tick).join('')}
    <line x1="${PL}" y1="${zeroY}" x2="${W - PR}" y2="${zeroY}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    ${line(ctl, '#10b981')}
    ${line(atl, '#f59e0b')}
    ${line(tsb, '#3b82f6', true)}
    ${labels}
  </svg>`;
}

const COLORS = {
  strength:  '#3b82f6',
  base:      '#10b981',
  threshold: '#f59e0b',
  vo2:       '#ef4444',
};

function renderFocusChart(container, weekLabels, strArr, baseArr, thrArr, vo2Arr) {
  if (!container) return;
  const W = 400, H = 140, PL = 12, PR = 12, PT = 12, PB = 32;
  const n = weekLabels.length;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;

  if (!n) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center;">No data yet.</p>';
    return;
  }

  const barW = Math.max(2, (innerW / n) - 2);
  const step = innerW / n;
  let bars = '';
  let hasAny = false;

  weekLabels.forEach((lbl, i) => {
    const str  = strArr[i]  || 0;
    const base = baseArr[i] || 0;
    const thr  = thrArr[i]  || 0;
    const vo2  = vo2Arr[i]  || 0;
    const total = str + base + thr + vo2;
    if (total === 0) return;
    hasAny = true;

    const x = PL + i * step + (step - barW) / 2;
    let yTop = PT;

    const seg = (val, color) => {
      if (val <= 0) return '';
      const h = (val / total) * innerH;
      const rect = `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="1"/>`;
      yTop += h;
      return rect;
    };

    // Draw in order: strength, base, threshold, VO2
    bars += seg(str,  COLORS.strength);
    bars += seg(base, COLORS.base);
    bars += seg(thr,  COLORS.threshold);
    bars += seg(vo2,  COLORS.vo2);

    if (n <= 12 || i % 2 === 0 || i === n - 1) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="9">${lbl}</text>`;
    }
  });

  if (!hasAny) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center;">Log sessions with RPE to see distribution.</p>';
    return;
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg">
    ${bars}
  </svg>`;
}

export function renderLoadFocusAnalytics(data, getState, getDays) {
  const appState = getState();
  const days     = getDays();
  const maxWeek  = data.weekLabels.length;

  const breakdown = recoveryCostBreakdown(appState, days, maxWeek);

  const baseArr = [], thrArr = [], vo2Arr = [];
  let missingHrData = false;

  breakdown.endurance.forEach((runLoad, i) => {
    const zones   = data.hrZonesData[i] || [0, 0, 0, 0, 0];
    const zoneSum = zones.reduce((a, b) => a + b, 0);
    if (zoneSum > 0) {
      baseArr.push(runLoad * (zones[0] + zones[1]) / zoneSum);
      thrArr.push(runLoad  * (zones[2] + zones[3]) / zoneSum);
      vo2Arr.push(runLoad  *  zones[4]             / zoneSum);
    } else {
      baseArr.push(runLoad);
      thrArr.push(0);
      vo2Arr.push(0);
      if (runLoad > 0) missingHrData = true;
    }
  });

  renderFocusChart(
    document.getElementById('lfDistributionChart'),
    data.weekLabels, breakdown.strength, baseArr, thrArr, vo2Arr
  );

  const legendEl = document.getElementById('lfLegend');
  if (legendEl) {
    const dot = c => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:4px;vertical-align:middle;"></span>`;
    legendEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:0.75rem;color:rgba(255,255,255,0.7);">
      <span>${dot(COLORS.strength)}Strength</span>
      <span>${dot(COLORS.base)}Base Run</span>
      <span>${dot(COLORS.threshold)}Threshold</span>
      <span>${dot(COLORS.vo2)}VO&#x2082; Max</span>
    </div>`;
  }

  const noteEl = document.getElementById('lfNote');
  if (noteEl) {
    noteEl.innerHTML = missingHrData
      ? '<p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin-top:0.5rem;">Import FIT files with HR zone data to split run intensity by zone.</p>'
      : '';
  }

  // Performance Management Chart — ATL / CTL / TSB
  const pmcEl = document.getElementById('lfPMCChart');
  if (pmcEl) {
    // Weekly load = estimated sRPE: gym (vol / 100 * avgRpe) + run (dist * avgRpe * 8)
    const weeklyLoads = data.weekLabels.map((_, i) => {
      const vol  = data.volData[i]  || 0;
      const dist = data.runData[i]  || 0;
      const rpe  = data.rpeData[i]  || 6;
      return (vol / 200) * rpe + dist * rpe * 1.5;
    });
    const { atl, ctl, tsb } = computePMC(weeklyLoads);
    renderPMCChart(pmcEl, data.weekLabels, atl, ctl, tsb);

    const pmcLegendEl = document.getElementById('lfPMCLegend');
    if (pmcLegendEl) {
      const dot = (c, dash) => `<span style="display:inline-block;width:18px;height:2px;background:${dash ? 'none' : c};${dash ? `border-top:2px dashed ${c};` : ''}vertical-align:middle;margin-right:4px;"></span>`;
      pmcLegendEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:0.72rem;color:rgba(255,255,255,0.65);margin-top:6px;">
        <span>${dot('#10b981')}CTL (Fitness)</span>
        <span>${dot('#f59e0b')}ATL (Fatigue)</span>
        <span>${dot('#3b82f6', true)}TSB (Form)</span>
      </div>`;
    }
  }
}
