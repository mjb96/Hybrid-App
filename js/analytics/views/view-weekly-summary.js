// ==========================================
// WEEKLY SUMMARY VIEW (analytics/views/view-weekly-summary.js)
// ==========================================
import { formatPace, rpeColour } from '../utils.js';
import { renderVolumeChart } from '../charts.js';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function renderWeeklySummaryAnalytics(data, getState, getDays, selectedWeek) {
  const appState  = getState();
  const days      = getDays();
  const wkIdx     = selectedWeek - 1;
  const wkData    = appState.weeks?.[selectedWeek.toString()];
  const distUnit  = data.distUnit || 'km';

  const container = document.getElementById('wsContainer');
  if (!container) return;

  // ── Day-level data ──────────────────────────────────────────────────
  const dayItems = days.map((d, i) => {
    const hasGym  = _hasGymActivity(wkData, d);
    const hasRun  = (parseFloat(wkData?.runs?.[d]?.dist) || 0) > 0;
    const gymSets = _countCompletedSets(wkData, d);
    const runDist = parseFloat(wkData?.runs?.[d]?.dist) || 0;
    const gymRpe  = parseFloat(wkData?.gymRpe?.[d]) || 0;
    const runRpe  = parseFloat(wkData?.runs?.[d]?.rpe) || 0;
    const runPace = _parsePaceSecs(runDist, wkData?.runs?.[d]?.time || '');
    const gymVol  = _dayGymVol(wkData, d);
    return { day: d, label: DAY_SHORT[i], hasGym, hasRun, gymSets, runDist, gymRpe, runRpe, runPace, gymVol };
  });

  const weekVol  = data.volData[wkIdx]  || 0;
  const weekDist = data.runData[wkIdx]  || 0;
  const weekRpe  = data.rpeData[wkIdx]  || 0;
  const weekPace = data.paceData[wkIdx] || 0;
  const gymSessions = dayItems.filter(d => d.hasGym).length;
  const runSessions = dayItems.filter(d => d.hasRun).length;
  const hasAnyData  = gymSessions > 0 || runSessions > 0;

  // Previous-week deltas
  const prevIdx  = wkIdx > 0 ? wkIdx - 1 : -1;
  const prevVol  = prevIdx >= 0 ? (data.volData[prevIdx]  || 0) : null;
  const prevDist = prevIdx >= 0 ? (data.runData[prevIdx]  || 0) : null;
  const prevRpe  = prevIdx >= 0 ? (data.rpeData[prevIdx]  || 0) : null;
  const prevPace = prevIdx >= 0 ? (data.paceData[prevIdx] || 0) : null;

  function wkDelta(curr, prev, higherIsBetter) {
    if (prev === null || prev === 0 || curr === 0) return '';
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (pct === 0) return '';
    const up    = pct > 0;
    const good  = up === higherIsBetter;
    const color = good ? '#10b981' : '#ef4444';
    return `<div class="ws-stat-delta" style="color:${color};">${up ? '+' : ''}${pct}% vs W${selectedWeek - 1}</div>`;
  }

  // ── Activity strip ──────────────────────────────────────────────────
  const activityStrip = dayItems.map(item => {
    let color, bg, typeLabel;
    if (item.hasGym && item.hasRun) {
      color = '#10b981'; bg = 'rgba(16,185,129,0.15)'; typeLabel = 'Hybrid';
    } else if (item.hasGym) {
      color = '#3b82f6'; bg = 'rgba(59,130,246,0.15)'; typeLabel = 'Gym';
    } else if (item.hasRun) {
      color = '#ec4899'; bg = 'rgba(236,72,153,0.15)'; typeLabel = 'Run';
    } else {
      color = 'rgba(255,255,255,0.18)'; bg = 'rgba(255,255,255,0.03)'; typeLabel = '';
    }

    const sub = item.hasGym && item.gymSets > 0
      ? `${item.gymSets}s`
      : item.hasRun && item.runDist > 0
      ? `${item.runDist.toFixed(1)}`
      : '·';

    return `<div class="ws-day-pill" style="border-color:${color};background:${bg};">
      <span class="ws-day-name" style="color:${color};">${item.label}</span>
      <span class="ws-day-type" style="color:${color};">${typeLabel}</span>
      <span class="ws-day-sub">${sub}</span>
    </div>`;
  }).join('');

  // ── Stat values ─────────────────────────────────────────────────────
  const volStr  = weekVol  > 0 ? (weekVol >= 1000 ? (weekVol/1000).toFixed(1)+'t' : Math.round(weekVol)+' kg') : '—';
  const distStr = weekDist > 0 ? weekDist.toFixed(1) + ' ' + distUnit : '—';
  const rpeStr  = weekRpe  > 0 ? weekRpe.toFixed(1) : '—';
  const paceStr = weekPace > 0 ? formatPace(weekPace) : '—';

  const statsGrid = `
    <div class="ws-stats-grid">
      <div class="ws-stat">
        <div class="ws-stat-value" style="color:#3b82f6;">${volStr}</div>
        <div class="ws-stat-label">Gym Volume</div>
        ${wkDelta(weekVol, prevVol, true)}
      </div>
      <div class="ws-stat">
        <div class="ws-stat-value" style="color:#ec4899;">${distStr}</div>
        <div class="ws-stat-label">Run Distance</div>
        ${wkDelta(weekDist, prevDist, true)}
      </div>
      <div class="ws-stat">
        <div class="ws-stat-value" style="color:${weekRpe > 0 ? rpeColour(weekRpe) : 'rgba(255,255,255,0.4)'};">${rpeStr}</div>
        <div class="ws-stat-label">Avg RPE</div>
        ${wkDelta(weekRpe, prevRpe, false)}
      </div>
      <div class="ws-stat">
        <div class="ws-stat-value" style="color:#22d3ee;">${paceStr}</div>
        <div class="ws-stat-label">Avg Pace</div>
        ${wkDelta(weekPace, prevPace, false)}
      </div>
      <div class="ws-stat">
        <div class="ws-stat-value" style="color:#3b82f6;">${gymSessions > 0 ? gymSessions : '—'}</div>
        <div class="ws-stat-label">Gym Days</div>
      </div>
      <div class="ws-stat">
        <div class="ws-stat-value" style="color:#ec4899;">${runSessions > 0 ? runSessions : '—'}</div>
        <div class="ws-stat-label">Run Days</div>
      </div>
    </div>`;

  // ── Session breakdown ────────────────────────────────────────────────
  let sessionRows = '';
  if (hasAnyData) {
    sessionRows = dayItems
      .filter(item => item.hasGym || item.hasRun)
      .map(item => {
        const parts = [];
        if (item.hasGym) {
          const volPart = item.gymVol > 0 ? `${item.gymVol >= 1000 ? (item.gymVol/1000).toFixed(1)+'t' : Math.round(item.gymVol)+' kg'}` : '';
          const rpePart = item.gymRpe > 0 ? `RPE ${item.gymRpe}` : '';
          const detail  = [volPart, item.gymSets > 0 ? `${item.gymSets} sets` : '', rpePart].filter(Boolean).join(' · ');
          parts.push(`<span class="ws-session-tag ws-session-tag--gym">Gym</span><span class="ws-session-detail">${detail}</span>`);
        }
        if (item.hasRun) {
          const distPart = item.runDist > 0 ? `${item.runDist.toFixed(1)} ${distUnit}` : '';
          const pacePart = item.runPace > 0 ? formatPace(item.runPace) + '/km' : '';
          const rpePart  = item.runRpe  > 0 ? `RPE ${item.runRpe}` : '';
          const detail   = [distPart, pacePart, rpePart].filter(Boolean).join(' · ');
          parts.push(`<span class="ws-session-tag ws-session-tag--run">Run</span><span class="ws-session-detail">${detail}</span>`);
        }
        return `<div class="ws-session-row">
          <span class="ws-session-day">${item.label}</span>
          <div class="ws-session-body">${parts.join('')}</div>
        </div>`;
      })
      .join('');
  }

  // ── Hero load bar ────────────────────────────────────────────────────
  const totalSessions = gymSessions + runSessions;
  const heroAccent = gymSessions > 0 && runSessions > 0 ? '#10b981'
    : gymSessions > 0 ? '#3b82f6'
    : runSessions > 0 ? '#ec4899'
    : 'rgba(255,255,255,0.15)';

  container.innerHTML = `
    <article class="ws-hero-card" style="border-top:3px solid ${heroAccent};">
      <div class="ws-hero-sessions">
        ${gymSessions > 0 ? `<span class="ws-hero-badge ws-hero-badge--gym">${gymSessions} Gym</span>` : ''}
        ${runSessions > 0 ? `<span class="ws-hero-badge ws-hero-badge--run">${runSessions} Run</span>` : ''}
        ${!hasAnyData ? `<span style="color:var(--text-muted);font-size:0.85rem;">No sessions logged</span>` : ''}
      </div>
      <div class="ws-hero-meta">
        ${weekVol > 0 ? `<span>${weekVol >= 1000 ? (weekVol/1000).toFixed(1)+'t' : Math.round(weekVol)+' kg'} lifted</span>` : ''}
        ${weekDist > 0 ? `<span>${weekDist.toFixed(1)} ${distUnit} run</span>` : ''}
      </div>
    </article>

    <h3 class="section-header mt-4">Activity This Week</h3>
    <div class="ws-activity-strip">${activityStrip}</div>

    ${statsGrid}

    ${hasAnyData ? `
      <h3 class="section-header mt-4">Sessions</h3>
      <article class="card-dark p-4 mb-4">${sessionRows}</article>
    ` : ''}
  `;

  // Render the volume trend chart below (into separate container)
  const chartEl = document.getElementById('wsTrendChart');
  if (chartEl) {
    renderVolumeChart(chartEl, data.weekLabels, data.volData, data.runData, wkIdx);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function _hasGymActivity(wkData, day) {
  if (!wkData?.lifts?.[day]) return false;
  return Object.values(wkData.lifts[day]).some(sets =>
    Array.isArray(sets) && sets.some(s =>
      s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1
    )
  );
}

function _countCompletedSets(wkData, day) {
  if (!wkData?.lifts?.[day]) return 0;
  let n = 0;
  Object.values(wkData.lifts[day]).forEach(sets => {
    if (Array.isArray(sets))
      n += sets.filter(s => s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1).length;
  });
  return n;
}

function _dayGymVol(wkData, day) {
  if (!wkData?.lifts?.[day]) return 0;
  let vol = 0;
  Object.values(wkData.lifts[day]).forEach(sets => {
    if (Array.isArray(sets))
      sets.forEach(s => {
        if (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)
          vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
      });
  });
  return vol;
}

function _parsePaceSecs(dist, time) {
  if (!time || !dist || dist <= 0) return 0;
  const parts = time.split(':').map(Number);
  let secs = 0;
  if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
  else secs = parts[0] || 0;
  return secs > 0 ? secs / dist : 0;
}
