// ==========================================
// VDOT VIEW (analytics/views/view-vdot.js)
//
// Daniels & Gilbert (1979) VDOT — VO2max equivalent derived from run pace.
// Only runs ≥ 3 km with logged time are included.
// ==========================================
import { parsePaceSeconds } from '../utils.js';

// v = meters/min, T = race time in minutes
function calcVdot(distKm, timeMins) {
  if (distKm < 3 || timeMins < 3.5) return null;
  const v   = (distKm * 1000) / timeMins;
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  if (vo2 <= 0) return null;
  const pct = 0.8
    + 0.1894393 * Math.exp(-0.012778  * timeMins)
    + 0.2989558 * Math.exp(-0.1932605 * timeMins);
  return vo2 / pct;
}

function renderVdotChart(container, weekLabels, vdotByWeek) {
  if (!container) return;
  const W = 400, H = 130, PL = 40, PR = 12, PT = 14, PB = 28;
  const n = weekLabels.length;

  const validVals = vdotByWeek.filter(v => v != null);
  if (!validVals.length) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center;padding:1rem 0;">Log runs ≥ 3 km with time to see VDOT trend.</p>`;
    return;
  }

  const minVal = Math.max(0, Math.floor(Math.min(...validVals)) - 3);
  const maxVal = Math.ceil(Math.max(...validVals)) + 3;

  const cx = i => PL + (n < 2 ? (W - PL - PR) / 2 : (i / (n - 1)) * (W - PL - PR));
  const cy = v => PT + (1 - (v - minVal) / (maxVal - minVal)) * (H - PT - PB);

  // Build contiguous segments (null values create gaps)
  const segments = [];
  let seg = [];
  vdotByWeek.forEach((v, i) => {
    if (v != null) {
      seg.push([i, v]);
    } else if (seg.length) {
      segments.push(seg); seg = [];
    }
  });
  if (seg.length) segments.push(seg);

  const lines = segments.map(s =>
    `<polyline points="${s.map(([i, v]) => `${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ')}"
       fill="none" stroke="#10b981" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
  ).join('');

  const dots = vdotByWeek.map((v, i) => v != null
    ? `<circle cx="${cx(i).toFixed(1)}" cy="${cy(v).toFixed(1)}" r="3" fill="#10b981"/>`
    : ''
  ).join('');

  const xLabels = weekLabels.map((lbl, i) => {
    if (n > 8 && i % 2 !== 0 && i !== n - 1) return '';
    return `<text x="${cx(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-size="9">${lbl}</text>`;
  }).join('');

  const yTick = v =>
    `<line x1="${PL - 4}" y1="${cy(v).toFixed(1)}" x2="${W - PR}" y2="${cy(v).toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
     <text x="${(PL - 6).toFixed(1)}" y="${(cy(v) + 3).toFixed(1)}" text-anchor="end" fill="rgba(255,255,255,0.35)" font-size="8">${Math.round(v)}</text>`;

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg">
    ${yTick(minVal + (maxVal - minVal) / 2)}
    ${yTick(maxVal)}
    <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H - PB}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    ${lines}
    ${dots}
    ${xLabels}
  </svg>`;
}

export function renderVdotAnalytics(data, getState, getDays) {
  const appState = getState();
  const days     = getDays();

  // Best VDOT per week (highest from any qualifying run that week)
  const vdotByWeek = data.weekLabels.map((_, wi) => {
    const wkData = appState.weeks?.[String(wi + 1)];
    if (!wkData) return null;
    let best = null;
    days.forEach(d => {
      const run  = wkData.runs?.[d];
      const dist = parseFloat(run?.dist) || 0;
      if (!run || dist < 3 || !run.time) return;
      const secsPerKm = parsePaceSeconds(dist, run.time);
      if (!secsPerKm) return;
      const timeMins = (secsPerKm * dist) / 60;
      const vdot = calcVdot(dist, timeMins);
      if (vdot != null && (best == null || vdot > best)) best = vdot;
    });
    return best != null ? Math.round(best * 10) / 10 : null;
  });

  // Trend: compare mean of first 3 vs last 3 qualifying data points
  const validPoints = vdotByWeek.filter(v => v != null);
  const latest = validPoints.length ? validPoints[validPoints.length - 1] : null;

  let trend = null;
  if (validPoints.length >= 4) {
    const first3 = validPoints.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last3  = validPoints.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const diff   = last3 - first3;
    if (diff > 1)       trend = { label: '↑ Improving',  color: '#10b981' };
    else if (diff < -1) trend = { label: '↓ Declining',  color: '#ef4444' };
    else                trend = { label: '→ Stable',     color: '#94a3b8' };
  }

  const heroEl = document.getElementById('vdotHero');
  if (heroEl) {
    heroEl.innerHTML = `
      <article class="card-dark flex-col flex-center p-4" style="border:1px solid rgba(16,185,129,0.35);text-align:center;">
        <div class="text-xs text-muted mb-2">CURRENT VDOT</div>
        <div class="text-2xl font-heavy text-inverse">${latest != null ? latest.toFixed(1) : '—'}</div>
        ${trend ? `<div class="text-sm font-bold mt-2" style="color:${trend.color};">${trend.label}</div>` : ''}
        ${latest == null ? '<div class="text-xs text-muted mt-2">Log runs ≥ 3 km with time to unlock</div>' : ''}
      </article>`;
  }

  renderVdotChart(document.getElementById('vdotChart'), data.weekLabels, vdotByWeek);

  const noteEl = document.getElementById('vdotNote');
  if (noteEl) {
    noteEl.innerHTML = `<p style="color:rgba(255,255,255,0.4);font-size:0.75rem;">
      VDOT is a VO&#x2082;max equivalent computed from run pace (Daniels &amp; Gilbert, 1979).
      Only runs &#x2265; 3 km with logged time are included. Best effort per week is shown.
    </p>`;
  }
}
