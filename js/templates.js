// @ts-check
// ==========================================
// UPGRADED TEMPLATES — HTML SPATIAL BUILDERS
// ==========================================
import { DAY_NAMES_FULL } from './constants.js';
import { escapeHtml } from './util.js';
import { isBodyweightExercise, resolvedLoadMode } from './workout/load-mode.js';

export function buildEmptyWorkoutCard() {
  return '<div class="card-dark text-xs-muted empty-state-card">No lifting scheduled today.</div>';
}

export function buildSetRow(sData, sIdx, safeLiftName, historicalSetData = null, weightUnit = 'kg', exerciseName = safeLiftName, bodyweight = 75) {
  const ghostWeight = historicalSetData?.w || weightUnit;
  const ghostReps   = historicalSetData?.r || 'reps';
  const type = sData.type || '';

  const numLabels  = { '': `S${sIdx + 1}`, 'W': 'W', 'D': 'D', 'F': 'F' };
  const typeClass  = type === 'W' ? 'type-warmup' : type === 'D' ? 'type-dropset' : type === 'F' ? 'type-amrap' : '';

  // Single "load" chip: one control cycling Weighted → Bodyweight → band tiers,
  // instead of a separate label + BW button + band chip on every set.
  const loadState = sData.bw ? 'BW' : (sData.band || '');
  const loadLabels = { '': 'Weighted', 'BW': 'Bodyweight', 'L': '🟢 Light band', 'M': '🟡 Med band', 'H': '🔴 Heavy band' };
  const loadCls = loadState === '' ? 'weighted' : loadState === 'BW' ? 'bw' : loadState;
  const bodyweightCapable = isBodyweightExercise(exerciseName);
  const directMode = resolvedLoadMode(sData, exerciseName);
  const effectiveValue = bodyweightCapable && directMode === 'bodyweight' && !sData.w
    ? String(bodyweight)
    : String(sData.w || '');

  // Full-word type label for the (now roomier) expander, vs the terse column badge.
  const typeFullLabels = { '': 'Working set', 'W': 'Warm-up', 'D': 'Drop set', 'F': 'AMRAP (max reps)' };

  return `<div class="cockpit-set-row ${sData.c ? 'is-complete' : ''} ${typeClass} ${sData.isPR ? 'is-pr' : ''}" data-set-index="${sIdx}" data-load-mode="${directMode}">
    ${sData.isPR ? '<span class="pr-badge">PR</span>' : ''}
    ${bodyweightCapable ? `<div class="set-load-choice" role="group" aria-label="Load mode for set ${sIdx + 1}">
      ${['bodyweight', 'weighted', 'assisted'].map(mode => `<button type="button"
        class="set-load-choice__btn${directMode === mode ? ' active' : ''}"
        data-action="set-load-mode" data-mode="${mode}"
        data-liftname="${safeLiftName}" data-sidx="${sIdx}"
        aria-pressed="${directMode === mode}">${mode === 'bodyweight' ? 'Bodyweight' : mode === 'weighted' ? 'Weighted' : 'Assisted'}</button>`).join('')}
    </div>` : ''}
    <button type="button" class="set-num-lbl tactile-scale"
         data-action="quick-log"
         data-liftname="${safeLiftName}"
         data-sidx="${sIdx}"
         title="Tap to log this set at its target"
         aria-label="Log set ${sIdx + 1} at target"
         style="cursor:pointer; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); text-align: center;">
         Log ${numLabels[type]}
    </button>
    <div>
      <input type="number" inputmode="decimal" class="input-weight-node" aria-label="Effective load for set ${sIdx + 1}" placeholder="${escapeHtml(String(ghostWeight))}" value="${escapeHtml(effectiveValue)}">
    </div>
    <div>
      <input type="number" inputmode="numeric" class="input-reps-node" placeholder="${escapeHtml(String(ghostReps))}" value="${escapeHtml(String(sData.r || ''))}">
    </div>
    <div class="gym-check-container">
      <label class="gym-check-wrap">
        <input type="checkbox" class="gym-check" ${sData.c ? 'checked' : ''}>
        <span class="gym-check-icon">✓</span>
      </label>
    </div>
    <button class="btn-set-more tactile-scale"
            data-action="toggle-set-adv"
            aria-label="Set options"
            title="Set type, load & remove">⋯</button>

    <div class="set-adv-row">
      <button class="type-pill tactile-scale"
           data-action="cycle-set-type"
           data-liftname="${safeLiftName}"
           data-sidx="${sIdx}"
           title="Tap to cycle: Working → Warm-up → Drop → AMRAP">
           ${typeFullLabels[type]}
      </button>
      <button class="btn-load tactile-scale load-${loadCls}"
              data-action="cycle-load"
              data-liftname="${safeLiftName}"
              data-sidx="${sIdx}"
              title="Tap to set load: Weighted → Bodyweight → Light → Medium → Heavy band. Bodyweight/band auto-fill the weight for volume; edit it to add or assist.">
        ${loadLabels[loadState]}
      </button>
      <button class="btn-set-delete tactile-scale"
        data-action="remove-set"
        data-liftname="${safeLiftName}"
        data-sidx="${sIdx}">✕ Remove set</button>
    </div>
    ${type === 'W' ? '' : `<div class="rpe-pad-row">
      <span class="rpe-pad-label" title="Reps in reserve — how many more reps you could have done">Reps left</span>
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

export function buildExerciseCard({ displaySafeName, safeLiftName, isCompleted, diagnostic, blueprintLabel, targetLabel = '', historicalLineText, setsMarkup, groupId = null, ssColor = null, plates = '' }) {
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
        <div class="cockpit-ex-target" style="${targetStyle}" data-target-label="${escapeHtml(String(targetLabel || blueprintLabel))}">${blueprintLabel}</div>
      </div>
      <div class="cockpit-ex-status">${isCompleted ? 'DONE' : 'LOG'}</div>
    </div>
    <button class="${ssBtnClass}" ${ssBtnStyle} data-action="show-ss-panel" data-liftname="${safeLiftName}">${ssBtnLabel}</button>
  </div>
  <div class="cockpit-body">
    <div class="local-timer-placeholder"></div>
    <span class="cockpit-history-line">⚡ ${historicalLineText}</span>
    ${diagnostic.progression && diagnostic.progression.weight ? `
      <div class="cockpit-coach-target">
        <span class="cct-text">🎯 Target <b>${escapeHtml(String(diagnostic.progression.weight))} × ${escapeHtml(String(diagnostic.progression.reps))}</b>${plates ? `<span class="cct-plates" style="color:var(--text-muted);font-size:0.72rem;margin-left:6px;">🍩 ${escapeHtml(plates)}</span>` : ''}</span>
        ${isCompleted ? '' : `<button class="cct-logall tactile-scale" data-action="log-all-target">Log all →</button>`}
      </div>
    ` : ''}
    ${setsMarkup ? `<div class="set-rows-head" aria-hidden="true">
      <span></span>
      <span class="srh-lbl">Weight</span>
      <span class="srh-lbl">Reps</span>
      <span class="srh-lbl">Done</span>
      <span></span>
    </div>` : ''}
    <div class="set-rows-list">${setsMarkup}</div>
    <div class="append-set-row">
      <button class="btn-pad-append tactile-scale btn-append-warmup" data-action="append-warmup-set" data-liftname="${safeLiftName}">+ Warmup</button>
      <button class="btn-pad-append tactile-scale" data-action="append-set" data-liftname="${safeLiftName}">+ Working Set</button>
      <button class="btn-pad-append tactile-scale" data-action="swap-exercise" data-liftname="${safeLiftName}">⇄ Swap</button>
    </div>
  </div>`;
}
