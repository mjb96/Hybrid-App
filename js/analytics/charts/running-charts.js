// @ts-check
// ==========================================
// RUNNING CHARTS — analytics/charts/running-charts.js
// ==========================================
import { uid, bezierPath, linearGradientV, gridLines, xAxisLabels, areaFill, dotSeries, refLine, shadedBand, trendLinePath, rollingAvgPath } from './chart-primitives.js';

function fmtPace(secs) {
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// Enhanced pace chart: raw pace + 4-week rolling average + fitness trend + threshold band + best-effort marker.
export function renderEnhancedPaceChart(container, weekLabels, paceSeries, rolling4, trendArr, thresholdSecs) {
  if (!container) return;
  const nonZero = paceSeries.filter(v => v > 0);
  if (nonZero.length < 2) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Log 2+ weeks with run times to see pace analysis.</p>';
    return;
  }

  const W = 400, H = 185, PL = 46, PR = 15, PT = 20, PB = 30;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = weekLabels.length;

  const allVals = [...paceSeries, thresholdSecs].filter(v => v > 0);
  const minPace = Math.min(...allVals) - 8;
  const maxPace = Math.max(...allVals) + 8;
  const range   = Math.max(maxPace - minPace, 1);

  const centreX  = i => PL + (i / n) * chartW + chartW / n / 2;
  const toY      = v => PT + chartH - ((v - minPace) / range) * chartH;

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, '#ec4899', 0.25, '#ec4899', 0)}</defs>`;

  // Threshold band
  let threshSvg = '';
  if (thresholdSecs > 0) {
    const ty   = toY(thresholdSecs);
    const easyY = toY(thresholdSecs * 1.15);
    threshSvg  = shadedBand(ty, easyY, PL, W, PR, '#f59e0b', 0.1);
    threshSvg += refLine(ty, PL, W, PR, `T ${fmtPace(thresholdSecs)}`, '#f59e0b', true);
  }

  // Main pace line + fill
  const pts    = paceSeries.map((v, i) => v > 0 ? [centreX(i), toY(v)] : null).filter(Boolean);
  const smooth = pts.length >= 2 ? bezierPath(pts) : '';
  const area   = smooth ? areaFill(smooth, pts, PT + chartH, gId) : '';
  const line   = smooth ? `<path d="${smooth}" fill="none" stroke="rgba(236,72,153,0.85)" stroke-width="2.5" stroke-linecap="round"/>` : '';

  // Colour dots by zone (green=easy, amber=moderate, red=threshold/hard)
  let pDots = '';
  pts.forEach(([cx, cy], idx) => {
    const rawI = paceSeries.findIndex((v, i) => v > 0 && pts.slice(0, idx + 1).length === idx + 1);
    const pace = paceSeries[pts.map((_, ii) => ({ ii })).findIndex((_, ii) => paceSeries.filter(v => v > 0)[idx] !== undefined)]; // get original pace
    let color = '#ec4899';
    if (thresholdSecs > 0) {
      const p = nonZero[idx] || 0;
      color = p > thresholdSecs * 1.15 ? '#10b981' : p > thresholdSecs ? '#f59e0b' : '#ef4444';
    }
    pDots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="${color}" stroke="#0d1117" stroke-width="1.5"/>`;
  });

  // Best effort marker (fastest pace dot labelled)
  const bestPace = Math.min(...nonZero);
  const bestIdx  = paceSeries.findIndex(v => v === bestPace);
  if (bestIdx >= 0) {
    const bx = centreX(bestIdx), by = toY(bestPace);
    pDots += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="6" fill="none" stroke="#f59e0b" stroke-width="1.5"/>`;
    pDots += `<text x="${bx.toFixed(1)}" y="${(by - 10).toFixed(1)}" text-anchor="middle" font-size="9" fill="#f59e0b">Best ${fmtPace(bestPace)}</text>`;
  }

  // Rolling average and trend
  const raLine = rollingAvgPath(rolling4, centreX, toY, 'rgba(255,255,255,0.6)');
  const trLine = trendLinePath(trendArr, centreX, toY, n, 'rgba(96,165,250,0.45)');

  const ticks = [0.25, 0.5, 0.75, 1].map(p => minPace + p * range);
  const grid  = gridLines(ticks, toY, PL, W, PR, fmtPace);
  const step  = n > 8 ? 2 : 1;
  const xLbl  = xAxisLabels(weekLabels, centreX, H - 5, { step });

  const legend = `<text x="${PL}" y="12" font-size="9" fill="#ec4899">▬ Pace</text>
    <text x="${PL + 40}" y="12" font-size="9" fill="rgba(255,255,255,0.55)">— 4wk avg</text>
    <text x="${PL + 90}" y="12" font-size="9" fill="rgba(96,165,250,0.5)">-- Trend</text>
    <text x="${PL + 130}" y="12" font-size="9" fill="#f59e0b">○ Threshold</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${defs}${grid}${threshSvg}${area}${line}${raLine}${trLine}${pDots}${xLbl}${legend}</svg>`;
}

// Aerobic Efficiency chart: pace/HR ratio trend (lower = more efficient).
export function renderAerobicEfficiencyChart(container, weekLabels, effSeries, rolling4) {
  if (!container) return;
  const nonZero = effSeries.filter(v => v > 0);
  if (nonZero.length < 2) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Log runs with heart rate to see aerobic efficiency.</p>';
    return;
  }

  const W = 400, H = 155, PL = 44, PR = 15, PT = 18, PB = 28;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n      = weekLabels.length;

  const minV  = Math.min(...nonZero) * 0.97;
  const maxV  = Math.max(...nonZero) * 1.03;
  const range = Math.max(maxV - minV, 0.1);

  const centreX = i => PL + (i / n) * chartW + chartW / n / 2;
  const toY     = v => PT + chartH - ((v - minV) / range) * chartH;

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, '#22d3ee', 0.25, '#22d3ee', 0)}</defs>`;

  const pts    = effSeries.map((v, i) => v > 0 ? [centreX(i), toY(v)] : null).filter(Boolean);
  const smooth = pts.length >= 2 ? bezierPath(pts) : '';
  const area   = smooth ? areaFill(smooth, pts, PT + chartH, gId) : '';
  const line   = smooth ? `<path d="${smooth}" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round"/>` : '';
  const dots   = dotSeries(pts, '#22d3ee', 4);
  const raLine = rollingAvgPath(rolling4, centreX, toY, 'rgba(255,255,255,0.6)');

  const ticks  = [0.25, 0.5, 0.75, 1].map(p => minV + p * range);
  const grid   = gridLines(ticks, toY, PL, W, PR, v => v.toFixed(2));
  const step   = n > 8 ? 2 : 1;
  const xLbl   = xAxisLabels(weekLabels, centreX, H - 5, { step });

  const legend = `<text x="${PL}" y="11" font-size="9" fill="#22d3ee">Aerobic Efficiency (s/km per BPM) — lower = better</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${defs}${grid}${area}${line}${raLine}${dots}${xLbl}${legend}</svg>`;
}

// HR Zone distribution ring chart (donut).
export function renderHrZoneRingChart(container, zonePct) {
  if (!container) return;
  if (!zonePct || zonePct.every(v => v === 0)) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Import .FIT data to see HR zone distribution.</p>';
    return;
  }

  const COLORS = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
  const LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
  const W = 260, CX = 80, CY = 80, R = 60, r = 38;

  let cumAngle = -90; // start from top
  let slices = '';
  const pcts = zonePct.map(p => p || 0);

  pcts.forEach((pct, i) => {
    if (pct === 0) return;
    const angle = (pct / 100) * 360;
    const start = cumAngle;
    const end   = cumAngle + angle;
    const rad = a => (a * Math.PI) / 180;

    const x1 = CX + R * Math.cos(rad(start));
    const y1 = CY + R * Math.sin(rad(start));
    const x2 = CX + R * Math.cos(rad(end));
    const y2 = CY + R * Math.sin(rad(end));
    const ix1 = CX + r * Math.cos(rad(start));
    const iy1 = CY + r * Math.sin(rad(start));
    const ix2 = CX + r * Math.cos(rad(end));
    const iy2 = CY + r * Math.sin(rad(end));
    const large = angle > 180 ? 1 : 0;

    slices += `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z" fill="${COLORS[i]}" opacity="0.9"/>`;
    cumAngle = end;
  });

  let legend = '';
  LABELS.forEach((lbl, i) => {
    const y = 16 + i * 22;
    legend += `<rect x="170" y="${y}" width="10" height="10" fill="${COLORS[i]}" rx="2"/>`;
    legend += `<text x="184" y="${y + 8}" font-size="11" fill="rgba(255,255,255,0.8)">${lbl}: ${pcts[i]}%</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} 160" style="width:100%;max-width:260px;height:auto;display:block;">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="22"/>
    ${slices}
    ${legend}
  </svg>`;
}

// Running distance progression with rolling average.
export function renderDistanceProgressionChart(container, weekLabels, distSeries, rolling4) {
  if (!container) return;
  const nonZero = distSeries.filter(v => v > 0);
  if (nonZero.length < 2) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Log 2+ weeks of running to see distance trends.</p>';
    return;
  }

  const W = 400, H = 165, PL = 44, PR = 15, PT = 18, PB = 28;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n     = weekLabels.length;
  const maxV  = Math.max(...distSeries, 1);

  const centreX = i => PL + (i / n) * chartW + chartW / n / 2;
  const barW    = Math.max(6, Math.floor(chartW / n) - 6);
  const toY     = v => PT + chartH - (v / maxV) * chartH;

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, '#ec4899', 0.9, '#be185d', 0.5)}</defs>`;

  let bars = '';
  distSeries.forEach((v, i) => {
    if (v <= 0) return;
    const x  = centreX(i) - barW / 2;
    const bh = Math.max(3, (v / maxV) * chartH);
    const y  = PT + chartH - bh;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${bh.toFixed(1)}" fill="url(#${gId})" rx="3"/>`;
  });

  const ticks  = [0.25, 0.5, 0.75, 1].map(p => maxV * p);
  const grid   = gridLines(ticks, toY, PL, W, PR, v => v.toFixed(0));
  const raLine = rollingAvgPath(rolling4, centreX, toY, 'rgba(255,255,255,0.6)');
  const step   = n > 8 ? 2 : 1;
  const xLbl   = xAxisLabels(weekLabels, centreX, H - 5, { step });

  const legend = `<text x="${PL}" y="11" font-size="9" fill="#ec4899">▪ Distance (km)</text>
    <text x="${PL + 88}" y="11" font-size="9" fill="rgba(255,255,255,0.55)">— 4wk avg</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${defs}${grid}${bars}${raLine}${xLbl}${legend}</svg>`;
}
