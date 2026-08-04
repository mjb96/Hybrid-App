// ==========================================
// ANALYTICS CHART RENDERERS (analytics/charts.js)
// ==========================================
import { rpeColour } from './utils.js';
import { formatDayMonth } from '../dates.js';

// Shared helper: smooth cubic-bezier path through an array of [x,y] points
function _smoothBezierPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const tension = 0.38;
    const cp1x = p0[0] + (p1[0] - p0[0]) * tension;
    const cp2x = p1[0] - (p1[0] - p0[0]) * tension;
    d += ` C ${cp1x.toFixed(1)},${p0[1].toFixed(1)} ${cp2x.toFixed(1)},${p1[1].toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
  }
  return d;
}

// Unique id helper for SVG gradients (avoids collisions when chart re-renders)
let _gid = 0;
function _uid() { return 'g' + (++_gid); }

export function renderVolumeChart(container, weekLabels, volData, runData, highlightIdx = -1) {
  if (!container || weekLabels.length < 1) {
    if (container) container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log workouts to see volume trends.</p>';
    return;
  }

  const W = 400, H = 200, PAD_L = 50, PAD_B = 30, PAD_T = 20, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;

  const maxVol = Math.max(...volData, 1);
  const maxRun = Math.max(...runData, 1);
  const n      = weekLabels.length;
  const barW   = Math.max(8, Math.floor(chartW / n) - 6);

  const vGrad = _uid(), rGrad = _uid();
  const defs = `<defs>
    <linearGradient id="${vGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#3b82f6" stop-opacity="1"/>
      <stop offset="100%" stop-color="#1e3a8a" stop-opacity="0.55"/>
    </linearGradient>
    <linearGradient id="${rGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ec4899" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

  let bars = '';
  const runXY = [];

  weekLabels.forEach((label, i) => {
    const x    = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const barH = volData[i] > 0 ? Math.max(3, (volData[i] / maxVol) * chartH) : 0;
    const y    = PAD_T + chartH - barH;
    const isHL = i === highlightIdx;

    if (barH > 0) {
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}"
        fill="${isHL ? '#60a5fa' : `url(#${vGrad})`}"
        opacity="${isHL ? 1 : 0.8}" rx="4"/>`;
      if (isHL) {
        // Bright top-cap accent on highlighted bar
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="3" fill="#93c5fd" rx="2" opacity="0.9"/>`;
      }
    }

    const rx = PAD_L + (i / n) * chartW + chartW / n / 2;
    if (runData[i] > 0) {
      runXY.push([rx, PAD_T + chartH - (runData[i] / maxRun) * chartH, i]);
    }
  });

  // Smooth bezier run line + gradient area fill
  let runSvg = '';
  if (runXY.length >= 2) {
    const pts    = runXY.map(p => [p[0], p[1]]);
    const smooth = _smoothBezierPath(pts);
    const areaD  = smooth + ` L ${pts[pts.length-1][0].toFixed(1)},${(PAD_T+chartH).toFixed(1)} L ${pts[0][0].toFixed(1)},${(PAD_T+chartH).toFixed(1)} Z`;
    runSvg = `<path d="${areaD}" fill="url(#${rGrad})"/>`;
    runSvg += `<path d="${smooth}" fill="none" stroke="#ec4899" stroke-width="2.5" stroke-linecap="round"/>`;
    runXY.forEach(([cx, cy, i]) => {
      const isHL = i === highlightIdx;
      runSvg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isHL ? 5.5 : 4}" fill="#ec4899" stroke="#0d1117" stroke-width="${isHL ? 2 : 1.5}"/>`;
    });
  }

  let yAxis = '';
  for (let t = 0; t <= 2; t++) {
    const val = Math.round((maxVol / 2) * t);
    const vy  = PAD_T + chartH - (t / 2) * chartH;
    const lbl = val > 999 ? (val / 1000).toFixed(1) + 'k' : val;
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" font-weight="600" fill="rgba(255,255,255,0.5)">${lbl}</text>`;
    yAxis += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
  }

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx   = PAD_L + (i / n) * chartW + chartW / n / 2;
    const isHL = i === highlightIdx;
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="11"
      font-weight="${isHL ? 800 : 600}"
      fill="${isHL ? '#60a5fa' : 'rgba(255,255,255,0.55)'}">${label}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${defs}${yAxis}${bars}${runSvg}${xAxis}</svg>`;
}

export function renderRpeChart(container, weekLabels, rpeData) {
  if (!container) return;
  if (weekLabels.length === 0 || rpeData.every(r => r === 0)) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log RPE on workouts to see fatigue trends.</p>';
    return;
  }

  const W = 400, H = 150, PAD_L = 40, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const band = (yPct, h, colour) => {
    const y = PAD_T + chartH * (1 - yPct - h);
    return `<rect x="${PAD_L}" y="${y.toFixed(1)}" width="${chartW}" height="${(chartH * h).toFixed(1)}" fill="${colour}" opacity="0.15"/>`;
  };
  const bands = band(0, 6 / 10, '#10b981') + band(0.6, 2 / 10, '#f59e0b') + band(0.8, 2 / 10, '#ef4444');

  let points = '';
  let dots = '';
  weekLabels.forEach((label, i) => {
    const rx = PAD_L + (i / n) * chartW + chartW / n / 2;
    const ry = rpeData[i] > 0 ? PAD_T + chartH - (rpeData[i] / 10) * chartH : PAD_T + chartH;
    if (rpeData[i] > 0) {
      points += `${rx.toFixed(1)},${ry.toFixed(1)} `;
      dots += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="5" fill="${rpeColour(rpeData[i])}" stroke="#111827" stroke-width="2"/>`;
    }
  });

  // Smooth bezier curve instead of polyline
  const nonZeroPts = weekLabels.map((_, i) => {
    if (rpeData[i] <= 0) return null;
    return [PAD_L + (i / n) * chartW + chartW / n / 2, PAD_T + chartH - (rpeData[i] / 10) * chartH];
  }).filter(Boolean);

  const line = nonZeroPts.length >= 2
    ? `<path d="${_smoothBezierPath(nonZeroPts)}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2.5" stroke-linecap="round"/>`
    : '';

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = PAD_L + (i / n) * chartW + chartW / n / 2;
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  const yLabels = [[6, '#f59e0b'], [8, '#ef4444']].map(([v, c]) => {
    const vy = PAD_T + chartH - (v / 10) * chartH;
    return `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="12" font-weight="bold" fill="${c}">${v}</text>
      <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="${c}" stroke-width="1.5" opacity="0.4"/>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${bands}${yLabels}${line}${dots}${xAxis}</svg>`;
}

export function renderBodyWeightChart(container, bwLog) {
  if (!container) return;
  const validEntries = (bwLog || []).filter(e => e && e.date && e.weight > 0);
  if (validEntries.length < 2) {
    container.innerHTML = validEntries.length === 1
      ? `<p style="color:rgba(255,255,255,0.8);font-size:0.85rem;padding:8px 0;">One entry logged (${validEntries[0].weight} kg). Log more to see a trend.</p>`
      : '<p style="color:rgba(255,255,255,0.6);font-size:0.75rem;">Log body weight to see trend.</p>';
    return;
  }

  const sorted = [...validEntries].sort((a, b) => a.date.localeCompare(b.date));
  const weights = sorted.map(e => e.weight);
  const labels  = sorted.map(e => formatDayMonth(e.date));

  const W = 400, H = 150, PAD_L = 45, PAD_B = 30, PAD_T = 15, PAD_R = 10;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weights.length;
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const rangeW = Math.max(maxW - minW, 2);

  const toX = i => PAD_L + (i / (n - 1)) * chartW;
  const toY = w => PAD_T + chartH - ((w - (minW - 1)) / (rangeW + 2)) * chartH;

  const points = weights.map((w, i) => `${toX(i).toFixed(1)},${toY(w).toFixed(1)}`).join(' ');
  const polyline = `<polyline fill="none" stroke="#a855f7" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${points}"/>`;

  const fillPath = `M ${toX(0).toFixed(1)},${(PAD_T + chartH).toFixed(1)} ` +
    weights.map((w, i) => `L ${toX(i).toFixed(1)},${toY(w).toFixed(1)}`).join(' ') +
    ` L ${toX(n - 1).toFixed(1)},${(PAD_T + chartH).toFixed(1)} Z`;
  const fill = `<path d="${fillPath}" fill="#a855f7" opacity="0.12"/>`;

  let dots = '';
  weights.forEach((w, i) => {
    dots += `<circle cx="${toX(i).toFixed(1)}" cy="${toY(w).toFixed(1)}" r="4" fill="#a855f7" stroke="#111827" stroke-width="2"/>`;
  });

  const specialIdx = new Set([0, n - 1, weights.indexOf(minW), weights.indexOf(maxW)]);
  let valueLabels = '';
  specialIdx.forEach(i => {
    const x = toX(i);
    const y = toY(weights[i]);
    const above = y > PAD_T + 20;
    valueLabels += `<text x="${x.toFixed(1)}" y="${(above ? y - 8 : y + 18).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="rgba(255,255,255,0.9)">${weights[i].toFixed(1)}</text>`;
  });

  let xAxis = '';
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  for (let i = 0; i < n; i += step) {
    xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.7)">${labels[i]}</text>`;
  }

  [[minW, 'min'], [maxW, 'max']].forEach(([w]) => {
    const vy = toY(w);
    valueLabels += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${fill}${polyline}${dots}${valueLabels}${xAxis}</svg>`;
}

export function renderHrZonesChart(container, weekLabels, zonesData) {
  if (!container) return;
  const hasData = zonesData.some(week => week.some(z => z > 0));
  if (!hasData || weekLabels.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Import .FIT data to view HR zones.</p>';
    return;
  }

  const W = 400, H = 160, PAD_L = 40, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;
  const barW = Math.max(12, Math.floor(chartW / n) - 8);
  const colors = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
  let bars = '';

  weekLabels.forEach((label, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const weekZones = zonesData[i];
    const totalTime = weekZones.reduce((a, b) => a + b, 0) || 1;
    let currentY = PAD_T + chartH;
    weekZones.forEach((zTime, zIdx) => {
      if (zTime <= 0) return;
      const h = (zTime / totalTime) * chartH;
      currentY -= h;
      bars += `<rect x="${x.toFixed(1)}" y="${currentY.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="${colors[zIdx]}" opacity="0.9"/>`;
    });
  });

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = PAD_L + (i / n) * chartW + chartW / n / 2;
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  let yAxis = '';
  [0, 50, 100].forEach(pct => {
    const vy = PAD_T + chartH - (pct / 100) * chartH;
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.6)">${pct}%</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${xAxis}</svg>`;
}

export function renderCadenceChart(container, weekLabels, cadenceData) {
  if (!container) return;
  const valid = cadenceData.filter(c => c > 0);
  if (valid.length === 0 || weekLabels.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Import .FIT data to view cadence trends.</p>';
    return;
  }

  const W = 400, H = 150, PAD_L = 40, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const minC = Math.max(120, Math.min(...valid) - 5);
  const maxC = Math.max(...valid) + 5;
  const rangeC = Math.max(maxC - minC, 10);

  const toX = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY = c => PAD_T + chartH - ((c - minC) / rangeC) * chartH;

  let points = '';
  let dots = '';
  weekLabels.forEach((label, i) => {
    const c = cadenceData[i];
    if (c > 0) {
      const x = toX(i), y = toY(c);
      points += `${x.toFixed(1)},${y.toFixed(1)} `;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#f59e0b" stroke="#111827" stroke-width="2"/>
               <text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#f59e0b">${Math.round(c)}</text>`;
    }
  });

  const line = points.trim().split(' ').length >= 2
    ? `<polyline fill="none" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round" points="${points.trim()}"/>` : '';

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = toX(i);
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  let yAxis = '';
  [minC, Math.round((minC + maxC) / 2), maxC].forEach(val => {
    const vy = toY(val);
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.6)">${val}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${line}${dots}${xAxis}</svg>`;
}

export function render1RMProgressChart(container, weekLabels, sqData, bpData, dlData) {
  if (!container) return;
  const hasAny = (sqData.some(v => v > 0) || bpData.some(v => v > 0) || dlData.some(v => v > 0));
  if (!hasAny || weekLabels.length < 1) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Complete squat, bench or deadlift sets to see 1RM progress.</p>';
    return;
  }

  const W = 400, H = 190, PAD_L = 52, PAD_B = 30, PAD_T = 22, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const allVals = [...sqData, ...bpData, ...dlData].filter(v => v > 0);
  const minVal = Math.max(0, Math.min(...allVals) - 5);
  const maxVal = Math.max(...allVals) + 5;
  const range = Math.max(maxVal - minVal, 1);

  const toX = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY = v => PAD_T + chartH - ((v - minVal) / range) * chartH;

  // Y axis gridlines at 25%, 50%, 75%
  let yAxis = '';
  [0.25, 0.5, 0.75].forEach(pct => {
    const val = minVal + pct * range;
    const vy = toY(val);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.5)">${Math.round(val)}</text>`;
    yAxis += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
  });

  // X axis labels
  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = toX(i);
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.7)">${label}</text>`;
  });

  // Draw a series line + dots, skipping zeros
  const drawSeries = (data, color) => {
    const nonZero = data.map((v, i) => ({ v, i })).filter(p => p.v > 0);
    if (nonZero.length === 0) return '';
    let result = '';
    if (nonZero.length >= 2) {
      const pts = nonZero.map(p => `${toX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(' ');
      result += `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/>`;
    }
    nonZero.forEach(p => {
      result += `<circle cx="${toX(p.i).toFixed(1)}" cy="${toY(p.v).toFixed(1)}" r="4" fill="${color}" stroke="#111827" stroke-width="1.5"/>`;
    });
    return result;
  };

  const series = drawSeries(sqData, '#3b82f6') + drawSeries(bpData, '#10b981') + drawSeries(dlData, '#f59e0b');

  // Legend at top
  const legend =
    `<circle cx="${PAD_L}" cy="10" r="5" fill="#3b82f6"/>` +
    `<text x="${PAD_L + 8}" y="14" font-size="10" fill="rgba(255,255,255,0.8)">SQ</text>` +
    `<circle cx="${PAD_L + 38}" cy="10" r="5" fill="#10b981"/>` +
    `<text x="${PAD_L + 46}" y="14" font-size="10" fill="rgba(255,255,255,0.8)">BP</text>` +
    `<circle cx="${PAD_L + 76}" cy="10" r="5" fill="#f59e0b"/>` +
    `<text x="${PAD_L + 84}" y="14" font-size="10" fill="rgba(255,255,255,0.8)">DL</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${series}${xAxis}${legend}</svg>`;
}

export function renderBodyWeightWithMA(container, bwLog) {
  if (!container) return;
  const validEntries = (bwLog || []).filter(e => e && e.date && e.weight > 0);
  if (validEntries.length < 3) {
    renderBodyWeightChart(container, bwLog);
    return;
  }

  const sorted = [...validEntries].sort((a, b) => a.date.localeCompare(b.date));
  const weights = sorted.map(e => e.weight);
  const labels  = sorted.map(e => formatDayMonth(e.date));
  const n = weights.length;

  const W = 400, H = 165, PAD_L = 48, PAD_B = 30, PAD_T = 22, PAD_R = 12;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;

  const minW = Math.min(...weights) - 0.8;
  const maxW = Math.max(...weights) + 0.8;
  const rangeW = Math.max(maxW - minW, 1);

  const toX = i => PAD_L + (i / (n - 1)) * chartW;
  const toY = w => PAD_T + chartH - ((w - minW) / rangeW) * chartH;

  // Compute 7-day moving average (rolling window from index 0)
  const ma = weights.map((_, i) => {
    const window = weights.slice(Math.max(0, i - 6), i + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });

  // Raw line fill
  const fillPath = `M ${toX(0).toFixed(1)},${(PAD_T + chartH).toFixed(1)} ` +
    weights.map((w, i) => `L ${toX(i).toFixed(1)},${toY(w).toFixed(1)}`).join(' ') +
    ` L ${toX(n - 1).toFixed(1)},${(PAD_T + chartH).toFixed(1)} Z`;
  const fill = `<path d="${fillPath}" fill="#a855f7" opacity="0.10"/>`;

  // Raw line
  const rawPoints = weights.map((w, i) => `${toX(i).toFixed(1)},${toY(w).toFixed(1)}`).join(' ');
  const rawLine = `<polyline fill="none" stroke="#a855f7" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${rawPoints}"/>`;

  // Raw dots
  let rawDots = '';
  weights.forEach((w, i) => {
    rawDots += `<circle cx="${toX(i).toFixed(1)}" cy="${toY(w).toFixed(1)}" r="3" fill="#a855f7" opacity="0.7"/>`;
  });

  // MA dashed line
  const maPoints = ma.map((w, i) => `${toX(i).toFixed(1)},${toY(w).toFixed(1)}`).join(' ');
  const maLine = `<polyline fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2.5" stroke-dasharray="5,3" stroke-linejoin="round" stroke-linecap="round" points="${maPoints}"/>`;

  // Y axis: min, mid, max
  let yAxis = '';
  const midW = (minW + maxW) / 2;
  [minW, midW, maxW].forEach(w => {
    const vy = toY(w);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${w.toFixed(1)}</text>`;
    yAxis += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`;
  });

  // X axis dates
  let xAxis = '';
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  for (let i = 0; i < n; i += step) {
    xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.7)">${labels[i]}</text>`;
  }

  // Legend top-left
  const legend =
    `<circle cx="${PAD_L}" cy="11" r="4" fill="#a855f7"/>` +
    `<text x="${PAD_L + 8}" y="15" font-size="10" fill="rgba(255,255,255,0.75)">Daily</text>` +
    `<line x1="${PAD_L + 42}" y1="11" x2="${PAD_L + 58}" y2="11" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-dasharray="4,2"/>` +
    `<text x="${PAD_L + 62}" y="15" font-size="10" fill="rgba(255,255,255,0.75)">7d MA</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${fill}${rawLine}${rawDots}${maLine}${xAxis}${legend}</svg>`;
}

export function renderConsistencyHeatmap(container, trainingDays, weekLabels) {
  if (!container) return;
  if (!trainingDays || trainingDays.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log workouts to see your training calendar.</p>';
    return;
  }

  const CELL = 13, GAP = 2, STEP = 15;
  const PAD_L = 20, PAD_T = 18;
  const nWeeks = weekLabels.length;
  const nDays = 7;
  const gridW = PAD_L + nWeeks * STEP;
  const gridH = PAD_T + nDays * STEP;
  const legendH = 18;
  const totalH = gridH + legendH;

  // Background grid
  let bg = '';
  for (let w = 0; w < nWeeks; w++) {
    for (let d = 0; d < nDays; d++) {
      const cx = PAD_L + w * STEP;
      const cy = PAD_T + d * STEP;
      bg += `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" fill="rgba(255,255,255,0.05)" rx="2"/>`;
    }
  }

  // Week labels above columns
  let wkLabels = '';
  weekLabels.forEach((lbl, w) => {
    const cx = PAD_L + w * STEP + CELL / 2;
    wkLabels += `<text x="${cx}" y="${PAD_T - 4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.4)">${lbl}</text>`;
  });

  // Day labels left column
  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  let dayLabels = '';
  dayNames.forEach((name, d) => {
    const cy = PAD_T + d * STEP + CELL / 2 + 3;
    dayLabels += `<text x="${PAD_L - 4}" y="${cy}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.4)">${name}</text>`;
  });

  // Overlay trained cells
  let cells = '';
  trainingDays.forEach(({ week, dayIdx, gym, run }) => {
    const w = week - 1;
    // Number.isFinite first: a non-numeric week key (an archived activation)
    // parses to NaN, and every NaN comparison below is false — so the range
    // guard alone let it through and emitted <rect x="NaN">, an invisible cell.
    if (!Number.isFinite(w) || !Number.isFinite(dayIdx)) return;
    if (w < 0 || w >= nWeeks || dayIdx < 0 || dayIdx >= nDays) return;
    const cx = PAD_L + w * STEP;
    const cy = PAD_T + dayIdx * STEP;
    let color;
    if (gym && run) color = '#10b981';
    else if (gym)   color = '#3b82f6';
    else if (run)   color = '#ec4899';
    else return;
    cells += `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" fill="${color}" opacity="0.85" rx="2"/>`;
  });

  // Legend row at bottom
  const ly = gridH + 4;
  const legend =
    `<rect x="${PAD_L}" y="${ly}" width="10" height="10" fill="#3b82f6" rx="2"/>` +
    `<text x="${PAD_L + 13}" y="${ly + 8}" font-size="9" fill="rgba(255,255,255,0.7)">Gym</text>` +
    `<rect x="${PAD_L + 38}" y="${ly}" width="10" height="10" fill="#ec4899" rx="2"/>` +
    `<text x="${PAD_L + 51}" y="${ly + 8}" font-size="9" fill="rgba(255,255,255,0.7)">Run</text>` +
    `<rect x="${PAD_L + 74}" y="${ly}" width="10" height="10" fill="#10b981" rx="2"/>` +
    `<text x="${PAD_L + 87}" y="${ly + 8}" font-size="9" fill="rgba(255,255,255,0.7)">Both</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${gridW} ${totalH}" style="width:100%;height:auto;display:block;">${bg}${wkLabels}${dayLabels}${cells}${legend}</svg>`;
}

export function renderPaceLineChart(container, weekLabels, paceData, thresholdSecs) {
  if (!container) return;
  const nonZero = paceData.filter(s => s > 0);
  if (nonZero.length === 0 || weekLabels.length < 1) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log runs with time to see pace trend.</p>';
    return;
  }

  const W = 400, H = 165, PAD_L = 44, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const minPace = Math.min(...nonZero) - 5;
  const maxPace = Math.max(...nonZero) + 5;
  const range = Math.max(maxPace - minPace, 1);

  const toX = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY = s => PAD_T + chartH - ((s - minPace) / range) * chartH;

  const fmtPace = s => {
    const sec = Math.round(s);
    return Math.floor(sec / 60) + ':' + (sec % 60).toString().padStart(2, '0');
  };

  // Y axis gridlines at 3 levels
  let yAxis = '';
  [0.25, 0.5, 0.75].forEach(pct => {
    const val = minPace + pct * range;
    const vy = toY(val);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.5)">${fmtPace(val)}</text>`;
    yAxis += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
  });

  // Threshold band and line
  let thresholdSvg = '';
  if (thresholdSecs > 0) {
    const ty = toY(thresholdSecs);
    const easyY = toY(thresholdSecs * 1.15);
    // Shade band between threshold and easy zone (lower secs = higher on chart)
    const bandTop = Math.min(ty, easyY);
    const bandBot = Math.max(ty, easyY);
    const bandH = bandBot - bandTop;
    if (bandH > 0) {
      thresholdSvg += `<rect x="${PAD_L}" y="${bandTop.toFixed(1)}" width="${chartW}" height="${bandH.toFixed(1)}" fill="#f59e0b" opacity="0.10"/>`;
    }
    thresholdSvg += `<line x1="${PAD_L}" y1="${ty.toFixed(1)}" x2="${W - PAD_R}" y2="${ty.toFixed(1)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.8"/>`;
    thresholdSvg += `<text x="${W - PAD_R}" y="${(ty - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#f59e0b">Threshold</text>`;
  }

  // Smooth bezier pace line + gradient fill + coloured dots
  const paceNonZero = weekLabels.map((_, i) => {
    if (paceData[i] <= 0) return null;
    return [toX(i), toY(paceData[i]), i];
  }).filter(Boolean);

  let dots = '';
  let line  = '';
  if (paceNonZero.length >= 2) {
    const paceGrad = _uid();
    const pts    = paceNonZero.map(p => [p[0], p[1]]);
    const smooth = _smoothBezierPath(pts);
    const areaD  = smooth + ` L ${pts[pts.length-1][0].toFixed(1)},${(PAD_T+chartH).toFixed(1)} L ${pts[0][0].toFixed(1)},${(PAD_T+chartH).toFixed(1)} Z`;
    line = `<defs><linearGradient id="${paceGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ec4899" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#ec4899" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${areaD}" fill="url(#${paceGrad})"/>
    <path d="${smooth}" fill="none" stroke="rgba(236,72,153,0.8)" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  paceNonZero.forEach(([x, y, i]) => {
    const s = paceData[i];
    let dotColor = '#ec4899';
    if (thresholdSecs > 0) {
      dotColor = s > thresholdSecs * 1.15 ? '#10b981' : s > thresholdSecs ? '#f59e0b' : '#ef4444';
    }
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${dotColor}" stroke="#0d1117" stroke-width="1.5"/>`;
  });

  // X axis
  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = toX(i);
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.7)">${label}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${thresholdSvg}${line}${dots}${xAxis}</svg>`;
}

export function renderACWRChart(container, weekLabels, atlSeries, ctlSeries) {
  if (!container) return;
  const valid = atlSeries.some(v => v > 0) || ctlSeries.some(v => v > 0);
  if (!valid || weekLabels.length < 2) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log sessions with RPE and duration to unlock load history.</p>';
    return;
  }

  const W = 400, H = 200, PAD_L = 42, PAD_B = 28, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const maxVal = Math.max(...atlSeries, ...ctlSeries, 1);
  const toX = i => PAD_L + (i / (n - 1)) * chartW;
  const toY = v => PAD_T + chartH - (v / maxVal) * chartH;

  // Safe zone band: ATL 0.8–1.3× CTL
  let bandSvg = '';
  let safePts1 = '', safePts2 = '';
  for (let i = 0; i < n; i++) {
    const ctl = ctlSeries[i];
    if (ctl > 0) {
      safePts1 += `${toX(i).toFixed(1)},${toY(ctl * 0.8).toFixed(1)} `;
      safePts2 += `${toX(i).toFixed(1)},${toY(ctl * 1.3).toFixed(1)} `;
    }
  }
  const allPts = safePts1 + safePts2.split(' ').filter(Boolean).reverse().join(' ');
  if (allPts.trim()) {
    bandSvg = `<polygon points="${allPts}" fill="#10b981" opacity="0.08"/>`;
  }

  // CTL line (blue, dashed) — smooth bezier
  const ctlNonZero = ctlSeries.map((v, i) => v > 0 ? [toX(i), toY(v)] : null).filter(Boolean);
  const ctlLine = ctlNonZero.length >= 2
    ? `<path d="${_smoothBezierPath(ctlNonZero)}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6,3" stroke-linecap="round"/>`
    : '';

  // ATL line (amber, solid) — smooth bezier + gradient area fill
  const atlNonZero = atlSeries.map((v, i) => v > 0 ? [toX(i), toY(v), i] : null).filter(Boolean);
  let atlLine = '', atlDots = '';
  if (atlNonZero.length >= 2) {
    const atlPts  = atlNonZero.map(p => [p[0], p[1]]);
    const smooth  = _smoothBezierPath(atlPts);
    const atlGrad = _uid();
    const areaD   = smooth + ` L ${atlPts[atlPts.length-1][0].toFixed(1)},${(PAD_T+chartH).toFixed(1)} L ${atlPts[0][0].toFixed(1)},${(PAD_T+chartH).toFixed(1)} Z`;
    atlLine = `<defs><linearGradient id="${atlGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${areaD}" fill="url(#${atlGrad})"/>
    <path d="${smooth}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>`;
  } else if (atlNonZero.length === 1) {
    atlLine = '';
  }
  atlNonZero.forEach(([cx, cy, i]) => {
    const acwr = ctlSeries[i] > 0 ? atlSeries[i] / ctlSeries[i] : 0;
    const dc   = acwr === 0 ? '#94a3b8' : acwr <= 1.0 ? '#10b981' : acwr <= 1.3 ? '#f59e0b' : '#ef4444';
    atlDots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${dc}" stroke="#0d1117" stroke-width="1.5"/>`;
  });

  // Y axis gridlines
  let yAxis = '';
  [0.25, 0.5, 0.75, 1].forEach(pct => {
    const val = Math.round(maxVal * pct);
    const vy  = toY(maxVal * pct);
    yAxis += `<text x="${PAD_L - 5}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.45)">${val}</text>`;
    yAxis += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });

  // X axis labels (show every 2nd to avoid crowding)
  let xAxis = '';
  weekLabels.forEach((label, i) => {
    if (n > 8 && i % 2 !== 0) return;
    xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.6)">${label}</text>`;
  });

  // Legend
  const legend = `
    <text x="${PAD_L}" y="${PAD_T - 2}" font-size="9" fill="#f59e0b">▬ ATL (acute)</text>
    <text x="${PAD_L + 90}" y="${PAD_T - 2}" font-size="9" fill="#3b82f6" stroke-dasharray="4,2">- - CTL (chronic)</text>
    <text x="${PAD_L + 195}" y="${PAD_T - 2}" font-size="9" fill="#10b981">■ Safe zone</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bandSvg}${ctlLine}${atlLine}${atlDots}${xAxis}${legend}</svg>`;
}
