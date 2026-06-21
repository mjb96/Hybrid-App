// ==========================================
// WEEKLY FITNESS GRAPH — Garmin Connect-style
// Renders inside the In Focus carousel cards.
// ==========================================

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
    this._workouts    = {};   // date-string → workout object (for modal)
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

    const appState  = this.getState?.();
    const dates     = this._windowDates(appState);
    const workouts  = this._loadData(dates, appState);

    // Cache for modal access
    this._workouts = {};
    workouts.forEach(w => { this._workouts[w.date] = w; });

    const values  = dates.map(d => (this._workouts[d] ? this._metricVal(this._workouts[d]) : 0));
    const maxVal  = Math.max(...values, 1);
    const yStep   = maxVal / Y_STEPS;
    const total   = values.reduce((a, b) => a + b, 0);
    const avg     = total / 7;

    const tabs     = this._tabs();
    const canBack  = this.weekOffset > -((parseInt(appState?.currentWeek, 10) || 1) - 1);
    const canFwd   = this.weekOffset < 0;
    const rangeStr = this._rangeLabel(dates[0], dates[6]);
    const mLabel   = tabs.find(t => t.key === this.activeMetric)?.label || '';

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
    const barsHTML = dates.map((date, i) => {
      const w    = this._workouts[date];
      const val  = values[i];
      const barH = val > 0 ? Math.max(Math.round((val / maxVal) * CHART_H), 4) : 0;
      return `<div class="wfg-dc">${w && barH > 0
        ? `<button class="wfg-bb"
                   data-wfg-action="bar-click"
                   data-wfg-date="${date}"
                   title="${this._fmtFull(val)}">
             <div class="wfg-b wfg-b--${this.type}" style="height:${barH}px"></div>
           </button>`
        : `<div class="wfg-empty"></div>`
      }</div>`;
    }).join('');

    // X-axis (dots + first/last date labels)
    const xHTML = dates.map((date, i) => {
      const active = !!this._workouts[date];
      const lbl    = (i === 0 || i === 6) ? this._fmtDate(date) : '';
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

  _openModal(dateStr) {
    const w = this._workouts[dateStr];
    if (!w) return;

    const modal   = document.getElementById('wfgModal');
    const content = document.getElementById('wfgModalContent');
    if (!modal || !content) return;

    const [y, mo, d] = dateStr.split('-').map(Number);
    const MN = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dow = DN[new Date(`${dateStr}T12:00:00`).getDay()];

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
      <p class="wfg-mdate">${dow}, ${d} ${MN[mo]} ${y}</p>
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
    const weekNum = this._targetWeekNum(appState);
    const start   = this._weekStartDate(weekNum, appState);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }

  _targetWeekNum(appState) {
    const current = parseInt(appState?.currentWeek, 10) || 1;
    return Math.max(1, current + this.weekOffset);
  }

  _weekStartDate(weekNum, appState) {
    if (appState?.weekStartedAt) {
      const base = new Date(appState.weekStartedAt);
      const d    = new Date(base);
      d.setDate(base.getDate() + (weekNum - 1) * 7);
      return d;
    }
    // Fallback: anchor to the Monday of this calendar week
    const today   = new Date();
    const monday  = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setDate(monday.getDate() + (weekNum - 1) * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
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
                  if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) sets++;
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

    // For past weeks with no real data, surface mock data so the chart
    // doesn't appear completely empty (demo / first-run experience).
    const currentWeek = parseInt(appState?.currentWeek, 10) || 1;
    if (result.length === 0 && weekNum < currentWeek) {
      return this._mockData(dates, weekNum);
    }

    return result;
  }

  _mockData(dates, weekNum) {
    const gymDays = [0, 1, 3, 4];   // Mon Tue Thu Fri
    const runDays = [2, 4, 6];      // Wed Fri Sun
    const days    = this.type === 'strength' ? gymDays : runDays;

    return days.map(i => {
      const v = 0.25 + ((i * 3 + weekNum * 7) % 100) / 100;
      if (this.type === 'strength') {
        return {
          date: dates[i],
          durationSeconds: Math.round(2400 + v * 2400),
          calories: Math.round(280 + v * 280),
          workoutId: `mock-gym-${weekNum}-${i}`,
        };
      }
      return {
        date: dates[i],
        durationSeconds: Math.round(1200 + v * 2400),
        distanceKm: parseFloat((3.5 + v * 9).toFixed(1)),
        ascentM: Math.round(15 + v * 130),
        calories: Math.round(180 + v * 320),
        workoutId: `mock-run-${weekNum}-${i}`,
      };
    });
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
    const [, mo, d] = dateStr.split('-').map(Number);
    return `${d}/${mo}`;
  }

  _rangeLabel(startStr, endStr) {
    const [, m1, d1] = startStr.split('-').map(Number);
    const [, m2, d2] = endStr.split('-').map(Number);
    const M = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m1 === m2
      ? `${d1}–${d2} ${M[m1]}`
      : `${d1} ${M[m1]} – ${d2} ${M[m2]}`;
  }
}
