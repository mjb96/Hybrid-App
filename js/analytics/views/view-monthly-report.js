// @ts-check
// =============================================================================
// MONTHLY REPORT — analytics leaf (js/analytics/views/view-monthly-report.js)
// Renders the 28-day rollup from the pure builder, with a share action. — R13
// =============================================================================
import { showToast } from '../../state.js';
import { buildMonthlyReport, reportToText } from '../../brain/monthly-report.js';
import { weightUnitOf } from '../utils.js';

const KM_TO_MI = 0.621371;
function deltaChip(pct, suffix = 'vs prior 30d') {
  if (pct === null || pct === undefined) return '';
  const up = pct > 0;
  const color = up ? 'var(--color-green)' : pct < 0 ? 'var(--color-red)' : 'var(--text-muted)';
  return `<span class="wrev-delta" style="color:${color}">${up ? '▲' : pct < 0 ? '▼' : '→'} ${Math.abs(pct)}% ${suffix}</span>`;
}

export function renderMonthlyReport(getState, getDays, getProgram) {
  const el = document.getElementById('monthlyReportContainer');
  if (!el) return;
  const state = getState();
  const r = buildMonthlyReport(state, getDays(), getProgram());

  if (!r.hasData) {
    el.innerHTML = `<article class="card-dark p-4 text-center">
      <div style="font-size:2rem;margin-bottom:8px;">🗓️</div>
      <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.5;">Your 30-day report builds itself as you train. Check back after a few sessions.</p>
    </article>`;
    return;
  }

  const distUnit = state?.settings?.distanceUnit || 'km';
  const dist = distUnit === 'mi' ? `${Math.round(r.totals.distanceKm * KM_TO_MI * 10) / 10} mi` : `${r.totals.distanceKm} km`;

  const stats = [
    { v: String(r.totals.sessions), k: 'Sessions', d: r.deltas.sessions ? `<span class="wrev-delta" style="color:${r.deltas.sessions > 0 ? 'var(--color-green)' : 'var(--color-red)'}">${r.deltas.sessions > 0 ? '+' : ''}${r.deltas.sessions}</span>` : '' },
    { v: r.totals.volume >= 1000 ? `${(r.totals.volume / 1000).toFixed(1)}t` : `${r.totals.volume} ${weightUnitOf(state)}`, k: 'Lifted', d: deltaChip(r.deltas.volumePct) },
    { v: dist, k: 'Run', d: deltaChip(r.deltas.distancePct) },
    { v: r.hybridScore.avg !== null ? String(r.hybridScore.avg) : '—', k: 'Avg Score', d: r.hybridScore.delta ? `<span class="wrev-delta" style="color:${r.hybridScore.delta > 0 ? 'var(--color-green)' : 'var(--color-red)'}">${r.hybridScore.delta > 0 ? '+' : ''}${r.hybridScore.delta}</span>` : '' },
  ].map(s => `<div class="wrev-stat"><div class="wrev-stat__v">${s.v}</div><div class="wrev-stat__k">${s.k}</div>${s.d}</div>`).join('');

  const trendWord = { rising: 'rising 📈', easing: 'easing 📉', steady: 'holding steady', building: 'building' }[r.fitness.trend] || r.fitness.trend;

  el.innerHTML = `
    <div class="wrev-stats mb-3">${stats}</div>
    <article class="card-dark p-3 mb-3 flex-between">
      <span class="wrev-label">Fitness (CTL ${r.fitness.ctl})</span>
      <span class="wrev-arc"><b>${trendWord}</b></span>
    </article>
    <article class="card-dark p-3 mb-3 flex-between">
      <span class="wrev-label">Avg plan adherence</span>
      <span class="wrev-arc"><b>${r.consistency}%</b></span>
    </article>
    ${r.projection ? `<article class="card-dark p-3 mb-3" style="border-left:3px solid var(--color-green);">
      <div style="font-weight:800;color:var(--color-green);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Looking ahead</div>
      <p style="color:var(--text-secondary);font-size:0.84rem;line-height:1.5;margin:0;">${r.projection}</p>
    </article>` : ''}
    <button id="mrepShareBtn" class="btn-action-block btn-ghost" aria-label="Share your month">📤 Share your month</button>
  `;

  const btn = el.querySelector('#mrepShareBtn');
  if (btn) btn.addEventListener('click', async () => {
    const text = reportToText(r, distUnit);
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      throw new Error('no-share');
    } catch {
      try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard ✓'); }
      catch { showToast('Sharing unavailable on this device', true); }
    }
  });
}
