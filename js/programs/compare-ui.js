// =============================================================================
// PROGRAM COMPARE — UI (js/programs/compare-ui.js)
//
// Owns the compare modal: pick a second program, then a two-column diff of the
// stats that decide it (length, frequency, time cost, weekly volume, level,
// equipment) plus a training-focus bar comparison. Pure model lives in
// compare.js; this is the render + event surface, wired from app.js.
// =============================================================================
import { PROGRAM_CATALOG, CATEGORIES, DIFFICULTY_LABELS } from './catalog.js';
import { buildComparison } from './compare.js';
import { getProgramById } from '../state.js';
import { escapeHtml } from '../util.js';

let _aId = null;

export function openCompareModal(programAId) {
  if (!programAId) return;
  _aId = programAId;
  const modal = document.getElementById('programCompareModal');
  if (!modal) return;
  const wrap = document.getElementById('compareSearchWrap');
  const input = document.getElementById('compareSearchInput');
  if (wrap) wrap.style.display = '';
  if (input) input.value = '';
  renderComparePicker('');
  modal.classList.add('active');
  setTimeout(() => input?.focus(), 80);
}

export function closeCompareModal() {
  _aId = null;
  document.getElementById('programCompareModal')?.classList.remove('active');
}

export function renderComparePicker(query) {
  const body = document.getElementById('compareBody');
  if (!body) return;
  const q = (query || '').toLowerCase().trim();
  const aName = getProgramById(_aId)?.name || '';
  const list = PROGRAM_CATALOG
    .filter(p => p.id !== _aId)
    .filter(p => !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));

  body.innerHTML = `
    <div class="text-xs text-muted" style="padding:0 4px 8px;">Comparing <b>${escapeHtml(aName)}</b> against&hellip;</div>
    ${list.length === 0 ? '<div class="el-empty">No programs match.</div>' :
      list.map(p => `
        <button class="el-chip tactile-scale" data-action="compare-pick" data-program-id="${p.id}">
          ${p.icon || '📋'} ${escapeHtml(p.name)}
          <span class="el-pr">${CATEGORIES[p.category]?.label || p.category || ''}</span>
        </button>
      `).join('')}
  `;
}

export function pickCompareB(bId) {
  if (!_aId || !bId) return;
  const wrap = document.getElementById('compareSearchWrap');
  if (wrap) wrap.style.display = 'none';
  renderComparison(_aId, bId);
}

function renderComparison(aId, bId) {
  const body = document.getElementById('compareBody');
  if (!body) return;
  const pa = getProgramById(aId);
  const pb = getProgramById(bId);
  const cmp = buildComparison(pa, pb);

  const diffLabel = (d) => DIFFICULTY_LABELS[d]?.label || d || '—';
  const cell = (v) => `<div style="flex:1;text-align:center;font-size:0.82rem;">${escapeHtml(String(v))}</div>`;

  const statRows = cmp.rows.map(r => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--overlay-sm);">
      <div style="width:96px;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);">${r.label}</div>
      ${cell(r.label === 'Level' ? diffLabel(r.a) : r.a)}
      ${cell(r.label === 'Level' ? diffLabel(r.b) : r.b)}
    </div>
  `).join('');

  // Training-focus bars used to be two bare coloured strips: no number, no scale,
  // and no accessible name — so the one part of the comparison that is a CHART
  // could not be read at all by a screen reader, and a sighted user could see
  // "longer" without seeing by how much. Every stat row beside them states its
  // value, so these must too.
  const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const bar = (v, color) => `
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;height:6px;border-radius:99px;background:var(--overlay-sm);overflow:hidden;">
        <div style="height:100%;width:${pct(v)}%;background:${color};"></div>
      </div>
      <span style="min-width:2.4em;text-align:right;font-size:0.7rem;font-weight:700;color:var(--text-sub);">${pct(v)}%</span>
    </div>`;
  const metricRows = cmp.metrics.map(m => `
    <div style="padding:8px 4px;border-bottom:1px solid var(--overlay-sm);"
         role="group" aria-label="${escapeHtml(`${m.label}: ${cmp.a.name} ${pct(m.a)}%, ${cmp.b.name} ${pct(m.b)}%`)}">
      <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-bottom:5px;">${m.label}</div>
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="flex:1;">${bar(m.a, '#8b5cf6')}</div>
        <div style="flex:1;">${bar(m.b, '#22d3ee')}</div>
      </div>
    </div>
  `).join('');

  body.innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-start;padding:6px 4px 10px;">
      <div style="width:96px;"></div>
      <div style="flex:1;text-align:center;color:#8b5cf6;font-weight:800;font-size:0.9rem;">${escapeHtml(cmp.a.name)}</div>
      <div style="flex:1;text-align:center;color:#22d3ee;font-weight:800;font-size:0.9rem;">${escapeHtml(cmp.b.name)}</div>
    </div>
    ${statRows}
    ${metricRows ? `<div style="margin-top:12px;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);padding:0 4px 4px;">Training focus</div>${metricRows}` : ''}
    <button class="el-custom-add-btn" data-action="compare-reset" style="width:100%;margin-top:14px;">← Compare a different program</button>
  `;
}

export function handleCompareSearch(query) {
  renderComparePicker(query);
}
