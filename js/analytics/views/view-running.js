// ==========================================
// RUNNING VIEW (analytics/views/view-running.js)
// ==========================================
import { formatPace, paceZoneColour, formatDist } from '../utils.js';
import { renderHrZonesChart, renderCadenceChart, renderPaceLineChart } from '../charts.js';
import {
  renderEnhancedPaceChart,
  renderAerobicEfficiencyChart,
  renderHrZoneRingChart,
  renderDistanceProgressionChart,
} from '../charts/running-charts.js';
import { renderTSBTrendChart, renderLoadRatioChart, renderTrainingStressChart } from '../charts/load-charts.js';
import { statCard } from '../charts/chart-primitives.js';
import { computeRunningAnalytics } from '../calculations/running-calcs.js';
import { computeLoadAnalytics } from '../calculations/load-calcs.js';
import {
  generateRunningInsights,
  generateLoadInsights,
  rankInsights,
  renderInsightsHTML,
} from '../insights/insight-engine.js';

function qs(id) { return document.getElementById(id); }

function fmtPace(secs) {
  if (!secs || secs <= 0) return '--';
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')} /km`;
}

function fmtDist(km) { return km > 0 ? km.toFixed(1) + ' km' : '--'; }

function _enduranceScoreLabel(score) {
  if (score >= 85) return 'Elite aerobic engine';
  if (score >= 70) return 'Advanced aerobic base';
  if (score >= 55) return 'Developing aerobic capacity';
  if (score >= 40) return 'Building foundation';
  return 'Early stage — keep building';
}

// ---- Endurance Score Hero -----------------------------------------------
function renderEnduranceHero(ra, data) {
  const el = qs('runningEnduranceHero');
  if (!el) return;

  const score = ra.endScore;
  const color = score === null ? '#94a3b8'
    : score >= 80 ? '#10b981'
    : score >= 60 ? '#3b82f6'
    : score >= 40 ? '#f59e0b'
    : '#ef4444';

  const ring = score !== null ? (() => {
    const r = 34, cx2 = 44, cy2 = 44, circ = 2 * Math.PI * r;
    const offset = circ - (score / 100) * circ;
    return `<svg width="88" height="88" viewBox="0 0 88 88" style="flex-shrink:0;">
      <circle cx="${cx2}" cy="${cy2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
      <circle cx="${cx2}" cy="${cy2}" r="${r}" fill="none" stroke="${color}" stroke-width="6"
        stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
        stroke-linecap="round" transform="rotate(-90 ${cx2} ${cy2})" opacity="0.9"/>
      <text x="${cx2}" y="${cy2 + 6}" text-anchor="middle" fill="${color}" font-size="20" font-weight="900">${score}</text>
    </svg>`;
  })() : '';

  el.innerHTML = `
    <article class="card-dark p-4 mb-3" style="border:1px solid ${color}44;display:flex;align-items:center;gap:16px;">
      ${ring}
      <div style="flex:1;min-width:0;">
        <div class="text-xs text-muted mb-1">ENDURANCE SCORE</div>
        <div class="font-heavy text-inverse" style="font-size:1.4rem;color:${color};">${score !== null ? _enduranceScoreLabel(score) : 'Set threshold pace'}</div>
        ${ra.vdot ? `<div class="text-xs text-muted mt-1">VDOT&nbsp;${ra.vdot}&nbsp;·&nbsp;RE&nbsp;${ra.re || '--'}&nbsp;ml/kg/km</div>` : ''}
        ${ra.decoupling !== null ? `<div class="text-xs mt-1" style="color:${Math.abs(ra.decoupling) < 5 ? '#10b981' : '#f59e0b'};">Decoupling&nbsp;${ra.decoupling > 0 ? '+' : ''}${ra.decoupling}%</div>` : ''}
      </div>
    </article>`;
}

// ---- Race Predictors ----------------------------------------------------
function renderRacePredictors(ra, data) {
  const el = qs('runningRacePredictors');
  if (!el) return;

  if (!ra.racePredict) {
    el.innerHTML = `
      <h2 class="section-header mt-2">Race Predictors</h2>
      <article class="card-dark p-4" style="text-align:center;">
        <div class="text-muted text-sm">Set your threshold pace in settings to unlock race predictions.</div>
      </article>`;
    return;
  }

  const { fiveK, tenK, halfMar, marathon } = ra.racePredict;
  const races = [fiveK, tenK, halfMar, marathon];
  const rows = races.map((r, idx) => {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
    return `
      <div class="flex-between py-3" style="border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:3px;height:28px;background:${colors[idx]};border-radius:2px;flex-shrink:0;"></div>
          <span class="text-sm font-bold text-inverse">${r.dist}</span>
        </div>
        <div style="text-align:right;">
          <div class="font-heavy text-inverse" style="font-size:1.1rem;">${r.time}</div>
          <div class="text-xs text-muted">${r.pace}</div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <h2 class="section-header mt-2">Race Predictors</h2>
    <article class="card-dark p-3 mb-3">
      <div class="text-xs text-muted mb-3">Based on threshold pace ${fmtPace(data.thresholdSecs)}&nbsp;·&nbsp;VDOT ${ra.vdot || '--'}</div>
      ${rows}
    </article>`;
}

// ---- Running Fitness Dashboard ----------------------------------------
function renderRunningFitnessDashboard(ra, la, data) {
  const el = qs('runningFitnessDashboard');
  if (!el) return;

  const distCur  = ra.distSeries[ra.distSeries.length - 1] || 0;
  const distPrev = ra.distSeries[ra.distSeries.length - 2] || 0;
  const distPct  = distPrev > 0 ? ((distCur - distPrev) / distPrev) * 100 : null;

  const monthly = ra.monthlyDist;
  const curMon  = monthly[monthly.length - 1]?.distance || 0;
  const prevMon = monthly[monthly.length - 2]?.distance || 0;
  const monPct  = prevMon > 0 ? ((curMon - prevMon) / prevMon) * 100 : null;

  const roiAbs    = Math.abs(ra.roi || 0);
  const roiLabel  = ra.roi < -0.5 ? `↑ ${roiAbs.toFixed(1)} s/km/wk` : ra.roi > 0.5 ? `↓ ${roiAbs.toFixed(1)} s/km/wk` : 'Stable';
  const roiColor  = ra.roi < -0.5 ? '#10b981' : ra.roi > 0.5 ? '#ef4444' : 'rgba(255,255,255,0.5)';

  const loadRatioColor = la.currentRatio < 0.8 ? '#10b981' : la.currentRatio < 1.3 ? '#f59e0b' : '#ef4444';

  el.innerHTML = `
    <h2 class="section-header mt-2">Running Fitness Dashboard</h2>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Threshold Pace', value: data.thresholdSecs ? fmtPace(data.thresholdSecs) : '--', sub: 'Set in settings', color: '#f59e0b' })}
      ${statCard({ label: 'Threshold HR', value: ra.thresholdHR ? ra.thresholdHR + ' bpm' : '--', sub: '~87% max HR', color: '#ef4444' })}
    </div>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'VDOT Estimate', value: ra.vdot ? ra.vdot.toString() : '--', sub: 'From threshold pace', color: '#3b82f6' })}
      ${statCard({ label: 'Running Economy', value: ra.re ? ra.re + ' ml/kg/km' : '--', sub: 'At threshold pace', color: '#22d3ee' })}
    </div>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Weekly Distance', value: fmtDist(distCur), delta: distPct, sub: 'vs last week', color: '#ec4899' })}
      ${statCard({ label: 'Monthly Distance', value: fmtDist(curMon), delta: monPct, sub: 'vs last month', color: '#f472b6' })}
    </div>
    <div class="grid-2-col gap-2 mb-3">
      <article class="card-dark p-3 flex-col" style="border:1px solid ${roiColor}22;">
        <div class="text-xs text-muted mb-1">Fitness Trend</div>
        <div class="font-heavy text-inverse" style="font-size:1.1rem;color:${roiColor};">${roiLabel}</div>
        <div class="text-xs text-muted mt-1">Pace improvement rate</div>
        ${ra.bestPace ? `<div class="text-xs mt-1" style="color:#f59e0b;">Best: ${fmtPace(ra.bestPace)}</div>` : ''}
      </article>
      <article class="card-dark p-3 flex-col" style="border:1px solid ${loadRatioColor}22;">
        <div class="text-xs text-muted mb-1">Running Load (ACWR)</div>
        <div class="font-heavy text-inverse" style="font-size:1.3rem;color:${loadRatioColor};">${la.currentRatio || '--'}</div>
        <div class="text-xs mt-1" style="color:${loadRatioColor};">${la.loadStatus.status}</div>
        <div class="text-xs text-muted mt-1">ATL / CTL</div>
      </article>
    </div>`;
}

// ---- Pace Analysis ------------------------------------------------------
function renderPaceAnalysis(ra, data) {
  const el = qs('runningPaceAnalysisSection');
  if (!el) return;

  el.innerHTML = `
    <h2 class="section-header mt-2">Pace Analysis</h2>
    <article class="card-dark p-3 mb-3">
      <div id="enhancedPaceChart"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="text-xs text-muted mb-2">Weekly Pace Detail</div>
      <div id="paceDetailList"></div>
    </article>`;

  const paceChartEl = qs('enhancedPaceChart');
  if (paceChartEl) {
    renderEnhancedPaceChart(
      paceChartEl,
      data.weekLabels,
      ra.paceSeries,
      ra.paceRolling4,
      ra.paceTrendLine,
      data.thresholdSecs || 0,
    );
  }

  const paceListEl = qs('paceDetailList');
  if (paceListEl) {
    const rows = data.weekLabels.map((lbl, i) => {
      if (ra.paceSeries[i] <= 0) return '';
      const colour = paceZoneColour(ra.paceSeries[i], data.thresholdSecs);
      const isBest = ra.paceSeries[i] === Math.min(...ra.paceSeries.filter(v => v > 0));
      return `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.06);">
        <span class="text-sm text-inverse">${lbl}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${isBest ? '<span style="font-size:0.7rem;color:#f59e0b;">Best</span>' : ''}
          <span class="font-heavy" style="color:${colour};font-variant-numeric:tabular-nums;">${formatPace(ra.paceSeries[i])}</span>
        </div>
      </div>`;
    }).filter(Boolean).join('');
    paceListEl.innerHTML = rows || '<p class="text-muted text-sm">No pace data logged.</p>';
  }
}

// ---- HR Analysis --------------------------------------------------------
function renderHRAnalysis(ra, data) {
  const el = qs('runningHrAnalysisSection');
  if (!el) return;

  el.innerHTML = `
    <h2 class="section-header mt-2">Heart Rate Analysis</h2>
    <div class="grid-2-col gap-2 mb-3">
      <article class="card-dark p-3 flex-col">
        <div class="text-xs text-muted mb-1">HR Zone Distribution</div>
        <div id="hrZoneRingChart"></div>
      </article>
      <article class="card-dark p-3 flex-col">
        <div class="text-xs text-muted mb-2">Zone Details</div>
        <div id="hrZoneDetails"></div>
      </article>
    </div>
    <article class="card-dark p-3 mb-3">
      <div class="text-xs text-muted mb-2">Aerobic Efficiency Trend <span style="opacity:0.5;">(s/km per BPM — lower = better)</span></div>
      <div id="aerobicEfficiencyChart"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="text-xs text-muted mb-2">HR Zones by Week (minutes)</div>
      <div id="hrZonesWeeklyChart"></div>
    </article>`;

  // Ring chart
  const ringEl = qs('hrZoneRingChart');
  if (ringEl) renderHrZoneRingChart(ringEl, ra.hrZonePct);

  // Zone details text
  const zoneDetailsEl = qs('hrZoneDetails');
  if (zoneDetailsEl && ra.hrZonePct) {
    const zoneNames  = ['Z1 Recovery', 'Z2 Aerobic', 'Z3 Tempo', 'Z4 Threshold', 'Z5 Max'];
    const zoneColors = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
    zoneDetailsEl.innerHTML = zoneNames.map((name, i) => `
      <div class="flex-between mb-1" style="font-size:0.75rem;">
        <span style="color:${zoneColors[i]};">${name}</span>
        <span class="font-bold text-inverse">${ra.hrZonePct[i] || 0}%</span>
      </div>`).join('');
  }

  // Efficiency chart
  const effEl = qs('aerobicEfficiencyChart');
  if (effEl) renderAerobicEfficiencyChart(effEl, data.weekLabels, ra.effSeries, ra.effRolling4);

  // Weekly HR zones chart
  const hrWeeklyEl = qs('hrZonesWeeklyChart');
  if (hrWeeklyEl) renderHrZonesChart(hrWeeklyEl, data.weekLabels, ra.hrZonesSeries);

  // Pace vs HR correlation
  if (ra.paceHrCorr?.correlation !== null) {
    const corrEl = document.createElement('article');
    corrEl.className = 'card-dark p-3 mb-3';
    corrEl.innerHTML = `
      <div class="text-xs text-muted mb-1">Pace–HR Relationship</div>
      <div class="font-bold text-inverse text-sm">${ra.paceHrCorr.interpretation}</div>
      <div class="text-xs text-muted mt-1">Correlation r = ${ra.paceHrCorr.correlation}</div>`;
    qs('runningHrAnalysisSection').appendChild(corrEl);
  }
}

// ---- Running Load -------------------------------------------------------
function renderRunningLoad(ra, la, data) {
  const el = qs('runningLoadSection');
  if (!el) return;

  el.innerHTML = `
    <h2 class="section-header mt-2">Running Load</h2>
    <article class="card-dark p-3 mb-3">
      <div id="tsbTrendChartRunning"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="text-xs text-muted mb-2">Load Ratio (ACWR)</div>
      <div id="loadRatioChartRunning"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="text-xs text-muted mb-2">Training Stress Trend (4-week rolling)</div>
      <div id="trainingStressChartRunning"></div>
    </article>`;

  const tsbEl = qs('tsbTrendChartRunning');
  if (tsbEl) renderTSBTrendChart(tsbEl, data.weekLabels, la.atlSeries, la.ctlSeries, la.tsb);

  const ratioEl = qs('loadRatioChartRunning');
  if (ratioEl) renderLoadRatioChart(ratioEl, data.weekLabels, la.ratioSeries);

  const stressEl = qs('trainingStressChartRunning');
  if (stressEl) renderTrainingStressChart(stressEl, data.weekLabels, la.stressTrend, la.weeklyTotal);
}

// ---- Distance Progression -----------------------------------------------
function renderDistanceSection(ra, data) {
  const el = qs('runningDistanceSection');
  if (!el) return;

  el.innerHTML = `
    <h2 class="section-header mt-2">Distance Progression</h2>
    <article class="card-dark p-3 mb-3">
      <div id="distanceProgressionChart"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="text-xs text-muted mb-2">Cadence</div>
      <div id="cadenceChartContainer"></div>
    </article>`;

  const distEl = qs('distanceProgressionChart');
  if (distEl) renderDistanceProgressionChart(distEl, data.weekLabels, ra.distSeries, ra.distRolling4);

  const cadEl = qs('cadenceChartContainer');
  if (cadEl) renderCadenceChart(cadEl, data.weekLabels, ra.cadenceSeries);
}

// ---- Main Export --------------------------------------------------------
export function renderRunningAnalytics(data, getState, getDays) {
  const appState = getState ? getState() : {};
  const days     = getDays ? getDays() : [];
  const maxWeek  = data.weekLabels.length;

  const ra = computeRunningAnalytics(appState, days, maxWeek, data.thresholdSecs);
  const la = computeLoadAnalytics(appState, days, maxWeek);

  const runInsights  = generateRunningInsights({
    paceSeries: ra.paceSeries, roi: ra.roi, distSeries: ra.distSeries,
    distProgPct: ra.distProgPct, hrZonePct: ra.hrZonePct, bestPace: ra.bestPace,
    decoupling: ra.decoupling, vdot: ra.vdot, thresholdSecs: data.thresholdSecs,
    endScore: ra.endScore, weeklyDistAvg: ra.weeklyDistAvg,
  });
  const loadInsights = generateLoadInsights({
    atl: la.currentATL, ctl: la.currentCTL, ratio: la.currentRatio,
    loadProgPct: la.loadProgPct, fatigue: la.fatigue, loadStatus: la.loadStatus,
  });
  const allInsights  = rankInsights([...runInsights, ...loadInsights]);

  const section = qs('analytics-running');
  if (!section) return;

  let insightsEl = section.querySelector('.running-insights-panel');
  if (!insightsEl) {
    insightsEl = document.createElement('div');
    insightsEl.className = 'running-insights-panel';
    section.prepend(insightsEl);
  }
  insightsEl.innerHTML = renderInsightsHTML(allInsights, 4);

  _ensureDiv(section, 'runningEnduranceHero');
  _ensureDiv(section, 'runningFitnessDashboard');
  _ensureDiv(section, 'runningPaceAnalysisSection');
  _ensureDiv(section, 'runningRacePredictors');
  _ensureDiv(section, 'runningHrAnalysisSection');
  _ensureDiv(section, 'runningLoadSection');
  _ensureDiv(section, 'runningDistanceSection');

  // Keep legacy elements for tile compat
  _ensureSpan(section, 'allTimeRunDist');
  _ensureSpan(section, 'allTimeRunElev');
  _ensureSpan(section, 'allTimeRunCals');
  const setText = (id, val) => { const el = qs(id); if (el) el.textContent = val; };
  setText('allTimeRunDist', formatDist(data.globalTotalDist, data.distUnit));
  setText('allTimeRunElev', Math.round(data.globalTotalElev) + ' m');
  setText('allTimeRunCals', Math.round(data.globalTotalCals).toLocaleString());

  renderEnduranceHero(ra, data);
  renderRunningFitnessDashboard(ra, la, data);
  renderPaceAnalysis(ra, data);
  renderRacePredictors(ra, data);
  renderHRAnalysis(ra, data);
  renderRunningLoad(ra, la, data);
  renderDistanceSection(ra, data);

  // Threshold pace input sync
  const thresholdInput = qs('analyticsThresholdPaceInput');
  if (thresholdInput && data.thresholdSecs && !thresholdInput.value) {
    thresholdInput.value = data.thresholdSecs;
  }
}

function _ensureDiv(parent, id) {
  if (!document.getElementById(id)) {
    const div = document.createElement('div');
    div.id = id;
    parent.appendChild(div);
  }
}

function _ensureSpan(parent, id) {
  if (!document.getElementById(id)) {
    const span = document.createElement('span');
    span.id = id;
    span.style.display = 'none';
    parent.appendChild(span);
  }
}
