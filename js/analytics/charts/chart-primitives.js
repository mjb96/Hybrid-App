// @ts-check
// ==========================================
// CHART PRIMITIVES — analytics/charts/chart-primitives.js
// Shared SVG building blocks. No DOM writes — return SVG strings only.
// ==========================================

let _gid = 100;
export function uid() { return 'cp' + (++_gid); }

// Smooth cubic-bezier path through [x,y] points.
export function bezierPath(pts) {
  if (!pts || pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const t  = 0.38;
    const cp1x = p0[0] + (p1[0] - p0[0]) * t;
    const cp2x = p1[0] - (p1[0] - p0[0]) * t;
    d += ` C ${cp1x.toFixed(1)},${p0[1].toFixed(1)} ${cp2x.toFixed(1)},${p1[1].toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
  }
  return d;
}

// Gradient definition SVG string.
export function linearGradientV(id, colorTop, opTop, colorBot, opBot) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${colorTop}" stop-opacity="${opTop}"/>
    <stop offset="100%" stop-color="${colorBot}" stop-opacity="${opBot}"/>
  </linearGradient>`;
}

// Horizontal grid lines + y-axis labels.
export function gridLines(ticks, toY, PAD_L, W, PAD_R, fmt) {
  return ticks.map(val => {
    const y = toY(val);
    return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${PAD_L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.45)">${fmt ? fmt(val) : val}</text>`;
  }).join('');
}

// X-axis labels.
export function xAxisLabels(labels, toX, y, options = {}) {
  const { step = 1, highlightIdx = -1, fontSize = 10 } = options;
  return labels.map((label, i) => {
    if (i % step !== 0) return '';
    const isHL = i === highlightIdx;
    return `<text x="${toX(i).toFixed(1)}" y="${y}" text-anchor="middle" font-size="${fontSize}"
      font-weight="${isHL ? 700 : 500}"
      fill="${isHL ? '#60a5fa' : 'rgba(255,255,255,0.55)'}">${label}</text>`;
  }).join('');
}

// Area fill path (path + bottom baseline).
export function areaFill(smoothPath, pts, baseY, gradId) {
  if (!pts || pts.length < 2) return '';
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `<path d="${smoothPath} L ${last[0].toFixed(1)},${baseY.toFixed(1)} L ${first[0].toFixed(1)},${baseY.toFixed(1)} Z" fill="url(#${gradId})"/>`;
}

// Dot series with optional highlight.
export function dotSeries(pts, color, r = 4, stroke = '#0d1117', strokeW = 1.5) {
  return pts.map(([cx, cy]) =>
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="${strokeW}"/>`
  ).join('');
}

// Horizontal reference line with label.
export function refLine(y, PAD_L, W, PAD_R, label, color = '#f59e0b', dashed = true) {
  const dash = dashed ? 'stroke-dasharray="5,3"' : '';
  return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1.5" ${dash} opacity="0.85"/>
    <text x="${W - PAD_R}" y="${(y - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${color}">${label}</text>`;
}

// Shaded band between two y values.
export function shadedBand(y1, y2, PAD_L, W, PAD_R, color, opacity = 0.12) {
  const top = Math.min(y1, y2);
  const h   = Math.abs(y2 - y1);
  return `<rect x="${PAD_L}" y="${top.toFixed(1)}" width="${W - PAD_L - PAD_R}" height="${h.toFixed(1)}" fill="${color}" opacity="${opacity}"/>`;
}

// Trend line path (dashed) from regression array.
export function trendLinePath(trendArr, toX, toY, n, color = 'rgba(255,255,255,0.3)') {
  const pts = trendArr
    .slice(0, n)
    .map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(' ');
  if (!pts) return '';
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round"/>`;
}

// Rolling average line path (solid, semi-transparent).
export function rollingAvgPath(avgArr, toX, toY, color = 'rgba(255,255,255,0.6)') {
  const nonZero = avgArr
    .map((v, i) => ({ v, i }))
    .filter(p => p.v > 0);
  if (nonZero.length < 2) return '';
  const pts = nonZero.map(p => [toX(p.i), toY(p.v)]);
  return `<path d="${bezierPath(pts)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
}

// Delta badge HTML (for use in stat cards).
export function deltaBadge(pct, inverse = false) {
  if (pct === null || !isFinite(pct)) return '';
  const positive = inverse ? pct < 0 : pct > 0;
  const color = positive ? '#10b981' : (pct === 0 ? 'rgba(255,255,255,0.4)' : '#ef4444');
  const arrow = pct > 0 ? '↑' : (pct < 0 ? '↓' : '→');
  return `<span style="color:${color};font-size:0.75rem;font-weight:700;">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
}

// Stat card HTML: primary value + optional delta + sub-label + status.
export function statCard({ label, value, unit = '', delta = null, sub = '', color = '#3b82f6', status = '', inverseDelta = false }) {
  const deltaHtml = delta !== null
    ? `<div class="mt-1">${deltaBadge(delta, inverseDelta)}<span class="text-xs text-muted ml-1">${sub}</span></div>`
    : (sub ? `<div class="text-xs text-muted mt-1">${sub}</div>` : '');
  const statusHtml = status ? `<div class="an-stat__status" style="color:${color};">${status}</div>` : '';
  return `<article class="card-dark flex-col an-stat" style="border:1px solid ${color}18;border-top:2px solid ${color};">
    <div class="an-stat__label">${label}</div>
    <div class="an-stat__value">${value}<span class="an-stat__unit">${unit}</span></div>
    ${deltaHtml}
    ${statusHtml}
  </article>`;
}
