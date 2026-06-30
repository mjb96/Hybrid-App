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

  const band = sData.band || '';
  const bandLabels = { '': '— None', 'L': '🟢 Light', 'M': '🟡 Medium', 'H': '🔴 Heavy' };
  const bw = !!sData.bw;

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
    <div class="band-pad-row">
      <span class="rpe-pad-label">LOAD</span>
      <button class="btn-bw tactile-scale${bw ? ' bw-on' : ''}"
              data-action="toggle-bodyweight"
              data-liftname="${safeLiftName}"
              data-sidx="${sIdx}"
              title="Bodyweight: use your bodyweight as the load. Edit the weight to add (weighted) or reduce (assisted).">
        BW
      </button>
      <button class="btn-band tactile-scale${band ? ' band-' + band : ''}"
              data-action="cycle-band"
              data-liftname="${safeLiftName}"
              data-sidx="${sIdx}"
              title="Tap to cycle resistance band: None → Light → Medium → Heavy. Uses your band weights for volume.">
        ${bandLabels[band]}
      </button>
    </div>
    <div class="rpe-pad-row">
      <span class="rpe-pad-label">RPE</span>
      ${[6,7,8,9,10].map(v => `<button class="btn-rpe tactile-scale${sData.rpe === v ? ' rpe-selected' : ''}" data-action="set-rpe" data-sidx="${sIdx}" data-rpe="${v}">${v}</button>`).join('')}
    </div>
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
