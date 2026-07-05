// ==========================================
// HOME DASHBOARD — coordinator. UI sub-modules live in ./home/
// ==========================================
import { WEEK_PHASE_NAMES } from './constants.js';
import { getProgramById, saveStateToLocalStorage } from './state.js';
import { computeHybridScore } from './brain/hybrid-score/hybrid-score.js';
import { projectScore } from './brain/hybrid-score/project.js';
import { heroHTML } from './brain/hybrid-score/ui.js';
import { recordDailyScore } from './brain/hybrid-score/history.js';
import { buildMorningBriefing } from './brain/morning-briefing.js';
import { briefingCardHTML } from './home/morning-briefing-card.js';
import { celebrateMilestone, celebrate } from './ui/celebration.js';
import { assessOvertrainingRisk, riskSignature } from './brain/risk.js';
import { answerCoachQuestion } from './brain/coach-qa.js';
import { pushOvertrainingWarning, pushFastingStageNudge } from './notifications.js';
import { reconcileStreakFreezes } from './brain/streak.js';
import { shouldSuggestDeload } from './engine.js';
import { TILE_REGISTRY, DashboardTileType, CONNECT_HEALTH_TILE, resolveTileNavigation, HOME_TILE_IDS } from './dashboard.js';
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
// C2 — Ask the coach. Recomputes the live context (readiness model, Hybrid Score
// + delta, overtraining risk, today's session) and answers deterministically
// into the briefing card. Called from the app.js action router on a chip tap.
export function answerCoachOnHome(intent) {
  const el = document.getElementById('coachAnswer');
  if (!el) return;
  try {
    const appState = _getState();
    const selectedDay = _getSelectedDay();
    const days = _getDays();
    const activeProgram = getProgramById(appState.activeProgramId);
    const model = computeDashboardModel(appState, days, activeProgram, selectedDay);
    const score = computeHybridScore(model, appState, days);
    let risk = null;
    try { risk = assessOvertrainingRisk(model, appState, days); } catch (_) {}
    const rec = model?.rec || {};
    const session = { isRest: rec.sessionLabel === 'Rest Day', done: rec.badge === 'Session Done', label: rec.sessionLabel };
    const { answer } = answerCoachQuestion(intent, { model, score, risk, session });
    el.textContent = answer;
    el.hidden = false;
  } catch (e) {
    console.warn('coach Q&A failed (non-fatal):', e);
    el.textContent = "I couldn't read your data just now — try again in a moment.";
    el.hidden = false;
  }
}

function renderMorningBriefing(appState, model, scoreResult, activeProgram, selectedDay) {
  const el = document.getElementById('morningBriefing');
  if (!el) return;
  const firstSession = !!appState._justOnboarded;
  const projection = projectScore(model, appState, _getDays());
  const briefing = buildMorningBriefing({
    state: appState, model, score: scoreResult, projection,
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

  // One shared brain pass for the whole dashboard — every tile reads the same
  // model. renderHome computes it once and passes it in.
  const model = sharedModel || computeDashboardModel(appState, defaultDays, activeProgram, selectedDay);
  updateQuickActions(model);

  // Fasting stage / goal nudge (S1d): if an active fast crossed a metabolic
  // stage or hit its goal since last seen, deliver it now (app-open / return).
  if (appState.fastingSession?.active) {
    pushFastingStageNudge(appState, () => saveStateToLocalStorage(true));
  }

  // V2 (S3): exactly four fixed tiles, in order — no customiser, no hidden/order
  // state. Curated defaults beat a customiser (PRODUCT_V2 §3).
  const byId = new Map(TILE_REGISTRY.map(t => [t.id, t]));
  const visible = HOME_TILE_IDS.map(id => byId.get(id)).filter(Boolean);

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
}

// ==========================================
// QUICK ACTIONS — Start/Resume Fast · Check-in · Log Weight.
// ==========================================
function updateQuickActions(model) {
  const fastRow = document.getElementById('dashboardQuickActions');
  const fastBtn = document.getElementById('qaFasting');
  if (fastRow && fastBtn) {
    const f = model.fasting;
    // Home is quiet: starting a fast lives in the centre "+" sheet now. The only
    // fasting thing that surfaces on Home is a live status pill while a fast is
    // actually running — an in-progress timer should never be buried in a menu.
    fastRow.style.display = f.active ? '' : 'none';
    if (f.active) {
      const labelEl = fastBtn.querySelector('.qa-label');
      const subEl   = fastBtn.querySelector('.qa-sub');
      if (labelEl) labelEl.textContent = 'Fasting';
      if (subEl)   subEl.textContent   = `${Math.floor(f.hours)}h · ${f.zone.name}`;
      fastBtn.classList.add('qa-btn--active');
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


export function renderHome() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const DEFAULT_DAYS = _getDays(); 

  const wk = appState?.currentWeek || "1";

  const indicatorEl = document.getElementById('homeWeekBlockIndicator');
  const phaseEl = document.getElementById('homePhaseLabelTag');
  if (indicatorEl) indicatorEl.textContent = 'Week ' + wk;
  if (phaseEl) phaseEl.textContent = WEEK_PHASE_NAMES[wk] || 'Active Phase';

  // Home-header avatar → Profile (the avatar is Profile's entry point now that
  // Profile has left the nav bar). Shows the photo if set, else name initials.
  const avatarEl = document.getElementById('homeAvatar');
  if (avatarEl) {
    const nm = (appState.settings?.name || '').trim();
    const url = appState.settings?.avatarDataUrl;
    if (url) {
      avatarEl.style.backgroundImage = `url("${url}")`;
      avatarEl.textContent = '';
      avatarEl.classList.add('home-avatar--img');
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = nm ? nm.split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('') : '?';
      avatarEl.classList.remove('home-avatar--img');
    }
  }

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

  // V2 (S4): engine stall alerts move off Home — the one-hero Home keeps only
  // the recovery flag slot (overtraining/deload). Stall diagnostics still surface
  // in the workout cockpit where they're actionable.
  const engineAlertCard = document.getElementById('homeEngineAlertCard');
  if (engineAlertCard) engineAlertCard.style.display = 'none';

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

  // V2 (S4): the week-compare card moves off Home — it was one of several
  // redundant "did you train this week" renderings the Hybrid Score already owns.
  const compareCard = document.getElementById('homeWeekCompareCard');
  if (compareCard) compareCard.style.display = 'none';

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

  if (action === 'ack-overtraining') {
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