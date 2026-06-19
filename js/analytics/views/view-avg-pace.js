// ==========================================
// AVG PACE VIEW (analytics/views/view-avg-pace.js)
// ==========================================
import { renderPaceLineChart } from '../charts.js';

export function renderAvgPaceAnalytics(data, getState) {
  const appState = getState();
  const section = document.getElementById('analytics-avg-pace');
  if (!section) return;

  // Derive per-week best/avg pace and this-week stats
  const thresholdSecs = appState.thresholdPaceSeconds || 0;
  const nonZeroPaces  = data.paceData.filter(p => p > 0);

  // This-week stats
  const currentWk  = appState.currentWeek || '1';
  const wkData     = appState.weeks?.[currentWk];
  let weekDist = 0, weekMins = 0, weekRuns = 0;
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  if (wkData) {
    days.forEach(d => {
      const r    = wkData.runs?.[d];
      if (!r) return;
      const dist = parseFloat(r.dist) || 0;
      const t    = r.time || '';
      const p    = t.split(':');
      const mins = p.length === 2 ? parseInt(p[0], 10) + parseInt(p[1], 10) / 60 : parseFloat(p[0]) || 0;
      if (dist > 0 && mins > 0) { weekDist += dist; weekMins += mins; weekRuns++; }
    });
  }

  const weekPaceSec  = weekDist > 0 && weekMins > 0 ? (weekMins / weekDist) * 60 : 0;
  const fmtPace = s => {
    if (!s || s <= 0) return '--:--';
    const sec = Math.round(s);
    return Math.floor(sec / 60) + ':' + (sec % 60).toString().padStart(2, '0');
  };

  const allTimeBest = nonZeroPaces.length > 0 ? Math.min(...nonZeroPaces) : 0;
  const allTimeAvg  = nonZeroPaces.length > 0 ? nonZeroPaces.reduce((a, b) => a + b, 0) / nonZeroPaces.length : 0;

  // vs-threshold indicator
  let thresholdNote = '';
  if (thresholdSecs > 0 && weekPaceSec > 0) {
    const diff = weekPaceSec - thresholdSecs;
    if (diff > 30)       thresholdNote = `${fmtPace(diff)} slower than threshold — easy/recovery zone`;
    else if (diff > 0)   thresholdNote = `Within ${fmtPace(diff)} of threshold — tempo zone`;
    else if (diff > -30) thresholdNote = `At or near threshold pace`;
    else                 thresholdNote = `${fmtPace(-diff)} faster than threshold — race pace effort`;
  }

  // Hero stat cards
  const heroEl = document.getElementById('apHeroCards');
  if (heroEl) {
    const paceColor = weekPaceSec > 0 && allTimeBest > 0
      ? (weekPaceSec <= allTimeBest * 1.05 ? '#10b981' : weekPaceSec <= allTimeAvg ? '#f59e0b' : 'rgba(255,255,255,0.8)')
      : 'rgba(255,255,255,0.8)';

    heroEl.innerHTML = `
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(236,72,153,0.3);">
        <div class="text-xs text-muted mb-1">This Week</div>
        <div class="text-lg font-heavy" style="color:${paceColor};">${fmtPace(weekPaceSec)}</div>
        <div class="text-xs text-muted mt-1">min/km · ${weekRuns} run${weekRuns !== 1 ? 's' : ''}</div>
      </article>
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(16,185,129,0.3);">
        <div class="text-xs text-muted mb-1">All-Time Best</div>
        <div class="text-lg font-heavy" style="color:#10b981;">${fmtPace(allTimeBest)}</div>
        <div class="text-xs text-muted mt-1">min/km · avg ${fmtPace(allTimeAvg)}</div>
      </article>`;
  }

  // Pace trend chart
  const chartEl = document.getElementById('apPaceChart');
  if (chartEl) {
    renderPaceLineChart(chartEl, data.weekLabels, data.paceData, thresholdSecs);
  }

  // Pace distribution — bucket runs into zones
  const distEl = document.getElementById('apDistributionChart');
  if (distEl) {
    _renderPaceDistribution(distEl, data.paceData, thresholdSecs);
  }

  // Note
  const noteEl = document.getElementById('apNote');
  if (noteEl) {
    const parts = [];
    if (thresholdNote) parts.push(`<div class="text-sm text-muted" style="line-height:1.5;">${thresholdNote}</div>`);
    if (!thresholdSecs) parts.push(`<div class="text-sm text-muted">Set your threshold pace in the Running analytics to unlock zone analysis.</div>`);
    noteEl.innerHTML = parts.length ? `<article class="card-dark p-3">${parts.join('')}</article>` : '';
  }
}

function _renderPaceDistribution(container, paceData, thresholdSecs) {
  const valid = paceData.filter(p => p > 0);
  if (valid.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log runs to see pace distribution.</p>';
    return;
  }

  if (!thresholdSecs) {
    // Without threshold, show fastest/slowest/average bar chart by week
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Set threshold pace to see zone distribution.</p>';
    return;
  }

  const easyLimit  = thresholdSecs * 1.15;
  let easy = 0, tempo = 0, threshold = 0, hard = 0;
  valid.forEach(p => {
    if      (p > easyLimit)    easy++;
    else if (p > thresholdSecs) tempo++;
    else if (p > thresholdSecs * 0.95) threshold++;
    else                       hard++;
  });

  const total = easy + tempo + threshold + hard;
  const pct   = n => total > 0 ? Math.round((n / total) * 100) : 0;

  const zones = [
    { label: 'Easy', count: easy,      color: '#10b981', pct: pct(easy) },
    { label: 'Tempo', count: tempo,    color: '#f59e0b', pct: pct(tempo) },
    { label: 'Threshold', count: threshold, color: '#ef4444', pct: pct(threshold) },
    { label: 'Race Pace', count: hard, color: '#a855f7', pct: pct(hard) },
  ];

  let html = '<div class="flex-col gap-2">';
  zones.forEach(z => {
    html += `
      <div>
        <div class="flex-between mb-1">
          <span class="text-sm" style="color:${z.color};">${z.label}</span>
          <span class="text-sm text-muted">${z.count} week${z.count !== 1 ? 's' : ''} · ${z.pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:8px;overflow:hidden;">
          <div style="width:${z.pct}%;background:${z.color};height:100%;border-radius:4px;transition:width 0.4s;"></div>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}
