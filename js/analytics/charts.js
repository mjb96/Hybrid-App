// ==========================================
// ANALYTICS CHART RENDERERS (analytics/charts.js)
// ==========================================
import { rpeColour } from './utils.js';
import { formatDayMonth } from '../dates.js';

export function renderVolumeChart(container, weekLabels, volData, runData) {
  if (!container || weekLabels.length < 1) {
    if (container) container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log workouts to see volume trends.</p>';
    return;
  }

  const W = 400, H = 180, PAD_L = 50, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;

  const maxVol = Math.max(...volData, 1);
  const maxRun = Math.max(...runData, 1);
  const n = weekLabels.length;
  const barW = Math.max(8, Math.floor(chartW / n) - 6);

  let bars = '';
  let runPoints = '';
  let runPath = '';

  weekLabels.forEach((label, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const barH = (volData[i] / maxVol) * chartH;
    const y = PAD_T + chartH - barH;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" fill="#3b82f6" opacity="0.85" rx="3"/>`;

    const rx = PAD_L + (i / n) * chartW + chartW / n / 2;
    const ry = PAD_T + chartH - (runData[i] / maxRun) * chartH;
    runPoints += `${rx.toFixed(1)},${ry.toFixed(1)} `;
  });

  if (n >= 2) {
    runPath = `<polyline fill="none" stroke="#ec4899" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${runPoints.trim()}"/>`;
    weekLabels.forEach((label, i) => {
      const rx = PAD_L + (i / n) * chartW + chartW / n / 2;
      const ry = PAD_T + chartH - (runData[i] / maxRun) * chartH;
      runPath += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="4.5" fill="#ec4899"/>`;
    });
  }

  let yAxis = '';
  for (let t = 0; t <= 2; t++) {
    const val = Math.round((maxVol / 2) * t);
    const vy = PAD_T + chartH - (t / 2) * chartH;
    const labelTxt = val > 999 ? (val / 1000).toFixed(1) + 'k' : val;
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${labelTxt}</text>`;
    yAxis += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>`;
  }

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = PAD_L + (i / n) * chartW + chartW / n / 2;
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${runPath}${xAxis}</svg>`;
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

  const line = points.trim().split(' ').length >= 2
    ? `<polyline fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" stroke-dasharray="4,4" stroke-linejoin="round" points="${points.trim()}"/>`
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
