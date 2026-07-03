// @ts-check
// =============================================================================
// FASTING CARD — sheet UI and live ticker. Call initFastingCard() first.
// =============================================================================
import {
  getFastingContext, fmtFastDuration, fmtHoursLabel, FASTING_ZONES,
  FASTING_PROTOCOLS, protocolForGoalHours,
} from '../fasting.js';
import { fastingRingSVG, ringArcOffset, ringCaption } from '../fasting/fasting-ring.js';

function _isoToDatetimeLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let _getState = null;
let _fastingTicker = null;

export function initFastingCard(getStateFn) {
  _getState = getStateFn;
}

function _fastingTickUpdate() {
  const state = _getState ? _getState() : null;
  if (!state?.fastingSession?.active) { _stopFastingTicker(); return; }
  const ctx = getFastingContext(state);
  const sheetTimer = document.getElementById('fastingSheetTimer');
  if (sheetTimer) sheetTimer.textContent = fmtFastDuration(ctx.hours);
  // Advance the ring arc, and roll the stage name/colour when a zone is crossed.
  const arc = document.getElementById('fastingRingArc');
  if (arc) arc.setAttribute('stroke-dashoffset', ringArcOffset(ctx.progressPct).toFixed(1));
  const stage = document.getElementById('fastingRingStage');
  if (stage) { stage.textContent = ctx.zone.name; stage.setAttribute('fill', ctx.zone.color); }
  if (arc) arc.setAttribute('stroke', ctx.zone.color);
  const caption = document.getElementById('fastingRingCaption');
  if (caption) caption.textContent = ringCaption(ctx);
}

function _startFastingTicker() {
  if (_fastingTicker) return;
  _fastingTicker = setInterval(_fastingTickUpdate, 1000);
}

function _stopFastingTicker() {
  clearInterval(_fastingTicker);
  _fastingTicker = null;
}

function _zoneNameForHours(h) {
  for (const z of FASTING_ZONES) {
    if (h >= z.hoursStart && h < z.hoursEnd) return z.name;
  }
  return FASTING_ZONES[FASTING_ZONES.length - 1].name;
}

export function openFastingDetail() {
  const state = _getState ? _getState() : null;
  if (!state) return;
  const sheet    = document.getElementById('fastingSheet');
  const backdrop = document.getElementById('fastingSheetBackdrop');
  if (!sheet) return;

  const ctx = getFastingContext(state);

  const nextZone = FASTING_ZONES.find(z => z.hoursStart > ctx.hours);
  const phaseProgress = ctx.zone && ctx.zone.hoursEnd !== Infinity
    ? Math.min(100, ((ctx.hours - ctx.zone.hoursStart) / (ctx.zone.hoursEnd - ctx.zone.hoursStart)) * 100)
    : 100;

  const timelineHtml = FASTING_ZONES.map(z => {
    const reached  = ctx.hours >= z.hoursStart;
    const current  = ctx.hours >= z.hoursStart && ctx.hours < z.hoursEnd;
    const cls = current ? 'fz-node fz-node--current' : (reached ? 'fz-node fz-node--done' : 'fz-node');
    return `<div class="${cls}" style="--zone-color:${z.color};">
      <div class="fz-dot">${z.icon}</div>
      <div class="fz-label">${z.name}</div>
      <div class="fz-time">${z.hoursStart}h</div>
    </div>`;
  }).join('');

  const phaseInfoHtml = ctx.active && nextZone
    ? `<div class="fz-phase-info">
        <div class="fz-phase-label">Next: <strong style="color:${nextZone.color};">${nextZone.icon} ${nextZone.name}</strong></div>
        <div class="fz-phase-time">in ${fmtHoursLabel(nextZone.hoursStart - ctx.hours)}</div>
        <div class="fz-phase-track">
          <div class="fz-phase-fill" style="width:${phaseProgress.toFixed(1)}%;background:${ctx.zone.color};"></div>
        </div>
      </div>`
    : '';

  const totalHistory = ctx.history.length;
  const historyHtml = totalHistory === 0
    ? '<p class="fasting-history-empty">No completed fasts yet.</p>'
    : ctx.history.slice().reverse().slice(0, 7).map((h, displayIdx) => {
        const actualIdx = totalHistory - 1 - displayIdx;
        const date = new Date(h.endTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const zone = _zoneNameForHours(h.durationHours);
        const metGoal = h.durationHours >= (h.goalHours ?? 16);
        return `<div class="fasting-history-row" data-fhr-index="${actualIdx}">
          <span class="fhr-date">${date}</span>
          <span class="fhr-dur">${fmtHoursLabel(h.durationHours)}</span>
          <span class="fhr-zone">${zone}</span>
          <span class="fhr-check">${metGoal ? '✓' : '–'}</span>
          <button class="fhr-edit-btn" data-action="fast-edit-history" data-index="${actualIdx}" aria-label="Edit this fast">✏</button>
        </div>`;
      }).join('');

  const activeCaution = protocolForGoalHours(ctx.goal)?.caution ?? false;
  const protocolChips = FASTING_PROTOCOLS.map(p =>
    `<button class="fasting-chip ${p.fastHours === ctx.goal ? 'fasting-chip--active' : ''}"
       data-action="fast-set-protocol" data-goal="${p.fastHours}" data-caution="${p.caution ? '1' : '0'}"
       title="${p.blurb}">${p.label}</button>`
  ).join('');

  sheet.innerHTML = `
    <div class="fasting-sheet-header">
      <span class="fasting-sheet-title">Fasting</span>
      <button class="fasting-btn-analytics" data-action="open-fasting-analytics">Analytics</button>
      <button class="fasting-sheet-close" data-action="close-fasting-detail">✕</button>
    </div>

    <div class="fasting-ring-wrap ${ctx.active ? 'fasting-ring-wrap--active' : ''}">
      ${fastingRingSVG(ctx, 208)}
      <div class="fasting-ring-caption" id="fastingRingCaption">${ringCaption(ctx)}</div>
      <div class="fasting-ring-zonedesc">${ctx.zone.description}</div>
    </div>

    <div class="fasting-metrics-grid">
      <div class="fasting-metric"><div class="fm-value">${ctx.goal}h</div><div class="fm-label">Goal</div></div>
      <div class="fasting-metric"><div class="fm-value">${ctx.streak}</div><div class="fm-label">Day Streak</div></div>
      <div class="fasting-metric"><div class="fm-value">${fmtHoursLabel(ctx.weeklyHours)}</div><div class="fm-label">This Week</div></div>
      <div class="fasting-metric"><div class="fm-value">${ctx.history.length}</div><div class="fm-label">Total Fasts</div></div>
    </div>

    <div class="fasting-zone-timeline">${timelineHtml}</div>
    ${phaseInfoHtml}

    <div class="fasting-sheet-controls">
      ${ctx.active
        ? `<button class="fasting-btn-stop fasting-btn-stop--full" data-action="fast-stop">End Fast</button>
           <div class="fasting-adjust-row">
             <button class="fasting-btn-adjust" data-action="fast-edit-start-time">Adjust start</button>
             <button class="fasting-btn-adjust" data-action="fast-edit-end-time">Adjust end</button>
           </div>
           <div class="fasting-edit-panel" id="fastingEditStartPanel" style="display:none;">
             <div class="fasting-edit-panel-title">Start time</div>
             <input type="datetime-local" id="fastingStartTimeInput" class="fasting-edit-input"
               value="${_isoToDatetimeLocal(state.fastingSession.startTime)}"
               max="${_isoToDatetimeLocal(new Date().toISOString())}">
             <div class="fasting-edit-panel-actions">
               <button class="fasting-edit-cancel" data-action="fast-cancel-edit-start">Cancel</button>
               <button class="fasting-edit-save" data-action="fast-save-start-time">Save</button>
             </div>
           </div>
           <div class="fasting-edit-panel" id="fastingEditEndPanel" style="display:none;">
             <div class="fasting-edit-panel-title">End time</div>
             <input type="datetime-local" id="fastingEndTimeInput" class="fasting-edit-input"
               value="${_isoToDatetimeLocal(new Date().toISOString())}"
               min="${_isoToDatetimeLocal(state.fastingSession.startTime)}"
               max="${_isoToDatetimeLocal(new Date().toISOString())}">
             <div class="fasting-edit-panel-actions">
               <button class="fasting-edit-cancel" data-action="fast-cancel-edit-end">Cancel</button>
               <button class="fasting-edit-save" data-action="fast-save-end-time">Save</button>
             </div>
           </div>`
        : `<div class="fasting-protocol-picker">
             <div class="fasting-protocol-label">Protocol</div>
             <div class="fasting-chip-row">${protocolChips}</div>
             <input type="hidden" id="fastingSheetGoalSelect" value="${ctx.goal}">
             <div class="fasting-protocol-caution" id="fastingProtocolCaution"
                  style="display:${activeCaution ? '' : 'none'};">
               ⚠ Extended fast — consider medical guidance for 24h+.
             </div>
             <button class="fasting-btn-start fasting-btn-start--full" data-action="fast-start">Start Fast</button>
           </div>`
      }
    </div>

    <div class="fasting-history-section">
      <div class="fasting-history-title">Recent Fasts</div>
      <div class="fasting-history-header">
        <span>Date</span><span>Duration</span><span>Zone</span><span>Goal</span><span></span>
      </div>
      ${historyHtml}
    </div>
  `;

  sheet.classList.add('active');
  if (backdrop) backdrop.classList.add('active');
  if (ctx.active) _startFastingTicker();
}

export function closeFastingDetail() {
  _stopFastingTicker();
  closeHistoryEditPanel();
  document.getElementById('fastingSheet')?.classList.remove('active');
  document.getElementById('fastingSheetBackdrop')?.classList.remove('active');
}

export function openHistoryEditPanel(idx, appState) {
  closeHistoryEditPanel();
  const history = appState?.fastingSession?.history ?? [];
  const entry = history[idx];
  if (!entry) return;

  const row = document.querySelector(`.fasting-history-row[data-fhr-index="${idx}"]`);
  if (!row) return;

  row.classList.add('fhr--editing');

  const panel = document.createElement('div');
  panel.id = 'fhrEditPanel';
  panel.className = 'fhr-edit-panel';
  panel.innerHTML = `
    <div class="fasting-edit-panel-title">Edit Fast</div>
    <label class="fasting-edit-panel-title" style="font-size:0.7rem;margin-bottom:4px;display:block;">Start time</label>
    <input type="datetime-local" id="fhrEditStart" class="fasting-edit-input"
      value="${_isoToDatetimeLocal(entry.startTime)}"
      max="${_isoToDatetimeLocal(new Date().toISOString())}">
    <label class="fasting-edit-panel-title" style="font-size:0.7rem;margin-bottom:4px;display:block;">End time</label>
    <input type="datetime-local" id="fhrEditEnd" class="fasting-edit-input"
      value="${_isoToDatetimeLocal(entry.endTime)}"
      min="${_isoToDatetimeLocal(entry.startTime)}"
      max="${_isoToDatetimeLocal(new Date().toISOString())}">
    <div class="fasting-edit-panel-actions">
      <button class="fasting-edit-cancel" data-action="fast-cancel-history-edit">Cancel</button>
      <button class="fasting-edit-save" data-action="fast-save-history" data-index="${idx}">Save</button>
    </div>
  `;
  row.after(panel);
}

export function closeHistoryEditPanel() {
  document.getElementById('fhrEditPanel')?.remove();
  document.querySelector('.fhr--editing')?.classList.remove('fhr--editing');
}
