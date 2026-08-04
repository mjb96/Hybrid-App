// @ts-check
// =============================================================================
// PROJECTIONS — analytics leaf (js/analytics/views/view-projections.js) — R12
// Renders current race-time predictions and trend-based ETAs to the next
// strength/running milestone from the pure predictions engine.
// =============================================================================
import { buildPredictions } from '../../brain/predictions.js';
import { weightUnitOf } from '../utils.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const etaLabel = (w) => w == null ? null : w === 0 ? 'reached' : `~${w} week${w === 1 ? '' : 's'}`;

export function renderProjections(getState, getDays) {
  const el = document.getElementById('projectionsContainer');
  if (!el) return;
  const pred = buildPredictions(getState(), getDays());
  const unit = weightUnitOf(getState());

  if (!pred.hasData) {
    el.innerHTML = `<article class="card-dark p-4 text-center">
      <div style="font-size:2rem;margin-bottom:8px;">🔮</div>
      <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.5;">Log a few weeks of lifts and runs — and set your threshold pace — and your projected milestones will appear here.</p>
    </article>`;
    return;
  }

  const r = pred.running;
  let runHTML = '';
  if (r.hasData && r.races) {
    const rows = [r.races.fiveK, r.races.tenK, r.races.halfMar, r.races.marathon].map(x => `
      <div class="proj-race"><span class="proj-race__d">${esc(x.dist)}</span><span class="proj-race__t">${esc(x.time)}</span><span class="proj-race__p">${esc(x.pace)}</span></div>`).join('');
    const next = r.nextTarget && r.nextTarget.etaWeeks != null
      ? `<div class="proj-eta"><span class="proj-eta__k">On your current trend</span><span class="proj-eta__v">Sub-${esc(r.nextTarget.time)} 5k in <b>${esc(etaLabel(r.nextTarget.etaWeeks))}</b></span></div>`
      : '';
    runHTML = `
      <h3 class="section-header">Predicted race times${r.vdot ? ` · VDOT ${r.vdot}` : ''}</h3>
      <article class="card-dark p-3 mb-3"><div class="proj-races">${rows}</div></article>
      ${next}`;
  }

  let strHTML = '';
  if (pred.strength.length) {
    strHTML = '<h3 class="section-header mt-4">Strength milestones</h3>' + pred.strength.map(s => `
      <article class="card-dark p-3 mb-2 proj-lift">
        <div class="proj-lift__head"><span class="proj-lift__name">${esc(s.lift)}</span><span class="proj-lift__now">${s.current} ${unit}</span></div>
        <div class="proj-lift__bar"><div class="proj-lift__fill" style="width:${Math.min(100, Math.round((s.current / s.target) * 100))}%"></div></div>
        <div class="proj-lift__foot">
          <span>Next: <b>${s.target} ${unit}</b></span>
          <span class="${s.etaWeeks == null ? 'proj-muted' : 'proj-eta-chip'}">${s.etaWeeks == null ? 'keep progressing' : etaLabel(s.etaWeeks)}</span>
        </div>
      </article>`).join('');
  }

  el.innerHTML = runHTML + strHTML +
    `<p class="proj-note">Projections extend your recent trend — they assume you keep training consistently. Train smart, not just hard.</p>`;
}
