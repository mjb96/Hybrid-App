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

  let totalRpe = 0, rpeCount = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }

  const avgRpe         = rpeCount > 0 ? totalRpe / rpeCount : 0;
  const score          = rpeCount > 0 ? Math.round(Math.max(0, Math.min(100, ((10 - avgRpe) / 9) * 100))) : 0;
  const sleepContrib   = Math.round(score * 0.4);
  const fatigueContrib = Math.round(score * 0.6);

  let recommendation = 'Log workouts to generate recovery insights.';
  if (rpeCount > 0) {
    if      (score >= 80) recommendation = 'Well recovered. You can push intensity today.';
    else if (score >= 60) recommendation = 'Moderately recovered. Stick to planned volume.';
    else if (score >= 40) recommendation = 'Fatigue accumulating. Prioritise sleep tonight.';
    else                  recommendation = 'High fatigue load. Consider a deload or rest day.';
  }

  const heroEl  = document.getElementById('recoveryScoreHero');
  const rpeEl   = document.getElementById('recoveryAvgRpe');
  const sleepEl = document.getElementById('recoverySleepContrib');
  const fatEl   = document.getElementById('recoveryFatigueContrib');
  const recEl   = document.getElementById('recoveryRecommendation');

  if (heroEl)  heroEl.textContent  = rpeCount > 0 ? `${score}%` : '--';
  if (rpeEl)   rpeEl.textContent   = rpeCount > 0 ? avgRpe.toFixed(1) : '--';
  if (sleepEl) sleepEl.textContent = rpeCount > 0 ? `~${sleepContrib}%` : '--';
  if (fatEl)   fatEl.textContent   = rpeCount > 0 ? `~${fatigueContrib}%` : '--';
  if (recEl)   recEl.textContent   = recommendation;

  const trendEl = document.getElementById('rpeTrendContainerDetail');
  if (trendEl) _renderRpeTrendChart(trendEl, data, getState, getDays);
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
