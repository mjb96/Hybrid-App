// ==========================================
// FASTING CHARTS — analytics/charts/fasting-charts.js
// All pure SVG string builders. No DOM state.
// Follows the same pattern as recovery-charts.js
// ==========================================
import { uid, bezierPath, linearGradientV, areaFill, dotSeries, refLine } from './chart-primitives.js';

const AMBER  = '#f59e0b';
const ORANGE = '#f97316';
const BLUE   = '#3b82f6';
const GREEN  = '#10b981';
const PURPLE = '#8b5cf6';
const MUTED  = 'rgba(255,255,255,0.45)';

// ── Bar chart: weekly fasting hours ──────────────────────────────────────────

export function renderFastingHoursBarChart(container, weeklyTrend) {
  if (!container) return;
  if (!weeklyTrend?.length) {
    container.innerHTML = `<p style="color:${MUTED};font-size:0.85rem;padding:8px 0;">Log fasts to see weekly trends.</p>`;
    return;
  }

  const W = 400, H = 160, PL = 40, PR = 12, PT = 14, PB = 32;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = weeklyTrend.length;

  const values = weeklyTrend.map(w => w.hours);
  const maxV = Math.max(...values, 1);

  const barW = Math.max(4, (chartW / n) * 0.65);
  const gap  = chartW / n;

  const toX = i => PL + i * gap + gap / 2;
  const toY = v => PT + chartH - (v / maxV) * chartH;

  // Y-axis ticks
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxV / tickCount) * i));
  const yLines = ticks.map(val => {
    const y = toY(val);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <text x="${PL - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${MUTED}">${val}h</text>`;
  }).join('');

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, AMBER, 0.85, AMBER, 0.25)}</defs>`;

  const bars = weeklyTrend.map((w, i) => {
    if (w.hours === 0) return '';
    const x = toX(i) - barW / 2;
    const barH = (w.hours / maxV) * chartH;
    const y = PT + chartH - barH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}"
      fill="url(#${gId})" rx="3"/>`;
  }).join('');

  // Baseline: 12-week personal average (excluding current partial week)
  const completedWeeks = weeklyTrend.slice(0, -1).filter(w => w.hours > 0);
  const baseline = completedWeeks.length >= 3
    ? completedWeeks.reduce((s, w) => s + w.hours, 0) / completedWeeks.length : null;
  const baselineSvg = baseline !== null && baseline <= maxV
    ? refLine(toY(baseline), PL, W, PR, `avg ${baseline.toFixed(0)}h`, AMBER, true) : '';

  // X-axis labels (show every 2nd or 3rd to avoid crowding)
  const step = n > 8 ? Math.ceil(n / 6) : 1;
  const xLabels = weeklyTrend.map((w, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    return `<text x="${toX(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="8.5" fill="${MUTED}">${w.label}</text>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block;">
    ${defs}
    ${yLines}
    ${bars}
    ${baselineSvg}
    ${xLabels}
  </svg>`;
}

// ── Line chart: average fast duration trend ───────────────────────────────────

export function renderFastingDurationTrend(container, weeklyTrend) {
  if (!container) return;
  const withData = weeklyTrend?.filter(w => w.count > 0) ?? [];
  if (withData.length < 2) {
    container.innerHTML = `<p style="color:${MUTED};font-size:0.85rem;padding:8px 0;">Complete more fasts to see duration trends.</p>`;
    return;
  }

  const W = 400, H = 140, PL = 42, PR = 14, PT = 14, PB = 28;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = weeklyTrend.length;

  const values = weeklyTrend.map(w => w.avgDuration);
  const maxV = Math.max(...values, 1);
  const minV = 0;

  const toX = i => PL + (i / (n - 1)) * chartW;
  const toY = v => PT + chartH - ((v - minV) / Math.max(maxV - minV, 1)) * chartH;

  const ticks = [0, Math.round(maxV * 0.5), Math.round(maxV)];
  const yLines = ticks.map(val => {
    const y = toY(val);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <text x="${PL - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${MUTED}">${val}h</text>`;
  }).join('');

  const gId = uid();
  const gradDef = linearGradientV(gId, ORANGE, 0.22, ORANGE, 0);

  const pts = weeklyTrend
    .map((w, i) => w.avgDuration > 0 ? [toX(i), toY(w.avgDuration)] : null)
    .filter(Boolean);

  const smooth = pts.length >= 2 ? bezierPath(pts) : '';
  const area   = smooth ? areaFill(smooth, pts, PT + chartH, gId) : '';
  const line   = smooth ? `<path d="${smooth}" fill="none" stroke="${ORANGE}" stroke-width="2.5" stroke-linecap="round"/>` : '';
  const dots   = dotSeries(pts, ORANGE, 3.5);

  const step = n > 8 ? Math.ceil(n / 6) : 1;
  const xLabels = weeklyTrend.map((w, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    return `<text x="${toX(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="${MUTED}">${w.label}</text>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block;">
    <defs>${gradDef}</defs>
    ${yLines}
    ${area}
    ${line}
    ${dots}
    ${xLabels}
  </svg>`;
}

// ── Line chart: goal completion % trend ──────────────────────────────────────

export function renderGoalCompletionTrend(container, weeklyTrend) {
  if (!container) return;
  const withData = weeklyTrend?.filter(w => w.count > 0) ?? [];
  if (withData.length < 2) {
    container.innerHTML = `<p style="color:${MUTED};font-size:0.85rem;padding:8px 0;">Complete more fasts to see goal trend.</p>`;
    return;
  }

  const W = 400, H = 130, PL = 38, PR = 14, PT = 12, PB = 26;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = weeklyTrend.length;

  const toX = i => PL + (i / (n - 1)) * chartW;
  const toY = v => PT + chartH - (v / 100) * chartH;

  const ticks = [0, 50, 100];
  const yLines = ticks.map(val => {
    const y = toY(val);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <text x="${PL - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${MUTED}">${val}%</text>`;
  }).join('');

  const gId = uid();
  const gradDef = linearGradientV(gId, GREEN, 0.22, GREEN, 0);

  const pts = weeklyTrend
    .map((w, i) => w.count > 0 ? [toX(i), toY(w.goalPct)] : null)
    .filter(Boolean);

  const smooth = pts.length >= 2 ? bezierPath(pts) : '';
  const area   = smooth ? areaFill(smooth, pts, PT + chartH, gId) : '';
  const line   = smooth ? `<path d="${smooth}" fill="none" stroke="${GREEN}" stroke-width="2.5" stroke-linecap="round"/>` : '';
  const dots   = dotSeries(pts, GREEN, 3.5);

  const step = n > 8 ? Math.ceil(n / 6) : 1;
  const xLabels = weeklyTrend.map((w, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    return `<text x="${toX(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="8.5" fill="${MUTED}">${w.label}</text>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block;">
    <defs>${gradDef}</defs>
    ${yLines}
    ${area}
    ${line}
    ${dots}
    ${xLabels}
  </svg>`;
}

// ── Zone distribution horizontal bars ────────────────────────────────────────

export function renderZoneDistributionChart(container, zoneDistribution) {
  if (!container) return;
  const hasData = zoneDistribution?.some(z => z.count > 0);
  if (!hasData) {
    container.innerHTML = `<p style="color:${MUTED};font-size:0.85rem;padding:8px 0;">Log fasts to see zone distribution.</p>`;
    return;
  }

  const maxCount = Math.max(...zoneDistribution.map(z => z.count), 1);

  const rows = zoneDistribution.map(z => {
    const pct = (z.count / maxCount) * 100;
    const color = z.zone.color;
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:0.75rem;color:rgba(255,255,255,0.65);display:flex;align-items:center;gap:6px;">
          <span>${z.zone.icon}</span>
          <span>${z.zone.name}</span>
          <span style="font-size:0.65rem;color:rgba(255,255,255,0.3);">${z.zone.hoursStart}h+</span>
        </span>
        <span style="font-size:0.75rem;font-weight:700;color:${color};font-variant-numeric:tabular-nums;">${z.count}</span>
      </div>
      <div style="height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct.toFixed(1)}%;background:${color};border-radius:3px;transition:width 0.5s ease;"></div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = rows;
}

// ── Weekly fasting frequency line chart (count per week) ─────────────────────

export function renderFastingFrequencyChart(container, weeklyTrend) {
  if (!container) return;
  const withData = weeklyTrend?.filter(w => w.count > 0) ?? [];
  if (withData.length < 2) {
    container.innerHTML = `<p style="color:${MUTED};font-size:0.85rem;padding:8px 0;">Complete more fasts to see frequency trends.</p>`;
    return;
  }

  const W = 400, H = 130, PL = 36, PR = 14, PT = 12, PB = 26;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = weeklyTrend.length;

  const maxV = Math.max(...weeklyTrend.map(w => w.count), 1);
  const toX  = i => PL + (i / (n - 1)) * chartW;
  const toY  = v => PT + chartH - (v / maxV) * chartH;

  const ticks = [0, Math.ceil(maxV / 2), maxV];
  const yLines = ticks.map(val => {
    const y = toY(val);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <text x="${PL - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${MUTED}">${val}</text>`;
  }).join('');

  const gId = uid();
  const gradDef = linearGradientV(gId, PURPLE, 0.22, PURPLE, 0);

  const pts = weeklyTrend
    .map((w, i) => w.count > 0 ? [toX(i), toY(w.count)] : null)
    .filter(Boolean);

  const smooth = pts.length >= 2 ? bezierPath(pts) : '';
  const area   = smooth ? areaFill(smooth, pts, PT + chartH, gId) : '';
  const line   = smooth ? `<path d="${smooth}" fill="none" stroke="${PURPLE}" stroke-width="2.5" stroke-linecap="round"/>` : '';
  const dots   = dotSeries(pts, PURPLE, 3.5);

  // Target line: 5 fasts/week
  const targetY = toY(Math.min(5, maxV));
  const targetLine = maxV >= 4
    ? `<line x1="${PL}" y1="${targetY.toFixed(1)}" x2="${W - PR}" y2="${targetY.toFixed(1)}" stroke="rgba(139,92,246,0.35)" stroke-width="1.5" stroke-dasharray="5,3"/>
       <text x="${W - PR}" y="${(targetY - 4).toFixed(1)}" text-anchor="end" font-size="8.5" fill="rgba(139,92,246,0.55)">target</text>`
    : '';

  const step = n > 8 ? Math.ceil(n / 6) : 1;
  const xLabels = weeklyTrend.map((w, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    return `<text x="${toX(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="8.5" fill="${MUTED}">${w.label}</text>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block;">
    <defs>${gradDef}</defs>
    ${yLines}
    ${targetLine}
    ${area}
    ${line}
    ${dots}
    ${xLabels}
  </svg>`;
}

// ── Fasting score SVG ring (matches readiness ring pattern) ──────────────────

export function renderFastingScoreRing(container, score, label, color) {
  if (!container) return;
  if (score === null) {
    container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;padding:16px;"><div style="color:rgba(255,255,255,0.35);font-size:0.78rem;">Log 2+ fasts to unlock your Fasting Score</div></div>`;
    return;
  }
  const r  = 54, cx = 70, cy = 70;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const gap  = circ - dash;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <svg viewBox="0 0 140 140" style="width:140px;height:140px;">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="12"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
          stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
          stroke-linecap="round"
          transform="rotate(-90 ${cx} ${cy})"/>
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="30" font-weight="900" fill="${color}">${score}</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="9.5" font-weight="700" letter-spacing="0.07em" fill="rgba(255,255,255,0.50)">${label.toUpperCase()}</text>
      </svg>
    </div>`;
}

// ── Monthly adherence bar chart ───────────────────────────────────────────────

export function renderMonthlyAdherenceChart(container, monthlyTrend) {
  if (!container) return;
  if (!monthlyTrend?.length) {
    container.innerHTML = `<p style="color:${MUTED};font-size:0.85rem;padding:8px 0;">Log fasts to see monthly trends.</p>`;
    return;
  }

  const W = 400, H = 140, PL = 38, PR = 12, PT = 12, PB = 28;
  const chartW = W - PL - PR, chartH = H - PB - PT;
  const n = monthlyTrend.length;
  const maxV = Math.max(...monthlyTrend.map(m => m.hours), 1);

  const barW = Math.max(8, (chartW / n) * 0.6);
  const gap  = chartW / n;
  const toX  = i => PL + i * gap + gap / 2;
  const toY  = v => PT + chartH - (v / maxV) * chartH;

  const ticks = [0, Math.round(maxV * 0.5), Math.round(maxV)];
  const yLines = ticks.map(val => {
    const y = toY(val);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <text x="${PL - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="${MUTED}">${val}h</text>`;
  }).join('');

  const gId = uid();
  const defs = `<defs>${linearGradientV(gId, BLUE, 0.85, BLUE, 0.25)}</defs>`;

  const bars = monthlyTrend.map((m, i) => {
    if (!m.hours) return '';
    const x = toX(i) - barW / 2;
    const bH = (m.hours / maxV) * chartH;
    const y = PT + chartH - bH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="url(#${gId})" rx="3"/>`;
  }).join('');

  const xLabels = monthlyTrend.map((m, i) =>
    `<text x="${toX(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="9" fill="${MUTED}">${m.label}</text>`
  ).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block;">
    ${defs}
    ${yLines}
    ${bars}
    ${xLabels}
  </svg>`;
}
