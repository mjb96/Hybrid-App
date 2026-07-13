// ==========================================
// WEEKLY FITNESS GRAPH — the home-screen "In Focus" weekly bar chart.
//
// Seven daily bars for the selected week (Mon–Sun), a clear week-range label,
// prev/next navigation, an honest week-to-week comparison, and a tap target
// into the matching analytics detail view. Clean + glanceable, Helyx-styled.
//
// ALL numbers come from the shared `buildWeekChart` model (analytics/
// week-chart-model.js) — the graph never computes analytics itself, so it can
// never diverge from the detail views. This component only formats + renders.
// ==========================================
import { buildWeekChart, STRENGTH_METRICS, RUNNING_METRICS, DAY_KEYS } from '../analytics/week-chart-model.js';

const CHART_H = 120;  // bars area height in px
const Y_STEPS = 4;    // intervals between Y-axis labels (5 labels total)

// Singleton registry — one instance per container id
const _registry = {};

/**
 * Create and mount a WeeklyFitnessGraph inside `containerId`. Idempotent.
 * @param {object} [opts]
 * @param {string} [opts.today] Fixed 'YYYY-MM-DD' local today — TEST-ONLY seam so
 *   the calendar-week model is deterministic; production omits it (real clock).
 */
export function initWeeklyFitnessGraph(containerId, type, getStateFn, opts = {}) {
  let graph = _registry[containerId];
  if (!graph) {
    graph = new WeeklyFitnessGraph(containerId, type, getStateFn);
    _registry[containerId] = graph;
  }
  if (opts.today) graph._today = opts.today;
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
   * @param {string} containerId  DOM element id to render into
   * @param {'strength'|'running'} type
   * @param {() => object} getState  returns current appState
   */
  constructor(containerId, type, getState) {
    this.containerId  = containerId;
    this.type         = type === 'running' ? 'running' : 'strength';
    this.getState     = getState;
    this.weekOffset   = 0; // 0 = current week, -1 = last week, …
    const catalog     = this.type === 'strength' ? STRENGTH_METRICS : RUNNING_METRICS;
    this.activeMetric = Object.keys(catalog)[0]; // sets / distance
    this._container   = null;
    this._weekData    = null; // raw stored week (for the tap-to-detail modal)
  }

  // ── Mount / update ──────────────────────────────────────────────────────

  mount() {
    this._container = document.getElementById(this.containerId);
    if (!this._container) return;

    this._container.style.cssText = 'display:block;height:auto;min-height:0;overflow:visible;';

    // Hide the legacy large-number hero / sub-text elements the graph replaces.
    const heroId = this.type === 'strength' ? 'focusStrengthHero' : 'focusRunHero';
    const subId  = this.type === 'strength' ? 'focusStrengthSub'  : 'focusRunSub';
    [heroId, subId].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    if (!this._container._wfgBound) {
      this._container._wfgBound = true;
      this._container.addEventListener('click', e => {
        const el = e.target.closest('[data-wfg-action]');
        if (!el) return;
        e.stopPropagation(); // don't trigger the card's open-analytics
        this._handleAction(el);
      });
    }

    this._render();
  }

  // ── Action dispatcher ────────────────────────────────────────────────────

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
        this._openModal(el.getAttribute('data-wfg-day'));
        break;
      case 'open-detail':
        this._openDetail();
        break;
    }
  }

  _openDetail() {
    // Route to the matching analytics detail view via the app's action router.
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'open-analytics');
    cta.setAttribute('data-context', this.type);
    cta.style.display = 'none';
    document.body.appendChild(cta);
    cta.click();
    cta.remove();
  }

  // ── Core render ──────────────────────────────────────────────────────────

  _render() {
    if (!this._container) return;
    const appState = this.getState?.() || {};
    const settings = appState.settings || {};

    const chart = buildWeekChart(appState, {
      type: this.type,
      metric: this.activeMetric,
      weekOffset: this.weekOffset,
      today: this._today, // undefined in production → real local today
    });
    // Keep the calendar week's assembled data for the tap-to-detail modal (it
    // carries the real dates + the slots that own them).
    this._weekData = chart.weekData || null;

    // Respect the user's week-start preference for DISPLAY ordering only.
    const sunFirst = (settings.weekStartDay === 'sun');
    const order = sunFirst ? ['sun', ...DAY_KEYS.slice(0, 6)] : DAY_KEYS;
    const orderedDays = order.map(dk => chart.days.find(d => d.dayKey === dk));

    const values = orderedDays.map(d => d.value);
    const maxVal = Math.max(...values, this.activeMetric === 'sets' ? 4 : 1);
    const yStep  = maxVal / Y_STEPS;

    const canBack = chart.canGoBack;
    const canFwd  = this.weekOffset < 0;

    const rangeStr = this._rangeLabel(chart);
    const mInfo    = chart.metricInfo;

    // Y-axis labels (bottom-to-top via column-reverse in CSS).
    const yLabelsHTML = Array.from({ length: Y_STEPS + 1 }, (_, i) =>
      `<span class="wfg-yl">${this._fmtY(yStep * i, settings)}</span>`
    ).join('');

    const gridHTML = Array.from({ length: Y_STEPS + 1 }, (_, i) =>
      `<div class="wfg-gl" style="bottom:${(i / Y_STEPS) * 100}%"></div>`
    ).join('');

    // Bars.
    const barsHTML = orderedDays.map((d, i) => {
      const val  = values[i];
      const barH = val > 0 ? Math.max(Math.round((val / maxVal) * CHART_H), 4) : 0;
      const aria = this._barAria(d, settings);
      const cls  = 'wfg-b wfg-b--' + this.type + (d.isToday ? ' wfg-b--today' : '');
      if (d.hasData && barH > 0) {
        return `<div class="wfg-dc${d.isToday ? ' wfg-dc--today' : ''}">
          <button class="wfg-bb" data-wfg-action="bar-click" data-wfg-day="${d.dayKey}"
                  aria-label="${aria}" title="${this._fmtFull(val, settings)}">
            <div class="${cls}" style="height:${barH}px"></div>
          </button>
        </div>`;
      }
      return `<div class="wfg-dc${d.isToday ? ' wfg-dc--today' : ''}${d.isFuture ? ' wfg-dc--future' : ''}">
        <div class="wfg-empty${d.isFuture ? ' wfg-empty--future' : ''}" role="img" aria-label="${aria}"></div>
      </div>`;
    }).join('');

    // X-axis: concise day letters + activity dot + today marker.
    const xHTML = orderedDays.map(d =>
      `<div class="wfg-xd${d.isFuture ? ' wfg-xd--future' : ''}">
        <div class="wfg-dot${d.hasData ? ' wfg-dot--on' : ''}${d.isToday ? ' wfg-dot--today' : ''}"></div>
        <span class="wfg-xl${d.isToday ? ' wfg-xl--today' : ''}">${d.dayLabel}</span>
      </div>`
    ).join('');

    // Metric tabs (only render the switch when there is more than one metric).
    const catalog = this.type === 'strength' ? STRENGTH_METRICS : RUNNING_METRICS;
    const tabs = Object.values(catalog);
    const tabsHTML = tabs.length > 1 ? `<div class="wfg-tabs" role="tablist">${tabs.map(t =>
      `<button class="wfg-tab${t.key === this.activeMetric ? ' wfg-tab--on' : ''}"
               role="tab" aria-selected="${t.key === this.activeMetric}"
               data-wfg-action="set-metric" data-wfg-metric="${t.key}">${t.short}</button>`
    ).join('')}</div>` : '';

    const totalStr = this._fmtFull(chart.total, settings);
    const compHTML = this._comparisonHTML(chart, settings);
    const summaryAria = this._chartSummaryAria(chart, orderedDays, settings, rangeStr);

    this._container.innerHTML = `
<div class="wfg">
  <div class="wfg-nav">
    <button class="wfg-arrow" data-wfg-action="nav-prev" ${canBack ? '' : 'disabled'}
            aria-label="Previous week">‹</button>
    <span class="wfg-range">${rangeStr}</span>
    <button class="wfg-arrow" data-wfg-action="nav-next" ${canFwd ? '' : 'disabled'}
            aria-label="Next week">›</button>
  </div>
  ${tabsHTML}
  <div class="wfg-chart-row">
    <div class="wfg-y" style="height:${CHART_H}px" aria-hidden="true">${yLabelsHTML}</div>
    <div class="wfg-right">
      <div class="wfg-plot" style="height:${CHART_H}px" role="img" aria-label="${summaryAria}">
        ${gridHTML}
        <div class="wfg-bars">${barsHTML}</div>
      </div>
      <div class="wfg-xaxis" aria-hidden="true">${xHTML}</div>
    </div>
  </div>
  <div class="wfg-summary">
    <div class="wfg-total">
      <span class="wfg-total-v">${totalStr}</span>
      <span class="wfg-total-l">${chart.isCurrentWeek ? 'this week' : mInfo.label.toLowerCase()}</span>
    </div>
    ${compHTML}
  </div>
  <button class="wfg-detail-link" data-wfg-action="open-detail"
          aria-label="Open ${this.type === 'strength' ? 'strength' : 'running'} analytics">
    View ${this.type === 'strength' ? 'strength' : 'running'} details ›
  </button>
</div>`;
  }

  // ── Comparison line ──────────────────────────────────────────────────────

  _comparisonHTML(chart, settings) {
    const c = chart.comparison;
    if (!c.isComparable) {
      // Honest, non-numeric messages (no fabricated %).
      const extra = (c.absoluteChange && c.direction === 'up')
        ? ` (+${this._fmtDelta(c.absoluteChange, settings)})` : '';
      return `<div class="wfg-compare wfg-compare--muted">${c.message}${extra}</div>`;
    }
    const arrow = c.direction === 'up' ? '▲' : c.direction === 'down' ? '▼' : '■';
    const word  = c.direction === 'up' ? 'Up' : c.direction === 'down' ? 'Down' : 'Level';
    const cls   = c.direction === 'up' ? 'wfg-compare--up'
                : c.direction === 'down' ? 'wfg-compare--down' : 'wfg-compare--flat';
    const pct   = Math.abs(c.percentageChange);
    const abs   = this._fmtDelta(Math.abs(c.absoluteChange), settings);
    const aria  = `${word} ${pct}%, ${c.direction === 'down' ? 'minus' : 'plus'} ${abs}, ${c.comparisonLabel}`;
    return `<div class="wfg-compare ${cls}" aria-label="${aria}">
      <span class="wfg-compare-badge"><span aria-hidden="true">${arrow}</span> ${pct}%</span>
      <span class="wfg-compare-label">${c.comparisonLabel}</span>
    </div>`;
  }

  // ── Accessible label builders ────────────────────────────────────────────

  _barAria(d, settings) {
    const dayName = d.dayFull + (d.isToday ? ' (today)' : '');
    // A day still to come is "upcoming", not a missed session — never let an
    // empty future bar read as "no activity" (that's a day you trained nothing).
    if (!d.hasData) return `${dayName}, ${d.isFuture ? 'upcoming' : 'no activity'}`;
    return `${dayName}, ${this._fmtFull(d.value, settings)}`;
  }

  _chartSummaryAria(chart, orderedDays, settings, rangeStr) {
    const parts = orderedDays.map(d =>
      d.hasData ? `${d.dayFull} ${this._fmtFull(d.value, settings)}`
                : `${d.dayFull} ${d.isFuture ? 'upcoming' : 'none'}`);
    const c = chart.comparison;
    const compStr = c.isComparable
      ? `${c.direction === 'up' ? 'up' : c.direction === 'down' ? 'down' : 'level'} ${Math.abs(c.percentageChange)}% ${c.comparisonLabel}`
      : c.message;
    return `${chart.metricInfo.label}, week of ${rangeStr}. `
      + `${parts.join(', ')}. Total ${this._fmtFull(chart.total, settings)}. ${compStr}.`;
  }

  // ── Tap-to-detail modal (per-day session summary) ────────────────────────

  _openModal(dayKey) {
    const modal   = document.getElementById('wfgModal');
    const content = document.getElementById('wfgModalContent');
    if (!modal || !content) return;
    const appState = this.getState?.() || {};
    const settings = appState.settings || {};
    const wd = this._weekData;
    const date = wd?.dates?.[dayKey] || null;

    const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let dateLine = '';
    if (date) {
      const [y, mo, d] = date.split('-').map(Number);
      const dow = DN[new Date(`${date}T12:00:00`).getDay()];
      dateLine = `<p class="wfg-mdate">${dow}, ${d} ${MN[mo]} ${y}</p>`;
    }

    const icon  = this.type === 'strength' ? '🏋️' : '🏃';
    const title = this.type === 'strength' ? 'Gym Session' : 'Run Session';
    const summary = this._daySummary(dayKey, wd, settings);
    const stats = this._modalStats(dayKey, wd, settings);
    const statsHTML = stats.map(s =>
      `<div class="wfg-ms"><span class="wfg-msl">${s.label}</span><span class="wfg-msv">${s.value}</span></div>`
    ).join('');

    content.innerHTML = `
      <div class="wfg-mhandle"></div>
      ${dateLine}
      <h3 class="wfg-mtitle">${icon} ${title}</h3>
      ${summary ? `<p class="wfg-msummary">${summary}</p>` : ''}
      <div class="wfg-mstats">${statsHTML || '<p class="wfg-mempty">No detailed stats recorded.</p>'}</div>
      <button class="wfg-mclose" data-wfg-action="close-modal">Done</button>
    `;
    modal.classList.add('wfg-modal--open');
  }

  // A compact, glanceable one-liner for the tapped day, e.g.
  // "14 working sets across 2 exercises · 4,250 kg" or "6.4 km in 34:10".
  _daySummary(dayKey, wd, settings) {
    if (this.type === 'strength') {
      let sets = 0, vol = 0, exercises = 0;
      const lifts = wd?.lifts?.[dayKey] || {};
      for (const l in lifts) {
        if (!Array.isArray(lifts[l])) continue;
        let liftSets = 0;
        lifts[l].forEach(s => {
          const done = s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
          const warm = s.type === 'W' || s.isWarmup;
          if (done && !warm) { liftSets++; vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); }
        });
        if (liftSets > 0) { sets += liftSets; exercises++; }
      }
      if (sets === 0) return '';
      const setLbl = `${sets} working ${sets === 1 ? 'set' : 'sets'}`;
      const exLbl  = `${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`;
      const volLbl = vol > 0 ? ` · ${Math.round(vol).toLocaleString()} ${settings.weightUnit || 'kg'}` : '';
      return `${setLbl} across ${exLbl}${volLbl}`;
    }
    const run = wd?.runs?.[dayKey] || {};
    const distKm = parseFloat(run.dist) || 0;
    const secs   = this._parseTime(run.time);
    if (distKm <= 0 && secs <= 0) return '';
    const parts = [];
    if (distKm > 0) parts.push(this._fmtDistance(distKm, settings));
    if (secs > 0)   parts.push(`in ${this._fmtTime(secs)}`);
    return parts.join(' ');
  }

  _modalStats(dayKey, wd, settings) {
    const stats = [];
    const add = (label, value) => { if (value) stats.push({ label, value }); };

    if (this.type === 'strength') {
      // Working sets + volume come from the same shared definition as the bars.
      let sets = 0, vol = 0;
      const lifts = wd?.lifts?.[dayKey] || {};
      for (const l in lifts) {
        if (!Array.isArray(lifts[l])) continue;
        lifts[l].forEach(s => {
          const done = s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
          const warm = s.type === 'W' || s.isWarmup;
          if (done && !warm) { sets++; vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); }
        });
      }
      add('Working Sets', sets > 0 ? String(sets) : '');
      add('Volume', vol > 0 ? `${Math.round(vol).toLocaleString()} ${settings.weightUnit || 'kg'}` : '');
      const gs = wd?.gymStats?.[dayKey];
      if (gs) {
        const secs = this._parseTime(gs.time);
        if (secs > 0) add('Duration', this._fmtTime(secs));
        if (parseFloat(gs.cals) > 0) add('Calories', `${Math.round(parseFloat(gs.cals))} kcal`);
        if (parseFloat(gs.avgHR) > 0) add('Avg HR', `${Math.round(parseFloat(gs.avgHR))} bpm`);
      }
    } else {
      const run = wd?.runs?.[dayKey] || {};
      const distKm = parseFloat(run.dist) || 0;
      const secs   = this._parseTime(run.time);
      if (distKm > 0) add('Distance', this._fmtDistance(distKm, settings));
      if (secs > 0)   add('Time', this._fmtTime(secs));
      if (distKm > 0 && secs > 0) add('Avg Pace', this._fmtPace(distKm, secs, settings));
      if (parseFloat(run.elev) > 0) add('Elevation', `${Math.round(parseFloat(run.elev))} m`);
      if (parseFloat(run.cals) > 0) add('Calories', `${Math.round(parseFloat(run.cals))} kcal`);
      if (parseFloat(run.avgHR) > 0) add('Avg HR', `${Math.round(parseFloat(run.avgHR))} bpm`);
    }
    return stats;
  }

  // ── Formatting helpers ───────────────────────────────────────────────────

  _parseTime(str) {
    if (!str) return 0;
    const p = String(str).split(':').map(Number);
    if (p.some(isNaN)) return 0;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return parseInt(str, 10) || 0;
  }

  _fmtTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  _fmtDistance(km, settings) {
    const mi = (settings.distanceUnit === 'mi');
    const val = mi ? km * 0.621371 : km;
    return `${val.toFixed(1)} ${mi ? 'mi' : 'km'}`;
  }

  _fmtPace(km, secs, settings) {
    const mi = (settings.distanceUnit === 'mi');
    const dist = mi ? km * 0.621371 : km;
    if (dist <= 0) return '';
    const pps = secs / dist;
    const pm = Math.floor(pps / 60);
    const ps = Math.round(pps % 60);
    return `${pm}:${String(ps).padStart(2, '0')} /${mi ? 'mi' : 'km'}`;
  }

  // Y-axis abbreviated label.
  _fmtY(val, settings) {
    switch (this.activeMetric) {
      case 'sets':     return Math.round(val).toString();
      case 'volume':   return val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val).toString();
      case 'duration': {
        const h = Math.floor(val / 3600);
        const m = Math.floor((val % 3600) / 60);
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`;
      }
      case 'distance': {
        const mi = (settings.distanceUnit === 'mi');
        return (mi ? val * 0.621371 : val).toFixed(1);
      }
      default: return Math.round(val).toString();
    }
  }

  // Full formatted value with unit (footer, tooltips, aria).
  _fmtFull(val, settings) {
    switch (this.activeMetric) {
      case 'sets':     return `${Math.round(val)} ${Math.round(val) === 1 ? 'set' : 'sets'}`;
      case 'volume':   return `${Math.round(val).toLocaleString()} ${settings.weightUnit || 'kg'}`;
      case 'duration': return this._fmtTime(val);
      case 'distance': return this._fmtDistance(val, settings);
      default:         return String(Math.round(val));
    }
  }

  // Absolute-change label (no sign; caller adds direction).
  _fmtDelta(val, settings) {
    switch (this.activeMetric) {
      case 'sets':     return `${Math.round(val)} ${Math.round(val) === 1 ? 'set' : 'sets'}`;
      case 'volume':   return `${Math.round(val).toLocaleString()} ${settings.weightUnit || 'kg'}`;
      case 'duration': return this._fmtTime(val);
      case 'distance': return this._fmtDistance(val, settings);
      default:         return String(Math.round(val));
    }
  }

  _rangeLabel(chart) {
    if (chart.isCurrentWeek && !chart.startDate) return 'This week';
    if (!chart.startDate) return chart.weekKey || 'Week';
    const M = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [, m1, d1] = chart.startDate.split('-').map(Number);
    const [, m2, d2] = (chart.endDate || chart.startDate).split('-').map(Number);
    const range = m1 === m2 ? `${d1}–${d2} ${M[m1]}` : `${d1} ${M[m1]} – ${d2} ${M[m2]}`;
    return chart.isCurrentWeek ? `${range} · This week` : range;
  }
}
