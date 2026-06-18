// ==========================================
// LOAD FOCUS VIEW (analytics/views/view-load-focus.js)
// ==========================================
import { recoveryCostBreakdown } from '../../brain/load_models.js';

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
}
