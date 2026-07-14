// ==========================================
// CLEANED CORE PROTOCOL ROUTER (app.js)
// ==========================================
import { devWarn } from './debug.js';
import { openBuilder } from './program_builder.js';
import { initProgramLibrary, updateLibraryState, renderLibrary, handleLibraryAction, returnToLibrary } from './programs/library.js';
import { handleDetailAction, closeDayPreviewModal } from './programs/detail.js';
import { openCompareModal, closeCompareModal, pickCompareB, renderComparePicker, handleCompareSearch } from './programs/compare-ui.js';
import { getCatalogEntry } from './programs/catalog.js';
import { activateProgramWithConfirm } from './programs/activation.js';
import { escapeHtml, programProgressPct } from './util.js';
import { getWeekModifier } from './schema.js';
import { resolveProgramPhase } from './programs/phase.js';

import {
  appState, activeTab, selectedDay, DEFAULT_DAYS,
  setActiveTab, setSelectedDay, setAppState,
  getProgramById, createCustomProgram, duplicateCustomProgram, deleteCustomProgram,
  determineDefaultCalendarDay,
  verifyWeekStorageSchema,
  reseedActiveProgramIntoWeek,
  startProgramActivation,
  saveStateToLocalStorage,
  scheduleLocalSave,
  pullEngineDataFromStorage,
  triggerCSVExport,
  setImportSuccessCallback,
  showToast,
  checkActiveSession,
  loginToSupabase,
  signUpToSupabase,
  savePersonalRating,
  getPersonalRating,
  dismissDeloadSuggestion,
  applyDeloadToCurrentWeek,
} from './state.js';
import { initSyncConflictUI } from './state/sync-conflict-ui.js';
import { confirmModal } from './ui/confirm-modal.js';
import { paintIcons } from './ui/icons.js';
import { initSentry } from './monitoring/sentry.js';
import { SENTRY_DSN, SENTRY_RELEASE } from './monitoring/sentry-config.js';

import { initEngine, shouldSuggestDeload } from './engine.js';
import { initHome, renderHome, openFastingDetail, answerCoachOnHome } from './home.js';
import { initAnalytics, renderAnalytics, saveThresholdPace, logBodyWeight, setAnalyticsContext, shareScoreCard } from './analytics.js';
import { initSessionRecap, openSessionRecap, closeSessionRecap, isSessionRecapOpen, sharePRFromRecap } from './session-recap.js';
import { initDragDrop } from './dragdrop.js';
import {
  initWorkout, renderWorkout,
  updateInputState, commitWorkoutUIState, toggleGymCheckLoggingState,
  appendCustomSetRow, removeCustomSetRow,
  toggleAccordionManual,
  openAddExerciseModal, closeAddExerciseModal, confirmAddExercise,
  openConfirmResetModal, closeConfirmResetModal, executeResetActiveDayMetrics,
  openFinishSessionModal, closeFinishSessionModal,
  handleExerciseSearch, addExerciseToDayFromLibrary
} from './workout.js';

import { startWorkoutTimer, dismissRestTimer, checkActiveTimerOnLoad, getWorkoutElapsedSeconds } from './timers.js';
import { saveMapToDB } from './db.js';
import { initGarminRunImport, initGarminGymImport } from './garmin.js';
import { initRunLogger, openRunLogger, closeRunLogger, saveManualRun } from './run-logger.js';
import { initOnboarding, shouldShowOnboarding, startOnboarding, handleOnboardingAction } from './onboarding.js';
import {
  initSettings, openSettings, closeSettings,
  saveName, saveBodyWeight, setWeightUnit,
  setProgressionIncrement, setDistanceUnit, setTheme, stepCurrentWeek, setAutoAdvanceWeek,
  saveThresholdPace as saveSettingsThresholdPace,
  exportData, triggerImport, handleImportFile, confirmResetAllData, recoverPreSyncSnapshot,
  applySettingsOnBoot,
  hcToggleConnect, hcSyncNow, saveStepGoal, hcToggleSyncField,
  setFitnessGoal, setWeightGoal, setFitnessLevel, setWeekStartDay, setFastingDefault,
  saveReminderTime, setNotifToggle, saveStreakAlertTime, toggleEquipment, saveBandWeights,
  saveRestPeriods, applyRestPreset, setRestTimerEnabledSetting, resetRestOverrides, signOut, deleteAccount,
  openAvatarPicker, handleAvatarFile,
} from './settings.js';
import { initAthleteProfile, renderAthleteProfile, handleProfileAction } from './athlete-profile.js';
import { initGpsTracker, startTracking, pauseTracking, resumeTracking, stopTracking, cancelTracking, onWorkoutTabActivated } from './gps-tracker.js';
import { renderRunMap } from './workout-map.js';
import { orderedLiftNames } from './workout-order.js';
import { isCompletedSet, isWarmupSet, setVolume } from './set-utils.js';
import { dateKey, todayKey } from './dates.js';
import { resolveDateToSlot, resolveSlotDate } from './analytics/logged-days.js';
import { newRunSessionId, runDaySummary, upsertRunSession } from './state/run-sessions.js';
import { FASTING_ACTIONS, handleFastingClickAction } from './fasting/fasting-actions.js';
import { initNotifications, requestNotificationPermission, cancelReminders, checkMissedWorkout } from './notifications.js';

document.addEventListener('app:storage-loaded', () => {
  try {
    hydrateCurrentView();
  } catch (err) {
    console.warn('UI Hydration pending full app initialization.', err);
  }
});

document.addEventListener('onboarding:finished', () => {
  // Land on Home immediately so the Morning Briefing renders now and consumes
  // the _justOnboarded flag here — otherwise the welcome celebration fires
  // lazily on whatever Home render happens next (e.g. after the first workout),
  // stacking confetti over the session recap.
  try { switchGlobalAppTab('home'); } catch (err) { console.warn('Post-onboarding home landing failed.', err); }
});

document.addEventListener('app:library-updated', () => {
  try {
    updateLibraryState(appState);
    renderLibrary();
  } catch (err) {
    console.warn('Library render failed after builder closed.', err);
  }
});

document.addEventListener('app:navigate', (e) => {
  const target = e.detail?.target;
  if (!target) { devWarn('app:navigate fired with no detail.target — ignoring.', e.detail); return; }
  if (target === 'custom:today-summary') openTodaySummaryModal();
  else if (target === 'custom:fasting') openFastingDetail();
  else if (target === 'custom:settings') openSettings();
  else openAnalyticsView(target);
});

let _activePlanDisplayWeek = null;

export function openAnalyticsView(context, scrollToId) {
  setAnalyticsContext(context);
  switchGlobalAppTab('analytics');
  // Optional deep-link to a sub-section (e.g. the rest-day mission → the wellness
  // check-in form, which otherwise sits several screens below the recovery hero).
  if (scrollToId) {
    setTimeout(() => {
      try { document.getElementById(scrollToId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    }, 60);
  }
}

export function switchGlobalAppTab(targetViewID) {
  if (activeTab === 'workout') {
    try { commitWorkoutUIState(); } catch(e) { console.warn(e); }
  }
  
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  setActiveTab(targetViewID);
  
  const targetPanel = document.getElementById('view-' + targetViewID);
  if (targetPanel) targetPanel.classList.add('active');
  
  const navItem = document.querySelector('.nav-item[data-target="' + targetViewID + '"]');
  if (navItem) navItem.classList.add('active');
  
  hydrateCurrentView();
  window.scrollTo(0, 0);
}

// Quick-start bottom sheet (the centre "+" FAB). Reachable from every tab.
function toggleQuickStart(show) {
  const sheet = document.getElementById('quickStartSheet');
  const back  = document.getElementById('quickStartBackdrop');
  if (sheet) sheet.classList.toggle('active', show);
  if (back)  back.classList.toggle('active', show);
}

export function setCockpitActiveDay(dayKey) {
  if (activeTab === 'workout') {
    try { commitWorkoutUIState(); } catch(e) { console.warn(e); }
  }
  setSelectedDay(dayKey);
  document.querySelectorAll('#cockpitDaySelectorBar .day-pill').forEach(p => {
    p.classList.toggle('active', p.getAttribute('data-day') === dayKey);
  });
  if (activeTab === 'workout') safeRenderExecution(renderWorkout, "Workout View Render");
}

export function launchActiveWorkoutCockpit() {
  switchGlobalAppTab('workout');
  setCockpitActiveDay(selectedDay);
}

// Quick Start (from Home): begin a GPS walk/run untethered from the program on
// a clean, dedicated full-screen Activity tracker. Logs to TODAY's slot
// regardless of what today's plan prescribes, tagged walk/run. On finish the
// tracker persists the run and opens the session recap.
export function openActivityScreen(type) {
  const screen = document.getElementById('activityScreen');
  const title  = document.getElementById('activityTitle');
  if (title) title.textContent = type === 'walk' ? 'Walk' : 'Run';
  if (screen) { screen.style.display = 'flex'; screen.scrollTop = 0; }
}

export function closeActivityScreen() {
  const screen = document.getElementById('activityScreen');
  if (screen) screen.style.display = 'none';
}

export function isActivityScreenOpen() {
  const screen = document.getElementById('activityScreen');
  return !!screen && screen.style.display !== 'none';
}

export function startQuickActivity(type) {
  const kind = type === 'walk' ? 'walk' : 'run';
  const localDate = todayKey();
  const slot = resolveDateToSlot(appState, localDate);
  if (slot) {
    verifyWeekStorageSchema(String(slot.weekNum));
    setSelectedDay(slot.day);
  } else {
    determineDefaultCalendarDay();
  }
  openActivityScreen(kind);
  startTracking(kind, /* quickStart */ true, {
    week: slot ? String(slot.weekNum) : appState.currentWeek,
    day: slot?.day || selectedDay,
    localDate,
  });
}

// Cancel a Quick Start: discard the in-progress track (nothing is saved) and
// close the Activity screen.
export function cancelQuickActivity() {
  try { cancelTracking(); } catch (_) {}
  closeActivityScreen();
}

// ==========================================
// PROGRAM LIBRARY ROUTING
// ==========================================
export function switchProgramMode(mode) {
  const libraryScreen  = document.getElementById('programLibraryScreen');
  const detailScreen   = document.getElementById('programDetailScreen');
  const activePlanView = document.getElementById('progActivePlanView');
  const viewBuilder    = document.getElementById('builderViewContainer');

  if (mode === 'active') {
    if (libraryScreen)  libraryScreen.style.display  = 'none';
    if (detailScreen)   detailScreen.style.display   = 'none';
    if (viewBuilder)    viewBuilder.style.display    = 'none';
    showActivePlanView(true);
  } else if (mode === 'builder') {
    if (libraryScreen)  libraryScreen.style.display  = 'none';
    if (detailScreen)   detailScreen.style.display   = 'none';
    if (activePlanView) activePlanView.style.display = 'none';
    if (viewBuilder)    viewBuilder.style.display    = 'block';
  } else {
    if (viewBuilder)    viewBuilder.style.display    = 'none';
    if (activePlanView) activePlanView.style.display = 'none';
    if (detailScreen)   detailScreen.style.display   = 'none';
    if (libraryScreen)  libraryScreen.style.display  = 'block';
    updateLibraryState(appState);
    renderLibrary();
  }
}


// Activation is a deliberate step, never a silent one-tap swap: route through
// the confirmation sheet (states the program, its impact on the current
// program, that history is kept, any in-progress-workout warning, and the
// start week) and only switch on an explicit choice. Fire-and-forget for the
// action/event callers.
export function triggerMakeActiveProgram(newProgramId) {
  if (!newProgramId) return;
  activateProgramWithConfirm(appState, newProgramId, {
    resolveProgram: getProgramById,
    resolveName: (id) => getCatalogEntry(id)?.name || getProgramById(id)?.name,
    workoutInProgress: () => { try { return getWorkoutElapsedSeconds() > 0; } catch { return false; } },
    apply: applyProgramSwitch,
    onError: (msg) => showToast(msg, true),
  }).catch(err => console.warn('Activation failed:', err));
}

function applyProgramSwitch(newProgramId, startWeek = 1) {
  appState.activeProgramId = newProgramId;
  // A freshly-activated program begins at the chosen week (Week 1 by default),
  // not wherever the previous program happened to be.
  appState.currentWeek = String(Math.max(1, parseInt(String(startWeek), 10) || 1));
  appState.weekStartedAt = new Date().toISOString();
  // Begin a NEW program activation (a distinct run, even when restarting the same
  // program) and archive every numeric week owned by the previous run: its logged
  // history is preserved in the archive (still counted by date-based analytics/PRs)
  // and its scaffolding is cleared, so no completed exercise from the old program
  // can leak into the new program's workout. The new run then seeds its start week
  // clean; future weeks materialise lazily under the new activation.
  startProgramActivation(newProgramId, appState.currentWeek);
  reseedActiveProgramIntoWeek(appState.currentWeek);
  saveStateToLocalStorage(true);
  try { updateLibraryState(appState); renderLibrary(); } catch (_) {}
  hydrateCurrentView();
  showActivePlanView(true);
  showToast('Program activated ✓');
}

export function handleMacroWeekSwitch() {
  const weekSelectElement = document.getElementById('globalWeekSelect');
  if (!weekSelectElement) return;
  
  appState.currentWeek = weekSelectElement.value;
  appState.weekStartedAt = new Date().toISOString(); 
  saveStateToLocalStorage(true);
  
  verifyWeekStorageSchema(appState.currentWeek);
  hydrateCurrentView();
  showToast('Switched to Week ' + appState.currentWeek);
}

export function hydrateCurrentView() {
  verifyWeekStorageSchema(appState.currentWeek);

  if (activeTab === 'home') safeRenderExecution(renderHome, "Home Dashboard Render");
  else if (activeTab === 'workout') { safeRenderExecution(renderWorkout, "Workout Cockpit Render"); onWorkoutTabActivated(); }
  else if (activeTab === 'analytics') safeRenderExecution(renderAnalytics, "Performance Matrix Render");
  else if (activeTab === 'profile') safeRenderExecution(renderAthleteProfile, "Athlete Profile Render");
  else if (activeTab === 'program') {
    const wkSelect = document.getElementById('globalWeekSelect');
    if (wkSelect) wkSelect.value = appState.currentWeek;

    // If active plan view is visible, refresh it; otherwise render library
    const activePlanView = document.getElementById('progActivePlanView');
    if (activePlanView && activePlanView.style.display !== 'none') {
      switchBrowserSectionTab('overview');
    } else {
      updateLibraryState(appState);
      renderLibrary();
    }
  }
}

function safeRenderExecution(renderFn, viewLabel) {
  try {
    renderFn();
  } catch (err) {
    // Production: stay graceful (a render crash must never blank the app).
    // Dev (localStorage.hybrid_debug='1'): escalate to a loud console.error so
    // swallowed render failures are visible instead of hiding behind a warn.
    console.warn(`[Insulation Shield] Prevented load crash on ${viewLabel}:`, err);
    devWarn(`Render crash in ${viewLabel}`, err);
  }
}

export function switchBrowserSectionTab(tabName) {
  const overviewContainer = document.getElementById('programBrowserDetails');
  const tabOverview = document.getElementById('btnBrowserTabOverview');
  const tabWeeks = document.getElementById('btnBrowserTabWeeks');

  if (tabOverview) tabOverview.classList.remove('active');
  if (tabWeeks) tabWeeks.classList.remove('active');

  _renderActivePlanHero();
  _renderActivePlanWeekNav();

  const prog = getProgramById(appState.activeProgramId);
  const catalog = getCatalogEntry(appState.activeProgramId);

  if (!overviewContainer) return;

  if (tabName === 'weeks') {
    if (tabWeeks) tabWeeks.classList.add('active');
    overviewContainer.innerHTML = _renderScheduleTab(catalog, prog);
  } else {
    if (tabOverview) tabOverview.classList.add('active');
    overviewContainer.innerHTML = _renderThisWeekTab(catalog, prog);
  }
}

function _renderActivePlanHero() {
  const heroEl = document.getElementById('activePlanHero');
  if (!heroEl) return;

  const catalog = getCatalogEntry(appState.activeProgramId);
  const prog = getProgramById(appState.activeProgramId);
  const name = catalog?.name || prog?.name || 'Active Program';
  const icon = catalog?.icon || '📋';
  const g = catalog?.coverGradient || ['#1a0e2e', '#0d1b2a'];
  const accentColor = catalog?.accentColor || '#8b5cf6';
  const displayWk = parseInt(_activePlanDisplayWeek || appState.currentWeek || '1', 10);
  const actualWk  = parseInt(appState.currentWeek || '1', 10);
  const totalWeeks = catalog?.durationWeeks || prog?.totalWeeks || 12;
  const progress = programProgressPct(actualWk, totalWeeks);
  const phaseName = resolveProgramPhase(catalog || prog, displayWk, appState).label;

  heroEl.innerHTML = `
    <div class="aplan-hero-inner" style="background: linear-gradient(135deg, ${g[0]}, ${g[1]})">
      <div class="aplan-hero-icon">${icon}</div>
      <div class="aplan-hero-content">
        <div class="aplan-hero-eyebrow">ACTIVE PROGRAM</div>
        <div class="aplan-hero-name">${escapeHtml(name)}</div>
        ${phaseName ? `<div class="aplan-hero-phase">${escapeHtml(phaseName)}</div>` : ''}
        <div class="aplan-hero-progress-row">
          <div class="aplan-hero-bar">
            <div class="aplan-hero-fill" style="width: ${progress}%; background: ${accentColor}"></div>
          </div>
          <span class="aplan-hero-pct">${progress}%</span>
        </div>
        <div class="aplan-hero-weeks">${actualWk} of ${totalWeeks} weeks</div>
      </div>
      <button class="aplan-rate-btn" data-action="rate-program" data-program-id="${appState.activeProgramId || ''}" title="Rate this program">★</button>
    </div>
  `;
}

function _renderActivePlanWeekNav() {
  const numEl   = document.getElementById('aplanWeekNum');
  const phaseEl = document.getElementById('aplanPhaseName');
  const displayWk = _activePlanDisplayWeek || appState.currentWeek || '1';
  if (numEl) numEl.textContent = displayWk;
  const prog = getCatalogEntry(appState.activeProgramId) || getProgramById(appState.activeProgramId);
  if (phaseEl) phaseEl.textContent = resolveProgramPhase(prog, displayWk, appState).label;
}

function _renderThisWeekTab(catalog, prog) {
  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayShort = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const jsDayToKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const todayKey = jsDayToKey[new Date().getDay()];
  const catalogDays = catalog?.days || {};
  const legacyDays = prog?.days || {};

  const cards = dayOrder.map(dayKey => {
    const cd = catalogDays[dayKey];
    const ld = legacyDays[dayKey];
    const isToday = dayKey === todayKey;
    const title = cd?.title || ld?.title || (dayKey === 'sun' ? 'Rest Day' : 'Training');
    const badge = cd?.badge || '';
    const color = cd?.color || 'var(--accent-blue)';
    const isRest = !cd?.lifts?.length && (!cd?.runs || cd?.runs === 'Rest')
                && !ld?.lifts?.length && (!ld?.runs || ld?.runs === 'Rest');
    const hasPreview = !isRest && !!(
      cd?.workoutPreview
      || cd?.lifts?.length || (cd?.runs && cd?.runs !== 'Rest')
      || ld?.lifts?.length || (ld?.runs && ld?.runs !== 'Rest')
    );
    return `
      <div class="aplan-day-card ${isToday ? 'aplan-day-card--today' : ''} ${isRest ? 'aplan-day-card--rest' : ''}"
           ${hasPreview ? `data-action="open-day-preview" data-day="${dayKey}" data-program-id="${appState.activeProgramId}" role="button" tabindex="0"` : ''}>
        <div class="aplan-day-label">${dayShort[dayKey]}</div>
        <div class="aplan-day-body">
          <div class="aplan-day-title">${title}</div>
          ${badge ? `<div class="aplan-day-badge" style="color:${color};border-color:${color}40">${badge}</div>` : ''}
        </div>
        ${hasPreview ? '<span class="aplan-day-chevron">›</span>' : ''}
        ${isToday ? '<div class="aplan-today-pip"></div>' : ''}
      </div>
    `;
  }).join('');

  // Week-aware header: the stepper/schedule change the displayed week, so show
  // that week's phase + prescribed load (sets×reps) here instead of a static
  // blueprint that ignores the selector.
  const displayWk = _activePlanDisplayWeek || appState.currentWeek || '1';
  const mod = getWeekModifier(prog, displayWk);
  const phase = resolveProgramPhase(catalog || prog, displayWk, appState).label;
  const setsReps = (mod.sets && mod.reps) ? `${mod.sets}×${mod.reps}` : '';
  const prescription = `
    <div class="aplan-week-prescription">
      <span class="aplan-wp-week">Week ${escapeHtml(String(displayWk))}</span>
      ${phase ? `<span class="aplan-wp-phase">${escapeHtml(phase)}</span>` : ''}
      ${setsReps ? `<span class="aplan-wp-load">${setsReps}</span>` : ''}
    </div>`;

  return `${prescription}<div class="aplan-day-list">${cards}</div>`;
}

function _renderScheduleTab(catalog, prog) {
  const totalWeeks = catalog?.durationWeeks || prog?.totalWeeks || 12;
  const displayWkNum = parseInt(_activePlanDisplayWeek || appState.currentWeek || '1', 10);
  const actualWkNum  = parseInt(appState.currentWeek || '1', 10);

  const cells = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const isCurrent = w === displayWkNum;
    const isPast = w < displayWkNum;
    const isActual = w === actualWkNum && displayWkNum !== actualWkNum;
    const phase = resolveProgramPhase(catalog || prog, w, appState).label;
    cells.push(`
      <button class="aplan-sched-cell ${isCurrent ? 'aplan-sched-cell--current' : ''} ${isPast ? 'aplan-sched-cell--past' : ''} ${isActual ? 'aplan-sched-cell--actual' : ''}"
              data-action="aplan-set-week" data-week="${w}" title="${phase}">
        ${w}
      </button>
    `);
  }

  const phaseGroups = {};
  for (let w = 1; w <= totalWeeks; w++) {
    const p = resolveProgramPhase(catalog || prog, w, appState).label;
    if (!phaseGroups[p]) phaseGroups[p] = [];
    phaseGroups[p].push(w);
  }

  const legendItems = Object.entries(phaseGroups).map(([phase, wks]) => {
    const isActive = wks.includes(displayWkNum);
    return `
      <div class="aplan-phase-item ${isActive ? 'aplan-phase-item--active' : ''}">
        <span class="aplan-phase-wks">Wk ${wks[0]}${wks.length > 1 ? `–${wks[wks.length - 1]}` : ''}</span>
        <span class="aplan-phase-label">${phase}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="aplan-schedule">
      <div class="aplan-sched-grid">${cells.join('')}</div>
      <div class="aplan-phase-breakdown">
        <div class="aplan-phase-breakdown-title">PHASE BREAKDOWN</div>
        <div class="aplan-phase-list">${legendItems}</div>
      </div>
    </div>
  `;
}

export function confirmWeekAdvance() {
  const modal = document.getElementById('weekAdvanceModal');
  if (!modal) return;
  const nextWeekString = modal.getAttribute('data-pending-week');
  modal.classList.remove('active');
  if (nextWeekString) {
    appState.currentWeek = nextWeekString;
    appState.weekStartedAt = new Date().toISOString(); 
    verifyWeekStorageSchema(appState.currentWeek);
    saveStateToLocalStorage(true);
    hydrateCurrentView();
    const weekSelectElement = document.getElementById('globalWeekSelect');
    if (weekSelectElement) weekSelectElement.value = nextWeekString;
    showToast(`Advanced to Week ${nextWeekString}!`);
  }
}

export function cancelWeekAdvance() {
  const modal = document.getElementById('weekAdvanceModal');
  if (!modal) return;
  modal.classList.remove('active');
  const today = new Date();
  const fallbackDate = new Date();
  fallbackDate.setDate(today.getDate() - 4); 
  appState.weekStartedAt = fallbackDate.toISOString();
  saveStateToLocalStorage(true);
}

export function openCreateProgramModal() { document.getElementById('createProgramModal').classList.add('active'); }
export function closeCreateProgramModal() { document.getElementById('createProgramModal').classList.remove('active'); }

export function executeCreateProgram() {
  const name = document.getElementById('cpInputName').value;
  const focus = document.getElementById('cpInputFocus').value;
  const wks = document.getElementById('cpInputWeeks').value;
  const newId = createCustomProgram(name, wks, focus, "");
  closeCreateProgramModal();
  document.getElementById('cpInputName').value = '';
  document.getElementById('cpInputFocus').value = '';
  document.getElementById('cpInputWeeks').value = '12';
  showToast('Custom Program Created!');
  // Drop straight into the builder so the (empty) program is actually fillable.
  switchProgramMode('builder');
  openBuilder(newId);
}

export async function executeDeleteProgram(id) {
  const ok = await confirmModal({
    title: 'Delete this program?',
    message: 'This custom program will be permanently removed. This cannot be undone.',
    confirmLabel: 'Delete', danger: true,
  });
  if (!ok) return;
  const result = deleteCustomProgram(id);
  if (result.success) {
    updateLibraryState(appState);
    renderLibrary();
    showToast('Program deleted.');
  } else {
    showToast(result.message, true);
  }
}

export function executeDuplicateProgram(id) {
  duplicateCustomProgram(id);
  updateLibraryState(appState);
  renderLibrary();
}

// Fork ANY program (catalog or custom) into an editable copy, then drop straight
// into the builder. The clone is a copy — the original catalog program is never
// mutated — so there's no shared-data hazard.
export function customizeProgram(id) {
  if (!id) return;
  const newId = duplicateCustomProgram(id);
  if (!newId) { showToast('Could not customize this program.', true); return; }
  updateLibraryState(appState);
  showToast('Editable copy created — customize it below');
  switchProgramMode('builder');
  openBuilder(newId);
}

// ==========================================
// MODALS & SUMMARY LOGIC
// ==========================================
export function openTodaySummaryModal() {
  const modal = document.getElementById('todaySummaryModal');
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const dayNames = {sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
  const todayKey = selectedDay || days[new Date().getDay()];

  document.getElementById('todaySummaryDayLabel').textContent = dayNames[todayKey] || '';

  let volume = 0, sets = 0, gymRpe = null, runDist = null, runTime = null, runPace = null, runRpe = null, notes = '';

  const wk = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];
  
  if (weekData) {
    const dayLifts = weekData.lifts?.[todayKey] || {};
    for (const lift in dayLifts) {
      if (Array.isArray(dayLifts[lift])) {
        dayLifts[lift].forEach(s => {
          if (isCompletedSet(s) && !isWarmupSet(s)) {
            sets++;
            volume += setVolume(s);
          }
        });
      }
    }

    const runData = runDaySummary(weekData, todayKey);
    runDist = parseFloat(runData.dist) || null;
    runTime = runData.time || null;
    runRpe  = runData.rpe  || null;

    gymRpe = weekData.gymRpe?.[todayKey] || null;
    notes = weekData.notes?.[todayKey] || '';
  }

  if (runDist && runTime) {
    const p = runTime.toString().split(':');
    const tm = p.length === 2 ? parseInt(p[0]) + parseInt(p[1]) / 60 : parseFloat(p[0]);
    if (tm > 0 && runDist > 0) {
      const pt = tm / runDist;
      const pm = Math.floor(pt);
      const ps = Math.round((pt - pm) * 60).toString().padStart(2, '0');
      runPace = pm + ':' + ps;
    }
  }

  const hasLift  = volume > 0 || sets > 0;
  const hasRun   = runDist > 0 || runTime;
  const hasNotes = notes && notes.trim().length > 0;
  const isEmpty  = !hasLift && !hasRun && !hasNotes;

  document.getElementById('todaySummaryLiftBlock').style.display = hasLift ? '' : 'none';
  document.getElementById('todaySummaryVolume').textContent  = Math.round(volume).toLocaleString() + ' kg';
  document.getElementById('todaySummarySets').textContent    = sets;
  document.getElementById('todaySummaryGymRpe').textContent  = gymRpe || '--';

  // Set-by-set breakdown
  const breakdownEl = document.getElementById('todaySummarySetBreakdown');
  if (breakdownEl) {
    if (hasLift && weekData) {
      const dayLifts = weekData.lifts?.[todayKey] || {};
      // Order identically to the cockpit (liftOrder / blueprint), not raw object
      // keys — otherwise drag-reordered or integer-keyed days list out of sequence.
      const _bp = getProgramById(appState.activeProgramId)?.days?.[todayKey];
      const liftNames = orderedLiftNames(weekData, todayKey, _bp).filter(l => Array.isArray(dayLifts[l]) && dayLifts[l].length > 0);
      if (liftNames.length > 0) {
        let html = '<div class="text-xs text-muted mb-2" style="text-transform:uppercase;letter-spacing:0.05em;">Set Breakdown</div>';
        liftNames.forEach(lift => {
          const completedSets = dayLifts[lift].filter(s => s && s.c);
          if (completedSets.length === 0) return;
          const displayLiftName = lift;
          html += `<div class="mb-2"><div class="text-sm font-bold text-inverse mb-1">${escapeHtml(displayLiftName)}</div>`;
          completedSets.forEach((s, idx) => {
            const typeLabel = s.type === 'W' ? 'W' : s.type === 'D' ? `D${idx + 1}` : s.type === 'F' ? 'F' : `S${idx + 1}`;
            const labelColor = s.type === 'W' ? '#94a3b8' : s.type === 'D' ? '#f97316' : s.type === 'F' ? '#ef4444' : 'rgba(255,255,255,0.5)';
            html += `<div class="flex-between text-sm" style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
              <span style="color:${labelColor};">${typeLabel}</span>
              <span class="text-inverse">${parseFloat(s.w) || 0} kg × ${parseInt(s.r, 10) || 0} reps</span>
            </div>`;
          });
          html += '</div>';
        });
        breakdownEl.innerHTML = html;
        breakdownEl.style.display = '';
      } else {
        breakdownEl.style.display = 'none';
      }
    } else {
      breakdownEl.style.display = 'none';
    }
  }

  // vs last week comparison
  const vsEl = document.getElementById('todaySummaryVsLastWeek');
  if (vsEl && (hasLift || hasRun)) {
    const prevWk   = (parseInt(wk, 10) - 1).toString();
    const prevData = appState.weeks?.[prevWk];
    if (prevData) {
      let prevVol = 0, prevSets = 0, prevDist = 0;
      const prevLifts = prevData.lifts?.[todayKey] || {};
      for (const lift in prevLifts) {
        if (Array.isArray(prevLifts[lift])) {
          prevLifts[lift].forEach(s => {
            if (s && s.c) { prevSets++; prevVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); }
          });
        }
      }
      prevDist = parseFloat(runDaySummary(prevData, todayKey).dist) || 0;

      const volDelta  = volume - prevVol;
      const setsDelta = sets   - prevSets;
      const distDelta = (runDist || 0) - prevDist;

      const fmt = (n, unit) => {
        if (n === 0) return `<span class="text-muted">= ${unit}</span>`;
        const sign = n > 0 ? '+' : '';
        const color = n > 0 ? '#10b981' : '#ef4444';
        return `<span style="color:${color};">${sign}${Math.round(Math.abs(n) * 10) / 10} ${unit}</span>`;
      };

      let rows = '';
      if (hasLift && (prevVol > 0 || volume > 0)) {
        rows += `<div class="flex-between text-sm mb-1"><span class="text-muted">Volume vs last week</span>${fmt(volDelta, 'kg')}</div>`;
        rows += `<div class="flex-between text-sm mb-1"><span class="text-muted">Sets vs last week</span>${fmt(setsDelta, 'sets')}</div>`;
      }
      if (hasRun && (prevDist > 0 || (runDist || 0) > 0)) {
        rows += `<div class="flex-between text-sm mb-1"><span class="text-muted">Distance vs last week</span>${fmt(distDelta, 'km')}</div>`;
      }

      if (rows) {
        vsEl.innerHTML = `<div class="text-xs text-muted mb-2" style="text-transform:uppercase;letter-spacing:0.05em;">vs Week ${prevWk}</div>${rows}`;
        vsEl.style.display = '';
      } else {
        vsEl.style.display = 'none';
      }
    } else {
      vsEl.style.display = 'none';
    }
  } else if (vsEl) {
    vsEl.style.display = 'none';
  }

  document.getElementById('todaySummaryRunBlock').style.display = hasRun ? '' : 'none';
  document.getElementById('todaySummaryRunDist').textContent  = runDist ? runDist + ' km' : '-- km';
  document.getElementById('todaySummaryRunTime').textContent  = runTime || '--:--';
  document.getElementById('todaySummaryRunPace').textContent  = runPace ? runPace + ' /km' : '-- /km';
  document.getElementById('todaySummaryRunRpe').textContent   = runRpe || '--';

  document.getElementById('todaySummaryNotesBlock').style.display = hasNotes ? '' : 'none';
  document.getElementById('todaySummaryNotes').textContent = notes;

  document.getElementById('todaySummaryEmpty').style.display = isEmpty ? '' : 'none';

  if (modal) modal.style.display = 'flex';
}

export function closeTodaySummaryModal() {
  const modal = document.getElementById('todaySummaryModal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// GLOBAL EVENT DELEGATION ROUTER
// ==========================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const progId = target.getAttribute('data-program-id');

  // Tab & Navigation
  if (action === 'switch-tab') {
    const tgt = target.getAttribute('data-target');
    // Entering Insights via the nav tab always lands on the hub index.
    if (tgt === 'analytics') setAnalyticsContext('hub');
    switchGlobalAppTab(tgt);
  }
  else if (action === 'open-analytics') openAnalyticsView(target.getAttribute('data-context'));
  else if (action === 'open-wellness-checkin') openAnalyticsView('recovery-score', 'wellnessFormSection');
  else if (action === 'share-score-card') shareScoreCard();
  else if (action === 'tile-nav') document.dispatchEvent(new CustomEvent('app:navigate', { detail: { target: target.getAttribute('data-nav') } }));
  else if (action === 'set-day') setCockpitActiveDay(target.getAttribute('data-day'));
  else if (action === 'start-today-workout') launchActiveWorkoutCockpit();
  else if (action === 'coach-ask') answerCoachOnHome(target.getAttribute('data-q'));
  else if (action === 'switch-browser-tab') switchBrowserSectionTab(target.getAttribute('data-tab'));
  
  // Timers
  else if (action === 'start-timer') startWorkoutTimer();
  else if (action === 'dismiss-rest') dismissRestTimer();

  // Programs & Library
  else if (action === 'open-create-program') openCreateProgramModal();
  else if (action === 'close-create-program') closeCreateProgramModal();
  else if (action === 'execute-create-program') executeCreateProgram();
  else if (action === 'cancel-week-advance') cancelWeekAdvance();
  else if (action === 'confirm-week-advance') confirmWeekAdvance();
  else if (action === 'make-active-program') triggerMakeActiveProgram(progId);
  else if (action === 'open-builder') openBuilder(progId);
  else if (action === 'delete-program') executeDeleteProgram(progId);
  else if (action === 'duplicate-program') executeDuplicateProgram(progId);
  else if (action === 'customize-program') customizeProgram(progId);
  else if (action === 'open-compare') openCompareModal(progId);
  else if (action === 'compare-pick') pickCompareB(progId);
  else if (action === 'compare-reset') { document.getElementById('compareSearchWrap').style.display = ''; renderComparePicker(''); }
  else if (action === 'close-compare') closeCompareModal();

  // New Program Library actions
  else if (['open-program-detail', 'prog-filter', 'diff-filter', 'prog-quick-search', 'hero-dot', 'lib-tab', 'toggle-bookmark', 'continue-active-program'].includes(action)) {
    handleLibraryAction(action, target, e);
  }
  else if (['close-program-detail', 'make-active-from-detail', 'view-active-program', 'open-day-preview', 'preview-week-step', 'close-day-preview', 'detail-toggle-bookmark', 'mark-program-complete', 'detail-week-step', 'detail-week-current'].includes(action)) {
    handleDetailAction(action, target);
  }
  else if (action === 'close-active-plan-view') {
    showActivePlanView(false);
    returnToLibrary();
  }
  else if (action === 'aplan-week-step') {
    const delta = parseInt(target.getAttribute('data-delta'), 10);
    const cur = parseInt(_activePlanDisplayWeek || appState.currentWeek || '1', 10);
    const prog = getProgramById(appState.activeProgramId);
    const maxWk = prog?.totalWeeks || 12;
    const next = Math.min(Math.max(1, cur + delta), maxWk);
    if (next !== cur) {
      _activePlanDisplayWeek = String(next);
      appState.currentWeek = String(next);
      const wkSel = document.getElementById('globalWeekSelect');
      if (wkSel) wkSel.value = appState.currentWeek;
      saveStateToLocalStorage(true);
      verifyWeekStorageSchema(appState.currentWeek);
      const activeTabEl = document.getElementById('btnBrowserTabWeeks');
      switchBrowserSectionTab(activeTabEl?.classList.contains('active') ? 'weeks' : 'overview');
    }
  }
  else if (action === 'aplan-set-week') {
    const wk = target.getAttribute('data-week');
    if (wk && wk !== _activePlanDisplayWeek) {
      _activePlanDisplayWeek = wk;
      const activeTabEl = document.getElementById('btnBrowserTabWeeks');
      switchBrowserSectionTab(activeTabEl?.classList.contains('active') ? 'weeks' : 'overview');
    }
  }
  
  // Settings
  else if (action === 'open-settings') openSettings();
  else if (action === 'close-settings') closeSettings();
  else if (e.target.id === 'settingsOverlay') closeSettings();
  else if (action === 'set-unit') setWeightUnit(target.getAttribute('data-unit'));
  else if (action === 'set-dist-unit') setDistanceUnit(target.getAttribute('data-unit'));
  else if (action === 'set-theme')    setTheme(target.getAttribute('data-theme-val'));
  else if (action === 'rest-preset') applyRestPreset(target.getAttribute('data-preset'));
  else if (action === 'reset-rest-overrides') resetRestOverrides();
  else if (action === 'set-progression') setProgressionIncrement(parseFloat(target.getAttribute('data-kg')));
  else if (action === 'week-step') stepCurrentWeek(parseInt(target.getAttribute('data-delta'), 10));
  else if (action === 'export-data') exportData();
  else if (action === 'import-data') triggerImport();
  else if (action === 'reset-all-data') confirmResetAllData();
  else if (action === 'recover-presync-snapshot') recoverPreSyncSnapshot();
  else if (action === 'hc-toggle-connect') hcToggleConnect();
  else if (action === 'hc-sync-now') hcSyncNow();
  else if (action === 'set-fitness-goal')     setFitnessGoal(target.getAttribute('data-goal'));
  else if (action === 'set-weight-goal')      setWeightGoal(target.getAttribute('data-weight-goal'));
  else if (action === 'set-fitness-level')    setFitnessLevel(target.getAttribute('data-level'));
  else if (action === 'set-week-start')       setWeekStartDay(target.getAttribute('data-day'));
  else if (action === 'set-fasting-default')  setFastingDefault(parseInt(target.getAttribute('data-hours'), 10));
  else if (action === 'sign-out')             signOut();
  else if (action === 'delete-account')       deleteAccount();

  // Onboarding
  else if (['ob-next','ob-back','ob-goal','ob-level','ob-frequency','ob-recovery','ob-equipment','ob-program','ob-unit','ob-dist-unit','ob-finish','ob-notif-enable','ob-notif-skip'].includes(action)) {
    handleOnboardingAction(action, target);
  }

  // Quick-start sheet (centre "+" FAB) — start Run / Walk / Fast from any tab.
  else if (action === 'open-quick-start')  { toggleQuickStart(true); }
  else if (action === 'close-quick-start') { toggleQuickStart(false); }
  else if (action === 'qs-workout') { toggleQuickStart(false); launchActiveWorkoutCockpit(); }
  else if (action === 'qs-run')  { toggleQuickStart(false); startQuickActivity('run'); }
  else if (action === 'qs-walk') { toggleQuickStart(false); startQuickActivity('walk'); }
  else if (action === 'qs-fast') { toggleQuickStart(false); openFastingDetail(); }
  else if (action === 'open-profile') { switchGlobalAppTab('profile'); }

  // GPS Tracker
  else if (action === 'quick-activity') { startQuickActivity(target.getAttribute('data-type')); }
  else if (action === 'cancel-quick-activity') { cancelQuickActivity(); }
  else if (action === 'close-session-recap') { closeSessionRecap(); }
  else if (action === 'share-pr-card') { sharePRFromRecap(); }
  else if (action === 'gps-start')  {
    const dayIdx = DEFAULT_DAYS.indexOf(selectedDay);
    const localDate = appState.weeks?.[appState.currentWeek]?.dates?.[selectedDay]
      || resolveSlotDate(appState, parseInt(appState.currentWeek, 10) || 1, dayIdx, null);
    startTracking('run', false, { week: appState.currentWeek, day: selectedDay, localDate });
  }
  else if (action === 'gps-pause')  { pauseTracking(); }
  else if (action === 'gps-resume') { resumeTracking(); }
  else if (action === 'gps-stop')   {
    // Finish: from the Activity screen close it (recap opens via session:finished);
    // from the cockpit just stop + persist to the current slot.
    if (isActivityScreenOpen()) closeActivityScreen();
    stopTracking(appState.currentWeek, selectedDay);
  }

  // Fasting — delegated to the dedicated domain router (js/fasting/fasting-actions.js)
  else if (FASTING_ACTIONS.has(action)) handleFastingClickAction(action, target, { openAnalyticsView });

  // Run Logger
  else if (action === 'open-run-logger') openRunLogger();
  else if (action === 'close-run-logger') closeRunLogger();
  else if (action === 'save-run-log')    saveManualRun();

  // Export & Data
else if (action === 'export-csv') triggerCSVExport();
  
  // Auth
  else if (action === 'login-supabase') loginToSupabase();
  else if (action === 'signup-supabase') signUpToSupabase();
  else if (action === 'close-auth') {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = 'none';
  }
  else if (action === 'open-auth') {
    // Auth is opt-in now (no front-door wall): returning users open it to
    // restore/sync, new users open it from Settings to back up their progress.
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = '';
  }
  
  // Summary Modals
  else if (action === 'open-today-summary') openTodaySummaryModal();
  else if (action === 'close-today-summary') closeTodaySummaryModal();
  else if (action === 'close-today-summary-nav') { 
    closeTodaySummaryModal(); 
    switchGlobalAppTab('workout'); 
  }
  
  // Athlete Profile
  else if (['set-pr-goal', 'confirm-pr-goal', 'close-pr-goal-modal', 'open-session-detail', 'close-session-detail', 'share-profile'].includes(action))
    handleProfileAction(action, target);
  else if (action === 'pick-avatar')              openAvatarPicker();

  // Deload week
  else if (action === 'close-deload-modal') {
    dismissDeloadSuggestion();
    renderHome();
  }
  else if (action === 'execute-deload-week') {
    applyDeloadToCurrentWeek();
    renderHome();
    try { renderWorkout(); } catch (err) { console.warn(err); }
    showToast('Deload applied — working sets reduced for this week.');
  }

  // Analytics
  else if (action === 'log-body-weight') logBodyWeight();

  // Program Rating Modal
  else if (action === 'rate-program') _openRatingModal(target.dataset.programId || appState.activeProgramId);
  else if (action === 'close-rating-modal') _closeRatingModal();
  else if (action === 'submit-program-rating') _submitProgramRating();
  else if (action === 'rating-star') _highlightStars(parseInt(target.dataset.rating, 10));

  // Notifications
  else if (action === 'request-notifications') {
    requestNotificationPermission().then(({ granted }) => {
      const el = document.getElementById('settingsNotifStatus');
      if (el) el.textContent = granted ? 'Reminders active — you\'ll be notified at 07:30.' : 'Permission denied — enable notifications for Helyx in your device settings.';
    });
  }
});

// Keyboard accessibility for role="button" elements with data-action
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const target = e.target.closest('[role="button"][data-action]');
  if (!target) return;
  e.preventDefault();
  target.click();
});

// Auth tab switching
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-auth-tab]');
  if (!tab) return;
  const which = tab.getAttribute('data-auth-tab');
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('auth-tab--active', t.getAttribute('data-auth-tab') === which));
  const signinPanel = document.getElementById('authPanelSignin');
  const signupPanel = document.getElementById('authPanelSignup');
  if (signinPanel) signinPanel.style.display = which === 'signin' ? '' : 'none';
  if (signupPanel) signupPanel.style.display = which === 'signup' ? '' : 'none';
});

document.addEventListener('change', (e) => {
  const target = e.target;

  // ID-based handlers (No data-action required)
  if (target.id === 'analyticsThresholdPaceInput') {
    saveThresholdPace(target.value);
    return;
  }
  if (target.id === 'fastingGoalSelect' || target.id === 'fastingSheetGoalSelect') {
    const goal = parseInt(target.value, 10);
    if (!isNaN(goal)) {
      if (!appState.fastingSession) appState.fastingSession = { active: false, startTime: null, goal: 16, history: [] };
      appState.fastingSession.goal = goal;
      saveStateToLocalStorage(true);
    }
    return;
  }
  if (target.id === 'settingsImportFile') {
    handleImportFile(target.files?.[0]);
    return;
  }
  if (target.id === 'avatarFilePicker') {
    handleAvatarFile(target.files?.[0]);
    target.value = '';
    return;
  }
  const hcField = target.getAttribute?.('data-hc-field');
  if (hcField) { hcToggleSyncField(hcField, target.checked); return; }
  if (target.id === 'settingsAutoAdvance')          { setAutoAdvanceWeek(target.checked); return; }
  if (target.id === 'settingsNotifWeeklySummary')   { setNotifToggle('weeklySummary', target.checked); return; }
  if (target.id === 'settingsNotifStreak')          { setNotifToggle('streak', target.checked); return; }
  if (target.id === 'settingsNotifMissedWorkout')   { setNotifToggle('missed', target.checked); return; }
  const eqKey = target.getAttribute?.('data-equipment');
  if (eqKey) { toggleEquipment(eqKey, target.checked); return; }
  if (target.id === 'settingsBandLight' || target.id === 'settingsBandMed' || target.id === 'settingsBandHeavy') { saveBandWeights(); return; }
  if (target.id === 'settingsRestCompound' || target.id === 'settingsRestAccessory' || target.id === 'settingsRestIsolation') { saveRestPeriods(); return; }
  if (target.id === 'settingsRestEnabled') { setRestTimerEnabledSetting(target.checked); return; }
  if (target.id === 'settingsNotifications') {
    if (target.checked) {
      requestNotificationPermission().then(({ granted }) => {
        const el = document.getElementById('settingsNotifStatus');
        if (!granted) {
          target.checked = false;
          if (el) el.textContent = 'Permission denied. Enable notifications for Helyx in your device settings.';
        } else {
          if (el) el.textContent = "Reminders active — you'll be notified at 07:30 each morning.";
        }
      });
    } else {
      cancelReminders();
      const el = document.getElementById('settingsNotifStatus');
      if (el) el.textContent = 'Reminders are off.';
    }
    return;
  }

  // Data-action based handlers
  const actionTarget = target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.getAttribute('data-action');

  if (action === 'macro-week-switch') handleMacroWeekSwitch();
});

document.addEventListener('blur', (e) => {
  const id = e.target.id;
  if (id === 'settingsNameInput') saveName();
  else if (id === 'settingsBodyWeight') saveBodyWeight();
  else if (id === 'settingsThresholdPace') saveSettingsThresholdPace();
  else if (id === 'settingsStepGoal') saveStepGoal();
  else if (id === 'settingsReminderTime')    saveReminderTime();
  else if (id === 'settingsStreakAlertTime') saveStreakAlertTime();
}, true);

document.addEventListener('input', (e) => {
  if (e.target.id === 'elSearchInput') handleExerciseSearch(e.target.value);
  else if (e.target.id === 'compareSearchInput') handleCompareSearch(e.target.value);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'prGoalInput') {
    e.preventDefault();
    handleProfileAction('confirm-pr-goal', e.target);
  }
  if (e.key === 'Escape') {
    const modal = document.getElementById('prGoalModal');
    if (modal?.classList.contains('active')) {
      modal.classList.remove('active');
    }
  }
});

// ==========================================
// PROGRAM LIBRARY HELPERS
// ==========================================

export function showActivePlanView(show) {
  const libraryScreen = document.getElementById('programLibraryScreen');
  const detailScreen  = document.getElementById('programDetailScreen');
  const activePlan    = document.getElementById('progActivePlanView');
  const builder       = document.getElementById('builderViewContainer');

  if (libraryScreen) libraryScreen.style.display = show ? 'none' : 'block';
  if (detailScreen)  detailScreen.style.display  = 'none';
  if (activePlan)    activePlan.style.display    = show ? 'block' : 'none';
  if (builder)       builder.style.display       = 'none';

  if (show) {
    _activePlanDisplayWeek = appState.currentWeek;
    const wkSelect = document.getElementById('globalWeekSelect');
    if (wkSelect) wkSelect.value = appState.currentWeek;
    switchBrowserSectionTab('overview');
  }
}

// Custom event bridge from detail page → app.js
document.addEventListener('library:make-active', (e) => {
  const id = e.detail?.id;
  // triggerMakeActiveProgram opens the confirmation sheet and, only on an
  // explicit choice, applies the switch (which updates the library + view
  // itself). Rendering here would run before the user confirms, so it doesn't.
  if (id) triggerMakeActiveProgram(id);
});

document.addEventListener('library:view-active', () => {
  showActivePlanView(true);
});

document.addEventListener('library:continue-training', () => {
  switchGlobalAppTab('workout');
});

document.addEventListener('library:return', () => {
  try { returnToLibrary(); } catch (_) {}
});

// ==========================================
// BOOTSTRAP AND INITIALIZATION
// ==========================================
const getState = () => appState;
const getSelectedDay = () => selectedDay;
const getDays = () => DEFAULT_DAYS;
const saveState = (suppress) => saveStateToLocalStorage(suppress);

initEngine(getState, getDays);
initHome(getState, getSelectedDay, getDays);
initAnalytics(getState, getDays);
initDragDrop(getState, getSelectedDay, saveState);
initWorkout(getState, getSelectedDay, getDays, saveState, switchGlobalAppTab, scheduleLocalSave);
initSettings(getState);
initRunLogger(getState);
initOnboarding(getState);
initProgramLibrary(appState);
initAthleteProfile(getState, getDays, saveState);

// Save auto-filled inputs, persist km splits, and render the pace-zone map after GPS tracking finishes.
document.addEventListener('gps:route-saved', (e) => {
  const { week, day, sessionId, distKm, splits, quickActivity } = e.detail;

  if (!quickActivity && String(week) === String(appState.currentWeek) && day === selectedDay) {
    try { commitWorkoutUIState(); } catch (_) {}
  }
  try {
    renderRunMap(week, day, distKm, {
      splits,
      thresholdSec: appState.thresholdPaceSeconds,
      activationId: appState.activeActivationId,
      sessionId,
    });
  } catch (_) {}
});

// === DEVICE IMPORT WIRING ===

initGarminRunImport(async (distance, timeStr, coordinates, stats) => {
  const wk = appState.currentWeek;
  const sd = selectedDay;
  const localDate = appState.weeks[wk]?.dates?.[sd] || dateKey();
  const sessionId = newRunSessionId();
  if (appState.weeks[wk]) {
    if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
    upsertRunSession(appState.weeks[wk], sd, {
      dist:           distance,
      time:           timeStr,
      rpe:            '',
      avgHR:          stats?.avgHR        != null ? Math.round(stats.avgHR)       : '',
      maxHR:          stats?.maxHR        != null ? Math.round(stats.maxHR)       : '',
      elev:           stats?.elevation    != null ? Math.round(stats.elevation)   : '',
      descent:        stats?.descent      != null ? Math.round(stats.descent)     : '',
      cals:           stats?.calories     != null ? Math.round(stats.calories)    : '',
      avgCadence:     stats?.avgCadence   != null ? Math.round(stats.avgCadence)  : '',
      trainingEffect: stats?.trainingEffect != null ? stats.trainingEffect        : '',
      aerobicTE:      stats?.aerobicTE    != null ? stats.aerobicTE               : '',
      hrZones:        stats?.hrZones      || null,
      splits:         stats?.splits       || null,
    }, { sessionId, source: 'fit', localDate });
  }
  if (appState.weeks[wk]) {
    if (!appState.weeks[wk].dates) appState.weeks[wk].dates = {};
    if (!appState.weeks[wk].dates[sd]) {
      appState.weeks[wk].dates[sd] = localDate;
    }
  }
  if (coordinates && coordinates.length > 0) {
    const routeId = await saveMapToDB(wk, sd, coordinates, {
      sessionId,
      activationId: appState.activeActivationId,
      programId: appState.activeProgramId,
      localDate,
    });
    const current = appState.weeks[wk]?.runs?.[sd];
    if (current?.sessionId === sessionId) {
      upsertRunSession(appState.weeks[wk], sd, { ...current, routeId }, {
        sessionId, source: 'fit', localDate,
      });
    }
    saveStateToLocalStorage(true); hydrateCurrentView();
  } else {
    saveStateToLocalStorage(true); hydrateCurrentView();
  }
});

initGarminGymImport((timeStr, stats) => {
  const wk = appState.currentWeek;
  const sd = selectedDay;
  if (appState.weeks[wk]) {
    if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
    if (!appState.weeks[wk].gymStats[sd]) appState.weeks[wk].gymStats[sd] = {};
    const g = appState.weeks[wk].gymStats[sd];
    g.time        = timeStr;
    g.avgHR       = stats?.avgHR       != null ? Math.round(stats.avgHR)      : '';
    g.maxHR       = stats?.maxHR       != null ? Math.round(stats.maxHR)      : '';
    g.cals        = stats?.calories    != null ? Math.round(stats.calories)   : '';
    g.trainingEffect = stats?.trainingEffect != null ? stats.trainingEffect   : '';
    g.aerobicTE   = stats?.aerobicTE   != null ? stats.aerobicTE              : '';
    g.gymSets     = stats?.gymSets     || null;
    if (!appState.weeks[wk].dates) appState.weeks[wk].dates = {};
    if (!appState.weeks[wk].dates[sd]) {
      appState.weeks[wk].dates[sd] = dateKey();
    }
  }
  saveStateToLocalStorage(true);
  hydrateCurrentView();
});

setImportSuccessCallback(() => hydrateCurrentView());

function checkForAutomaticWeekAdvance() {
  if (appState.settings?.autoAdvanceWeek === false) return;
  if (!appState.weekStartedAt) {
    appState.weekStartedAt = new Date().toISOString();
    saveStateToLocalStorage(true);
    return;
  }
  const startDate = new Date(appState.weekStartedAt);
  const today = new Date();
  if (today <= startDate) return;

  const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  if (diffDays >= 7) {
    const currentWeekNumeric = parseInt(appState.currentWeek, 10);
    const activeProgram = getProgramById(appState.activeProgramId);
    const maxWeek = activeProgram.totalWeeks || 12;

    if (currentWeekNumeric >= maxWeek) {
      appState.weekStartedAt = new Date().toISOString();
      saveStateToLocalStorage(true);
      return;
    }

    const nextWeekString = (currentWeekNumeric + 1).toString();
    const modal = document.getElementById('weekAdvanceModal');
    const msgEl = document.getElementById('weekAdvanceMessage');
    
    if (modal && msgEl) {
      msgEl.textContent = `It's been ${diffDays} days since you started Week ${appState.currentWeek}. Start Week ${nextWeekString}?`;
      modal.setAttribute('data-pending-week', nextWeekString);
      modal.classList.add('active');
    }
  }
}

// ── Program Rating Modal ──────────────────────────────────────────────────

let _ratingProgramId  = null;
let _ratingSelected   = 0;

function _openRatingModal(programId) {
  _ratingProgramId = programId;
  _ratingSelected  = 0;
  const modal = document.getElementById('programRatingModal');
  if (!modal) return;
  const nameEl = document.getElementById('ratingModalProgramName');
  if (nameEl) {
    const prog = getProgramById(programId);
    nameEl.textContent = prog?.name || programId || 'Current Program';
  }
  const existing = getPersonalRating(programId);
  _highlightStars(existing?.rating || 0);
  const ta = document.getElementById('ratingReviewText');
  if (ta) ta.value = existing?.review || '';
  modal.classList.add('active');
}

function _closeRatingModal() {
  document.getElementById('programRatingModal')?.classList.remove('active');
}

function _highlightStars(n) {
  _ratingSelected = n;
  document.querySelectorAll('.rating-star').forEach(s => {
    const r = parseInt(s.dataset.rating, 10);
    s.style.opacity = r <= n ? '1' : '0.35';
    s.style.color   = r <= n ? '#f59e0b' : '';
  });
}

function _submitProgramRating() {
  if (!_ratingProgramId || _ratingSelected === 0) {
    showToast('Please select a rating (1–5 stars).');
    return;
  }
  const review = document.getElementById('ratingReviewText')?.value?.trim() || '';
  savePersonalRating(_ratingProgramId, _ratingSelected, review);
  showToast('Rating saved!');
  _closeRatingModal();
}

// ==========================================
// ANDROID HARDWARE / GESTURE BACK
// Native MainActivity calls window.__onAndroidBack() and only exits the app
// when we return anything other than 'handled'. Close the topmost open surface
// first (modal → settings → detail/builder), then fall back to the Home tab,
// then let the OS exit.
// ==========================================
if (typeof window !== 'undefined') {
  window.__onAndroidBack = function () {
    // 0) Full-screen session recap sits above everything — close it first.
    if (isSessionRecapOpen()) { closeSessionRecap(); return 'handled'; }

    // 0b) Quick Start Activity tracker — back cancels the in-progress activity.
    if (isActivityScreenOpen()) { cancelQuickActivity(); return 'handled'; }

    // 1) Generic modals using the .active convention (today-summary, rating,
    //    pr-goal, create-program, week-advance, deload, etc.)
    const activeModal = document.querySelector('.modal.active, [data-modal].active');
    if (activeModal) { activeModal.classList.remove('active'); return 'handled'; }

    // 2) Modals/sheets toggled via inline display (fasting, today-summary fallback)
    const displayModal = [...document.querySelectorAll('.modal, .bottom-sheet, .detail-overlay')]
      .find(el => el.style && (el.style.display === 'flex' || el.style.display === 'block'));
    if (displayModal) { displayModal.style.display = 'none'; return 'handled'; }

    // 3) Settings overlay
    const settingsOverlay = document.getElementById('settingsOverlay');
    if (settingsOverlay && settingsOverlay.classList.contains('active')) { closeSettings(); return 'handled'; }

    // 4) Program detail / builder / active-plan stack → back to library
    const detailScreen = document.getElementById('programDetailScreen');
    const builder      = document.getElementById('builderViewContainer');
    const activePlan   = document.getElementById('progActivePlanView');
    if ([detailScreen, builder, activePlan].some(el => el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none')) {
      try { returnToLibrary(); } catch (_) {}
      switchProgramMode('library');
      return 'handled';
    }

    // 5) Not on Home → go Home rather than exit
    if (activeTab !== 'home') { switchGlobalAppTab('home'); return 'handled'; }

    // 6) Nothing to close — let the native layer handle exit
    return 'exit';
  };
}

// Enforce declared min/max on number inputs (e.g. RPE fields carry max="10").
// Browsers don't clamp type=number on their own, so a stray "50" RPE would sail
// through and skew analytics. This bites only when a value exceeds the declared
// bound, so normal typing is untouched.
// Only clamp the upper bound on input: a value above max is invalid no matter
// what's typed next. Min is deliberately NOT clamped here — a partial entry like
// "1" toward "150" is smaller than a min of 30 and would be snapped away
// mid-typing. Low bounds are enforced on commit by the readers instead.
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.type !== 'number' || t.value === '' || t.max === '') return;
  const v = parseFloat(t.value);
  if (!Number.isNaN(v) && v > parseFloat(t.max)) t.value = t.max;
});

// Persistent offline indicator — reflects connectivity so the user knows their
// logging still works (and stays on-device) while the network is down.
function initOfflineIndicator() {
  const el = document.getElementById('offlineIndicator');
  if (!el) return;
  const sync = () => { el.hidden = navigator.onLine; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

async function bootstrapApp() {
  try {
    initSentry(SENTRY_DSN, SENTRY_RELEASE);   // no-op until a DSN is configured
    paintIcons(document);                     // fill [data-icon] chrome (nav + hub) with the SVG set
    initOfflineIndicator();
    initSyncConflictUI();
    initSessionRecap(() => appState);
    // Recap entry points: after finishing a session, and tapping a logged day.
    document.addEventListener('session:finished', (e) => {
      closeActivityScreen();
      openSessionRecap(e.detail?.week, e.detail?.day, e.detail?.sessionId);
    });
    document.addEventListener('app:open-recap',   (e) => openSessionRecap(e.detail?.week, e.detail?.day));
    determineDefaultCalendarDay();
    await checkActiveSession();
    await pullEngineDataFromStorage();
    // Recovery may immediately attach a device-local active session to app
    // state, so the stored training history must be loaded first.
    initGpsTracker();

    const currentTab = activeTab || 'home';
    const currentDay = selectedDay || 'mon';

    verifyWeekStorageSchema(appState.currentWeek);
    setCockpitActiveDay(currentDay);
    switchGlobalAppTab(currentTab);
    checkActiveTimerOnLoad();
    window._hybridGetProgram = () => getProgramById(appState.activeProgramId);
    applySettingsOnBoot(appState);
    checkForAutomaticWeekAdvance();
    initNotifications(() => appState);
    checkMissedWorkout();
    if (shouldShowOnboarding()) setTimeout(() => startOnboarding(), 300);

  } catch (fatalLifecycleError) {
    console.error("Critical layout generation block runtime defense:", fatalLifecycleError);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}
