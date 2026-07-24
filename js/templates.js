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

export function buildSetRow(sData, sIdx, safeLiftName, historicalSetData = null, weightUnit = 'kg', exerciseName = safeLiftName, bodyweight = 75, prescribedReps = null, prescribedRepGoal = null, previousSetData = historicalSetData, roleTag = null) {
  const ghostWeight = historicalSetData?.w || weightUnit;
  const ghostReps   = historicalSetData?.r || prescribedReps || 'reps';
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

  // Tier-aware role tag (J&T top set / back-off / plus / target / MRS …). The
  // label is derived from the role STORED on the set (stable across row edits)
  // and matches the completed snapshot in history. Warm-up rows never carry one.
  const hasRole = roleTag && type !== 'W';
  const roleTagHtml = hasRole
    ? `<span class="set-role-tag set-role-tag--${escapeHtml(String(roleTag.role))}${roleTag.emphasis ? ' is-emphasis' : ''}" data-set-role="${escapeHtml(String(roleTag.role))}">${escapeHtml(String(roleTag.label))}</span>`
    : '';

  // Block-2 back-off (weeks 7–11): when the day's top set is known, seed the
  // WEIGHT placeholder with the 85%/90% suggestion and show its source line.
  // data-ghost-default preserves the non-suggestion ghost so clearing the top set
  // restores it (no stale calculated load). A row the athlete has filled keeps
  // its value (never overwritten); the suggestion only ever fills a blank.
  const boSrc = hasRole && roleTag.boSrc ? String(roleTag.boSrc) : '';
  const ghostDefault = String(ghostWeight);
  const weightPlaceholder = (hasRole && roleTag.backoffSuggest != null) ? String(roleTag.backoffSuggest) : ghostDefault;
  const backoffHint = hasRole && roleTag.backoffHint ? String(roleTag.backoffHint) : '';
  const boAttrs = boSrc
    ? ` data-bo-src="${escapeHtml(boSrc)}" data-bo-pct="${escapeHtml(String(roleTag.boPct ?? ''))}"`
    : '';

  return `<div class="cockpit-set-row ${sData.c ? 'is-complete' : ''} ${typeClass} ${sData.isPR ? 'is-pr' : ''}"${hasRole ? ` data-set-role="${escapeHtml(String(roleTag.role))}"` : ''}${boAttrs} data-set-index="${sIdx}" data-load-mode="${directMode}">
    ${roleTagHtml}
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
    <div class="set-entry">
      <input type="number" inputmode="decimal" class="input-weight-node" aria-label="Effective load for set ${sIdx + 1}" placeholder="${escapeHtml(weightPlaceholder)}" data-ghost-default="${escapeHtml(ghostDefault)}" value="${escapeHtml(effectiveValue)}">
      ${boSrc ? `<small class="set-backoff-hint">${escapeHtml(backoffHint)}</small>` : previousSetData?.w ? `<small>Last ${escapeHtml(String(previousSetData.w))}${escapeHtml(weightUnit)}</small>` : ''}
    </div>
    <div class="set-entry">
      <input type="number" inputmode="numeric" class="input-reps-node" data-target-reps="${escapeHtml(String(prescribedRepGoal || ''))}" placeholder="${escapeHtml(String(ghostReps))}" value="${escapeHtml(String(sData.r || ''))}">
      ${previousSetData?.r ? `<small>Last ${escapeHtml(String(previousSetData.r))} reps</small>` : ''}
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

export function buildExerciseCard({ displaySafeName, safeLiftName, isCompleted, diagnostic, blueprintLabel, targetLabel = '', historicalLineText, historyPanelHTML = '', setsMarkup, groupId = null, ssColor = null }) {
  const stalledBadge = diagnostic.isStalled ? `<span class="badge-stall-indicator">PROGRESS CHECK</span>` : '';
  const targetStyle  = diagnostic.isStalled ? 'color: var(--color-amber); font-weight: 800;' : '';
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
    ${historyPanelHTML || `<span class="cockpit-history-line">${historicalLineText}</span>`}
    ${diagnostic.progression && diagnostic.progression.weight ? `
      <div class="cockpit-coach-target">
        <span class="cct-text">🎯 Target <b>${escapeHtml(String(diagnostic.progression.weight))} × ${escapeHtml(String(diagnostic.progression.reps))}</b></span>
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
