// ==========================================
// RECOVERY VIEW (analytics/views/view-recovery.js)
// ==========================================
import { renderRpeChart } from '../charts.js';

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
    if (avgRpe < 6) {
      statusLabel    = 'Fresh';
      statusColor    = '#10b981';
      interpretation = 'Low fatigue this week. Good time to push intensity.';
    } else if (avgRpe < 8) {
      statusLabel    = 'Accumulating';
      statusColor    = '#f59e0b';
      interpretation = 'Moderate fatigue. Stick to planned volume and prioritise sleep.';
    } else {
      statusLabel    = 'High Load';
      statusColor    = '#ef4444';
      interpretation = 'High fatigue this week. Consider reducing volume or taking a rest day.';
    }
  }

  const section = document.getElementById('analytics-recovery');
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
    </article>
  `;

  let interpEl = section.querySelector('.recovery-interpretation');
  if (!interpEl) {
    interpEl = document.createElement('article');
    interpEl.className = 'recovery-interpretation card-dark p-3 mb-3';
    const chartArticle = section.querySelector('article:not(.recovery-summary-cards article)');
    if (chartArticle) section.insertBefore(interpEl, chartArticle);
    else section.appendChild(interpEl);
  }
  interpEl.innerHTML = `<div class="text-sm text-muted" style="line-height:1.5;">${interpretation}</div>`;

  renderRpeChart(document.getElementById('rpeTrendContainer'), data.weekLabels, data.rpeData);
}

export function renderRecoveryScoreDetail(data, getState, getDays) {
  const appState    = getState();
  const defaultDays = getDays();
  const wk          = appState.currentWeek || '1';
  const weekData    = appState.weeks?.[wk];

  // Component 1: RPE fatigue factor
  let totalRpe = 0, rpeCount = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }
  const avgRpe    = rpeCount > 0 ? totalRpe / rpeCount : 0;
  const rpeFactor = rpeCount > 0 ? Math.round(Math.max(0, Math.min(100, ((10 - avgRpe) / 9) * 100))) : null;

  // Component 2: ACWR load balance factor
  const { atl = 0, ctl = 0 } = appState.loadMetrics || {};
  const hasLoad = ctl > 0;
  let acwrFactor = null, acwrRounded = 0;
  if (hasLoad) {
    const acwr = atl / ctl;
    acwrRounded = Math.round(acwr * 100) / 100;
    if      (acwr <= 0.8) acwrFactor = 80;
    else if (acwr <= 1.0) acwrFactor = 100;
    else if (acwr <= 1.3) acwrFactor = Math.round(100 - ((acwr - 1.0) / 0.3) * 60);
    else if (acwr <= 1.5) acwrFactor = Math.round(40  - ((acwr - 1.3) / 0.2) * 35);
    else                  acwrFactor = 5;
    acwrFactor = Math.max(0, Math.min(100, acwrFactor));
  }

  // Composite score
  let score = 0;
  if      (rpeFactor !== null && acwrFactor !== null) score = Math.round(rpeFactor * 0.6 + acwrFactor * 0.4);
  else if (rpeFactor !== null)                        score = rpeFactor;
  else if (acwrFactor !== null)                       score = acwrFactor;

  const hasData = rpeFactor !== null || acwrFactor !== null;

  let recommendation = 'Log workouts to generate recovery insights.';
  if (hasData) {
    if      (score >= 80) recommendation = 'Well recovered. You can push intensity today.';
    else if (score >= 60) recommendation = 'Moderately recovered. Stick to planned volume.';
    else if (score >= 40) recommendation = 'Fatigue accumulating. Prioritise sleep tonight.';
    else                  recommendation = 'High fatigue load. Consider a deload or rest day.';
  }

  const heroEl  = document.getElementById('recoveryScoreHero');
  const rpeEl   = document.getElementById('recoveryAvgRpe');
  const sleepEl = document.getElementById('recoverySleepContrib');  // now shows ACWR load balance
  const fatEl   = document.getElementById('recoveryFatigueContrib'); // now shows RPE fatigue
  const recEl   = document.getElementById('recoveryRecommendation');

  if (heroEl)  heroEl.textContent  = hasData ? `${score}%` : '--';
  if (rpeEl)   rpeEl.textContent   = rpeCount > 0 ? avgRpe.toFixed(1) : '--';
  if (sleepEl) sleepEl.textContent = acwrFactor !== null ? `${acwrFactor}% (ACWR ${acwrRounded})` : 'Log session duration';
  if (fatEl)   fatEl.textContent   = rpeFactor  !== null ? `${rpeFactor}%` : 'Log RPE';
  if (recEl)   recEl.textContent   = recommendation;

  const trendEl = document.getElementById('rpeTrendContainerDetail');
  if (trendEl) _renderRpeTrendChart(trendEl, data, getState, getDays);

  // ATL/CTL-derived load balance
  const windowEl = document.getElementById('recoveryWindowCard');
  if (windowEl) {
    const { atl = 0, ctl = 0 } = appState.loadMetrics || {};
    const hasLoad = ctl > 0;
    const tsb     = ctl - atl;
    const acwr    = hasLoad ? Math.round((atl / ctl) * 100) / 100 : 0;

    let loadStatus, loadColor, loadNote;
    if (!hasLoad) {
      loadStatus = '—';
      loadColor  = 'rgba(255,255,255,0.5)';
      loadNote   = 'Log sessions with RPE and duration to unlock load balance.';
    } else if (tsb > 0) {
      loadStatus = 'Fresh';
      loadColor  = '#10b981';
      loadNote   = `Acute load is below your 28-day baseline. ACWR: ${acwr}.`;
    } else if (acwr < 1.15) {
      loadStatus = 'Balanced';
      loadColor  = '#94a3b8';
      loadNote   = `Load is tracking your fitness baseline. ACWR: ${acwr}.`;
    } else {
      loadStatus = 'Fatigued';
      loadColor  = '#ef4444';
      loadNote   = `Recent load exceeds baseline by ${Math.round((acwr - 1) * 100)}%. ACWR: ${acwr}. Prioritise recovery.`;
    }

    windowEl.innerHTML = `
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
          <span class="font-heavy" style="color:${loadColor};">${hasLoad ? (tsb >= 0 ? '+' : '') + Math.round(tsb) : '—'}</span>
        </div>
        <div class="flex-between">
          <span class="text-sm text-muted">Status</span>
          <span class="font-heavy" style="color:${loadColor};">${loadStatus}</span>
        </div>
        <div class="text-xs text-muted mt-3" style="line-height:1.5;">${loadNote}</div>
      </article>`;
  }
}

function _renderRpeTrendChart(container, data, getState, getDays) {
  if (!container) return;
  const existingContainer = document.getElementById('rpeTrendContainer');
  const savedContent = existingContainer ? existingContainer.innerHTML : '';

  if (existingContainer) existingContainer.id = '_rpeTrendContainer_swap';
  container.id = 'rpeTrendContainer';
  try {
    renderRecoveryAnalytics(data, getState, getDays);
  } finally {
    container.id = 'rpeTrendContainerDetail';
    if (existingContainer) {
      existingContainer.id = 'rpeTrendContainer';
      existingContainer.innerHTML = savedContent;
    }
  }
}
