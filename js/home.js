// ==========================================
// HOME DASHBOARD — coordinator. UI sub-modules live in ./home/
// ==========================================
import { WEEK_PHASE_NAMES } from './constants.js';
import { getProgramById, saveStateToLocalStorage } from './state.js';
import { computeHybridScore } from './brain/hybrid-score/hybrid-score.js';
import { heroHTML } from './brain/hybrid-score/ui.js';
import { recordDailyScore } from './brain/hybrid-score/history.js';
import { buildMorningBriefing } from './brain/morning-briefing.js';
import { briefingCardHTML } from './home/morning-briefing-card.js';
import { celebrateMilestone, celebrate } from './ui/celebration.js';
import { assessOvertrainingRisk, riskSignature } from './brain/risk.js';
import { pushOvertrainingWarning, pushFastingStageNudge } from './notifications.js';
import { reconcileStreakFreezes } from './brain/streak.js';
import { computeDiagnosticForLift, shouldSuggestDeload } from './engine.js';
import { TILE_REGISTRY, DashboardTileType, CONNECT_HEALTH_TILE, resolveTileNavigation } from './dashboard.js';
import { loadTileOrder, mountTileDragAndDrop, loadHiddenTiles, saveHiddenTiles, resetTileOrder, resetHiddenTiles } from './dragdrop.js';
import { computeDashboardModel } from './home/dashboard-model.js';
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

export function initHome(getStateFn, getSelectedDayFn, getDaysFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
  initFastingCard(getStateFn);

  // Initialize the Garmin-style weekly fitness graphs inside the In Focus cards
  _strengthGraph = initWeeklyFitnessGraph('strengthBarChart', 'strength', getStateFn);
  _runGraph      = initWeeklyFitnessGraph('runBarChart',      'running',  getStateFn);
}

export { openFastingDetail, closeFastingDetail, openHistoryEditPanel, closeHistoryEditPanel } from './home/fasting-card.js';

// ==========================================
// HYBRID SCORE HERO — the signature surface at the top of Home.
// Computed from the same shared dashboard model (no extra pass) and recorded
// once per day so tomorrow's delta/trend/XP is available. Returns the score
// result so the Morning Briefing below reuses it without recomputing.
// ==========================================
function renderHybridScoreHome(appState, model) {
  const el = document.getElementById('hybridScoreHome');
  if (!el) return null;
  const result = computeHybridScore(model, appState, _getDays());
  // The Morning Briefing directly below owns the day's action — one voice.
  setHTML(el, heroHTML(result, { showAction: false }));
  try {
    const { changed, milestones } = recordDailyScore(appState, result, model);
    if (changed) saveStateToLocalStorage(true);
    // Earned moments (level-up · streak milestone · first 90+) fire only on
    // the first record of the day, so this can't spam on re-renders.
    (milestones || []).forEach(celebrateMilestone);
  } catch (e) {
    console.warn('Hybrid Score record failed (non-fatal):', e);
  }
  return result;
}

// ==========================================
// MORNING BRIEFING — the one coaching surface (replaces the old coaching card
// + insight banner pair). Narrative for the day: greeting, session, mission,
// coach line. Anchored by (and rendered directly under) the Hybrid Score hero.
// ==========================================
function renderMorningBriefing(appState, model, scoreResult, activeProgram, selectedDay) {
  const el = document.getElementById('morningBriefing');
  if (!el) return;
  const firstSession = !!appState._justOnboarded;
  const briefing = buildMorningBriefing({
    state: appState, model, score: scoreResult,
    program: activeProgram, selectedDay, firstSession,
  });
  setHTML(el, briefingCardHTML(briefing));

  // R14 — the guided first session: once, right after onboarding, welcome the
  // athlete and draw the eye to their first mission.
  if (firstSession) {
    appState._justOnboarded = false;
    saveStateToLocalStorage(true);
    const name = (appState.settings?.name || '').trim().split(/\s+/)[0];
    celebrate({
      icon: '🎉',
      title: name ? `Welcome, ${name}!` : "You're all set!",
      subtitle: 'Your daily coach is ready. Your first mission is waiting below — tap it to begin.',
    });
    setTimeout(() => { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {} }, 900);
  }
}

// ==========================================
// OVERTRAINING ESCALATION (R10) — a stronger, acknowledge-required warning
// when several fatigue signals stack up. Persists until the exact condition
// (signature) is acknowledged; a new/worse condition resurfaces it. Returns
// true while it's on screen so the advisory deload card stays out of its way.
// ==========================================
function renderOvertrainingCard(appState, model) {
  const card = document.getElementById('homeOvertrainingCard');
  if (!card) return false;

  let assessment;
  try { assessment = assessOvertrainingRisk(model, appState, DEFAULT_DAYS); }
  catch (e) { card.style.display = 'none'; return false; }

  const sig = riskSignature(assessment);
  const ack = appState.overtrainingAck;
  const acknowledged = assessment.level === 'high' && ack && ack.sig === sig;

  if (assessment.level !== 'high' || acknowledged) {
    card.style.display = 'none';
    return false;
  }

  const titleEl  = document.getElementById('homeOvertrainingTitle');
  const descEl   = document.getElementById('homeOvertrainingDesc');
  const sigEl    = document.getElementById('homeOvertrainingSignals');
  const deloadBtn = document.getElementById('homeOvertrainingDeload');
  if (titleEl) titleEl.textContent = assessment.headline;
  if (descEl)  descEl.textContent  = assessment.advice;
  if (sigEl) {
    sigEl.innerHTML = assessment.signals
      .map(s => `<span class="ot-signal${s.severity === 'watch' ? ' ot-signal--watch' : ''}">${s.label}</span>`)
      .join('');
  }
  // If they've already deloaded this week, the one-tap deload is redundant.
  if (deloadBtn) deloadBtn.style.display = assessment.deloadPlanned ? 'none' : '';

  // Store the signature so the acknowledge handler dismisses THIS condition.
  card.dataset.sig = sig;
  card.style.display = 'block';

  // Fire a single warning push per day when the condition is high (best-effort).
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (appState._overtrainingPushedDate !== today) {
      const pushed = pushOvertrainingWarning(assessment);
      if (pushed) { appState._overtrainingPushedDate = today; saveStateToLocalStorage(true); }
    }
  } catch (_) { /* push is best-effort */ }

  return true;
}

// ==========================================
// GLANCE GRID RENDERER
// Builds / updates the .glance-grid dynamically from TILE_REGISTRY
// ==========================================
function renderGlanceGrid(appState, defaultDays, activeProgram, selectedDay, sharedModel) {
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

  // One shared brain pass for the whole dashboard — every tile reads the same
  // model. renderHome computes it once and passes it in; the tile customiser
  // re-renders the grid on its own and lets us compute a fresh one here.
  const model = sharedModel || computeDashboardModel(appState, defaultDays, activeProgram, selectedDay);
  updateQuickActions(model);

  // Fasting stage / goal nudge (S1d): if an active fast crossed a metabolic
  // stage or hit its goal since last seen, deliver it now (app-open / return).
  if (appState.fastingSession?.active) {
    pushFastingStageNudge(appState, () => saveStateToLocalStorage(true));
  }

  const savedOrder  = loadTileOrder();
  const hiddenTiles = loadHiddenTiles();
  const healthLinked = !!appState.healthConnect?.connected;

  const sorted = [...TILE_REGISTRY].sort((a, b) => {
    if (savedOrder) {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    }
    return a.order - b.order;
  });

  // Hide manually-hidden tiles. When the Health app isn't linked, fold the five
  // Health-Connect tiles into a single "Connect" tile rather than showing five
  // dead "Setup" placeholders.
  let visible = sorted.filter(config => !hiddenTiles.has(config.id));
  if (!healthLinked) {
    visible = visible.filter(config => !config.requiresHealth);
    visible.push(CONNECT_HEALTH_TILE);
  }

  // Keyed reconciliation: tile nodes persist across renders (identity, one-time
  // listeners and order preserved); only new tiles are created, hidden/removed
  // tiles are dropped, and each tile's inner HTML is rewritten only when it
  // actually changed (setHTML).
  reconcileKeyed(grid, visible, {
    key: (config) => config.id,
    create: (config) => {
      const article = document.createElement('article');
      article.id        = `glance-tile-${config.id}`;
      article.className = 'card-dark glance-card tile-interactive'
        + (config.type === DashboardTileType.CONNECT ? ' glance-card--full glance-card--connect' : '');
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
        data = config.renderData(appState, defaultDays, activeProgram, selectedDay, model);
      } catch (e) {
        data = { state: 'error' };
      }
      setHTML(article, renderTileContent(config, data));
    },
  });

  mountTileDragAndDrop();
}

// ==========================================
// QUICK ACTIONS — Start/Resume Fast · Check-in · Log Weight.
// ==========================================
function updateQuickActions(model) {
  const fastBtn = document.getElementById('qaFasting');
  if (fastBtn) {
    const f = model.fasting;
    // Quiet Home (S1d): only surface fasting when it's in use — an active fast
    // or some history. A user who's never fasted gets a calm Home, not a nudge
    // toward a feature they haven't chosen.
    const inUse = f.active || (f.history?.length ?? 0) > 0;
    fastBtn.style.display = inUse ? '' : 'none';
    const labelEl = fastBtn.querySelector('.qa-label');
    const subEl   = fastBtn.querySelector('.qa-sub');
    if (f.active) {
      if (labelEl) labelEl.textContent = 'Fasting';
      if (subEl)   subEl.textContent   = `${Math.floor(f.hours)}h · ${f.zone.name}`;
      fastBtn.classList.add('qa-btn--active');
    } else {
      if (labelEl) labelEl.textContent = 'Start Fast';
      if (subEl)   subEl.textContent   = f.streak > 0 ? `${f.streak}d streak` : 'Intermittent fasting';
      fastBtn.classList.remove('qa-btn--active');
    }
  }
  const checkBtn = document.getElementById('qaCheckin');
  if (checkBtn) {
    const done = ((model.ready && model.ready.available) || []).includes('wellness');
    const sub = checkBtn.querySelector('.qa-sub');
    if (sub) sub.textContent = done ? '✓ Done today' : 'Sleep · mood · soreness';
    checkBtn.classList.toggle('qa-btn--active', done);
  }
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
  const phaseEl = document.getElementById('homePhaseLabelTag');
  if (indicatorEl) indicatorEl.textContent = 'Week ' + wk;
  if (phaseEl) phaseEl.textContent = WEEK_PHASE_NAMES[wk] || 'Active Phase';

  const activeProgram = getProgramById(appState.activeProgramId);

  // Streak freezes (R7): auto-cover an occasional missed day and top up the
  // bank on 7-day tiers — before the model computes the streak below.
  try {
    const { changed } = reconcileStreakFreezes(appState, DEFAULT_DAYS);
    if (changed) saveStateToLocalStorage(true);
  } catch (e) { console.warn('Streak freeze reconcile failed (non-fatal):', e); }

  // One shared brain pass — the header progress, week-compare card and every
  // tile all read from this single model so their numbers never diverge.
  const model = computeDashboardModel(appState, DEFAULT_DAYS, activeProgram, selectedDay);

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

  // Weekly fitness graphs handle their own rendering and data refresh.
  // Legacy hero/sub elements are hidden by the graphs on mount.
  if (_strengthGraph) {
    refreshWeeklyFitnessGraph('strengthBarChart');
  }
  if (_runGraph) {
    refreshWeeklyFitnessGraph('runBarChart');
  }

  const scoreResult = renderHybridScoreHome(appState, model);
  renderMorningBriefing(appState, model, scoreResult, activeProgram, selectedDay);
  renderGlanceGrid(appState, DEFAULT_DAYS, activeProgram, selectedDay, model);

  // Weekly completion header — same numbers as the Consistency tile (model.week).
  const w = model.week;
  const progressPctEl = document.getElementById('homeWeeklyProgressPct');
  const progressBarEl = document.getElementById('homeWeeklyProgressBar');
  const progressTasksEl = document.getElementById('homeWeeklyProgressTasks');
  if (progressPctEl) progressPctEl.textContent = w.consistencyPct + '%';
  if (progressBarEl) progressBarEl.style.width = w.consistencyPct + '%';
  if (progressTasksEl) progressTasksEl.textContent = w.consistencyTotal > 0 ? `${w.consistencyDone}/${w.consistencyTotal} done` : 'No tasks yet';

  const compareCard = document.getElementById('homeWeekCompareCard');
  const compareGrid = document.getElementById('homeWeekCompareGrid');
  const wc = model.weekCompare;
  if (compareCard && compareGrid && wc.hasPrev) {
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

    const volHTML  = makeMetric('Volume', wc.volume.current, wc.volume.prev, 'kg');
    const distHTML = makeMetric('Running', toDisplayDist(wc.distance.current), toDisplayDist(wc.distance.prev), distUnit);
    const combined = [volHTML, distHTML].filter(Boolean).join('');
    if (combined) {
      compareGrid.innerHTML = combined;
      compareCard.style.display = 'block';
    } else {
      compareCard.style.display = 'none';
    }
  } else if (compareCard) {
    compareCard.style.display = 'none';
  }

  // Overtraining escalation (R10) takes priority over the advisory deload card.
  const overtrainingShowing = renderOvertrainingCard(appState, model);

  const deloadCard = document.getElementById('homeDeloadSuggestionCard');
  const deloadReason = document.getElementById('homeDeloadReason');
  if (deloadCard) {
    const alreadyDismissed = appState._deloadDismissedWeek === appState.currentWeek;
    const alreadyApplied   = appState.deloadApplied === appState.currentWeek;
    if (overtrainingShowing) {
      deloadCard.style.display = 'none';
    } else if (!alreadyDismissed && !alreadyApplied) {
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
  } else if (action === 'ack-overtraining') {
    // Acknowledge THIS exact risk condition (by signature); a new/worse
    // signal set will resurface the warning.
    const appState = _getState();
    const card = document.getElementById('homeOvertrainingCard');
    appState.overtrainingAck = { sig: card?.dataset.sig || '', date: new Date().toISOString().slice(0, 10) };
    saveStateToLocalStorage(true);
    if (card) card.style.display = 'none';
    renderHome();
  }
});