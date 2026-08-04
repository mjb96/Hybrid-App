// @ts-check
// ==========================================
// STRENGTH VIEW (analytics/views/view-strength.js)
// ==========================================
import { renderVolumeChart, render1RMProgressChart } from '../charts.js';
import {
  render1RMProgressionChart,
  renderVolumeProgressionChart,
  renderVolumeCalendarHeatmap,
} from '../charts/strength-charts.js';
import { statCard } from '../charts/chart-primitives.js';
import { computeStrengthAnalytics } from '../calculations/strength-calcs.js';
import { buildWeekChart } from '../week-chart-model.js';
import { statComparisonFrom } from '../comparison.js';
import { computeLoadAnalytics } from '../calculations/load-calcs.js';
import {
  generateStrengthInsights,
  generateLoadInsights,
  rankInsights,
  renderInsightsHTML,
  deloadInsight,
} from '../insights/insight-engine.js';
import { isValidWorkingSet } from '../../set-utils.js';
import { summarizeSessionLifts } from '../calculations/session-compare.js';
import { isProgramDeloadWeek } from '../../brain/day-verdict.js';
import { resolveProgramForState, saveStateToLocalStorage } from '../../state.js';
import { esc, screenTabBar, mountScreenTabs, spark as _spark } from './screen-kit.js';
import { getCalendarWeekOffset, getSelectedWeekStart } from '../week-nav.js';
import { collectCalendarWeek, weekStartOf, localDayKey } from '../weekly-aggregate.js';
import { calendarStrengthSummary, calendarWeekE1rmSeriesForLift, bestE1rmByLiftForWeek } from '../../metrics/metrics-strength.js';
import { canonicalExerciseId } from '../../exercises/catalog.js';
import { estimatedE1rmForSet } from '../../strength/e1rm.js';
import { buildStrengthMetricDetail } from '../strength-detail.js';
import { buildVolumeGuideModel, musclePriorityLabel } from '../volume-guide.js';

function qs(id) { return document.getElementById(id); }
function setText(id, val) { const el = qs(id); if (el) el.textContent = val; }
function setHTML(id, html) { const el = qs(id); if (el) el.innerHTML = html; }

function fmtKg(v)   { return v > 0 ? Math.round(v).toLocaleString() + ' kg' : '--'; }
function fmtPct(v)  { if (v === null || !isFinite(v)) return ''; return (v >= 0 ? '+' : '') + v.toFixed(0) + '%'; }
function fmtKgWk(v) { if (!v || !isFinite(v)) return ''; return (v >= 0 ? '+' : '') + v.toFixed(1) + ' kg/wk'; }
function tone(pct)  { return pct > 0 ? '#10b981' : pct < 0 ? '#ef4444' : 'rgba(255,255,255,0.4)'; }


// ---- Training Load Dashboard -------------------------------------------
function renderTrainingLoadDashboard(sa, la, weekLabels, appState) {
  const el = qs('strengthTrainingLoadDashboard');
  if (!el) return;

  // Honest week-over-week: for the CURRENT (partial) week this compares the
  // elapsed portion against the same point last week; for a completed week it's
  // full-vs-full. Same shared model + labels as the In Focus graph, driven by the
  // CALENDAR-week navigator (offset 0 = this calendar week), so value and label
  // always describe the same real periods (no "partial vs full" mislabel).
  const volChart = buildWeekChart(appState, { type: 'strength', metric: 'volume', weekOffset: getCalendarWeekOffset() });
  const volCur   = volChart.total;
  const volCmp   = statComparisonFrom(volChart);

  const fourWeek = buildStrengthMetricDetail(appState, 'strength.four-week-volume');
  const volumeProgression = buildStrengthMetricDetail(appState, 'strength.volume-progression');

  const acwrVal   = la.currentRatio > 0 ? la.currentRatio.toFixed(2) : '--';
  const acwrColor = la.currentRatio === 0 ? 'rgba(255,255,255,0.4)'
    : la.currentRatio < 0.8 ? '#10b981' : la.currentRatio < 1.3 ? '#f59e0b' : '#ef4444';

  const volProgStatus = sa.volProgPct === null ? ''
    : sa.volProgPct > 5 ? 'Building' : sa.volProgPct < -5 ? 'Declining' : 'Stable';
  const fatigueColor = la.fatigue === 'rising' ? '#ef4444' : la.fatigue === 'declining' ? '#10b981' : '#94a3b8';

  el.innerHTML = `
    <h2 class="section-header mt-2">Training Load Dashboard</h2>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Weekly Volume', value: fmtKg(volCur), delta: volCmp.deltaPct, sub: volCmp.sub, color: '#3b82f6', status: volProgStatus, action: 'open-analytics', context: 'weekly-volume', parentContext: 'strength', preserveWeek: true })}
      ${statCard({ label: '4-Week Volume', value: fourWeek?.formattedValue || '—', sub: 'trailing 28 calendar days', color: '#8b5cf6', action: 'open-analytics', context: 'strength-metric', entity: 'strength.four-week-volume', parentContext: 'strength_pr', metricId: 'strength.four-week-volume' })}
    </div>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: '7-Day Load (ATL)', value: la.currentATL > 0 ? Math.round(la.currentATL) : '--', sub: 'acute training load', color: '#f59e0b' })}
      ${statCard({ label: '28-Day Load (CTL)', value: la.currentCTL > 0 ? Math.round(la.currentCTL) : '--', sub: 'chronic baseline', color: '#3b82f6' })}
    </div>
    <div class="grid-2-col gap-2 mb-2">
      <article class="card-dark p-3 flex-col" style="border:1px solid ${acwrColor}22;">
        <div class="text-xs text-muted mb-1">Acute:Chronic Ratio</div>
        <div class="font-heavy text-inverse" style="font-size:1.3rem;line-height:1.1;color:${acwrColor};">${acwrVal}</div>
        <div class="text-xs mt-1" style="color:${acwrColor};">${la.loadStatus.status}</div>
        <div class="text-xs text-muted mt-1">Compared with your 28-day baseline</div>
      </article>
      <article class="card-dark p-3 flex-col" style="border:1px solid ${fatigueColor}22;">
        <div class="text-xs text-muted mb-1">Fatigue Trend</div>
        <div class="font-heavy" style="font-size:1.2rem;text-transform:capitalize;color:${fatigueColor};">${la.fatigue}</div>
        <div class="text-xs text-muted mt-1">4-week ATL direction</div>
        ${la.loadProgPct !== null ? `<div class="text-xs mt-1" style="color:${tone(la.loadProgPct)};">${fmtPct(la.loadProgPct)} vs the previous week</div>` : ''}
      </article>
    </div>
    <div class="grid-2-col gap-2 mb-3">
      ${statCard({ label: 'Volume Progression', value: volumeProgression?.formattedValue || '—', sub: 'trailing 28d vs previous 28d', color: '#3b82f6', action: 'open-analytics', context: 'strength-metric', entity: 'strength.volume-progression', parentContext: 'strength_pr', metricId: 'strength.volume-progression' })}
      ${statCard({ label: 'Recovery Impact', value: la.recovImpact[la.recovImpact.length - 1] !== null ? ((la.recovImpact[la.recovImpact.length - 1] || 0) * 100).toFixed(0) + '%' : '--', sub: 'TSB / CTL', color: '#94a3b8' })}
    </div>`;
}

// ---- Strength Progression -----------------------------------------------
function renderStrengthProgression(sa, weekLabels) {
  const el = qs('strengthProgressionSection');
  if (!el) return;

  const lifts = Object.entries(sa.liftProgression || {})
    .filter(([, p]) => p.hasData)
    .sort(([, a], [, b]) => b.lifetimePR - a.lifetimePR);

  if (lifts.length === 0) {
    el.innerHTML = '<p class="text-muted text-sm p-3">Complete sets to see lift progression.</p>';
    return;
  }

  let html = '<h2 class="section-header mt-2">Strength Progression</h2>';

  lifts.forEach(([liftName, prog]) => {
    const cur  = prog.currentWeekPR;
    const prev = prog.previousWeekPR;
    const delta = cur > 0 && prev > 0 ? cur - prev : null;
    const roiColor = prog.roi > 0.2 ? '#10b981' : prog.roi < -0.1 ? '#ef4444' : 'rgba(255,255,255,0.5)';

    const isPR = cur > 0 && Math.abs(cur - prog.lifetimePR) < 0.5;
    const prBadge = isPR ? `<span style="font-size:0.7rem;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981;border-radius:4px;padding:1px 5px;margin-left:6px;">NEW PR</span>` : '';

    html += `<article class="card-dark p-3 mb-3" style="border:1px solid rgba(59,130,246,0.15);">
      <div class="flex-between mb-2">
        <button class="an-entity-link text-sm font-bold" data-action="open-analytics" data-context="exercise" data-entity="${esc(canonicalExerciseId(liftName) || `custom:${liftName}`)}" data-entity-name="${esc(liftName)}" data-parent-context="strength">${esc(liftName)}${prBadge}<span aria-hidden="true">›</span></button>
        <span class="text-base font-heavy" style="color:#3b82f6;">${Math.round(prog.lifetimePR)} kg <span class="text-xs text-muted">Lifetime PR</span></span>
      </div>
      <div class="grid-2-col gap-2 mb-2">
        <div style="font-size:0.78rem;">
          <div class="text-muted mb-1">Block PR (4wk)</div>
          <div class="font-bold text-inverse">${prog.blockPR > 0 ? Math.round(prog.blockPR) + ' kg' : '--'}</div>
        </div>
        <div style="font-size:0.78rem;">
          <div class="text-muted mb-1">Current Program Week</div>
          <div class="font-bold text-inverse">${cur > 0 ? Math.round(cur) + ' kg' : '--'}
            ${delta !== null ? `<span style="color:${delta >= 0 ? '#10b981' : '#ef4444'};font-size:0.7rem;margin-left:4px;">${delta >= 0 ? '+' : ''}${Math.round(delta)}</span>` : ''}
          </div>
        </div>
        <div style="font-size:0.78rem;">
          <div class="text-muted mb-1">Rate of Improvement</div>
          <div class="font-bold" style="color:${roiColor};">${fmtKgWk(prog.roi) || '--'}</div>
        </div>
        <div style="font-size:0.78rem;">
          <div class="text-muted mb-1">Projected PR (4wk)</div>
          <div class="font-bold" style="color:#60a5fa;">${prog.projection ? Math.round(prog.projection) + ' kg' : '—'}</div>
        </div>
      </div>
      <div id="liftChart_${liftName.replace(/[^a-zA-Z0-9]/g, '_')}"></div>
    </article>`;
  });

  el.innerHTML = html;

  // Render per-lift charts
  lifts.forEach(([liftName, prog]) => {
    const chartId = `liftChart_${liftName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const container = qs(chartId);
    if (container) {
      render1RMProgressionChart(container, weekLabels, prog.series, prog.trend, prog.rolling4, prog.lifetimePR, liftName);
    }
  });
}

// ---- Volume Guide --------------------------------------------------------
let _volumeGuideTab = 'overview';

function fmtCredit(value) {
  const number = Number(value || 0);
  return number.toFixed(number % 1 ? 1 : 0);
}

function priorityOptions(selected) {
  return [
    ['grow', 'Grow'], ['maintain', 'Maintain'], ['track', 'Track only'],
  ].map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

// One muscle row, drawn against the FULL landmark scale rather than a single
// min–max band. The axis runs 0 → the usual ceiling (MRV), so a week far above
// that ceiling now looks different from a merely productive one — the old track
// stacked four overlays on an unlabelled axis and both read the same.
function volumeGuideRow(row, { showPriority = true } = {}) {
  const lm = row.landmarks;
  // Scale headroom: always show the ceiling, and stretch if the athlete is past it.
  const ceiling = Math.max(lm?.mrv || 0, row.logged.total, row.planned.total, 1);
  const pct = (value) => Math.max(0, Math.min(100, (Number(value || 0) / ceiling) * 100));

  const directWidth = pct(row.logged.direct);
  const indirectWidth = Math.max(0, Math.min(100 - directWidth, pct(row.logged.indirect)));
  const bandLeft = row.reference ? pct(row.reference.min) : 0;
  const bandWidth = row.reference ? Math.max(1, pct(row.reference.max) - bandLeft) : 0;

  // Landmark ticks, de-duplicated so coincident values don't stack illegibly.
  const ticks = lm
    ? [['MV', lm.mv], ['MEV', lm.mev], ['MAV', lm.mav], ['MRV', lm.mrv]]
      .filter(([, value], index, all) => value > 0 && all.findIndex(([, v]) => v === value) === index)
      .map(([label, value]) => `<span class="vg-tick" style="left:${pct(value)}%"><i></i><b>${label}</b></span>`)
      .join('')
    : '';

  const scaleLabel = lm
    ? `${esc(row.name)}: ${fmtCredit(row.logged.total)} set credits logged. `
      + `Typical reference ${row.reference ? `${fmtCredit(row.reference.min)} to ${fmtCredit(row.reference.max)}` : 'not set'}, `
      + `usual ceiling ${fmtCredit(lm.mrv)}. ${esc(row.status.label)}.`
    : `${esc(row.name)}: ${fmtCredit(row.logged.total)} set credits logged.`;

  return `<article class="vg-muscle-row vg-muscle-row--${esc(row.status.tone)}">
    <div class="vg-muscle-row__head">
      <button type="button" class="an-entity-link" data-action="open-analytics" data-context="muscle" data-entity="${esc(row.id)}" data-entity-name="${esc(row.name)}" data-parent-context="strength_pr" data-preserve-week="true">${esc(row.name)}<span aria-hidden="true">›</span></button>
      ${showPriority ? `<label class="vg-priority"><span class="sr-only">${esc(row.name)} priority</span><select data-volume-priority="${esc(row.id)}">${priorityOptions(row.priority)}</select></label>` : `<span class="vg-priority-label">${musclePriorityLabel(row.priority)}</span>`}
    </div>
    <div class="vg-muscle-row__numbers">
      <strong>${fmtCredit(row.logged.total)}</strong>
      <span>${row.reference ? `of ${fmtCredit(row.reference.min)}–${fmtCredit(row.reference.max)} typical` : 'set credits'}</span>
      ${row.planned.total > 0 ? `<span class="vg-muscle-row__planned">${fmtCredit(row.planned.total)} planned</span>` : ''}
    </div>
    <div class="vg-scale" role="img" aria-label="${scaleLabel}">
      <div class="vg-scale__track">
        ${row.reference ? `<span class="vg-scale__band" style="left:${bandLeft}%;width:${bandWidth}%"></span>` : ''}
        <span class="vg-scale__direct" style="width:${directWidth}%"></span>
        <span class="vg-scale__indirect" style="left:${directWidth}%;width:${indirectWidth}%"></span>
        ${row.planned.total > 0 ? `<span class="vg-scale__plan" style="left:${pct(row.planned.total)}%"></span>` : ''}
      </div>
      <div class="vg-scale__ticks">${ticks}</div>
    </div>
    <div class="vg-muscle-row__meta">
      <span>${fmtCredit(row.logged.direct)} direct · ${fmtCredit(row.logged.indirect)} indirect</span>
      <strong class="vg-status vg-status--${esc(row.status.tone)}">${esc(row.status.label)}</strong>
    </div>
    <p class="vg-muscle-row__detail">${esc(row.status.detail)}</p>
  </article>`;
}

// Priorities moved off the default list into their own tab: 19 muscle rows each
// carrying a <select> made the common "how did my week go?" read heavy, and
// setting a priority is a rare, deliberate act rather than a per-visit one.
function volumeGuideTabs() {
  return `<div class="vg-tabs" role="tablist" aria-label="Volume Guide sections">
    ${[['overview', 'Focus'], ['muscles', 'All muscles'], ['plan', 'Planned'], ['priorities', 'Priorities']].map(([id, label]) => `<button type="button" role="tab" aria-selected="${_volumeGuideTab === id}" class="vg-tab${_volumeGuideTab === id ? ' is-active' : ''}" data-volume-tab="${id}">${label}</button>`).join('')}
  </div>`;
}

function renderMuscleGroupAnalysis(sa, appState) {
  const el = qs('muscleGroupAnalysisSection');
  if (!el) return;
  const activeProgram = resolveProgramForState(appState, appState.activeProgramId);
  const model = buildVolumeGuideModel(appState, { program: activeProgram, weekStart: getSelectedWeekStart() });
  const focus = model.muscles.filter((row) => row.priority !== 'track');
  const planned = model.muscles.filter((row) => row.planned.total > 0);
  // Focus leads with whatever needs attention: below range first, then above
  // the ceiling, then everything sitting comfortably in range.
  const attentionRank = { low: 0, high: 1, ok: 2, neutral: 3 };
  const byAttention = (a, b) =>
    (attentionRank[a.status.tone] ?? 9) - (attentionRank[b.status.tone] ?? 9)
    || b.logged.total - a.logged.total
    || a.name.localeCompare(b.name);
  const displayed = _volumeGuideTab === 'overview' ? [...focus].sort(byAttention)
    : _volumeGuideTab === 'plan' ? planned
    : model.muscles;

  const summaryText = model.summary.focusCount
    ? `${model.summary.inRangeCount} of ${model.summary.focusCount} focus muscles in their typical range`
    : 'Choose muscle priorities to create your guide';
  const planText = !model.isCurrentWeek
    ? 'Historical weeks show logged work only.'
    : model.deload
      ? 'Planned deload · lower volume is expected.'
      : model.summary.scheduledCount
        ? `${model.summary.scheduledCount} focus muscle${model.summary.scheduledCount === 1 ? '' : 's'} still scheduled.`
        : 'No remaining focus volume is scheduled.';

  el.innerHTML = `<h2 class="section-header mt-2">Volume Guide</h2>
    <article class="card-dark vg-guide">
      <div class="vg-guide__intro"><div><strong>${summaryText}</strong><span>Estimated set credits · ${esc(model.weekStart)} to ${esc(model.weekEnd)}</span></div><span class="vg-guide__status">${model.status}</span></div>
      <div class="vg-summary">
        <button type="button" data-action="open-analytics" data-context="strength-metric" data-entity="strength.muscle-set-credits" data-parent-context="strength_pr" data-metric-id="strength.muscle-set-credits" aria-label="View Muscle Set Credits details"><span>Logged</span><strong>${fmtCredit(model.summary.loggedCredits)}</strong></button>
        <div><span>Planned</span><strong>${model.isCurrentWeek ? fmtCredit(model.summary.plannedCredits) : '—'}</strong></div>
        <div><span>Week context</span><strong>${model.deload ? 'Deload' : 'Training'}</strong></div>
      </div>
      ${model.summary.focusCount ? `<div class="vg-spread">
        <span class="vg-spread__item vg-spread__item--ok">${model.summary.inRangeCount} in range</span>
        <span class="vg-spread__item vg-spread__item--low">${model.summary.belowCount} below</span>
        <span class="vg-spread__item vg-spread__item--high">${model.summary.aboveCount} above ceiling</span>
        ${model.summary.notStartedCount ? `<span class="vg-spread__item">${model.summary.notStartedCount} not started</span>` : ''}
      </div>` : ''}
      ${volumeGuideTabs()}
      ${_volumeGuideTab === 'plan' ? `<p class="vg-guide__note">${planText}</p>` : ''}
      <div class="vg-muscle-list">${displayed.length ? displayed.map((row) => volumeGuideRow(row, { showPriority: _volumeGuideTab === 'priorities' })).join('') : '<p class="an-empty-inline">No mapped muscle volume is available for this view.</p>'}</div>
      <div class="vg-legend"><span><i class="is-direct"></i>Direct</span><span><i class="is-indirect"></i>Indirect</span><span><i class="is-reference"></i>Typical range</span><span><i class="is-plan"></i>Planned</span></div>
      <details class="an-method"><summary>How is this calculated?</summary><p>Only completed working sets with recorded reps count. Main muscles receive 1 set credit, meaningful supporting muscles 0.5, and minor contributors 0.25. Planned credits use the exact set targets shown by the workout logger.</p><p>The scale marks four population landmarks: <strong>MV</strong> (maintenance volume), <strong>MEV</strong> (minimum effective volume), <strong>MAV</strong> (maximum adaptive volume) and <strong>MRV</strong> (maximum recoverable volume). Your highlighted range is MEV–MAV when a muscle is set to Grow, and MV–MEV when it is set to Maintain.</p><p>These are broad population references, not personal prescriptions: adaptation depends on effort, exercise choice, training age and recovery, none of which the logger fully observes. Treat a gap as information, not an instruction to add sets.</p></details>
    </article>`;

  el.querySelectorAll('[data-volume-tab]').forEach((button) => button.addEventListener('click', () => {
    _volumeGuideTab = button.getAttribute('data-volume-tab') || 'overview';
    renderMuscleGroupAnalysis(sa, appState);
  }));
  el.querySelectorAll('[data-volume-priority]').forEach((select) => select.addEventListener('change', () => {
    if (!appState.settings) appState.settings = {};
    if (!appState.settings.musclePriorities || typeof appState.settings.musclePriorities !== 'object') appState.settings.musclePriorities = {};
    const muscleId = select.getAttribute('data-volume-priority');
    if (muscleId) appState.settings.musclePriorities[muscleId] = /** @type {HTMLSelectElement} */ (select).value;
    saveStateToLocalStorage(true);
    renderMuscleGroupAnalysis(sa, appState);
  }));
}

// ---- Volume Progression Chart -------------------------------------------
function renderVolumeSection(sa, data) {
  const el = qs('strengthVolumeProgressionSection');
  if (!el) return;

  el.innerHTML = `
    <h2 class="section-header mt-2">Volume Progression</h2>
    <article class="card-dark p-3 mb-3">
      <div id="strengthVolProgressChart"></div>
    </article>`;

  const chartEl = qs('strengthVolProgressChart');
  if (chartEl) {
    renderVolumeProgressionChart(chartEl, data.weekLabels, sa.volSeries, sa.weeklyRolling, sa.volTrendLine);
  }
}

// ---- Training Heatmap ---------------------------------------------------
function renderStrengthHeatmap(data) {
  const el = qs('strengthHeatmapSection');
  if (!el) return;

  el.innerHTML = `
    <h2 class="section-header mt-2">Training Calendar</h2>
    <article class="card-dark p-3 mb-3">
      <div id="strengthCalendarHeatmap"></div>
    </article>`;

  const calEl = qs('strengthCalendarHeatmap');
  if (calEl && data._trainingDays) {
    renderVolumeCalendarHeatmap(calEl, data._trainingDays, data.weekLabels, data.volData);
  }
}

// ---- Main Export (V2: Overview | Stats, headline number + spark) --------
let _strengthTab = 'overview';
export function setStrengthTab(tab) { _strengthTab = tab === 'stats' ? 'stats' : 'overview'; }

// The single top lift by estimated 1RM, or null.
function _topLift(dynamicStats) {
  const entries = Object.entries(dynamicStats || {})
    .filter(([, v]) => v.allTimeMax > 0)
    .sort(([, a], [, b]) => b.allTimeMax - a.allTimeMax);
  return entries[0] ? { name: entries[0][0], ...entries[0][1] } : null;
}

export function renderStrengthAnalytics(data, getState, getDays) {
  const appState  = getState ? getState() : {};
  const days      = getDays ? getDays() : [];
  const maxWeek   = data.weekLabels.length;

  const sa = computeStrengthAnalytics(appState, days, maxWeek, { weekStart: getSelectedWeekStart() });
  const la = computeLoadAnalytics(appState, days, maxWeek);
  const allInsights = rankInsights([
    ...generateStrengthInsights({
      volSeries: sa.volSeries, volProgPct: sa.volProgPct,
      liftProgression: sa.liftProgression, muscleStatus: sa.muscleStatus, acwr: sa.tonnageACWR,
    }),
    ...generateLoadInsights({
      atl: la.currentATL, ctl: la.currentCTL, ratio: la.currentRatio,
      loadProgPct: la.loadProgPct, fatigue: la.fatigue, loadStatus: la.loadStatus,
    }),
  ]);

  const section = qs('analytics-strength');
  if (!section) return;
  section.innerHTML = screenTabBar(_strengthTab) + `<div id="strength-tab-body"></div>`;
  const body = qs('strength-tab-body');

  if (_strengthTab === 'stats') _renderStrengthStats(body, data, sa, la, appState);
  else _renderStrengthOverview(body, data, sa, allInsights, appState, days, maxWeek);

  mountScreenTabs('analytics-strength', (tab) => {
    _strengthTab = tab;
    renderStrengthAnalytics(data, getState, getDays);
  });
}

// Overview: headline est-1RM number + its trend spark + the two numbers that
// matter + ONE synthesized insight. The depth lives one tap away in Stats.
function _renderStrengthOverview(body, data, sa, insights, appState, days, maxWeek) {
  const top = _topLift(data.dynamicStats);
  const volChart = buildWeekChart(appState, { type: 'strength', metric: 'volume', weekOffset: getCalendarWeekOffset() });
  const volCur   = volChart.total;
  const volCmp   = statComparisonFrom(volChart);
  // Calendar-week strength summary for the SELECTED week (follows the navigator),
  // every comparison same-exercise. Replaces the old program-week e1RM delta.
  const cs = calendarStrengthSummary(appState, { weekStart: getSelectedWeekStart() });

  let hero;
  if (top) {
    // Hero is the ALL-TIME top lift; the spark is its best e1RM by CALENDAR week.
    const series = calendarWeekE1rmSeriesForLift(appState, top.name, { weeks: 12 });
    const prChip = cs.prCount > 0
      ? `<span class="an-hero__delta" style="color:#10b981">🏆 ${cs.prCount} new PR${cs.prCount === 1 ? '' : 's'} this week</span>`
      : '';
    hero = `<article class="card-dark an-hero">
      <div class="an-hero__k">All-time est. 1RM · ${esc(top.name)}</div>
      <div class="an-hero__val">${Math.round(top.allTimeMax)}<span class="an-hero__unit">kg</span></div>
      ${prChip}
      ${_spark(series, '#3b82f6')}
    </article>`;
  } else {
    hero = `<article class="card-dark an-hero">
      <div class="an-hero__k">Estimated 1RM</div>
      <div class="an-hero__val">—</div>
      <div class="an-hero__empty">Log working sets to see your top lift.</div>
    </article>`;
  }

  // On a deload week, show the deload line — never "below effective volume, add
  // sets", which is exactly the plan and would contradict the coach (§2.2).
  const shownInsights = isProgramDeloadWeek(appState, resolveProgramForState(appState, appState.activeProgramId))
    ? [deloadInsight()] : insights.slice(0, 1);

  body.innerHTML = `
    ${_thisWeekSessionsStripHTML(appState, days)}
    ${hero}
    <div class="grid-2-col gap-2 mb-2">
      ${statCard(_weeklyE1rmCard(cs))}
      ${statCard({ label: 'Weekly Volume', value: fmtKg(volCur), delta: volCmp.deltaPct, sub: volCmp.sub, color: '#8b5cf6', action: 'open-analytics', context: 'weekly-volume', parentContext: 'strength', preserveWeek: true })}
    </div>
    ${shownInsights[0] ? renderInsightsHTML(shownInsights, 1) : ''}
  `;
}

// The "e1RM change" card params, calendar-correct + honest about missing data.
// Never compares two different lifts and never reads a stale program week.
function _weeklyE1rmCard(cs) {
  if (!cs.hasCurrentWork) {
    return { label: 'e1RM Change', value: '—', sub: 'No strength work logged this week', color: '#64748b' };
  }
  if (cs.topChange) {
    const d = Math.round(cs.topChange.deltaKg);
    return {
      label: 'e1RM Change',
      value: `${d >= 0 ? '+' : ''}${d} kg`,
      sub: `${cs.topChange.exerciseName} vs previous week`,
      color: d > 0 ? '#10b981' : d < 0 ? '#ef4444' : '#94a3b8',
    };
  }
  // Trained this week, but no same-exercise result last week to compare against.
  return {
    label: 'e1RM This Week',
    value: `${Math.round(cs.bestThisWeek.e1rm)} kg`,
    sub: `Best ${cs.bestThisWeek.exerciseName} · no prior week`,
    color: '#3b82f6',
  };
}

// "This week's sessions" strip — a tappable chip per trained day this week, in
// weekday order, opening the session-detail modal (which shows a vs-last-week
// comparison). The one-tap route from Strength insights into "last week's Push
// vs this week's Push".
const _DAY_ABBR = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
function _thisWeekSessionsStripHTML(appState, days) {
  const chips = strengthSessionChipModels(appState, days);
  if (!chips.length) return '';
  return `<div class="sw-sessions">
    <div class="sw-sessions__title">This week's sessions</div>
    <div class="sw-sessions__row">${chips.map(chip => `<button class="sw-session-chip" data-action="open-session-detail" data-week="${esc(chip.weekKey)}" data-day="${esc(chip.sourceDay)}" data-datelabel="${esc(chip.title)}">
      <span class="sw-session-chip__day">${_DAY_ABBR[chip.calendarDay] || esc(chip.calendarDay)}</span>
      <span class="sw-session-chip__title">${esc(chip.title)}</span>
      <span class="sw-session-chip__vol">${Math.round(chip.totalVolume)} ${esc(chip.unit)} vol</span>
    </button>`).join('')}</div>
    <div class="sw-sessions__hint">Tap a session to see it and compare with last week.</div>
  </div>`;
}

/**
 * Resolve each calendar-day chip back to the exact program workout that was
 * logged. A moved workout keeps Tuesday as its performed day while retaining
 * Monday as its prescription/detail identity.
 */
export function strengthSessionChipModels(appState, days, opts = {}) {
  // "This week" = the current CALENDAR week. Assemble it from real stamped dates
  // (a day may live in any program-week slot) so the strip can never echo a
  // frozen program week's stale sessions. Each chip also keeps its SOURCE
  // program/week/day so a rescheduled workout is named and opened correctly.
  const weekStart = opts.weekStart || weekStartOf(localDayKey(new Date()));
  const weekData = collectCalendarWeek(appState, weekStart);
  const activeProgram = resolveProgramForState(appState, appState.activeProgramId);
  const unit = appState.settings?.weightUnit || 'kg';

  const chips = [];
  weekData.sourceSlots.forEach((source) => {
    const d = source.day;
    const sourceWeek = appState.weeks?.[source.weekKey] || {};
    const { totalVolume } = summarizeSessionLifts({ lifts: sourceWeek.lifts || {} }, source.sourceDay);
    if (totalVolume <= 0) return; // only days with logged lifting
    const sourceDay = source.sourceDay || d;
    const sourceProgram = source.programId
      ? resolveProgramForState(appState, source.programId)
      : activeProgram;
    chips.push({
      calendarDay: d,
      sourceDay,
      weekKey: String(source.weekKey ?? source.weekNum ?? appState.currentWeek ?? '1'),
      title: source.sessionTitle || sourceProgram?.days?.[sourceDay]?.title || 'Workout',
      totalVolume,
      unit,
    });
  });
  return chips;
}

// Stats: the full strength engine, one tap deeper. Absorbs the old 1RM (strength_pr)
// and Weekly-Volume leaves so each fact lives in exactly one place.
function _renderStrengthStats(body, data, sa, la, appState) {
  body.innerHTML = `
    <div id="strengthTrainingLoadDashboard"></div>
    <div id="strengthVolumeProgressionSection"></div>
    <div id="strengthProgressionSection"></div>
    <div id="muscleGroupAnalysisSection"></div>
    <div id="strengthHeatmapSection"></div>
    <h2 class="section-header mt-2">Lift PRs · est. 1RM</h2>
    <div id="allLiftsRmContainer"></div>
  `;
  renderTrainingLoadDashboard(sa, la, data.weekLabels, appState);
  renderVolumeSection(sa, data);
  renderStrengthProgression(sa, data.weekLabels);
  renderMuscleGroupAnalysis(sa, appState);
  renderStrengthHeatmap(data);
  // Calendar-week per-lift maxes for the selected week + its predecessor, plus the
  // set of lifts at a new calendar-week PR — so "this week / vs last week / PR" in
  // the list are all real-date based (same-exercise), never program-week buckets.
  const cs = calendarStrengthSummary(appState, { weekStart: getSelectedWeekStart() });
  const calStats = {
    curByLift:  bestE1rmByLiftForWeek(appState, { weekStart: cs.weekKey }),
    prevByLift: bestE1rmByLiftForWeek(appState, { weekStart: cs.prevWeekKey }),
    prSet:      new Set(cs.prLifts),
  };
  render1RMList(qs('allLiftsRmContainer'), data.dynamicStats, calStats);
}

// Per-lift PR list. `allTimeMax` (from dynamicStats) is the all-time headline;
// `calStats` supplies the CALENDAR-week "this week / vs last week / PR" figures
// (same exercise only). `calStats` optional → all-time-only rendering.
export function render1RMList(container, dynamicStats, calStats = null) {
  const entries = Object.entries(dynamicStats)
    .filter(([, v]) => v.allTimeMax > 0)
    .sort(([, a], [, b]) => b.allTimeMax - a.allTimeMax);

  if (entries.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Complete sets to populate lift PRs.</p>';
    return;
  }

  const cal = calStats || { curByLift: {}, prevByLift: {}, prSet: new Set() };
  const prCount  = cal.prSet.size;
  const maxAllTime = entries[0][1].allTimeMax;

  const rows = entries.map(([name, statData]) => {
    const pct  = Math.min(100, Math.max(5, Math.round((statData.allTimeMax / maxAllTime) * 100)));
    const cur  = cal.curByLift[name]?.bestEstimated1RM || 0;
    const prev = cal.prevByLift[name]?.bestEstimated1RM || 0;
    const isCurrentWeekPR = cal.prSet.has(name);

    const badge = isCurrentWeekPR
      ? `<span style="font-size:0.7rem;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981;border-radius:4px;padding:2px 6px;margin-left:6px;">PR</span>`
      : '';

    let deltaHtml = '';
    if (cur > 0 && prev > 0) {
      const delta = cur - prev;
      const sign  = delta >= 0 ? '+' : '';
      const col   = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--text-muted)';
      deltaHtml   = `<span style="font-size:0.72rem;color:${col};margin-left:6px;">${sign}${Math.round(delta)} kg vs last wk</span>`;
    } else if (cur > 0) {
      deltaHtml = `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">This week: ~${Math.round(cur)} kg</span>`;
    }

    return `<div class="mb-4">
      <div class="flex-between font-bold mb-1">
        <button class="an-entity-link text-sm" data-action="open-analytics" data-context="exercise" data-entity="${esc(canonicalExerciseId(name) || `custom:${name}`)}" data-entity-name="${esc(name)}" data-parent-context="strength">${esc(name)}${badge}<span aria-hidden="true">›</span></button>
        <span style="color:#3b82f6;" class="text-base">${Math.round(statData.allTimeMax)} kg</span>
      </div>
      ${deltaHtml ? `<div class="mb-2">${deltaHtml}</div>` : ''}
      <div class="trend-track-bg" style="height:10px;border-radius:5px;">
        <div class="trend-track-fill" style="width:${pct}%;background:#3b82f6;border-radius:5px;"></div>
      </div>
    </div>`;
  }).join('');

  const summaryBar = prCount > 0
    ? `<div class="flex-between mb-4 p-3 card-dark" style="border:1px solid rgba(16,185,129,0.3);">
        <span class="text-sm text-muted">PRs set this week</span>
        <span class="font-heavy" style="color:#10b981;">${prCount} lift${prCount !== 1 ? 's' : ''}</span>
       </div>`
    : '';

  container.innerHTML = summaryBar + rows;
}

export function render1RMProgressSection(sectionEl, weekLabels, getState, getDays) {
  if (!sectionEl) return;

  const prListEl = sectionEl.querySelector('#allLiftsRmContainer_PR');
  if (!prListEl) return;

  let container = sectionEl.querySelector('#rmProgressChartContainer');
  if (!container) {
    const headerEl = document.createElement('h2');
    headerEl.className = 'section-header mt-3 rm-progress-header';
    headerEl.textContent = '1RM Progress';
    container = document.createElement('div');
    container.id = 'rmProgressChartContainer';
    prListEl.before(headerEl);
    headerEl.after(container);
  }

  const appState    = getState();
  const defaultDays = getDays();
  const sqData = [], bpData = [], dlData = [];

  for (let w = 1; w <= weekLabels.length; w++) {
    const wKey   = w.toString();
    const wkData = appState.weeks?.[wKey];
    let sqMax = 0, bpMax = 0, dlMax = 0;

    if (wkData) {
      defaultDays.forEach(d => {
        const dayLifts = wkData.lifts?.[d] || {};
        for (const lift in dayLifts) {
          if (!Array.isArray(dayLifts[lift])) continue;
          const exerciseId = canonicalExerciseId(lift);
          dayLifts[lift].forEach(s => {
            const weight = parseFloat(s.w) || 0;
            const reps   = parseInt(s.r, 10) || 0;
            if (!isValidWorkingSet(s) || weight <= 0 || reps <= 0) return;
            const e1rm = estimatedE1rmForSet(lift, s);
            if (exerciseId === 'back_squat') sqMax = Math.max(sqMax, e1rm);
            if (exerciseId === 'barbell_bench_press') bpMax = Math.max(bpMax, e1rm);
            if (exerciseId === 'conventional_deadlift') dlMax = Math.max(dlMax, e1rm);
          });
        }
      });
    }

    sqData.push(sqMax);
    bpData.push(bpMax);
    dlData.push(dlMax);
  }

  render1RMProgressChart(container, weekLabels, sqData, bpData, dlData);
}
