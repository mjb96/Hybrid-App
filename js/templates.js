// @ts-check
// ==========================================
// UPGRADED TEMPLATES — HTML SPATIAL BUILDERS
// ==========================================
import { DAY_NAMES_FULL } from './constants.js';
import { escapeHtml } from './util.js';

export function buildEmptyWorkoutCard() {
  return '<div class="card-dark text-xs-muted empty-state-card">No lifting scheduled today.</div>';
}

export function buildSetRow(sData, sIdx, safeLiftName, historicalSetData = null) {
  const ghostWeight = historicalSetData?.w || 'kg';
  const ghostReps   = historicalSetData?.r || 'reps';
  const type = sData.type || '';

  const numLabels  = { '': `S${sIdx + 1}`, 'W': 'W', 'D': 'D', 'F': 'F' };
  const pillLabels = { '': 'set', 'W': 'warm', 'D': 'drop', 'F': 'amrp' };
  const typeClass  = type === 'W' ? 'type-warmup' : type === 'D' ? 'type-dropset' : type === 'F' ? 'type-amrap' : '';

  // Single "load" chip: one control cycling Weighted → Bodyweight → band tiers,
  // instead of a separate label + BW button + band chip on every set.
  const loadState = sData.bw ? 'BW' : (sData.band || '');
  const loadLabels = { '': 'Weighted', 'BW': 'Bodyweight', 'L': '🟢 Light band', 'M': '🟡 Med band', 'H': '🔴 Heavy band' };
  const loadCls = loadState === '' ? 'weighted' : loadState === 'BW' ? 'bw' : loadState;

  return `<div class="cockpit-set-row ${sData.c ? 'is-complete' : ''} ${typeClass} ${sData.isPR ? 'is-pr' : ''}" data-set-index="${sIdx}">
    ${sData.isPR ? '<span class="pr-badge">PR</span>' : ''}
    <div class="set-num-lbl tactile-scale"
         data-action="quick-log"
         data-liftname="${safeLiftName}"
         data-sidx="${sIdx}"
         title="One-Tap Quick Log (Uses Ghost Targets)"
         style="cursor:pointer; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); text-align: center;">
         ${numLabels[type]}
    </div>
    <div class="type-pill tactile-scale"
         data-action="cycle-set-type"
         data-liftname="${safeLiftName}"
         data-sidx="${sIdx}"
         title="Tap to cycle: Set → Warmup → Drop → AMRAP">
         ${pillLabels[type]}
    </div>
    <div>
      <input type="number" class="input-weight-node" placeholder="${escapeHtml(String(ghostWeight))}" value="${escapeHtml(String(sData.w || ''))}">
    </div>
    <div>
      <input type="number" class="input-reps-node" placeholder="${escapeHtml(String(ghostReps))}" value="${escapeHtml(String(sData.r || ''))}">
    </div>
    <div class="gym-check-container">
      <label class="gym-check-wrap">
        <input type="checkbox" class="gym-check" ${sData.c ? 'checked' : ''}>
        <span class="gym-check-icon">✓</span>
      </label>
    </div>
    <div>
      <button class="btn-set-delete tactile-scale"
        data-action="remove-set"
        data-liftname="${safeLiftName}"
        data-sidx="${sIdx}">✕</button>
    </div>
    <div class="load-pad-row">
      <button class="btn-load tactile-scale load-${loadCls}"
              data-action="cycle-load"
              data-liftname="${safeLiftName}"
              data-sidx="${sIdx}"
              title="Tap to set load: Weighted → Bodyweight → Light → Medium → Heavy band. Bodyweight/band auto-fill the weight for volume; edit it to add or assist.">
        ${loadLabels[loadState]}
      </button>
    </div>
    ${type === 'W' ? '' : `<div class="rpe-pad-row">
      <span class="rpe-pad-label">RIR</span>
      ${(() => {
        // Reps in reserve. Prefer a stored RIR; fall back to legacy per-set RPE
        // (RIR = 10 − RPE) so older logs still show their selection. Warm-ups are
        // deliberately submaximal, so they carry no effort pad.
        const selRir = sData.rir != null ? sData.rir : (sData.rpe != null ? 10 - sData.rpe : null);
        return [0,1,2,3,4].map(v => `<button class="btn-rpe tactile-scale${selRir === v ? ' rpe-selected' : ''}" data-action="set-rir" data-sidx="${sIdx}" data-rir="${v}">${v === 4 ? '4+' : v}</button>`).join('');
      })()}
    </div>`}
  </div>`;
}

export function buildExerciseCard({ displaySafeName, safeLiftName, isCompleted, diagnostic, blueprintLabel, historicalLineText, setsMarkup, groupId = null, ssColor = null }) {
  const stalledBadge = diagnostic.isStalled ? `<span class="badge-stall-indicator">STALLED</span>` : '';
  const targetStyle  = diagnostic.isStalled ? 'color: var(--accent-red); font-weight: 800;' : '';
  const ssBtnClass   = groupId ? 'btn-ss-link ss-active' : 'btn-ss-link';
  const ssBtnStyle   = groupId ? `style="--ss-color:${ssColor};"` : '';
  const ssBtnLabel   = groupId ? `SS ${groupId}` : 'SS+';

  return `<div class="cockpit-header">
    <div class="drag-handle-grip">☰</div>
    <div class="cockpit-header-clickzone" data-action="toggle-accordion">
      <div class="header-text-block">
        <div class="title-badge-row" style="display:flex; align-items:center;">
          <span class="cockpit-ex-name">${displaySafeName}</span>
          ${stalledBadge}
        </div>
        <div class="cockpit-ex-target" style="${targetStyle}">${blueprintLabel}</div>
      </div>
      <div class="cockpit-ex-status">${isCompleted ? 'DONE' : 'LOG'}</div>
    </div>
    <button class="${ssBtnClass}" ${ssBtnStyle} data-action="show-ss-panel" data-liftname="${safeLiftName}">${ssBtnLabel}</button>
  </div>
  <div class="cockpit-body">
    <div class="local-timer-placeholder"></div>
    <span class="cockpit-history-line">⚡ ${historicalLineText}</span>
    <div class="set-rows-list">${setsMarkup}</div>
    <div class="append-set-row">
      <button class="btn-pad-append tactile-scale btn-append-warmup" data-action="append-warmup-set" data-liftname="${safeLiftName}">+ Warmup</button>
      <button class="btn-pad-append tactile-scale" data-action="append-set" data-liftname="${safeLiftName}">+ Working Set</button>
    </div>
  </div>`;
}
