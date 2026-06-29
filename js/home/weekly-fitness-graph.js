// ==========================================
// WEEKLY FITNESS GRAPH — Garmin Connect-style
// Renders inside the In Focus carousel cards.
// ==========================================
import { isCompletedSet } from '../set-utils.js';

const DAY_KEYS  = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const CHART_H   = 120;  // bars area height in px
const Y_STEPS   = 4;    // intervals between Y-axis labels (5 labels total)

// Singleton registry — one instance per container id
const _registry = {};

/**
 * Create and mount a WeeklyFitnessGraph inside `containerId`.
 * Safe to call multiple times; re-mounts if the container was cleared.
 */
export function initWeeklyFitnessGraph(containerId, type, getStateFn) {
  let graph = _registry[containerId];
  if (!graph) {
    graph = new WeeklyFitnessGraph(containerId, type, getStateFn);
    _registry[containerId] = graph;
  }
  graph.mount();
  return graph;
}

/** Re-render a mounted graph (call this when app state changes). */
export function refreshWeeklyFitnessGraph(containerId) {
  _registry[containerId]?._render();
}

// ── Global modal close handler ──────────────────────────────────────────────
document.addEventListener('click', e => {
  const modal = document.getElementById('wfgModal');
  if (!modal || !modal.classList.contains('wfg-modal--open')) return;
  if (e.target === modal || e.target.closest('[data-wfg-action="close-modal"]')) {
    modal.classList.remove('wfg-modal--open');
  }
});

// ── Component class ─────────────────────────────────────────────────────────

class WeeklyFitnessGraph {
  /**
   * @param {string}            containerId  DOM element id to render into
   * @param {'strength'|'running'} type
   * @param {() => object}      getState     returns current appState
   */
  constructor(containerId, type, getState) {
    this.containerId  = containerId;
    this.type         = type;
    this.getState     = getState;
    this.weekOffset   = 0;    // 0 = current week, -1 = last week, …
    this.activeMetric = type === 'strength' ? 'time' : 'distance';
    this._container   = null;
    this._workouts    = {};   // workoutId → workout object (for modal)
  }

  // ── Mount / update ────────────────────────────────────────────────────────

  mount() {
    this._container = document.getElementById(this.containerId);
    if (!this._container) return;

    // Expand the container and switch to block layout so the .wfg child fills
    // the full card width (the default flex row context would shrink it).
    this._container.style.cssText = 'display:block;height:auto;min-height:0;overflow:visible;';

    // Hide the legacy large-number hero / sub-text elements
    const heroId = this.type === 'strength' ? 'focusStrengthHero' : 'focusRunHero';
    const subId  = this.type === 'strength' ? 'focusStrengthSub'  : 'focusRunSub';
    [heroId, subId].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // One-time container-level listener — stops propagation so the parent
    // card's data-action="open-analytics" doesn't fire on chart clicks.
    if (!this._container._wfgBound) {
      this._container._wfgBound = true;
      this._container.addEventListener('click', e => {
        const el = e.target.closest('[data-wfg-action]');
        if (!el) return;
        e.stopPropagation();
        this._handleAction(el);
      });
    }

    this._render();
  }

  // ── Internal action dispatcher ────────────────────────────────────────────

  _handleAction(el) {
    switch (el.getAttribute('data-wfg-action')) {
      case 'nav-prev':
        if (!el.disabled) { this.weekOffset--; this._render(); }
        break;
      case 'nav-next':
        if (!el.disabled) { this.weekOffset++; this._render(); }
        break;
      case 'set-metric':
        this.activeMetric = el.getAttribute('data-wfg-metric');
        this._render();
        break;
      case 'bar-click':
        this._openModal(el.getAttribute('data-wfg-date'));
        break;
    }
  }

  // ── Core render ───────────────────────────────────────────────────────────

  _render() {
    if (!this._container) return;

    const appState = this.getState?.();
    const weekNum  = this._targetWeekNum(appState);
    const dates    = this._windowDates(appState);
    const workouts = this._loadData(dates, appState);

    // Cache by workoutId (always unique) for bar-click → modal lookup
    this._workouts = {};
    workouts.forEach(w => { this._workouts[w.workoutId] = w; });

    const prefix = this.type === 'strength' ? 'gym' : 'run';
    const values = DAY_KEYS.map(dk => {
      const w = this._workouts[`${prefix}-${weekNum}-${dk}`];
      return w ? this._metricVal(w) : 0;
    });
    const maxVal = Math.max(...values, 1);
    const yStep  = maxVal / Y_STEPS;
    const total  = values.reduce((a, b) => a + b, 0);
    const avg    = total / 7;

    const tabs    = this._tabs();
    const canBack = this.weekOffset > -((parseInt(appState?.currentWeek, 10) || 1) - 1);
    const canFwd  = this.weekOffset < 0;
    const nonNullDates = dates.filter(Boolean).sort();
    const rangeStr = nonNullDates.length > 0
      ? this._rangeLabel(nonNullDates[0], nonNullDates[nonNullDates.length - 1])
      : `Week ${weekNum}`;
    const mLabel = tabs.find(t => t.key === this.activeMetric)?.label || '';

    // Y-axis labels — rendered bottom-to-top so flex-direction:column-reverse
    // displays them at 0%, 25%, 50%, 75%, 100% from the bottom.
    const yLabelsHTML = Array.from({ length: Y_STEPS + 1 }, (_, i) =>
      `<span class="wfg-yl">${this._fmtY(yStep * i)}</span>`
    ).join('');

    // Grid lines at matching percentages
    const gridHTML = Array.from({ length: Y_STEPS + 1 }, (_, i) =>
      `<div class="wfg-gl" style="bottom:${(i / Y_STEPS) * 100}%"></div>`
    ).join('');

    // Day columns (bars)
    const barsHTML = DAY_KEYS.map((dk, i) => {
      const workoutId = `${prefix}-${weekNum}-${dk}`;
      const w   = this._workouts[workoutId];
      const val = values[i];
      const barH = val > 0 ? Math.max(Math.round((val / maxVal) * CHART_H), 4) : 0;
      return `<div class="wfg-dc">${w && barH > 0
        ? `<button class="wfg-bb"
                   data-wfg-action="bar-click"
                   data-wfg-date="${workoutId}"
                   title="${this._fmtFull(val)}">
             <div class="wfg-b wfg-b--${this.type}" style="height:${barH}px"></div>
           </button>`
        : `<div class="wfg-empty"></div>`
      }</div>`;
    }).join('');

    // X-axis (dots + first/last date labels)
    const xHTML = DAY_KEYS.map((dk, i) => {
      const workoutId = `${prefix}-${weekNum}-${dk}`;
      const active = !!this._workouts[workoutId];
      const lbl    = (i === 0 || i === 6) ? this._fmtDate(dates[i]) : '';
      return `<div class="wfg-xd">
        <div class="wfg-dot${active ? ' wfg-dot--on' : ''}"></div>
        <span class="wfg-xl">${lbl}</span>
      </div>`;
    }).join('');

    // Metric tabs
    const tabsHTML = tabs.map(t =>
      `<button class="wfg-tab${t.key === this.activeMetric ? ' wfg-tab--on' : ''}"
               data-wfg-action="set-metric"
               data-wfg-metric="${t.key}">${t.label}</button>`
    ).join('');

    this._container.innerHTML = `
<div class="wfg">
  <div class="wfg-nav">
    <button class="wfg-arrow" data-wfg-action="nav-prev" ${canBack ? '' : 'disabled'}>‹</button>
    <span class="wfg-range">${rangeStr}</span>
    <button class="wfg-arrow" data-wfg-action="nav-next" ${canFwd ? '' : 'disabled'}>›</button>
  </div>
  <div class="wfg-tabs">${tabsHTML}</div>
  <div class="wfg-chart-row">
    <div class="wfg-y" style="height:${CHART_H}px">${yLabelsHTML}</div>
    <div class="wfg-right">
      <div class="wfg-plot" style="height:${CHART_H}px">
        ${gridHTML}
        <div class="wfg-bars">${barsHTML}</div>
      </div>
      <div class="wfg-xaxis">${xHTML}</div>
    </div>
  </div>
  <div class="wfg-footer">
    <div class="wfg-stat">
      <span class="wfg-stl">Total ${mLabel}</span>
      <span class="wfg-stv">${this._fmtFull(total)}</span>
    </div>
    <div class="wfg-stat wfg-stat--r">
      <span class="wfg-stl">Avg Daily</span>
      <span class="wfg-stv">${this._fmtFull(avg)}</span>
    </div>
  </div>
</div>`;
  }

  // ── Workout summary modal ─────────────────────────────────────────────────

  _openModal(workoutId) {
    const w = this._workouts[workoutId];
    if (!w) return;

    const modal   = document.getElementById('wfgModal');
    const content = document.getElementById('wfgModalContent');
    if (!modal || !content) return;

    const MN = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    let dateLine = '';
    if (w.date) {
      const [y, mo, d] = w.date.split('-').map(Number);
      const dow = DN[new Date(`${w.date}T12:00:00`).getDay()];
      dateLine = `<p class="wfg-mdate">${dow}, ${d} ${MN[mo]} ${y}</p>`;
    }

    const icon  = this.type === 'strength' ? '🏋️' : '🏃';
    const title = this.type === 'strength' ? 'Gym Session' : 'Run Session';

    const stats    = this._modalStats(w);
    const statsHTML = stats.map(s =>
      `<div class="wfg-ms">
         <span class="wfg-msl">${s.label}</span>
         <span class="wfg-msv">${s.value}</span>
       </div>`
    ).join('');

    content.innerHTML = `
      <div class="wfg-mhandle"></div>
      ${dateLine}
      <h3 class="wfg-mtitle">${icon} ${title}</h3>
      <div class="wfg-mstats">${statsHTML || '<p class="wfg-mempty">No detailed stats recorded.</p>'}</div>
      <button class="wfg-mclose" data-wfg-action="close-modal">Done</button>
    `;

    modal.classList.add('wfg-modal--open');
  }

  _modalStats(w) {
    const stats = [];
    const add   = (label, value) => { if (value) stats.push({ label, value }); };
    const raw   = w.rawStats || {};

    if (this.type === 'strength') {
      if (w.durationSeconds > 0) add('Duration',        this._fmtFullTime(w.durationSeconds));
      if (w.calories > 0)         add('Calories',        `${w.calories} kcal`);
      if (raw.avgHR > 0)          add('Avg HR',          `${Math.round(raw.avgHR)} bpm`);
      if (raw.maxHR > 0)          add('Max HR',          `${Math.round(raw.maxHR)} bpm`);
      if (raw.trainingEffect)     add('Training Effect', String(raw.trainingEffect));
      if (raw.estimatedSets)      add('Sets Logged',     String(raw.estimatedSets));
    } else {
      if (w.distanceKm > 0)       add('Distance', `${w.distanceKm.toFixed(2)} km`);
      if (w.durationSeconds > 0)  add('Time',     this._fmtFullTime(w.durationSeconds));
      if (w.distanceKm > 0 && w.durationSeconds > 0) {
        const pps  = w.durationSeconds / w.distanceKm;
        const pm   = Math.floor(pps / 60);
        const ps   = Math.round(pps % 60);
        add('Avg Pace', `${pm}:${String(ps).padStart(2, '0')} /km`);
      }
      if (w.ascentM > 0)          add('Elevation Gain', `${Math.round(w.ascentM)} m`);
      if (w.calories > 0)         add('Calories',       `${w.calories} kcal`);
      if (raw.avgHR > 0)          add('Avg HR',         `${Math.round(raw.avgHR)} bpm`);
      if (raw.rpe)                add('RPE',            `${raw.rpe} / 10`);
      if (raw.notes)              add('Notes',          raw.notes);
    }
    return stats;
  }

  // ── Date helpers ──────────────────────────────────────────────────────────

  _windowDates(appState) {
    const weekNum  = this._targetWeekNum(appState);
    const weekData = appState?.weeks?.[String(weekNum)];
    const stored   = weekData?.dates || {};
    return DAY_KEYS.map(dk => stored[dk] || null);
  }

  _targetWeekNum(appState) {
    const current = parseInt(appState?.currentWeek, 10) || 1;
    return Math.max(1, current + this.weekOffset);
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  _loadData(dates, appState) {
    const weekNum  = this._targetWeekNum(appState);
    const weekData = appState?.weeks?.[String(weekNum)];
    const result   = [];

    DAY_KEYS.forEach((dayKey, i) => {
      const dateStr = dates[i];

      if (this.type === 'strength') {
        const gs = weekData?.gymStats?.[dayKey];
        if (gs && (gs.time || parseFloat(gs.cals) > 0)) {
          result.push({
            date: dateStr,
            durationSeconds: this._parseTime(gs.time),
            calories: Math.round(parseFloat(gs.cals) || 0),
            workoutId: `gym-${weekNum}-${dayKey}`,
            rawStats: gs,
          });
        } else {
          // Estimate from completed sets when no FIT data was imported
          const lifts = weekData?.lifts?.[dayKey];
          if (lifts) {
            let sets = 0;
            for (const l in lifts) {
              if (Array.isArray(lifts[l])) {
                lifts[l].forEach(s => {
                  if (isCompletedSet(s)) sets++;
                });
              }
            }
            if (sets > 0) {
              result.push({
                date: dateStr,
                durationSeconds: sets * 180,   // ~3 min per set
                calories: sets * 12,
                workoutId: `gym-${weekNum}-${dayKey}`,
                rawStats: { estimatedSets: sets },
              });
            }
          }
        }
      } else {
        const run = weekData?.runs?.[dayKey];
        if (run && (parseFloat(run.dist) > 0 || run.time)) {
          result.push({
            date: dateStr,
            durationSeconds: this._parseTime(run.time),
            distanceKm: parseFloat(run.dist) || 0,
            ascentM: parseFloat(run.elev) || 0,
            calories: Math.round(parseFloat(run.cals) || 0),
            workoutId: `run-${weekNum}-${dayKey}`,
            rawStats: run,
          });
        }
      }
    });

    return result;
  }

  _parseTime(str) {
    if (!str) return 0;
    const p = String(str).split(':').map(Number);
    if (p.some(isNaN)) return 0;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return parseInt(str, 10) || 0;
  }

  // ── Metric helpers ────────────────────────────────────────────────────────

  _tabs() {
    return this.type === 'strength'
      ? [
          { key: 'time',     label: 'Time' },
          { key: 'calories', label: 'Calories' },
        ]
      : [
          { key: 'distance', label: 'Distance' },
          { key: 'time',     label: 'Time' },
          { key: 'ascent',   label: 'Ascent' },
          { key: 'calories', label: 'Calories' },
        ];
  }

  _metricVal(w) {
    switch (this.activeMetric) {
      case 'time':     return w.durationSeconds || 0;
      case 'calories': return w.calories || 0;
      case 'distance': return w.distanceKm || 0;
      case 'ascent':   return w.ascentM || 0;
      default:         return 0;
    }
  }

  // Y-axis label — abbreviated (no seconds)
  _fmtY(val) {
    switch (this.activeMetric) {
      case 'time': {
        const h = Math.floor(val / 3600);
        const m = Math.floor((val % 3600) / 60);
        return h > 0
          ? `${h}:${String(m).padStart(2, '0')}`
          : `${m}:${String(Math.floor(val % 60)).padStart(2, '0')}`;
      }
      case 'calories': return Math.round(val).toString();
      case 'distance': return parseFloat(val).toFixed(1);
      case 'ascent':   return Math.round(val).toString();
      default:         return Math.round(val).toString();
    }
  }

  // Full formatted value (used in footer and tooltips)
  _fmtFull(val) {
    switch (this.activeMetric) {
      case 'time':     return this._fmtFullTime(val);
      case 'calories': return `${Math.round(val)} cal`;
      case 'distance': return `${parseFloat(val).toFixed(1)} km`;
      case 'ascent':   return `${Math.round(val)} m`;
      default:         return Math.round(val).toString();
    }
  }

  _fmtFullTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  _fmtDate(dateStr) {
    if (!dateStr) return '';
    const [, mo, d] = dateStr.split('-').map(Number);
    return `${d}/${mo}`;
  }

  _rangeLabel(startStr, endStr) {
    if (!startStr) return '';
    const [, m1, d1] = startStr.split('-').map(Number);
    const M = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (!endStr || startStr === endStr) return `${d1} ${M[m1]}`;
    const [, m2, d2] = endStr.split('-').map(Number);
    return m1 === m2
      ? `${d1}–${d2} ${M[m1]}`
      : `${d1} ${M[m1]} – ${d2} ${M[m2]}`;
  }
}
