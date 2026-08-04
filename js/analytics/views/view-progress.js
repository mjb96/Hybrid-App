// ==========================================
// PROGRESS VIEW (analytics/views/view-progress.js)
// ==========================================
import { formatPace, rpeColour, paceZoneColour, formatWeight, weightUnitOf } from '../utils.js';
import { renderVolumeChart, renderConsistencyHeatmap } from '../charts.js';
import { getProgramById } from '../../state.js';
import { isCompletedSet } from '../../set-utils.js';
import { streakFreezeInfo } from '../../brain/streak.js';
import { runDaySummary } from '../../state/run-sessions.js';
import { activeTrainingDates, computeStreak } from '../../home/dashboard-model.js';
import { isNumericWeekKey } from '../../state/activation-identity.js';

export function renderProgressAnalytics(data, getState) {
  const tbody = document.getElementById('analyticsTimelineTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const state = getState();
  const currentWeekStr = state.currentWeek;
  const unit = weightUnitOf(state);
  data.weekLabels.forEach((lbl, i) => {
    const wKey    = (i + 1).toString();
    const isActive = wKey === currentWeekStr;
    const avgPace  = data.paceData[i] > 0 ? formatPace(data.paceData[i]) : '--';
    const avgRpe   = data.rpeData[i]  > 0 ? data.rpeData[i].toFixed(1) : '--';
    const rpeStyle = data.rpeData[i] > 0 ? `color:${rpeColour(data.rpeData[i])};font-weight:700;` : '';
    const paceCol  = data.paceData[i] > 0 ? paceZoneColour(data.paceData[i], data.thresholdSecs) : '#ffffff';

    const tr = document.createElement('tr');
    if (isActive) tr.style.background = 'rgba(59,130,246,0.1)';

    tr.innerHTML =
      `<td class="py-2"><strong style="${isActive ? 'color:#3b82f6;' : 'color:#fff;'}">${lbl}</strong></td>` +
      `<td class="py-2" style="color:#fff;">${formatWeight(data.volData[i], unit)}</td>` +
      `<td class="py-2" style="color:#fff;">${data.runData[i] > 0 ? data.runData[i].toFixed(1) + ' km' : '--'}</td>` +
      `<td class="py-2" style="color:${paceCol};font-variant-numeric:tabular-nums;">${avgPace}</td>` +
      `<td class="py-2" style="${rpeStyle}">${avgRpe}</td>`;
    tbody.appendChild(tr);
  });
}

export function renderWeeklyVolumeDetail(data, getState, getDays) {
  const appState    = getState();
  const defaultDays = getDays();
  const unit        = weightUnitOf(appState);
  const wk          = appState.currentWeek || '1';
  const weekData    = appState.weeks?.[wk];

  let totalSets = 0, totalReps = 0, totalVol = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const dayLifts = weekData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          dayLifts[lift].forEach(s => {
            if (isCompletedSet(s)) {
              const w = parseFloat(s.w) || 0;
              const r = parseInt(s.r, 10) || 0;
              totalVol  += w * r;
              totalSets += 1;
              totalReps += r;
            }
          });
        }
      }
    });
  }

  const setsEl    = document.getElementById('weekVolTotalSets');
  const repsEl    = document.getElementById('weekVolTotalReps');
  const tonnageEl = document.getElementById('weekVolTonnage');

  if (setsEl)    setsEl.textContent    = totalSets.toLocaleString();
  if (repsEl)    repsEl.textContent    = totalReps.toLocaleString();
  if (tonnageEl) tonnageEl.textContent = totalVol >= 1000
    ? `${(totalVol / 1000).toFixed(2)}t`
    : formatWeight(totalVol, unit, { empty: '0 ' + unit });

  const chartEl = document.getElementById('weekVolChartContainer');
  if (chartEl) renderVolumeChart(chartEl, data.weekLabels || [], data.volData || [], data.runData || []);
}

export function renderStreakDetail(data, getState, getDays) {
  const appState    = getState();
  const defaultDays = getDays();

  // ONE streak definition, shared with Home. This screen used to rebuild the
  // set of trained dates by approximating each slot's date from
  // `weekStartedAt ± currentWeek` arithmetic, which produced a DIFFERENT streak
  // from the one Home shows: it guessed dates instead of reading the stamped
  // `.dates[day]`, so moved sessions, gaps in logging and archived activations
  // all landed on invented days. computeStreak/activeTrainingDates are the
  // canonical, date-strict owners (they also honour streak freezes).
  const { current: streak, longest } = computeStreak(appState.weeks || {}, defaultDays, appState);
  const activeDates = activeTrainingDates(appState.weeks || {}, defaultDays, appState);

  const currentEl = document.getElementById('streakCurrent');
  const longestEl = document.getElementById('streakLongest');
  const detailEl  = document.getElementById('streakDetailContainer');

  if (currentEl) currentEl.textContent = `${streak} day${streak !== 1 ? 's' : ''}`;
  if (longestEl) longestEl.textContent = `${longest} day${longest !== 1 ? 's' : ''}`;

  if (detailEl) {
    if (activeDates.size === 0) {
      detailEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;">Complete workouts to build your streak.</p>';
    } else {
      const streakMsg = streak >= 7
        ? `🔥 ${streak}-day streak! Momentum is everything.`
        : streak >= 3
        ? `💪 ${streak} days in a row. Keep it going!`
        : streak === 0
        ? `Start today to begin a new streak.`
        : `${streak} day streak. Every day counts.`;

      const fz = streakFreezeInfo(appState);
      const freezeIcons = Array.from({ length: fz.max }, (_, i) =>
        `<span style="opacity:${i < fz.available ? 1 : 0.25};font-size:1.1rem;">🧊</span>`).join(' ');
      const freezeCard = `
        <div class="card-dark p-3 mb-3" style="border:1px solid rgba(59,130,246,0.28);background:rgba(59,130,246,0.06);">
          <div class="flex-between" style="align-items:center;">
            <div>
              <div class="font-heavy text-inverse" style="font-size:0.9rem;">Streak freezes ${freezeIcons}</div>
              <div class="text-muted" style="font-size:0.72rem;margin-top:3px;line-height:1.4;">
                ${fz.available > 0
                  ? `${fz.available} of ${fz.max} banked — one automatically covers a missed day so your streak survives.`
                  : `None left — earn one by reaching your next 7-day milestone.`}
              </div>
            </div>
          </div>
        </div>`;

      detailEl.innerHTML = `
        <div class="card-dark p-3 mb-3" style="border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
          <div class="font-heavy text-inverse" style="font-size:1rem;">${streakMsg}</div>
        </div>
        ${freezeCard}
        <div class="flex-between mb-2" style="font-size:0.8rem;">
          <span class="text-muted">Total active days logged</span>
          <span class="font-heavy text-inverse">${activeDates.size}</span>
        </div>
        <div class="flex-between" style="font-size:0.8rem;">
          <span class="text-muted">Personal best streak</span>
          <span class="font-heavy text-inverse">${longest} days</span>
        </div>
      `;
    }
  }

  // Consistency heatmap. This grid is PROGRAM-week indexed (its columns are the
  // "Week N" labels), so only numeric week keys belong on it — an archived
  // activation's `arch:<id>:<n>` key is a previous program run and has no column
  // here. parseInt on such a key returns NaN, which slipped past the renderer's
  // range guard (every NaN comparison is false) and emitted <rect x="NaN">.
  const trainingDays = [];
  for (const wk in appState.weeks || {}) {
    if (!isNumericWeekKey(wk)) continue;
    const weekNum = parseInt(wk, 10);
    const wkData = appState.weeks[wk];
    defaultDays.forEach((d, dayIdx) => {
      let completedSets = 0;
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          completedSets += dayLifts[lift].filter(s => isCompletedSet(s)).length;
        }
      }
      const gymHasData = completedSets > 0;
      const runHasData = (parseFloat(runDaySummary(wkData, d).dist) || 0) > 0;
      if (gymHasData || runHasData) {
        trainingDays.push({ week: weekNum, dayIdx, gym: gymHasData, run: runHasData });
      }
    });
  }

  // Find or create heatmap header + container after detailEl
  let heatmapHeader = document.querySelector('.streak-heatmap-header');
  let heatmapContainer = document.getElementById('streakHeatmapContainer');
  if (!heatmapContainer && detailEl) {
    heatmapHeader = document.createElement('h2');
    heatmapHeader.className = 'section-header mt-3 streak-heatmap-header';
    heatmapHeader.textContent = 'Training Calendar';
    heatmapContainer = document.createElement('div');
    heatmapContainer.id = 'streakHeatmapContainer';
    detailEl.after(heatmapHeader);
    heatmapHeader.after(heatmapContainer);
  }

  renderConsistencyHeatmap(heatmapContainer, trainingDays, data.weekLabels);
}

export function renderGoalProgressDetail(data, getState) {
  const appState      = getState();
  const activeProgram = getProgramById(appState.activeProgramId);

  const wk    = parseInt(appState.currentWeek, 10) || 1;
  const total = activeProgram.totalWeeks || 12;
  const pct   = Math.round((wk / total) * 100);

  const goalEl = document.getElementById('analytics-goal-detail');
  if (!goalEl) return;

  const remaining = total - wk;
  const milestones = [
    { week: 4,  label: '1-month check-in' },
    { week: 8,  label: 'Mid-program peak' },
    { week: 12, label: 'Program completion' },
  ];
  const nextMilestone = milestones.find(m => m.week >= wk) || milestones[milestones.length - 1];

  goalEl.innerHTML = `
    <h2 class="section-header mt-4">Program Goal Progress</h2>
    <article class="card-dark p-4 mb-4">
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">Mesocycle progress</span>
        <span class="font-heavy text-inverse">Wk ${wk} / ${total}</span>
      </div>
      <div style="height:8px;border-radius:4px;background:var(--overlay-md);overflow:hidden;margin-bottom:12px;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--color-blue),var(--color-indigo,#6366f1));border-radius:4px;transition:width 0.5s var(--ease-out);"></div>
      </div>
      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Completion</span>
        <span class="font-heavy text-inverse">${pct}%</span>
      </div>
      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Weeks remaining</span>
        <span class="font-heavy text-inverse">${remaining}</span>
      </div>
      <div class="flex-between" style="font-size:0.8rem;">
        <span class="text-muted">Next milestone</span>
        <span class="font-heavy text-accent-blue">Wk ${nextMilestone.week} — ${nextMilestone.label}</span>
      </div>
    </article>
  `;
}
