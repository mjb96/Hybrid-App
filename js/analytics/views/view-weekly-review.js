// @ts-check
// =============================================================================
// WEEK IN REVIEW — analytics leaf (js/analytics/views/view-weekly-review.js)
//
// Presenter for the R6 weekly review: the week's story (totals · deltas · PRs
// · Hybrid Score arc · one focus) with a share action. The data comes from the
// pure builder (js/brain/weekly-review.js); this file only renders and wires
// the Share button.
// =============================================================================
import { showToast, getProgramById } from '../../state.js';
import { reviewToText, buildWeeklyReview } from '../../brain/weekly-review.js';
import { sparkline } from '../../brain/hybrid-score/ui.js';
import { computeDashboardModel } from '../../home/dashboard-model.js';
import { computeHybridScore } from '../../brain/hybrid-score/hybrid-score.js';
import { shareHybridScoreCard } from '../../brain/hybrid-score/share-card.js';
import { statCard } from '../charts/chart-primitives.js';
import { renderMonthlyReport } from './view-monthly-report.js';
import { renderProgressAnalytics, renderStreakDetail, renderGoalProgressDetail } from './view-progress.js';
import { screenTabBar, mountScreenTabs, spark } from './screen-kit.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KM_TO_MI = 0.621371;

// ---- V2: unified Review screen (Overview | Stats) -----------------------
// The weekly/monthly story in one place — Overview leads with this week's Hybrid
// Score arc; Stats holds the full Week in Review + the Monthly Report (absorbing
// the weekly-summary and monthly-report leaves).
let _reviewTab = 'overview';
export function setReviewTab(tab) { _reviewTab = tab === 'stats' ? 'stats' : 'overview'; }

export function renderReview(data, getState, getDays) {
  const section = document.getElementById('analytics-weekly-review');
  if (!section) return;
  const state   = getState();
  const program = getProgramById(state.activeProgramId);
  const review  = buildWeeklyReview(state, getDays(), program);

  section.innerHTML = screenTabBar(_reviewTab) + `<div id="review-tab-body"></div>`;
  const body = document.getElementById('review-tab-body');

  if (_reviewTab === 'stats') {
    body.innerHTML = `
      <h2 class="section-header mt-2">Week in Review</h2>
      <div id="weeklyReviewContainer"></div>
      <h2 class="section-header mt-4">Monthly Report</h2>
      <div id="monthlyReportContainer"></div>

      <h2 class="section-header mt-4">Streak</h2>
      <div class="grid-2-col gap-2 mb-4">
        <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(245,158,11,0.35);">
          <div class="text-xs text-muted mb-1">Current Streak</div>
          <div id="streakCurrent" class="text-lg font-heavy text-inverse">0 days</div>
        </article>
        <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(59,130,246,0.35);">
          <div class="text-xs text-muted mb-1">Longest Streak</div>
          <div id="streakLongest" class="text-lg font-heavy text-inverse">0 days</div>
        </article>
      </div>
      <article class="card-dark p-4 mb-4">
        <div id="streakDetailContainer"><p style="color:var(--text-muted);font-size:0.75rem;">Complete workouts to build your streak.</p></div>
      </article>

      <h2 class="section-header mt-4">Goal Progress</h2>
      <div id="analytics-goal-detail"></div>

      <h2 class="section-header mt-4">Consistency Log</h2>
      <article class="card-dark p-3 mb-4">
        <div class="table-wrapper">
          <table aria-label="Training History">
            <thead><tr><th scope="col">Wk</th><th scope="col">Lift Vol</th><th scope="col">Run Dist</th><th scope="col">Avg Pace</th><th scope="col">Avg RPE</th></tr></thead>
            <tbody id="analyticsTimelineTableBody"></tbody>
          </table>
        </div>
      </article>
    `;
    renderWeeklyReview(review, state);
    renderMonthlyReport(getState, getDays, () => program);
    // Folded in from the retired progress / streak / goal-progress leaves.
    renderStreakDetail(data, getState, getDays);
    renderGoalProgressDetail(data, getState);
    renderProgressAnalytics(data, getState);
  } else {
    _renderReviewOverview(body, review);
  }

  mountScreenTabs('analytics-weekly-review', (tab) => {
    _reviewTab = tab;
    renderReview(data, getState, getDays);
  });
}

function _renderReviewOverview(body, review) {
  if (!review.hasData) {
    body.innerHTML = `<article class="card-dark an-hero">
      <div class="an-hero__k">This week</div>
      <div class="an-hero__val">—</div>
      <div class="an-hero__empty">Nothing logged yet — your review builds itself as you train.</div>
    </article>`;
    return;
  }
  const arc = review.arc;
  const color = !arc.hasData ? '#94a3b8' : arc.delta >= 0 ? '#10b981' : '#ef4444';
  const hero = arc.hasData
    ? `<article class="card-dark an-hero">
        <div class="an-hero__k">Hybrid Score · this week</div>
        <div class="an-hero__val" style="color:${color}">${arc.end}</div>
        <div class="an-hero__delta" style="color:${color}">${arc.delta > 0 ? '+' : ''}${arc.delta} over the week</div>
        ${spark(arc.series, color)}
      </article>`
    : `<article class="card-dark an-hero">
        <div class="an-hero__k">This week</div>
        <div class="an-hero__val">${review.totals.sessions}</div>
        <div class="an-hero__empty">sessions logged — keep going to unlock your score arc.</div>
      </article>`;

  body.innerHTML = `
    ${hero}
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Sessions', value: String(review.totals.sessions), sub: 'logged this week', color: '#3b82f6' })}
      ${statCard({ label: 'Adherence', value: review.consistency.total > 0 ? review.consistency.pct + '%' : '—', sub: review.consistency.total > 0 ? `${review.consistency.done}/${review.consistency.total} planned` : 'no plan set', color: '#10b981' })}
    </div>
    <article class="card-dark p-3 mb-3" style="border-left:3px solid var(--color-blue);">
      <div style="font-weight:800;color:var(--color-blue);font-size:0.66rem;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${esc(review.focus.area)}</div>
      <p style="color:var(--text-secondary);font-size:0.84rem;line-height:1.5;margin:0;">${esc(review.focus.text)}</p>
    </article>
  `;
}

function deltaChip(pct) {
  if (pct === null || pct === undefined) return '';
  const up = pct > 0;
  const color = up ? 'var(--color-green)' : pct < 0 ? 'var(--color-red)' : 'var(--text-muted)';
  return `<span class="wrev-delta" style="color:${color}">${up ? '▲' : pct < 0 ? '▼' : '→'} ${Math.abs(pct)}% vs last wk</span>`;
}

export function renderWeeklyReview(review, state) {
  const el = document.getElementById('weeklyReviewContainer');
  if (!el) return;

  if (!review.hasData) {
    el.innerHTML = `<article class="card-dark p-4 text-center">
      <div style="font-size:2rem;margin-bottom:8px;">📭</div>
      <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.5;">Nothing logged this week yet.<br>Your review builds itself as you train.</p>
    </article>`;
    return;
  }

  const distUnit = state?.settings?.distanceUnit || 'km';
  const dist = distUnit === 'mi'
    ? `${Math.round(review.totals.distanceKm * KM_TO_MI * 10) / 10} mi`
    : `${review.totals.distanceKm} km`;

  const stats = [
    { v: review.totals.volume >= 1000 ? `${(review.totals.volume / 1000).toFixed(1)}t` : `${review.totals.volume} kg`, k: 'Lifted', d: deltaChip(review.deltas.volumePct) },
    { v: dist, k: 'Run', d: deltaChip(review.deltas.distancePct) },
    { v: String(review.totals.sessions), k: 'Sessions', d: '' },
    { v: String(review.totals.prCount), k: 'PRs', d: review.totals.prCount > 0 ? '<span class="wrev-delta" style="color:var(--color-amber)">🏆</span>' : '' },
  ].map(s => `<div class="wrev-stat"><div class="wrev-stat__v">${s.v}</div><div class="wrev-stat__k">${s.k}</div>${s.d}</div>`).join('');

  const arcHTML = review.arc.hasData ? `
    <article class="card-dark p-3 mb-3">
      <div class="flex-between mb-1">
        <span class="wrev-label">Hybrid Score this week</span>
        <span class="wrev-arc">${review.arc.start} → <b>${review.arc.end}</b>
          <span style="color:${review.arc.delta >= 0 ? 'var(--color-green)' : 'var(--color-red)'};font-weight:800;">
            ${review.arc.delta > 0 ? '+' : ''}${review.arc.delta}</span></span>
      </div>
      ${sparkline(review.arc.series, review.arc.delta >= 0 ? '#10b981' : '#ef4444')}
    </article>` : '';

  const consHTML = review.consistency.total > 0 ? `
    <article class="card-dark p-3 mb-3">
      <div class="flex-between mb-1">
        <span class="wrev-label">Plan adherence</span>
        <span class="wrev-arc"><b>${review.consistency.pct}%</b> · ${review.consistency.done}/${review.consistency.total}</span>
      </div>
      <div class="wrev-bar"><div class="wrev-bar__fill" style="width:${review.consistency.pct}%"></div></div>
    </article>` : '';

  const prsHTML = review.prs.length ? `
    <h3 class="section-header mt-4">New records</h3>
    ${review.prs.map(p => `<article class="card-dark p-3 mb-2 flex-between">
      <span style="font-weight:700;color:var(--text-inverse);">🏆 ${esc(p.lift)}</span>
      <span style="color:var(--text-muted);font-size:0.8rem;">e1RM <b style="color:var(--color-amber);">${p.e1rm} kg</b> (was ${p.prevBest})</span>
    </article>`).join('')}` : '';

  el.innerHTML = `
    <div class="wrev-stats mb-3">${stats}</div>
    ${arcHTML}
    ${consHTML}
    ${prsHTML}
    <h3 class="section-header mt-4">Next week's focus</h3>
    <article class="card-dark p-3 mb-3" style="border-left:3px solid var(--color-blue);">
      <div style="font-weight:800;color:var(--color-blue);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${esc(review.focus.area)}</div>
      <p style="color:var(--text-secondary);font-size:0.84rem;line-height:1.5;margin:0;">${esc(review.focus.text)}</p>
    </article>
    <button id="wrevShareCardBtn" class="btn-action-block" aria-label="Share your Hybrid Score card for this week">↗ Share your Score card</button>
    <button id="wrevShareBtn" class="btn-action-block btn-ghost" aria-label="Share this week's review as text">📤 Share as text</button>
  `;

  const btn = el.querySelector('#wrevShareBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      const text = reviewToText(review, distUnit);
      try {
        if (navigator.share) { await navigator.share({ text }); return; }
        throw new Error('no-share');
      } catch {
        try {
          await navigator.clipboard.writeText(text);
          showToast('Copied to clipboard ✓');
        } catch { showToast('Sharing unavailable on this device', true); }
      }
    });
  }

  // V2-5 — the weekly variant of the shareable card, riding on this screen.
  const cardBtn = el.querySelector('#wrevShareCardBtn');
  if (cardBtn) {
    cardBtn.addEventListener('click', () => {
      try {
        const WK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
        const model = computeDashboardModel(state, WK_DAYS, getProgramById(state.activeProgramId), dayKey);
        const result = computeHybridScore(model, state, WK_DAYS);
        shareHybridScoreCard(result, state, {
          showToast, variant: 'weekly', weekLabel: `Week ${state.currentWeek || ''}`.trim(),
        });
      } catch { showToast('Could not create the card', true); }
    });
  }
}
