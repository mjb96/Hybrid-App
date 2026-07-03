// @ts-check
// =============================================================================
// WEEK IN REVIEW — analytics leaf (js/analytics/views/view-weekly-review.js)
//
// Presenter for the R6 weekly review: the week's story (totals · deltas · PRs
// · Hybrid Score arc · one focus) with a share action. The data comes from the
// pure builder (js/brain/weekly-review.js); this file only renders and wires
// the Share button.
// =============================================================================
import { showToast } from '../../state.js';
import { reviewToText } from '../../brain/weekly-review.js';
import { sparkline } from '../../brain/hybrid-score/ui.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KM_TO_MI = 0.621371;

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
    <button id="wrevShareBtn" class="btn-action-block btn-ghost" aria-label="Share this week's review">📤 Share your week</button>
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
}
