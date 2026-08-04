// @ts-check
// ==========================================
// STRENGTH CHARTS — analytics/charts/strength-charts.js
// All return SVG or inject into container.
// ==========================================
import { uid, bezierPath, linearGradientV, gridLines, xAxisLabels, areaFill, dotSeries, refLine, trendLinePath, rollingAvgPath } from './chart-primitives.js';
import { zoneColor } from '../calculations/volume-landmarks.js';
import { escapeHtml } from '../../util.js';

// 1RM Progression chart with projection line and rolling average.
export function render1RMProgressionChart(container, weekLabels, series, trend, rolling4, lifetimePR, liftName, unit = 'kg') {
  if (!container) return;
  const nonZero = series.filter(v => v > 0);
  if (nonZero.length < 2) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Complete 2+ weeks of ${escapeHtml(liftName)} to see progression.</p>`;
    return;
  }

  const W = 400, H = 180, PL = 50, PR = 15, PT = 22, PB = 28;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = weekLabels.length;
  const extendBy = trend.length - n;

  const allVals = [...series, ...(trend || [])].filter(v => v > 0 && isFinite(v));
  const minV = Math.min(...allVals) - 2;
  const maxV = Math.max(...allVals) + 5;
  const range = Math.max(maxV - minV, 1);

  const toX = i => PL + (i / (n + extendBy - 1)) * chartW;
  const toY = v => PT + chartH - ((v - minV) / range) * chartH;

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, '#3b82f6', 0.3, '#3b82f6', 0)}</defs>`;

  const pts = series.map((v, i) => v > 0 ? [toX(i), toY(v)] : null).filter(Boolean);
  const smooth = pts.length >= 2 ? bezierPath(pts) : '';
  const area = smooth ? areaFill(smooth, pts, PT + chartH, gId) : '';
  const mainLine = smooth ? `<path d="${smooth}" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/>` : '';
  const dots = dotSeries(pts, '#3b82f6', 4);

  // Trend extension (dashed, lighter)
  let trendExt = '';
  if (trend && trend.length > n) {
    const extPts = trend.slice(n - 1).map((v, i) => [`${toX(n - 1 + i).toFixed(1)}`, `${toY(v).toFixed(1)}`]);
    const extStr = extPts.map(([x, y]) => `${x},${y}`).join(' ');
    trendExt = `<polyline points="${extStr}" fill="none" stroke="#60a5fa" stroke-width="2" stroke-dasharray="5,3" stroke-linecap="round" opacity="0.7"/>`;
    // Future dot
    const lastExt = trend[trend.length - 1];
    trendExt += `<circle cx="${toX(trend.length - 1).toFixed(1)}" cy="${toY(lastExt).toFixed(1)}" r="5" fill="#60a5fa" stroke="#0d1117" stroke-width="1.5" opacity="0.85"/>`;
    trendExt += `<text x="${toX(trend.length - 1).toFixed(1)}" y="${(toY(lastExt) - 9).toFixed(1)}" text-anchor="middle" font-size="9" fill="#60a5fa">${Math.round(lastExt)} ${unit}</text>`;
  }

  // Rolling avg
  const raLine = rollingAvgPath(rolling4, toX, toY, 'rgba(255,255,255,0.5)');

  // Lifetime PR line
  const prLine = lifetimePR > 0 ? refLine(toY(lifetimePR), PL, W, PR, `PR ${Math.round(lifetimePR)} ${unit}`, '#10b981', true) : '';

  // Y ticks
  const ticks = [0.25, 0.5, 0.75, 1].map(p => minV + p * range);
  const grid  = gridLines(ticks, toY, PL, W, PR, v => Math.round(v));

  // X labels (show program weeks, skip every 2 if crowded)
  const step = n > 8 ? 2 : 1;
  const xLabels = xAxisLabels(weekLabels, toX, H - 5, { step });

  // Legend
  const legend = `<text x="${PL}" y="13" font-size="9" fill="#3b82f6">▬ e1RM</text>
    <text x="${PL + 42}" y="13" font-size="9" fill="rgba(255,255,255,0.5)">- - 4wk avg</text>
    <text x="${PL + 102}" y="13" font-size="9" fill="#60a5fa">-- Projection</text>
    <text x="${PL + 172}" y="13" font-size="9" fill="#10b981">— PR</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${defs}${grid}${prLine}${area}${mainLine}${trendExt}${raLine}${dots}${xLabels}${legend}</svg>`;
}

// Volume Progression chart: bars + rolling average overlay + trend line.
export function renderVolumeProgressionChart(container, weekLabels, volSeries, rolling4, trendArr, unit = 'kg') {
  if (!container) return;
  const hasData = volSeries.some(v => v > 0);
  if (!hasData) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Log strength sessions to see volume trends.</p>';
    return;
  }

  const W = 400, H = 180, PL = 50, PR = 15, PT = 20, PB = 28;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = weekLabels.length;
  const maxV = Math.max(...volSeries, 1);

  const toX = i => PL + (i / n) * chartW;
  const barW = Math.max(6, Math.floor(chartW / n) - 4);
  const toY  = v => PT + chartH - (v / maxV) * chartH;

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, '#3b82f6', 1, '#1e3a8a', 0.55)}</defs>`;

  let bars = '';
  volSeries.forEach((v, i) => {
    if (v <= 0) return;
    const x = toX(i) + (chartW / n - barW) / 2;
    const bh = Math.max(3, (v / maxV) * chartH);
    const y  = PT + chartH - bh;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${bh.toFixed(1)}" fill="url(#${gId})" rx="3" opacity="0.85"/>`;
  });

  const ticks = [0.25, 0.5, 0.75, 1].map(p => maxV * p);
  const grid  = gridLines(ticks, toY, PL, W, PR, v => v > 999 ? (v / 1000).toFixed(1) + 'k' : Math.round(v));

  const centreX = i => PL + (i / n) * chartW + chartW / n / 2;
  const raLine  = rollingAvgPath(rolling4, centreX, toY, 'rgba(255,255,255,0.65)');
  const trLine  = trendLinePath(trendArr, centreX, toY, n, 'rgba(96,165,250,0.5)');

  const step = n > 8 ? 2 : 1;
  const xLabels = xAxisLabels(weekLabels, centreX, H - 5, { step });

  const legend = `<text x="${PL}" y="12" font-size="9" fill="#3b82f6">▪ Volume (${unit})</text>
    <text x="${PL + 74}" y="12" font-size="9" fill="rgba(255,255,255,0.55)">— 4wk avg</text>
    <text x="${PL + 122}" y="12" font-size="9" fill="rgba(96,165,250,0.5)">- - Trend</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${defs}${grid}${bars}${raLine}${trLine}${xLabels}${legend}</svg>`;
}

// Muscle Group Balance bar chart — horizontal bars showing relative volume per group.
// Volume-landmark chart: one row per muscle group showing weekly sets against
// broad typical-volume window. The shaded bands are guidance zones; the
// filled bar is the current volume (coloured by which zone it lands in); the
// dashed line marks the transition into the upper typical range.
// `rows` = ordered array of { group|name, sets, mev, mav, mrv, zone }.
export function renderVolumeLandmarkChart(container, rows) {
  if (!container) return;
  const data = (rows || []).filter(r => r && r.mrv > 0);
  const hasData = data.some(r => (r.sets || 0) > 0);
  if (!hasData) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Log strength exercises to see estimated set credits.</p>';
    return;
  }

  const W = 340, PL = 66, PR = 34, PT = 6, H_PER_ROW = 30, BAR_H = 12;
  const barArea = W - PL - PR;
  const H = PT + data.length * H_PER_ROW + 4;

  let svg = '';
  data.forEach((r, i) => {
    const label = r.name || r.group || '';
    const sets  = r.sets || 0;
    const scale = Math.max(r.mrv * 1.15, sets * 1.05, 1);
    const X = v => PL + Math.min(v / scale, 1) * barArea;
    const rowY = PT + i * H_PER_ROW;
    const barY = rowY + 6;
    const col  = zoneColor(r.zone);

    // Track base, then broad guidance bands.
    svg += `<rect x="${PL}" y="${barY}" width="${barArea}" height="${BAR_H}" fill="rgba(255,255,255,0.05)" rx="3"/>`;
    svg += `<rect x="${X(r.mev).toFixed(1)}" y="${barY}" width="${(X(r.mav) - X(r.mev)).toFixed(1)}" height="${BAR_H}" fill="${zoneColor('growth')}" opacity="0.14"/>`;
    svg += `<rect x="${X(r.mav).toFixed(1)}" y="${barY}" width="${(X(r.mrv) - X(r.mav)).toFixed(1)}" height="${BAR_H}" fill="${zoneColor('optimal')}" opacity="0.18"/>`;
    svg += `<rect x="${X(r.mrv).toFixed(1)}" y="${barY}" width="${(W - PR - X(r.mrv)).toFixed(1)}" height="${BAR_H}" fill="${zoneColor('overreaching')}" opacity="0.12"/>`;

    // Current volume bar.
    const bw = Math.max(2, X(sets) - PL);
    svg += `<rect x="${PL}" y="${barY}" width="${bw.toFixed(1)}" height="${BAR_H}" fill="${col}" opacity="0.9" rx="3"/>`;

    // Upper-range transition marker (dashed).
    svg += `<line x1="${X(r.mav).toFixed(1)}" y1="${barY - 2}" x2="${X(r.mav).toFixed(1)}" y2="${barY + BAR_H + 2}" stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-dasharray="2 2"/>`;

    // Labels: group on the left, current sets on the right.
    svg += `<text x="${PL - 6}" y="${barY + BAR_H - 2}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.8)">${label}</text>`;
    svg += `<text x="${W - PR + 3}" y="${barY + BAR_H - 2}" font-size="10" font-weight="700" fill="${col}">${sets > 0 ? sets.toFixed(sets % 1 ? 1 : 0) : '–'}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${svg}</svg>`;
}

export function renderMuscleGroupBalanceChart(container, groupNames, currentSets, muscleStatus) {
  if (!container) return;
  const hasData = Object.values(currentSets || {}).some(v => v > 0);
  if (!hasData) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Complete strength sessions to see muscle balance.</p>';
    return;
  }

  const groups = groupNames.filter(g => currentSets[g] !== undefined);
  const maxSets = Math.max(...groups.map(g => currentSets[g] || 0), 1);

  const H_PER_ROW = 28;
  const W = 320, PL = 80, PR = 40, PT = 10;
  const barArea = W - PL - PR;
  const H = PT + groups.length * H_PER_ROW + 10;

  let svgContent = '';
  groups.forEach((g, i) => {
    const sets = currentSets[g] || 0;
    const pct  = sets / maxSets;
    const y    = PT + i * H_PER_ROW;
    const bw   = Math.max(2, pct * barArea);
    const col  = zoneColor(muscleStatus?.[g]);

    svgContent += `<text x="${PL - 6}" y="${y + 14}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.8)">${g}</text>`;
    svgContent += `<rect x="${PL}" y="${y + 4}" width="${bw.toFixed(1)}" height="16" fill="${col}" opacity="0.85" rx="3"/>`;
    svgContent += `<text x="${PL + bw + 5}" y="${y + 14}" font-size="10" fill="${col}" font-weight="700">${sets > 0 ? sets.toFixed(1) : '–'}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${svgContent}</svg>`;
}

// Strength consistency calendar heatmap — intensity varies with volume.
export function renderVolumeCalendarHeatmap(container, trainingDays, weekLabels, volSeries) {
  if (!container || !trainingDays || trainingDays.length === 0) {
    if (container) container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:8px 0;">Log training sessions to see your calendar.</p>';
    return;
  }

  const maxVol  = Math.max(...volSeries.filter(v => v > 0), 1);
  const CELL = 13, STEP = 15, PL = 20, PT = 18;
  const nWeeks  = weekLabels.length, nDays = 7;
  const W = PL + nWeeks * STEP + 10;
  const H = PT + nDays * STEP + 20;

  let bg = '';
  for (let w = 0; w < nWeeks; w++) for (let d = 0; d < nDays; d++) {
    bg += `<rect x="${PL + w * STEP}" y="${PT + d * STEP}" width="${CELL}" height="${CELL}" fill="rgba(255,255,255,0.05)" rx="2"/>`;
  }

  let wkLabels = '';
  weekLabels.forEach((lbl, w) => {
    wkLabels += `<text x="${(PL + w * STEP + CELL / 2).toFixed(1)}" y="${PT - 4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.4)">${lbl}</text>`;
  });

  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  let dayLabels = '';
  dayNames.forEach((n, d) => {
    dayLabels += `<text x="${PL - 4}" y="${PT + d * STEP + CELL / 2 + 3}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.4)">${n}</text>`;
  });

  let cells = '';
  trainingDays.forEach(({ week, dayIdx, gym, run }) => {
    const w = week - 1;
    // See renderConsistencyHeatmap: a NaN week index passes every range check,
    // so reject non-finite coordinates before they reach an SVG attribute.
    if (!Number.isFinite(w) || !Number.isFinite(dayIdx)) return;
    if (w < 0 || w >= nWeeks || dayIdx < 0 || dayIdx >= nDays) return;
    const weekVol = volSeries[w] || 0;
    const intensity = weekVol > 0 ? Math.max(0.3, Math.min(1, weekVol / maxVol)) : 0.3;
    let color;
    if (gym && run) color = `rgba(16,185,129,${intensity})`;
    else if (gym)   color = `rgba(59,130,246,${intensity})`;
    else if (run)   color = `rgba(236,72,153,${intensity})`;
    else return;
    cells += `<rect x="${PL + w * STEP}" y="${PT + dayIdx * STEP}" width="${CELL}" height="${CELL}" fill="${color}" rx="2"/>`;
  });

  const ly = PT + nDays * STEP + 4;
  const legend = `<rect x="${PL}" y="${ly}" width="10" height="10" fill="#3b82f6" rx="2"/>
    <text x="${PL + 13}" y="${ly + 8}" font-size="9" fill="rgba(255,255,255,0.7)">Strength</text>
    <rect x="${PL + 60}" y="${ly}" width="10" height="10" fill="#ec4899" rx="2"/>
    <text x="${PL + 73}" y="${ly + 8}" font-size="9" fill="rgba(255,255,255,0.7)">Run</text>
    <rect x="${PL + 100}" y="${ly}" width="10" height="10" fill="#10b981" rx="2"/>
    <text x="${PL + 113}" y="${ly + 8}" font-size="9" fill="rgba(255,255,255,0.7)">Both</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${bg}${wkLabels}${dayLabels}${cells}${legend}</svg>`;
}
