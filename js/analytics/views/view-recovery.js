// ==========================================
// RECOVERY VIEW (analytics/views/view-recovery.js)
// ==========================================
import { renderRpeChart } from '../charts.js';
import { saveStateToLocalStorage } from '../../state.js';
import {
  renderSleepTrendChart,
  renderHRVTrendChart,
  renderRestingHRTrendChart,
  renderRecoveryScoreTrendChart,
  renderMoodTrendChart,
  renderSorenessTrendChart,
  renderReadinessRingLarge,
} from '../charts/recovery-charts.js';
import { statCard } from '../charts/chart-primitives.js';
import { computeRecoveryAnalytics } from '../calculations/recovery-calcs.js';
import { computeLoadAnalytics } from '../calculations/load-calcs.js';
import {
  computeReadiness,
  readinessStatus,
  readinessColor,
} from '../scoring/readiness-scoring.js';
import {
  generateRecoveryInsights,
  generateLoadInsights,
  rankInsights,
  renderInsightsHTML,
} from '../insights/insight-engine.js';

function qs(id) { return document.getElementById(id); }

// ---- RPE-based recovery (existing view) --------------------------------
export function renderRecoveryAnalytics(data, getState, getDays) {
  const appState    = getState();
  const defaultDays = getDays();
  const wk          = appState.currentWeek || '1';
  const weekData    = appState.weeks?.[wk];

  let totalRpe = 0, rpeCount = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(weekData.gymRpe?.[d], 10)   || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }

  const avgRpe = rpeCount > 0 ? (totalRpe / rpeCount) : 0;
  let statusLabel = '--', statusColor = 'var(--text-muted)', interpretation = 'Log workouts to see recovery status.';
  if (rpeCount > 0) {
    if (avgRpe < 6)      { statusLabel = 'Fresh';       statusColor = '#10b981'; interpretation = 'Low fatigue this week. Good time to push intensity.'; }
    else if (avgRpe < 8) { statusLabel = 'Accumulating'; statusColor = '#f59e0b'; interpretation = 'Moderate fatigue. Stick to planned volume and prioritise sleep.'; }
    else                  { statusLabel = 'High Load';   statusColor = '#ef4444'; interpretation = 'High fatigue this week. Consider reducing volume or taking a rest day.'; }
  }

  const section = qs('analytics-recovery');
  if (!section) return;

  let summaryEl = section.querySelector('.recovery-summary-cards');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.className = 'recovery-summary-cards grid-2-col gap-2 mb-3';
    const chartArticle = section.querySelector('article');
    if (chartArticle) section.insertBefore(summaryEl, chartArticle);
    else section.appendChild(summaryEl);
  }
  summaryEl.innerHTML = `
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(16,185,129,0.3);">
      <div class="text-xs text-muted mb-1">Avg RPE This Week</div>
      <div class="text-lg font-heavy" style="color:${statusColor};">${rpeCount > 0 ? avgRpe.toFixed(1) : '--'}</div>
      <div class="text-xs font-bold mt-1" style="color:${statusColor};">${statusLabel}</div>
    </article>
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(59,130,246,0.3);">
      <div class="text-xs text-muted mb-1">Sessions Logged</div>
      <div class="text-lg font-heavy text-inverse">${rpeCount}</div>
      <div class="text-xs text-muted mt-1">this week</div>
    </article>`;

  let interpEl = section.querySelector('.recovery-interpretation');
  if (!interpEl) {
    interpEl = document.createElement('article');
    interpEl.className = 'recovery-interpretation card-dark p-3 mb-3';
    const chartArticle = section.querySelector('article:not(.recovery-summary-cards article)');
    if (chartArticle) section.insertBefore(interpEl, chartArticle);
    else section.appendChild(interpEl);
  }
  interpEl.innerHTML = `<div class="text-sm text-muted" style="line-height:1.5;">${interpretation}</div>`;

  renderRpeChart(qs('rpeTrendContainer'), data.weekLabels, data.rpeData);
}

// ---- Full Recovery Score Detail ----------------------------------------
export function renderRecoveryScoreDetail(data, getState, getDays) {
  const appState    = getState();
  const defaultDays = getDays();
  const section     = qs('analytics-recovery-score');
  if (!section) return;

  // Compute all recovery analytics
  const recov    = computeRecoveryAnalytics(appState);
  const la       = computeLoadAnalytics(appState, defaultDays, data.weekLabels.length);

  // Compute Garmin-style readiness
  const lastSleep  = recov.sleepData.length > 0 ? recov.sleepData[recov.sleepData.length - 1]?.value : null;
  const readiness  = computeReadiness({
    hrvStat:       recov.hrvStat,
    sleepHours:    lastSleep,
    atl:           la.currentATL,
    ctl:           la.currentCTL,
    todayWellness: recov.todayWellness,
  });

  const readColor = readinessColor(readiness.score);

  // Map readiness to athlete-friendly primary status
  const primaryStatus = recov.nsStatus?.status
    || (readiness.score >= 75 ? 'Primed' : readiness.score >= 50 ? 'Balanced' : 'Suppressed');
  const primaryTone   = recov.nsStatus?.tone
    || (readiness.score >= 75 ? 'progress' : readiness.score >= 50 ? 'neutral' : 'caution');
  const statusColor   = primaryTone === 'progress' ? '#10b981' : primaryTone === 'caution' ? '#f59e0b' : primaryTone === 'warning' ? '#ef4444' : '#94a3b8';

  // Generate insights
  const wk       = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];
  let rpeCount = 0, totalRpe = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }

  const recovInsights = generateRecoveryInsights({
    recovDecline:  recov.recovDecline,
    sleep7d:       recov.sleep7d,
    hrvStat:       recov.hrvStat,
    loadStatus:    la.loadStatus,
    todayWellness: recov.todayWellness,
  });
  const loadInsights = generateLoadInsights({
    atl: la.currentATL, ctl: la.currentCTL, ratio: la.currentRatio,
    loadProgPct: la.loadProgPct, fatigue: la.fatigue, loadStatus: la.loadStatus,
  });
  const allInsights  = rankInsights([...recovInsights, ...loadInsights]);

  // ---- Build full section HTML
  let insightsEl = section.querySelector('.recovery-insights-panel');
  if (!insightsEl) {
    insightsEl = document.createElement('div');
    insightsEl.className = 'recovery-insights-panel';
    section.prepend(insightsEl);
  }
  insightsEl.innerHTML = renderInsightsHTML(allInsights, 4);

  // Hero Status + Readiness Ring
  _ensureDiv(section, 'readinessDashboard');
  const readDash = qs('readinessDashboard');
  readDash.innerHTML = `
    <h2 class="section-header mt-2">Recovery Status</h2>
    <article class="card-dark p-4 mb-3 flex-col flex-center" style="border:1px solid ${statusColor}33;">
      <div class="an-kpi__label" style="margin-bottom:4px;">Today's Status</div>
      <div style="font-size:1.6rem;font-weight:900;color:${statusColor};letter-spacing:-0.02em;margin-bottom:2px;">${primaryStatus}</div>
      <div class="text-xs text-muted mb-4">${_recoveryStatusWhy(primaryStatus, recov, la)}</div>
      <div id="readinessRingContainer"></div>
      <div class="text-sm text-muted mt-3 text-center" style="max-width:280px;line-height:1.5;">${readiness.recommendation}</div>
      ${_readinessComponentsHTML(readiness.components)}
    </article>`;

  const ringEl = qs('readinessRingContainer');
  if (ringEl) renderReadinessRingLarge(ringEl, readiness.score, readiness.status, readColor);

  // Nervous System + Baseline Cards
  _ensureDiv(section, 'recoveryBaselineCards');
  qs('recoveryBaselineCards').innerHTML = `
    <h2 class="section-header mt-2">Recovery Signals</h2>
    <div class="grid-2-col gap-2 mb-3">
      ${_nsStatusCard(recov)}
      ${_recoveryMomentumCard(recov)}
      ${_sleepBaselineCard(recov)}
      ${_sleepDebtCard(recov)}
    </div>
    ${recov.debtDays > 0 ? `<div class="an-insight an-insight--alert mb-3" style="border-radius:10px;">
      <div class="an-insight__icon">!</div>
      <div>Recovery has been below optimal for <strong>${recov.debtDays} consecutive day${recov.debtDays > 1 ? 's' : ''}</strong>. Prioritise sleep, nutrition and a lighter session today.</div>
    </div>` : ''}`;

  // HRV Baseline Card (if available)
  if (recov.hasHC && recov.hrvStat) {
    _ensureDiv(section, 'hrvBaselineSection');
    qs('hrvBaselineSection').innerHTML = `
      <h2 class="section-header mt-2">HRV Status</h2>
      <article class="card-dark p-4 mb-3" style="border:1px solid rgba(16,185,129,0.25);">
        ${_hrvBaselineHTML(recov.hrvStat)}
      </article>`;
  }

  // RHR Baseline Card (if available)
  if (recov.hasHC && recov.rhrDev) {
    _ensureDiv(section, 'rhrBaselineSection');
    qs('rhrBaselineSection').innerHTML = `
      <h2 class="section-header mt-2">Resting HR Status</h2>
      <article class="card-dark p-4 mb-3" style="border:1px solid rgba(239,68,68,0.2);">
        ${_rhrBaselineHTML(recov.rhrDev)}
      </article>`;
  }

  // Summary metric cards
  _ensureDiv(section, 'recoverySummaryCards');
  const avgRpe    = rpeCount > 0 ? totalRpe / rpeCount : 0;
  const rpeFactor = rpeCount > 0 ? Math.round(Math.max(0, Math.min(100, ((10 - avgRpe) / 9) * 100))) : null;

  qs('recoverySummaryCards').innerHTML = `
    <h2 class="section-header mt-2">Session Load</h2>
    <div class="grid-2-col gap-2 mb-3">
      ${statCard({ label: 'Avg RPE', value: rpeCount > 0 ? avgRpe.toFixed(1) : '--', sub: 'This week', color: rpeFactor > 70 ? '#10b981' : rpeFactor > 40 ? '#f59e0b' : '#ef4444' })}
      ${statCard({ label: 'Recovery Capacity', value: rpeFactor !== null ? rpeFactor + '%' : '--', sub: 'From session RPE', color: '#3b82f6' })}
      ${statCard({ label: 'Form (TSB)', value: la.currentCTL > 0 ? (la.currentTSB >= 0 ? '+' : '') + Math.round(la.currentTSB) : '--', sub: la.currentTSB >= 0 ? 'Positive — ready to train' : 'Negative — fatigue present', color: la.currentTSB >= 0 ? '#10b981' : '#ef4444' })}
      ${statCard({ label: 'Load Ratio', value: la.currentCTL > 0 ? la.currentRatio.toFixed(2) : '--', sub: la.loadStatus.status, color: la.currentRatio < 1.3 ? '#f59e0b' : '#ef4444' })}
    </div>`;

  // Sleep trend
  _ensureDiv(section, 'sleepTrendSection');
  qs('sleepTrendSection').innerHTML = `
    <h2 class="section-header mt-2">Sleep Trend (28 days)</h2>
    <article class="card-dark p-3 mb-3">
      ${recov.sleep28dBaseline ? `<div class="flex-between mb-2"><span class="text-xs text-muted">28-day avg</span><span class="font-bold" style="color:#818cf8;">${recov.sleep28dBaseline.toFixed(1)}h</span></div>` : ''}
      <div id="sleepTrendChart"></div>
    </article>`;
  renderSleepTrendChart(qs('sleepTrendChart'), recov.sleepData, recov.sleep28dBaseline);

  // HRV + RHR (if Health Connect)
  _ensureDiv(section, 'hcTrendSection');
  if (recov.hasHC) {
    qs('hcTrendSection').innerHTML = `
      <h2 class="section-header mt-2">HRV & Resting HR Trends (28 days)</h2>
      <article class="card-dark p-3 mb-3">
        <div class="flex-between mb-2">
          <div class="text-xs text-muted">HRV — RMSSD (ms)</div>
          ${recov.hrvStat ? `<div class="text-xs font-bold" style="color:${recov.hrvStat.pct >= 0 ? '#10b981' : '#ef4444'};">${recov.hrvStat.pct >= 0 ? '+' : ''}${recov.hrvStat.pct}% vs baseline</div>` : ''}
        </div>
        <div id="hrvTrendChart"></div>
      </article>
      <article class="card-dark p-3 mb-3">
        <div class="flex-between mb-2">
          <div class="text-xs text-muted">Resting Heart Rate (bpm)</div>
          ${recov.rhrDev ? `<div class="text-xs font-bold" style="color:${recov.rhrDev.pct <= 0 ? '#10b981' : '#ef4444'};">${recov.rhrDev.pct >= 0 ? '+' : ''}${recov.rhrDev.pct}% vs baseline</div>` : ''}
        </div>
        <div id="rhrTrendChart"></div>
      </article>`;
    renderHRVTrendChart(qs('hrvTrendChart'), recov.hrvData, recov.hrv30d);
    renderRestingHRTrendChart(qs('rhrTrendChart'), recov.rhrData, recov.rhrBase28d);
  } else {
    qs('hcTrendSection').innerHTML = `
      <article class="card-dark p-3 mb-3" style="border:1px solid rgba(255,255,255,0.08);">
        <div class="text-sm text-muted">Connect Health Connect (Android) to unlock HRV and Resting HR trends.</div>
      </article>`;
  }

  // Recovery score trend
  _ensureDiv(section, 'recoveryScoreTrendSection');
  if (recov.recovScores.length >= 3) {
    qs('recoveryScoreTrendSection').innerHTML = `
      <h2 class="section-header mt-2">Recovery Score Trend (28 days)</h2>
      <article class="card-dark p-3 mb-3">
        <div id="recoveryScoreTrendChart"></div>
      </article>`;
    renderRecoveryScoreTrendChart(qs('recoveryScoreTrendChart'), recov.recovScores);
  }

  // Mood & Soreness trend
  _ensureDiv(section, 'moodSorenessTrendSection');
  if (recov.moodData.length >= 3 || recov.sorenessData.length >= 3) {
    qs('moodSorenessTrendSection').innerHTML = `
      <h2 class="section-header mt-2">Stress Signals (28 days)</h2>
      <div class="grid-2-col gap-2 mb-3">
        <article class="card-dark p-3">
          <div class="text-xs text-muted mb-2">Mood (1–5)</div>
          <div id="moodTrendChart"></div>
        </article>
        <article class="card-dark p-3">
          <div class="text-xs text-muted mb-2">Soreness (1–5, lower better)</div>
          <div id="sorenessTrendChart"></div>
        </article>
      </div>`;
    renderMoodTrendChart(qs('moodTrendChart'), recov.moodData);
    renderSorenessTrendChart(qs('sorenessTrendChart'), recov.sorenessData);
  }

  // RPE trend chart
  _ensureDiv(section, 'rpeTrendDetailSection');
  qs('rpeTrendDetailSection').innerHTML = `
    <h2 class="section-header mt-2">Weekly RPE Trend</h2>
    <article class="card-dark p-3 mb-3">
      <div id="rpeTrendContainer"></div>
    </article>`;
  renderRpeChart(qs('rpeTrendContainer'), data.weekLabels, data.rpeData);

  // Wellness form
  _ensureDiv(section, 'wellnessFormSection');
  _renderWellnessForm(qs('wellnessFormSection'), getState, getDays, data);

  // Load balance card
  _ensureDiv(section, 'recoveryWindowCard');
  _renderLoadBalanceCard(qs('recoveryWindowCard'), la);

  // Legacy DOM IDs for tile compatibility
  _syncLegacyIds(readiness, rpeFactor, avgRpe, la);
}

function _recoveryStatusWhy(status, recov, la) {
  if (status === 'Primed') {
    return recov.nsStatus ? 'HRV elevated above baseline — nervous system recovered' : 'Readiness signals are positive';
  }
  if (status === 'Balanced') {
    return 'All recovery signals within normal range';
  }
  if (status === 'Suppressed') {
    const reasons = [];
    if (recov.hrvStat?.status === 'suppressed') reasons.push('HRV below baseline');
    if (recov.sleepDev?.pct < -10) reasons.push('sleep below average');
    if (la.currentRatio > 1.3) reasons.push('high training load');
    return reasons.length > 0 ? reasons.join(' · ') : 'Recovery signals below normal';
  }
  return 'Multiple signals below optimal range';
}

function _nsStatusCard(recov) {
  const ns = recov.nsStatus;
  if (!ns) {
    return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid rgba(16,185,129,0.4);">
      <div class="an-stat__label">Nervous System</div>
      <div class="an-stat__value" style="font-size:1rem;color:rgba(255,255,255,0.4);">No HRV Data</div>
      <div class="an-stat__status text-muted">Connect Health Connect</div>
    </article>`;
  }
  const color = ns.tone === 'progress' ? '#10b981' : ns.tone === 'caution' ? '#f59e0b' : ns.tone === 'warning' ? '#ef4444' : '#94a3b8';
  return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid ${color};">
    <div class="an-stat__label">Nervous System</div>
    <div class="an-stat__value" style="font-size:1.15rem;color:${color};">${ns.status}</div>
    <div class="an-stat__status" style="color:${color};">${ns.tone === 'progress' ? 'Ready to perform' : ns.tone === 'caution' ? 'Moderate recovery' : ns.tone === 'warning' ? 'Needs rest' : 'Within range'}</div>
  </article>`;
}

function _recoveryMomentumCard(recov) {
  const m = recov.momentum;
  if (!m) {
    return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid rgba(59,130,246,0.4);">
      <div class="an-stat__label">Momentum</div>
      <div class="an-stat__value" style="font-size:1rem;color:rgba(255,255,255,0.4);">—</div>
      <div class="an-stat__status text-muted">Log 4+ days</div>
    </article>`;
  }
  const arrow    = m.direction === 'improving' ? '↑' : m.direction === 'declining' ? '↓' : '→';
  const color    = m.direction === 'improving' ? '#10b981' : m.direction === 'declining' ? '#ef4444' : '#f59e0b';
  const pctLabel = m.pct >= 0 ? `+${m.pct}%` : `${m.pct}%`;
  return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid ${color};">
    <div class="an-stat__label">Recovery Momentum</div>
    <div class="an-stat__value" style="font-size:1.3rem;color:${color};">${arrow} ${pctLabel}</div>
    <div class="an-stat__status" style="color:${color};">${m.direction === 'improving' ? 'Trending up' : m.direction === 'declining' ? 'Trending down' : 'Stable'}</div>
  </article>`;
}

function _sleepBaselineCard(recov) {
  const sleep7d = recov.sleep7d;
  const base28d = recov.sleep28dBaseline;
  if (!sleep7d) {
    return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid rgba(129,140,248,0.4);">
      <div class="an-stat__label">Sleep (7-day avg)</div>
      <div class="an-stat__value" style="font-size:1rem;color:rgba(255,255,255,0.4);">—</div>
      <div class="an-stat__status text-muted">Log sleep data</div>
    </article>`;
  }
  const pct   = base28d ? Math.round(((sleep7d - base28d) / base28d) * 100) : null;
  const color = sleep7d >= 7.5 ? '#10b981' : sleep7d >= 6.5 ? '#f59e0b' : '#ef4444';
  const delta = pct !== null ? (pct >= 0 ? `+${pct}%` : `${pct}%`) + ' vs 28d avg' : `vs 8h target`;
  return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid ${color};">
    <div class="an-stat__label">Sleep (7-day avg)</div>
    <div class="an-stat__value" style="color:${color};">${sleep7d.toFixed(1)}<span class="an-stat__unit">h</span></div>
    <div class="an-stat__status" style="color:${color};">${delta}</div>
  </article>`;
}

function _sleepDebtCard(recov) {
  const debt = recov.sleepDebt;
  if (debt === null) {
    return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid rgba(239,68,68,0.3);">
      <div class="an-stat__label">Sleep Debt (7d)</div>
      <div class="an-stat__value" style="font-size:1rem;color:rgba(255,255,255,0.4);">—</div>
      <div class="an-stat__status text-muted">Log sleep data</div>
    </article>`;
  }
  const color = debt <= 1 ? '#10b981' : debt <= 4 ? '#f59e0b' : '#ef4444';
  const status = debt <= 1 ? 'Well rested' : debt <= 4 ? 'Mild deficit' : 'Significant deficit';
  return `<article class="card-dark an-stat p-3 flex-col" style="border-top:2px solid ${color};">
    <div class="an-stat__label">Sleep Debt (7d)</div>
    <div class="an-stat__value" style="color:${color};">${debt}<span class="an-stat__unit">h</span></div>
    <div class="an-stat__status" style="color:${color};">${status}</div>
  </article>`;
}

function _hrvBaselineHTML(stat) {
  const color   = stat.pct >= 5 ? '#10b981' : stat.pct >= -5 ? '#94a3b8' : stat.pct >= -15 ? '#f59e0b' : '#ef4444';
  const label   = stat.status === 'elevated' ? 'Above baseline — well recovered' : stat.status === 'baseline' ? 'Within normal range' : stat.status === 'suppressed' ? 'Below baseline — moderate fatigue' : 'Well below baseline — rest needed';
  const pctStr  = stat.pct >= 0 ? `+${stat.pct}%` : `${stat.pct}%`;
  return `<div class="flex-between mb-2">
    <div><div class="text-xs text-muted mb-1">HRV Today</div><div style="font-size:1.6rem;font-weight:900;color:${color};font-variant-numeric:tabular-nums;">${stat.current}<span style="font-size:0.8rem;font-weight:500;color:rgba(255,255,255,0.4);margin-left:3px;">ms</span></div></div>
    <div style="text-align:right;"><div class="text-xs text-muted mb-1">28d Baseline</div><div style="font-size:1.6rem;font-weight:700;color:rgba(255,255,255,0.5);font-variant-numeric:tabular-nums;">${stat.baseline}<span style="font-size:0.8rem;font-weight:500;color:rgba(255,255,255,0.3);margin-left:3px;">ms</span></div></div>
  </div>
  <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 12px;">
    <div class="flex-between"><span style="font-size:0.8rem;font-weight:700;color:${color};">${pctStr} vs baseline</span><span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${label}</span></div>
  </div>`;
}

function _rhrBaselineHTML(rhrDev) {
  const color   = rhrDev.pct <= -5 ? '#10b981' : rhrDev.pct <= 5 ? '#94a3b8' : rhrDev.pct <= 10 ? '#f59e0b' : '#ef4444';
  const label   = rhrDev.pct <= -5 ? 'Below baseline — well recovered' : rhrDev.pct <= 5 ? 'Within normal range' : rhrDev.pct <= 10 ? 'Slightly elevated — mild fatigue' : 'Elevated — increased fatigue';
  const pctStr  = rhrDev.pct >= 0 ? `+${rhrDev.pct}%` : `${rhrDev.pct}%`;
  return `<div class="flex-between mb-2">
    <div><div class="text-xs text-muted mb-1">RHR Today</div><div style="font-size:1.6rem;font-weight:900;color:${color};font-variant-numeric:tabular-nums;">${rhrDev.current}<span style="font-size:0.8rem;font-weight:500;color:rgba(255,255,255,0.4);margin-left:3px;">bpm</span></div></div>
    <div style="text-align:right;"><div class="text-xs text-muted mb-1">28d Baseline</div><div style="font-size:1.6rem;font-weight:700;color:rgba(255,255,255,0.5);font-variant-numeric:tabular-nums;">${rhrDev.baseline}<span style="font-size:0.8rem;font-weight:500;color:rgba(255,255,255,0.3);margin-left:3px;">bpm</span></div></div>
  </div>
  <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 12px;">
    <div class="flex-between"><span style="font-size:0.8rem;font-weight:700;color:${color};">${pctStr} vs baseline</span><span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${label}</span></div>
  </div>`;
}

function _readinessComponentsHTML(components) {
  if (!components || Object.keys(components).length === 0) return '';
  const labels = { hrv: 'HRV', sleep: 'Sleep', load: 'Load Balance', wellness: 'Wellness' };
  const items = Object.entries(components)
    .map(([k, v]) => `<div class="flex-between text-xs mb-1"><span class="text-muted">${labels[k] || k}</span><span class="font-bold text-inverse">${v}%</span></div>`)
    .join('');
  return `<div class="mt-3 w-full" style="max-width:200px;">${items}</div>`;
}

function _renderLoadBalanceCard(el, la) {
  if (!el) return;
  const { currentATL: atl, currentCTL: ctl, currentTSB: tsb, currentRatio: acwr, loadStatus } = la;
  const hasLoad  = ctl > 0;
  const loadColor = loadStatus.tone === 'warning' ? '#ef4444' : loadStatus.tone === 'caution' ? '#f59e0b' : loadStatus.tone === 'progress' ? '#10b981' : '#94a3b8';

  el.innerHTML = `
    <h2 class="section-header mt-2">Load Balance</h2>
    <article class="card-dark p-4 mb-4">
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">ATL (7-day load)</span>
        <span class="font-heavy text-inverse">${hasLoad ? Math.round(atl) : '—'}</span>
      </div>
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">CTL (28-day baseline)</span>
        <span class="font-heavy text-inverse">${hasLoad ? Math.round(ctl) : '—'}</span>
      </div>
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">Form (TSB)</span>
        <span class="font-heavy" style="color:${tsb >= 0 ? '#10b981' : '#ef4444'};">${hasLoad ? (tsb >= 0 ? '+' : '') + Math.round(tsb) : '—'}</span>
      </div>
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">ACWR</span>
        <span class="font-heavy" style="color:${loadColor};">${hasLoad ? acwr.toFixed(2) : '—'}</span>
      </div>
      <div class="flex-between">
        <span class="text-sm text-muted">Status</span>
        <span class="font-heavy" style="color:${loadColor};">${loadStatus.status}</span>
      </div>
    </article>`;
}

function _syncLegacyIds(readiness, rpeFactor, avgRpe, la) {
  const setText = (id, val) => { const el = qs(id); if (el) el.textContent = val; };
  setText('recoveryScoreHero', readiness.score !== null ? `${readiness.score}%` : '--');
  setText('recoveryAvgRpe', rpeFactor !== null ? avgRpe.toFixed(1) : '--');
  setText('recoveryFatigueContrib', rpeFactor !== null ? `${rpeFactor}%` : 'Log RPE');
  setText('recoveryRecommendation', readiness.recommendation);

  const sleepEl = qs('recoverySleepContrib');
  if (sleepEl) {
    sleepEl.textContent = la.currentCTL > 0
      ? `${Math.round(la.currentRatio * 100) - 100 >= 0 ? '+' : ''}${Math.round((la.currentRatio - 1) * 100)}% load factor`
      : 'Log session duration';
  }
}

function _ensureDiv(parent, id) {
  if (!document.getElementById(id)) {
    const div = document.createElement('div');
    div.id = id;
    parent.appendChild(div);
  }
}

function _renderWellnessForm(formParent, getState, getDays, data) {
  if (!formParent) return;

  let formEl = formParent.querySelector('.wellness-checkin-form');
  if (!formEl) {
    formEl = document.createElement('div');
    formEl.className = 'wellness-checkin-form';
    formParent.appendChild(formEl);
  }

  const appState = getState();
  const today    = new Date().toISOString().slice(0, 10);
  const existing = (appState.wellnessLog || []).find(e => e.date === today) || {};

  const ratingBtns = (name, current, max) => {
    let html = '';
    for (let i = 1; i <= max; i++) {
      const active = (current || 0) === i ? 'background:rgba(59,130,246,0.35);color:#fff;border-color:#3b82f6;' : '';
      html += `<button class="btn-pad text-sm" style="min-width:36px;padding:4px 8px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;${active}" data-wellness="${name}" data-val="${i}">${i}</button>`;
    }
    return html;
  };

  formEl.innerHTML = `
    <h2 class="section-header mt-2">Daily Wellness Check-In</h2>
    <article class="card-dark p-4 mb-2">
      <div class="mb-3">
        <div class="text-sm text-muted mb-2">Sleep last night (hours)</div>
        <input id="wellnessSleepInput" type="number" min="0" max="12" step="0.5"
          value="${existing.sleep || ''}" placeholder="e.g. 7.5"
          style="border-radius:8px;padding:8px 12px;width:100%;font-size:0.9rem;"/>
      </div>
      <div class="mb-3">
        <div class="text-sm text-muted mb-2">Mood (1 = low, 5 = great)</div>
        <div class="flex gap-2" id="wellnessMoodBtns">${ratingBtns('mood', existing.mood, 5)}</div>
      </div>
      <div class="mb-3">
        <div class="text-sm text-muted mb-2">Muscle soreness (1 = none, 5 = very sore)</div>
        <div class="flex gap-2" id="wellnessSorenessBtns">${ratingBtns('soreness', existing.soreness, 5)}</div>
      </div>
      <button id="wellnessSaveBtn" class="btn-action-block btn-blue mt-0" style="width:100%;">Save Check-In</button>
      ${existing.sleep || existing.mood || existing.soreness ? '<div class="text-xs text-muted mt-2 text-center">✓ Check-in saved for today</div>' : ''}
    </article>`;

  formEl.querySelectorAll('[data-wellness]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.wellness;
      formEl.querySelectorAll(`[data-wellness="${name}"]`).forEach(b => {
        b.style.cssText = 'min-width:36px;padding:4px 8px;border-radius:6px;';
      });
      btn.style.cssText = 'min-width:36px;padding:4px 8px;border:1px solid #3b82f6;border-radius:6px;background:rgba(59,130,246,0.35);color:#fff;';
    });
  });

  qs('wellnessSaveBtn')?.addEventListener('click', () => {
    const state    = getState();
    const sleepVal = parseFloat(qs('wellnessSleepInput')?.value) || 0;
    const moodVal  = parseInt(formEl.querySelector('[data-wellness="mood"][style*="#3b82f6"]')?.dataset.val || existing.mood || 0, 10);
    const soreVal  = parseInt(formEl.querySelector('[data-wellness="soreness"][style*="#3b82f6"]')?.dataset.val || existing.soreness || 0, 10);
    if (!state.wellnessLog) state.wellnessLog = [];
    const idx   = state.wellnessLog.findIndex(e => e.date === today);
    const entry = { date: today, sleep: sleepVal, mood: moodVal, soreness: soreVal };
    if (idx >= 0) state.wellnessLog[idx] = entry;
    else state.wellnessLog.push(entry);
    saveStateToLocalStorage(true);
    renderRecoveryScoreDetail(data, getState, getDays);
  });
}
