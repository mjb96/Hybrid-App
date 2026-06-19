// ==========================================
// STRESS BALANCE VIEW (analytics/views/view-stress-balance.js)
// ==========================================
import { renderACWRChart } from '../charts.js';
import { weeklyLoadMetricsSeries } from '../../brain/load_models.js';
import { getProgramById } from '../../state.js';

export function renderStressBalanceAnalytics(data, getState, getDays) {
  const appState   = getState();
  const days       = getDays();
  const section    = document.getElementById('analytics-stress-balance');
  if (!section) return;

  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;

  // Build weekly ATL/CTL series
  const { atl: atlSeries, ctl: ctlSeries } = weeklyLoadMetricsSeries(appState, days, maxWeek);

  // Current loadMetrics
  const { atl = 0, ctl = 0 } = appState.loadMetrics || {};
  const hasLoad = ctl > 0;
  const tsb     = ctl - atl;
  const acwr    = hasLoad ? Math.round((atl / ctl) * 100) / 100 : null;

  // Status
  let status, statusColor, statusNote;
  if (!hasLoad) {
    status     = '—';
    statusColor = 'rgba(255,255,255,0.5)';
    statusNote  = 'Log sessions with RPE and duration to build your load history.';
  } else if (tsb > 5) {
    status     = 'Fresh';
    statusColor = '#10b981';
    statusNote  = `Acute load is below your chronic baseline. Good time to push. ACWR: ${acwr}.`;
  } else if (acwr <= 1.0) {
    status     = 'Balanced';
    statusColor = '#94a3b8';
    statusNote  = `Load is well within your chronic baseline. Sustainable training. ACWR: ${acwr}.`;
  } else if (acwr <= 1.3) {
    status     = 'Building';
    statusColor = '#f59e0b';
    statusNote  = `Acute load is above baseline — productive overreach. Monitor recovery. ACWR: ${acwr}.`;
  } else if (acwr <= 1.5) {
    status     = 'High Load';
    statusColor = '#ef4444';
    statusNote  = `Acute load significantly exceeds baseline. Injury risk elevated. ACWR: ${acwr}.`;
  } else {
    status     = 'Danger Zone';
    statusColor = '#ef4444';
    statusNote  = `ACWR ${acwr} is in the danger zone (>1.5). Reduce training load immediately.`;
  }

  // Hero cards
  const heroEl = document.getElementById('sbHeroCards');
  if (heroEl) {
    const tsbColor = tsb > 0 ? '#10b981' : tsb > -10 ? '#94a3b8' : '#ef4444';
    heroEl.innerHTML = `
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(245,158,11,0.3);">
        <div class="text-xs text-muted mb-1">ATL</div>
        <div class="text-lg font-heavy" style="color:#f59e0b;">${hasLoad ? Math.round(atl) : '—'}</div>
        <div class="text-xs text-muted mt-1">7-day acute load</div>
      </article>
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(59,130,246,0.3);">
        <div class="text-xs text-muted mb-1">CTL</div>
        <div class="text-lg font-heavy" style="color:#3b82f6;">${hasLoad ? Math.round(ctl) : '—'}</div>
        <div class="text-xs text-muted mt-1">28-day fitness base</div>
      </article>
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(148,163,184,0.3);">
        <div class="text-xs text-muted mb-1">Form (TSB)</div>
        <div class="text-lg font-heavy" style="color:${tsbColor};">${hasLoad ? (tsb >= 0 ? '+' : '') + Math.round(tsb) : '—'}</div>
        <div class="text-xs text-muted mt-1">CTL − ATL</div>
      </article>`;
  }

  // ACWR dual-line chart
  const chartEl = document.getElementById('sbACWRChart');
  if (chartEl) {
    renderACWRChart(chartEl, data.weekLabels, atlSeries, ctlSeries);
  }

  // Status note card
  const noteEl = document.getElementById('sbNote');
  if (noteEl) {
    noteEl.innerHTML = `
      <article class="card-dark p-4">
        <div class="flex-between mb-2">
          <span class="text-sm text-muted">ACWR</span>
          <span class="font-heavy" style="color:${statusColor};">${acwr !== null ? acwr : '—'}</span>
        </div>
        <div class="flex-between mb-3">
          <span class="text-sm text-muted">Status</span>
          <span class="font-heavy" style="color:${statusColor};">${status}</span>
        </div>
        <div class="text-xs text-muted" style="line-height:1.6;">${statusNote}</div>
        <div class="text-xs text-muted mt-3" style="line-height:1.5;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
          <strong style="color:rgba(255,255,255,0.7);">Safe zone guide:</strong>
          ACWR 0.8–1.0 = optimal balance · 1.0–1.3 = productive overreach · >1.3 = elevated injury risk
        </div>
      </article>`;
  }

  // This-week breakdown
  const breakdownEl = document.getElementById('sbWeeklyBreakdown');
  if (breakdownEl) {
    _renderWeeklyBreakdown(breakdownEl, appState, days);
  }
}

function _renderWeeklyBreakdown(container, appState, days) {
  const wk     = appState.currentWeek || '1';
  const wkData = appState.weeks?.[wk];

  if (!wkData) {
    container.innerHTML = '<p class="text-sm text-muted">No data for this week yet.</p>';
    return;
  }

  let rows = '';
  let hasAny = false;

  days.forEach(d => {
    const gymRpe  = parseFloat(wkData.gymRpe?.[d]) || 0;
    const gymMins = parseFloat(wkData.gymStats?.[d]?.time) || 0;
    const runRpe  = parseFloat(wkData.runs?.[d]?.rpe) || 0;
    const runMins = (() => {
      const t = wkData.runs?.[d]?.time || '';
      if (!t) return 0;
      const p = t.split(':');
      return p.length === 2 ? parseInt(p[0], 10) + parseInt(p[1], 10) / 60 : parseFloat(p[0]) || 0;
    })();

    const gymLoad = gymRpe > 0 && gymMins > 0 ? Math.round(gymRpe * gymMins) : 0;
    const runLoad = runRpe > 0 && runMins > 0  ? Math.round(runRpe * runMins) : 0;
    const dayLoad = gymLoad + runLoad;

    if (dayLoad === 0) return;
    hasAny = true;

    const dayLabel = d.charAt(0).toUpperCase() + d.slice(1);
    rows += `
      <div class="flex-between text-sm mb-2" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span class="text-muted">${dayLabel}</span>
        <div class="flex gap-3">
          ${gymLoad > 0 ? `<span style="color:#3b82f6;">Gym ${gymLoad}</span>` : ''}
          ${runLoad > 0 ? `<span style="color:#ec4899;">Run ${runLoad}</span>` : ''}
          <span class="font-heavy text-inverse">= ${dayLoad}</span>
        </div>
      </div>`;
  });

  if (!hasAny) {
    container.innerHTML = '<p class="text-sm text-muted">Log sessions with RPE and duration to see load breakdown.</p>';
    return;
  }

  container.innerHTML = `
    <article class="card-dark p-4">
      <div class="text-xs text-muted mb-3" style="text-transform:uppercase;letter-spacing:0.05em;">
        Daily sRPE load (RPE × minutes) — Week ${wk}
      </div>
      ${rows}
    </article>`;
}
