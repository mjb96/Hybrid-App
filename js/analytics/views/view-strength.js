// ==========================================
// STRENGTH VIEW (analytics/views/view-strength.js)
// ==========================================
import { renderVolumeChart, render1RMProgressChart } from '../charts.js';

const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

export function renderStrengthAnalytics(data) {
  setText('allTimeTotalVol', Math.round(data.globalTotalVol).toLocaleString() + ' kg');
  setText('allTimeTotalSets', data.globalTotalSets.toLocaleString());
  setText('analyticsPeakVol', data.absoluteMesoPeakVol.toLocaleString() + ' kg peak');

  const gymHrEl = document.getElementById('allTimeGymHr');
  const gymCalsEl = document.getElementById('allTimeGymCals');
  if (gymHrEl) gymHrEl.textContent = data.globalAvgGymHr > 0 ? Math.round(data.globalAvgGymHr) + ' bpm' : '-- bpm';
  if (gymCalsEl) gymCalsEl.textContent = Math.round(data.globalTotalGymCals).toLocaleString();

  renderVolumeChart(document.getElementById('volumeChartContainer'), data.weekLabels, data.volData, data.runData);

  const rmContainer = document.getElementById('allLiftsRmContainer');
  if (rmContainer) render1RMList(rmContainer, data.dynamicStats);
}

export function render1RMList(container, dynamicStats) {
  const entries = Object.entries(dynamicStats)
    .filter(([, v]) => v.allTimeMax > 0)
    .sort(([, a], [, b]) => b.allTimeMax - a.allTimeMax);

  if (entries.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Complete sets to populate lift PRs.</p>';
    return;
  }

  const prCount = entries.filter(([, v]) => {
    const cur = v.currentEstimatedMax || 0;
    return cur > 0 && Math.abs(cur - v.allTimeMax) < 0.5;
  }).length;

  const maxAllTime = entries[0][1].allTimeMax;
  const rows = entries.map(([name, statData]) => {
    const pct  = Math.min(100, Math.max(5, Math.round((statData.allTimeMax / maxAllTime) * 100)));
    const cur  = statData.currentEstimatedMax || 0;
    const prev = statData.previousWeekMax || 0;
    const isCurrentWeekPR = cur > 0 && Math.abs(cur - statData.allTimeMax) < 0.5;

    const badge = isCurrentWeekPR
      ? `<span style="font-size:0.7rem;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981;border-radius:4px;padding:2px 6px;margin-left:6px;">PR</span>`
      : '';

    let deltaHtml = '';
    if (cur > 0 && prev > 0) {
      const delta = cur - prev;
      const sign  = delta >= 0 ? '+' : '';
      const col   = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--text-muted)';
      deltaHtml   = `<span style="font-size:0.72rem;color:${col};margin-left:6px;">${sign}${Math.round(delta)} kg vs last wk</span>`;
    } else if (cur > 0) {
      deltaHtml = `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">This week: ~${Math.round(cur)} kg</span>`;
    }

    return `<div class="mb-4">
      <div class="flex-between font-bold mb-1">
        <span class="text-inverse text-sm">${name}${badge}</span>
        <span style="color:#3b82f6;" class="text-base">${Math.round(statData.allTimeMax)} kg</span>
      </div>
      ${deltaHtml ? `<div class="mb-2">${deltaHtml}</div>` : ''}
      <div class="trend-track-bg" style="height:10px;border-radius:5px;">
        <div class="trend-track-fill" style="width:${pct}%;background:#3b82f6;border-radius:5px;"></div>
      </div>
    </div>`;
  }).join('');

  const summaryBar = prCount > 0
    ? `<div class="flex-between mb-4 p-3 card-dark" style="border:1px solid rgba(16,185,129,0.3);">
        <span class="text-sm text-muted">PRs set this week</span>
        <span class="font-heavy" style="color:#10b981;">${prCount} lift${prCount !== 1 ? 's' : ''} 🏆</span>
       </div>`
    : '';

  container.innerHTML = summaryBar + rows;
}

export function render1RMProgressSection(sectionEl, weekLabels, getState, getDays) {
  if (!sectionEl) return;

  const prListEl = sectionEl.querySelector('#allLiftsRmContainer_PR');
  if (!prListEl) return;

  // Find or create the header + container before #allLiftsRmContainer_PR
  let headerEl = sectionEl.querySelector('.rm-progress-header');
  let container = sectionEl.querySelector('#rmProgressChartContainer');
  if (!container) {
    headerEl = document.createElement('h2');
    headerEl.className = 'section-header mt-3 rm-progress-header';
    headerEl.textContent = '1RM Progress (12 Weeks)';
    container = document.createElement('div');
    container.id = 'rmProgressChartContainer';
    prListEl.before(headerEl);
    headerEl.before(container);
    // Re-insert: header then container then prListEl
    prListEl.before(container);
  }

  const appState = getState();
  const defaultDays = getDays();

  const sqNames = ['back squat', 'squat', 'front squat'];
  const bpNames = ['bench press', 'incline bench press', 'incline barbell press'];
  const dlNames = ['deadlift', 'romanian deadlift', 'deficit deadlift'];

  const sqData = [], bpData = [], dlData = [];

  for (let w = 1; w <= weekLabels.length; w++) {
    const wKey = w.toString();
    const wkData = appState.weeks?.[wKey];
    let sqMax = 0, bpMax = 0, dlMax = 0;

    if (wkData) {
      defaultDays.forEach(d => {
        const dayLifts = wkData.lifts?.[d] || {};
        for (const lift in dayLifts) {
          if (!Array.isArray(dayLifts[lift])) continue;
          const liftLower = lift.toLowerCase();
          dayLifts[lift].forEach(s => {
            const completed = s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
            const weight = parseFloat(s.w) || 0;
            const reps   = parseInt(s.r, 10) || 0;
            if (!completed || weight <= 0 || reps <= 0) return;
            const e1rm = weight * (1 + reps / 30);
            if (sqNames.some(n => liftLower.includes(n))) sqMax = Math.max(sqMax, e1rm);
            if (bpNames.some(n => liftLower.includes(n))) bpMax = Math.max(bpMax, e1rm);
            if (dlNames.some(n => liftLower.includes(n))) dlMax = Math.max(dlMax, e1rm);
          });
        }
      });
    }

    sqData.push(sqMax);
    bpData.push(bpMax);
    dlData.push(dlMax);
  }

  render1RMProgressChart(container, weekLabels, sqData, bpData, dlData);
}
