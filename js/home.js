// ==========================================
// HOME DASHBOARD — coordinator. UI sub-modules live in ./home/
// ==========================================
import { PROGRAMS, WEEK_PHASE_NAMES, DAY_NAMES_FULL } from './constants.js';
import { getProgramById } from './state.js';
import { buildRunPreviewRow, buildLiftPreviewRow, buildRestDayPreview } from './templates.js';
import { computeDiagnosticForLift, computeEstimated1RMs, shouldSuggestDeload, getLiftDisplayName } from './engine.js';
import { getMapFromDB } from './db.js';
import { TILE_REGISTRY, DashboardTileType, resolveTileNavigation } from './dashboard.js';
import { loadTileOrder, mountTileDragAndDrop, loadHiddenTiles, saveHiddenTiles, resetTileOrder, resetHiddenTiles } from './dragdrop.js';
import { generateRecommendation } from './brain/recommendations.js';
import { renderTileContent } from './home/tile-renderers.js';
import { renderActivityCalendar } from './home/activity-calendar.js';
import { initFastingCard } from './home/fasting-card.js';
import { initWeeklyFitnessGraph, refreshWeeklyFitnessGraph } from './home/weekly-fitness-graph.js';
import { setHTML, reconcileKeyed } from './ui/render.js';

let _getState;
let _getSelectedDay;
let _getDays;

// Weekly fitness graph instances (one per In Focus card)
let _strengthGraph = null;
let _runGraph      = null;

// Private module-scoped variable to hold the map instance safely
let activeHomeMapInstance = null;

export function initHome(getStateFn, getSelectedDayFn, getDaysFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
  initFastingCard(getStateFn);

  // Initialize the Garmin-style weekly fitness graphs inside the In Focus cards
  _strengthGraph = initWeeklyFitnessGraph('strengthBarChart', 'strength', getStateFn);
  _runGraph      = initWeeklyFitnessGraph('runBarChart',      'running',  getStateFn);
}

// ==========================================
// COACHING CARD RENDERER
// ==========================================
function renderCoachingCard(state, days, activeProgram, selectedDay) {
  const card = document.getElementById('brainCoachCard');
  if (!card) return;

  const rec = generateRecommendation(state, days, activeProgram, selectedDay);

  const badge    = document.getElementById('brainCoachBadge');
  const headline = document.getElementById('brainCoachHeadline');
  const meta     = document.getElementById('brainCoachMeta');
  const advice   = document.getElementById('brainCoachAdvice');

  if (badge)    badge.textContent    = rec.badge;
  if (headline) headline.textContent = rec.headline;
  if (advice)   advice.textContent   = rec.advice;

  if (meta) {
    const parts = [];
    if (rec.sessionLabel) parts.push(rec.sessionLabel);
    if (rec.acwr > 0)     parts.push(`ACWR ${rec.acwr.toFixed(2)}`);
    meta.textContent = parts.join(' · ');
  }

  card.className     = `brain-coach-card brain-coach--${rec.severity} mb-4`;
  card.style.display = 'block';
}

export { openFastingDetail, closeFastingDetail, openHistoryEditPanel, closeHistoryEditPanel } from './home/fasting-card.js';

// ==========================================
// GLANCE GRID RENDERER
// Builds / updates the .glance-grid dynamically from TILE_REGISTRY
// ==========================================
function renderGlanceGrid(appState, defaultDays, activeProgram, selectedDay) {
  const grid = document.getElementById('glanceGrid');
  if (!grid) return;

  const header = grid.previousElementSibling;
  if (header && !header.querySelector('.tile-customise-btn')) {
    const btn = document.createElement('button');
    btn.className = 'tile-customise-btn';
    btn.textContent = 'Edit';
    btn.setAttribute('aria-label', 'Customise dashboard tiles');
    btn.setAttribute('data-action', 'open-tile-customiser');
    header.appendChild(btn);
  }

  const savedOrder  = loadTileOrder();
  const hiddenTiles = loadHiddenTiles();

  const sorted = [...TILE_REGISTRY].sort((a, b) => {
    if (savedOrder) {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    }
    return a.order - b.order;
  });

  const visible = sorted.filter(config => !hiddenTiles.has(config.id));

  // Keyed reconciliation: tile nodes persist across renders (identity, one-time
  // listeners and order preserved); only new tiles are created, hidden/removed
  // tiles are dropped, and each tile's inner HTML is rewritten only when it
  // actually changed (setHTML). Replaces the previous full innerHTML-per-tile
  // rebuild on every hydrate.
  reconcileKeyed(grid, visible, {
    key: (config) => config.id,
    create: (config) => {
      const article = document.createElement('article');
      article.id        = `glance-tile-${config.id}`;
      article.className = 'card-dark glance-card tile-interactive';
      article.setAttribute('role', 'button');
      article.setAttribute('tabindex', '0');
      article.setAttribute('aria-label', `${config.label} — tap for details`);

      const nav = resolveTileNavigation(config.navTarget);
      if (nav) {
        article.style.cursor = 'pointer';
        article.addEventListener('click', nav);
        article.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') nav(); });
      }
      return article;
    },
    update: (article, config) => {
      let data;
      try {
        data = config.renderData(appState, defaultDays, activeProgram, selectedDay);
      } catch (e) {
        data = { state: 'error' };
      }
      setHTML(article, renderTileContent(config, data));
    },
  });

  mountTileDragAndDrop();
}

// ==========================================
// TILE CUSTOMISER
// ==========================================
function openTileCustomiser() {
  const sheet = document.getElementById('tileCustomiserSheet');
  const list  = document.getElementById('tileCustomiserList');
  if (!sheet || !list) return;

  const hidden     = loadHiddenTiles();
  const savedOrder = loadTileOrder();
  const sorted = [...TILE_REGISTRY].sort((a, b) => {
    if (savedOrder) {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    }
    return a.order - b.order;
  });

  list.innerHTML = sorted.map(config => `
    <div class="tile-picker-item${hidden.has(config.id) ? ' tile-picker-hidden' : ''}" data-tile-id="${config.id}">
      <span class="tile-picker-icon">${config.icon}</span>
      <span class="tile-picker-label">${config.label}</span>
      <input type="checkbox" class="tile-picker-check" data-tile-id="${config.id}" ${hidden.has(config.id) ? '' : 'checked'}>
      <span class="tile-picker-toggle"></span>
    </div>
  `).join('');

  list.querySelectorAll('.tile-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const cb = item.querySelector('.tile-picker-check');
      cb.checked = !cb.checked;
      item.classList.toggle('tile-picker-hidden', !cb.checked);
    });
  });

  sheet.classList.add('active');
  document.getElementById('tileCustomiserBackdrop')?.classList.add('active');
}

export function closeTileCustomiser(apply) {
  const sheet = document.getElementById('tileCustomiserSheet');
  if (!sheet) return;

  if (apply) {
    const hidden = new Set();
    sheet.querySelectorAll('.tile-picker-check').forEach(cb => {
      if (!cb.checked) hidden.add(cb.dataset.tileId);
    });
    saveHiddenTiles(hidden);
    sheet.classList.remove('active');
    document.getElementById('tileCustomiserBackdrop')?.classList.remove('active');
    
    const appState      = _getState();
    const DEFAULT_DAYS  = _getDays();
    const activeProgram = getProgramById(appState.activeProgramId);
    renderGlanceGrid(appState, DEFAULT_DAYS, activeProgram, _getSelectedDay());
  } else {
    sheet.classList.remove('active');
    document.getElementById('tileCustomiserBackdrop')?.classList.remove('active');
  }
}

export function resetTileCustomiser() {
  resetTileOrder();
  resetHiddenTiles();
  document.getElementById('tileCustomiserSheet')?.classList.remove('active');
  document.getElementById('tileCustomiserBackdrop')?.classList.remove('active');
  const appState      = _getState();
  const DEFAULT_DAYS  = _getDays();
  const activeProgram = getProgramById(appState.activeProgramId);
  renderGlanceGrid(appState, DEFAULT_DAYS, activeProgram, _getSelectedDay());
}

export function renderHome() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const DEFAULT_DAYS = _getDays(); 

  const wk = appState?.currentWeek || "1";
  const weekData = appState?.weeks?.[wk] || {};

  const indicatorEl = document.getElementById('homeWeekBlockIndicator');
  const labelEl = document.getElementById('homeBlockTypeLabel');
  if (indicatorEl) indicatorEl.textContent = 'Week ' + wk;
  if (labelEl) labelEl.textContent = WEEK_PHASE_NAMES[wk] || 'Active Phase';

  const activeProgram = getProgramById(appState.activeProgramId);
  const homeBlueprint = activeProgram.days?.[selectedDay] || { title: "Rest Day", badge: "Rest", color: "#6b7280", desc: "No specific template found.", runs: "Rest", lifts: [] };

  const hBadge = document.getElementById('homeFocusBadge');
  const dAccent = document.getElementById('homeDayAccentBar');
  if (hBadge) {
    hBadge.textContent = homeBlueprint.badge || 'Rest';
    hBadge.style.color = homeBlueprint.color || '#6b7280';
  }
  if (dAccent) dAccent.style.background = homeBlueprint.color || '#6b7280';

  const dayLabel = document.getElementById('homeCalendarDayLabel');
  const focusTitle = document.getElementById('homeFocusTitle');
  const focusDesc = document.getElementById('homeFocusDesc');

  if (dayLabel) dayLabel.textContent = DAY_NAMES_FULL[selectedDay] || '';
  if (focusTitle) focusTitle.textContent = homeBlueprint.title || 'Rest Day';
  if (focusDesc) focusDesc.textContent = homeBlueprint.desc || '';

  const engineAlertCard = document.getElementById('homeEngineAlertCard');
  const engineAlertDesc = document.getElementById('homeEngineAlertDesc');
  const globalStallAlertsFound = [];

  DEFAULT_DAYS.forEach(dKey => {
    const dayLifts = weekData.lifts?.[dKey] || {};
    for (let liftName in dayLifts) {
      try {
        const diag = computeDiagnosticForLift(wk, dKey, liftName);
        if (diag && (diag.isStalled || diag.isFatigueOverload)) {
          globalStallAlertsFound.push(diag.message);
        }
      } catch (e) {
        console.warn("Defensive shield caught diagnostic breakdown:", e);
      }
    }
  });

  if (globalStallAlertsFound.length > 0) {
    if (engineAlertCard) engineAlertCard.style.display = 'block';
    if (engineAlertDesc) engineAlertDesc.textContent = globalStallAlertsFound[0];
  } else {
    if (engineAlertCard) engineAlertCard.style.display = 'none';
  }

  const previewContainer = document.getElementById('homeDrillPreviewContainer');
  const todayLifts = weekData.lifts?.[selectedDay] || {};
  const todayRun = weekData.runs?.[selectedDay] || {};

  let todayVol = 0;
  let todaySets = 0;

  for (let lift in todayLifts) {
    if (Array.isArray(todayLifts[lift])) {
      todayLifts[lift].forEach(s => {
        if (s) {
          const isCompleted = s.c === true || s.c === "true" || s.c === "on" || s.c === 1;
          if (isCompleted) {
            todaySets++;
            todayVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
          }
        }
      });
    }
  }

  const todayRunDist = parseFloat(todayRun.dist) || 0;
  const isSessionStarted = todaySets > 0 || todayRunDist > 0;

  if (previewContainer) {
    previewContainer.innerHTML = '';

    if (isSessionStarted) {
      if (hBadge) hBadge.textContent = "✓ Completed";
      if (hBadge) hBadge.style.color = "var(--accent-green)";
      if (dAccent) dAccent.style.background = "var(--accent-green)";
      if (focusTitle) focusTitle.textContent = "Session Logged";
      if (focusDesc) focusDesc.textContent = "Great work. Tap below to edit or add notes.";

      let summaryHTML = `
        <div class="grid-2-col gap-2 mb-1">
          <div class="card-dark p-2 text-center" style="border: 1px solid rgba(255,255,255,0.1);">
            <div class="text-xs text-muted">Sets</div>
            <div class="text-lg font-heavy text-main">${todaySets}</div>
          </div>
          <div class="card-dark p-2 text-center" style="border: 1px solid rgba(255,255,255,0.1);">
            <div class="text-xs text-muted">Volume</div>
            <div class="text-lg font-heavy text-main">${todayVol} kg</div>
          </div>
        </div>
      `;

      const todayGym = weekData.gymStats?.[selectedDay] || {};
      const hasGymStats = todayGym.time || todayGym.avgHR || todayGym.maxHR || todayGym.cals;

      if (hasGymStats) {
        summaryHTML += `
          <div class="card-dark p-2 mb-1" style="border: 1px solid rgba(255,255,255,0.12);">
            <div class="flex-between">
              <span class="text-xs font-bold text-main" style="text-transform:uppercase;letter-spacing:0.06em;">Gym Session</span>
              <span class="text-xs text-muted">${todayGym.time || ''}</span>
            </div>
            <div class="flex gap-3 text-xs text-muted" style="margin-top:3px;">
              ${todayGym.avgHR ? `<span>❤️ ${Math.round(todayGym.avgHR)} avg</span>` : ''}
              ${todayGym.maxHR ? `<span>📈 ${Math.round(todayGym.maxHR)} max</span>` : ''}
              ${todayGym.cals  ? `<span>🔥 ${Math.round(todayGym.cals)} kcal</span>` : ''}
            </div>
          </div>
        `;
      }

      if (todayRunDist > 0) {
        summaryHTML += `
          <div class="card-dark p-2 mb-1" style="border: 1px solid var(--accent-pink);">
            <div class="flex-between">
              <span class="text-xs text-accent-pink font-bold">Run Logged</span>
              <span class="text-xs text-main">${todayRun.time || '--:--'}</span>
            </div>
            <div class="text-lg font-heavy text-inverse" style="margin-top:2px;">${appState.settings?.distanceUnit === 'mi' ? (todayRunDist * 0.621371).toFixed(2) + ' mi' : todayRunDist + ' km'}</div>
            <div class="flex gap-2 text-xs text-muted" style="margin-top:2px;">
              ${todayRun.avgHR ? `<span>❤️ ${Math.round(todayRun.avgHR)} bpm</span>` : ''}
              ${todayRun.elev  ? `<span>⛰️ ${Math.round(todayRun.elev)}m</span>`     : ''}
              ${todayRun.cals  ? `<span>🔥 ${Math.round(todayRun.cals)}</span>`      : ''}
            </div>
            <div id="homeMiniMapContainer" style="height: 100px; width: 100%; border-radius: 6px; display: none; z-index: 1; margin-top: 6px;"></div>
          </div>
        `;
      }

      previewContainer.innerHTML = summaryHTML;

      if (todayRunDist > 0) {
        getMapFromDB(wk, selectedDay).then(coords => {
          if (coords && coords.length > 0) {
            const mapEl = document.getElementById('homeMiniMapContainer');
            if (mapEl) {
              mapEl.style.display = 'block';
              setTimeout(() => {
                if (activeHomeMapInstance) activeHomeMapInstance.remove();
                activeHomeMapInstance = L.map('homeMiniMapContainer', {
                  zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false
                });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(activeHomeMapInstance);
                const route = L.polyline(coords, { color: '#f43f5e', weight: 4, opacity: 1.0 }).addTo(activeHomeMapInstance);
                activeHomeMapInstance.fitBounds(route.getBounds(), { padding: [5, 5] });
              }, 50);
            }
          }
        }).catch(err => console.warn("No map found in DB"));
      }

    } else {
      if (selectedDay !== 'sun' && homeBlueprint.runs) {
        previewContainer.innerHTML += buildRunPreviewRow(homeBlueprint.runs);
      }
      for (let liftName in todayLifts) {
        const expectedSets = Array.isArray(todayLifts[liftName]) ? todayLifts[liftName].length : 4;
        let displayLiftName;
        if (!isNaN(liftName) && homeBlueprint.lifts && homeBlueprint.lifts[parseInt(liftName, 10)]) {
          displayLiftName = homeBlueprint.lifts[parseInt(liftName, 10)];
        } else {
          displayLiftName = getLiftDisplayName(appState, liftName);
        }
        previewContainer.innerHTML += buildLiftPreviewRow(displayLiftName, expectedSets);
      }
      if (selectedDay === 'sun' || (Object.keys(todayLifts).length === 0 && selectedDay === 'sat')) {
        previewContainer.innerHTML = buildRestDayPreview();
      }
    }
  }

  let currentWeekRunDistSum = 0;

  DEFAULT_DAYS.forEach(dKey => {
    const rData = weekData.runs?.[dKey];
    if (rData) currentWeekRunDistSum += parseFloat(rData.dist) || 0;
  });

  // Weekly fitness graphs handle their own rendering and data refresh.
  // Legacy hero/sub elements are hidden by the graphs on mount.
  if (_strengthGraph) {
    refreshWeeklyFitnessGraph('strengthBarChart');
  }
  if (_runGraph) {
    refreshWeeklyFitnessGraph('runBarChart');
  }

  renderGlanceGrid(appState, DEFAULT_DAYS, activeProgram, selectedDay);
  renderCoachingCard(appState, DEFAULT_DAYS, activeProgram, selectedDay);

  const progressPercentage = (() => {
    let total = 0, done = 0;
    DEFAULT_DAYS.forEach(dKey => {
      const bp = activeProgram.days?.[dKey];
      const isRunScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
      if (isRunScheduled) total++;
      const rDist = parseFloat(weekData.runs?.[dKey]?.dist) || 0;
      if (isRunScheduled && rDist > 0) done++;
      const dayLifts = weekData.lifts?.[dKey] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          dayLifts[lift].forEach(s => {
            total++;
            if (s && (s.c === true || s.c === "true" || s.c === "on" || s.c === 1)) done++;
          });
        }
      }
    });
    return total > 0 ? Math.round((done / total) * 100) : 0;
  })();

  const progressPctEl = document.getElementById('homeWeeklyProgressPct');
  const progressBarEl = document.getElementById('homeWeeklyProgressBar');
  if (progressPctEl) progressPctEl.textContent = progressPercentage + '% WEEK DONE';
  if (progressBarEl) progressBarEl.style.width = progressPercentage + '%';

  const nextRunTitle = document.getElementById('homeNextRunTitle');
  const nextRunDesc = document.getElementById('homeNextRunDesc');
  if (nextRunTitle && nextRunDesc) {
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const todayIdx = dayKeys.indexOf(selectedDay);
    let foundNextRun = false;
    for (let offset = 1; offset <= 7; offset++) {
      const checkDay = dayKeys[(todayIdx + offset) % 7];
      const checkBlueprint = activeProgram.days?.[checkDay];
      if (checkBlueprint && checkBlueprint.runs &&
          checkBlueprint.runs.toLowerCase() !== 'rest' &&
          !checkBlueprint.runs.toLowerCase().includes('no running') &&
          !checkBlueprint.runs.toLowerCase().includes('no structured')) {
        nextRunTitle.textContent = checkBlueprint.title || 'Run Day';
        nextRunDesc.textContent = checkBlueprint.runs;
        foundNextRun = true;
        break;
      }
    }
    if (!foundNextRun) {
      nextRunTitle.textContent = 'No Run Scheduled';
      nextRunDesc.textContent = 'No aerobic sessions in the current program.';
    }
  }

  const compareCard = document.getElementById('homeWeekCompareCard');
  const compareGrid = document.getElementById('homeWeekCompareGrid');
  const prevWkNum = parseInt(wk, 10) - 1;
  if (compareCard && compareGrid && prevWkNum >= 1) {
    const prevWkData = appState.weeks[prevWkNum.toString()];
    if (prevWkData) {
      let prevVol = 0, prevDist = 0;
      let currentWeekVolSum = 0;
      DEFAULT_DAYS.forEach(d => {
        const pRun = prevWkData.runs?.[d] || {};
        prevDist += parseFloat(pRun.dist) || 0;
        const pLifts = prevWkData.lifts?.[d] || {};
        for (const l in pLifts) {
          if (Array.isArray(pLifts[l])) {
            pLifts[l].forEach(s => { 
              if (s) {
                const isCompleted = s.c === true || s.c === "true" || s.c === "on" || s.c === 1;
                if (isCompleted) prevVol += (parseFloat(s.w)||0)*(parseInt(s.r,10)||0); 
              }
            });
          }
        }
        const cLifts = weekData.lifts?.[d] || {};
        for (const l in cLifts) {
          if (Array.isArray(cLifts[l])) {
            cLifts[l].forEach(s => { 
              if (s) {
                const isCompleted = s.c === true || s.c === "true" || s.c === "on" || s.c === 1;
                if (isCompleted) currentWeekVolSum += (parseFloat(s.w)||0)*(parseInt(s.r,10)||0); 
              }
            });
          }
        }
      });

      const distUnit = appState.settings?.distanceUnit || 'km';
      const KM_TO_MI = 0.621371;
      const toDisplayDist = km => distUnit === 'mi' ? km * KM_TO_MI : km;

      const makeMetric = (label, current, prev, unit, higherIsBetter = true) => {
        if (prev === 0) return '';
        const diff = current - prev;
        const pct = Math.round((diff / prev) * 100);
        const isPositive = higherIsBetter ? diff >= 0 : diff <= 0;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        const colour = diff === 0 ? 'var(--text-muted)' : isPositive ? '#10b981' : '#ef4444';
        return `<div class="card-dark p-2 text-center" style="border:1px solid rgba(255,255,255,0.08);">
          <div class="text-xs text-muted mb-1">${label}</div>
          <div class="text-sm font-heavy text-inverse">${typeof current === 'number' ? (unit === 'kg' ? Math.round(current).toLocaleString() : current.toFixed(1)) : current}${unit ? ' '+unit : ''}</div>
          <div class="text-xs font-bold" style="color:${colour};">${arrow} ${Math.abs(pct)}%</div>
        </div>`;
      };

      const volHTML  = makeMetric('Volume', currentWeekVolSum, prevVol, 'kg');
      const distHTML = makeMetric('Running', toDisplayDist(currentWeekRunDistSum), toDisplayDist(prevDist), distUnit);
      const combined = [volHTML, distHTML].filter(Boolean).join('');
      if (combined) {
        compareGrid.innerHTML = combined;
        compareCard.style.display = 'block';
      } else {
        compareCard.style.display = 'none';
      }
    } else {
      compareCard.style.display = 'none';
    }
  } else if (compareCard) {
    compareCard.style.display = 'none';
  }

  const deloadCard = document.getElementById('homeDeloadSuggestionCard');
  const deloadReason = document.getElementById('homeDeloadReason');
  if (deloadCard) {
    const alreadyDismissed = appState._deloadDismissedWeek === appState.currentWeek;
    const alreadyApplied   = appState.deloadApplied === appState.currentWeek;
    if (!alreadyDismissed && !alreadyApplied) {
      try {
        const deloadSignal = shouldSuggestDeload();
        if (deloadSignal.suggest) {
          if (deloadReason) deloadReason.textContent = deloadSignal.reason;
          deloadCard.style.display = 'block';
        } else {
          deloadCard.style.display = 'none';
        }
      } catch(e) {
        deloadCard.style.display = 'none';
      }
    } else {
      deloadCard.style.display = 'none';
    }
  }

}

export { renderActivityCalendar } from './home/activity-calendar.js';

// ==========================================
// EVENT DELEGATION ROUTER
// ==========================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');

  if (action === 'open-tile-customiser') {
    openTileCustomiser();
  } else if (action === 'close-tile-customiser') {
    const apply = target.getAttribute('data-apply') === 'true';
    closeTileCustomiser(apply);
  } else if (action === 'reset-tile-customiser') {
    resetTileCustomiser();
  }
});