// ==========================================
// CLEANED CORE PROTOCOL ROUTER (app.js)
// ==========================================
import { PROGRAMS, WEEK_PHASE_NAMES } from './constants.js';
import { devWarn } from './debug.js';
import { openBuilder } from './program_builder.js';
import { initProgramLibrary, updateLibraryState, renderLibrary, handleLibraryAction, returnToLibrary } from './programs/library.js';
import { handleDetailAction, closeDayPreviewModal } from './programs/detail.js';
import { getCatalogEntry } from './programs/catalog.js';

import {
  appState, activeTab, selectedDay, DEFAULT_DAYS,
  setActiveTab, setSelectedDay, setAppState,
  getProgramById, createCustomProgram, duplicateCustomProgram, deleteCustomProgram,
  determineDefaultCalendarDay,
  verifyWeekStorageSchema,
  mergeWeekSchema,
  saveStateToLocalStorage,
  pullEngineDataFromStorage,
  triggerCSVExport,
  setImportSuccessCallback,
  showToast,
  checkActiveSession,
  loginToSupabase,
  signUpToSupabase
} from './state.js';

import { initEngine, shouldSuggestDeload, getLiftDisplayName } from './engine.js';
import { initHome, renderHome, closeTileCustomiser, resetTileCustomiser, openFastingDetail, closeFastingDetail } from './home.js';
import { initAnalytics, renderAnalytics, saveThresholdPace, logBodyWeight } from './analytics.js';
import { initDragDrop, resetTileOrder, exitTileEditMode } from './dragdrop.js';
import {
  initWorkout, renderWorkout,
  updateInputState, commitWorkoutUIState, toggleGymCheckLoggingState,
  applyQuickFillModifier, appendCustomSetRow, removeCustomSetRow,
  toggleAccordionManual, toggleQuickPad,
  openAddExerciseModal, closeAddExerciseModal, confirmAddExercise,
  openConfirmResetModal, closeConfirmResetModal, executeResetActiveDayMetrics,
  openFinishSessionModal, closeFinishSessionModal,
  handleExerciseDropdownSelectionChange,
  handleExerciseSearch, addExerciseToDayFromLibrary
} from './workout.js';

import { startWorkoutTimer, dismissRestTimer, checkActiveTimerOnLoad } from './timers.js';
import { saveMapToDB } from './db.js';
import { initGarminRunImport, initGarminGymImport } from './garmin.js';
import { initRunLogger, openRunLogger, closeRunLogger, saveManualRun, handleRunLoggerRpeClick } from './run-logger.js';
import { initOnboarding, shouldShowOnboarding, startOnboarding, handleOnboardingAction } from './onboarding.js';
import {
  initSettings, openSettings, closeSettings,
  saveName, saveBodyWeight, setWeightUnit, setRestDefault,
  setProgressionIncrement, setDistanceUnit, setTheme, stepCurrentWeek, setAutoAdvanceWeek,
  saveThresholdPace as saveSettingsThresholdPace,
  exportData, triggerImport, handleImportFile, confirmResetAllData,
  applySettingsOnBoot,
  hcToggleConnect, hcSyncNow, saveStepGoal, hcToggleSyncField
} from './settings.js';
import { initAthleteProfile, renderAthleteProfile, handleProfileAction } from './athlete-profile.js';
import { initGpsTracker, startTracking, pauseTracking, resumeTracking, stopTracking, onWorkoutTabActivated } from './gps-tracker.js';
import { renderRunMap } from './workout-map.js';
import { startFast, stopFast, editFastStartTime, stopFastAtTime } from './fasting.js';

document.addEventListener('app:storage-loaded', () => {
  try {
    hydrateCurrentView();
  } catch (err) {
    console.warn('UI Hydration pending full app initialization.', err);
  }
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
  else openAnalyticsView(target);
});

window.analyticsContext = 'weekly-summary';

let _activePlanDisplayWeek = null;

export function openAnalyticsView(context) {
  window.analyticsContext = context;
  switchGlobalAppTab('analytics');
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
  window.scrollTo(0, 0);
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


export function triggerMakeActiveProgram(newProgramId) {
  if (newProgramId === appState.activeProgramId) return;
  applyProgramSwitch(newProgramId);
}


function applyProgramSwitch(newProgramId) {
  appState.activeProgramId = newProgramId;
  appState.weekStartedAt = new Date().toISOString();
  mergeWeekSchema(appState.currentWeek);
  saveStateToLocalStorage(true);
  hydrateCurrentView();
  showActivePlanView(true);
  showToast('Program switched ✓');
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
  try { renderFn(); } catch (err) { console.warn(`[Insulation Shield] Prevented load crash on ${viewLabel}:`, err); }
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
  const progress = Math.min(100, Math.round(((actualWk - 1) / totalWeeks) * 100));
  const phaseName = WEEK_PHASE_NAMES[String(displayWk)] || '';

  heroEl.innerHTML = `
    <div class="aplan-hero-inner" style="background: linear-gradient(135deg, ${g[0]}, ${g[1]})">
      <div class="aplan-hero-icon">${icon}</div>
      <div class="aplan-hero-content">
        <div class="aplan-hero-eyebrow">ACTIVE PROGRAM</div>
        <div class="aplan-hero-name">${name}</div>
        ${phaseName ? `<div class="aplan-hero-phase">${phaseName}</div>` : ''}
        <div class="aplan-hero-progress-row">
          <div class="aplan-hero-bar">
            <div class="aplan-hero-fill" style="width: ${progress}%; background: ${accentColor}"></div>
          </div>
          <span class="aplan-hero-pct">${progress}%</span>
        </div>
        <div class="aplan-hero-weeks">${actualWk} of ${totalWeeks} weeks</div>
      </div>
    </div>
  `;
}

function _renderActivePlanWeekNav() {
  const numEl   = document.getElementById('aplanWeekNum');
  const phaseEl = document.getElementById('aplanPhaseName');
  const displayWk = _activePlanDisplayWeek || appState.currentWeek || '1';
  if (numEl) numEl.textContent = displayWk;
  if (phaseEl) phaseEl.textContent = WEEK_PHASE_NAMES[displayWk] || '';
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

  return `<div class="aplan-day-list">${cards}</div>`;
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
    const phase = WEEK_PHASE_NAMES[String(w)] || '';
    cells.push(`
      <button class="aplan-sched-cell ${isCurrent ? 'aplan-sched-cell--current' : ''} ${isPast ? 'aplan-sched-cell--past' : ''} ${isActual ? 'aplan-sched-cell--actual' : ''}"
              data-action="aplan-set-week" data-week="${w}" title="${phase}">
        ${w}
      </button>
    `);
  }

  const phaseGroups = {};
  for (let w = 1; w <= totalWeeks; w++) {
    const p = WEEK_PHASE_NAMES[String(w)] || 'Training';
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

export function triggerEditActiveProgram(progId) {
  const isSystem = !!PROGRAMS[progId];
  
  if (isSystem) {
    if (confirm("System blueprints are read-only. Duplicate this to a Custom Program so you can edit it?")) {
      const newId = 'prog_' + Date.now();
      const source = JSON.parse(JSON.stringify(PROGRAMS[progId]));
      source.id = newId;
      source.name = source.name + " (Custom)";
      if (source.dossier) source.dossier.creator = "You";
      
      if (!appState.customPrograms) appState.customPrograms = [];
      appState.customPrograms.push(source);
      
      appState.activeProgramId = newId;
      mergeWeekSchema(appState.currentWeek);
      saveStateToLocalStorage(true);
      hydrateCurrentView();
      
      switchProgramMode('builder');
      openBuilder(newId);
    }
  } else {
    switchProgramMode('builder');
    openBuilder(progId);
  }
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
  createCustomProgram(name, wks, focus, "");
  closeCreateProgramModal();
  updateLibraryState(appState);
  renderLibrary();
  showToast('Custom Program Created!');
  document.getElementById('cpInputName').value = '';
  document.getElementById('cpInputFocus').value = '';
  document.getElementById('cpInputWeeks').value = '12';
}

export function executeDeleteProgram(id) {
  if(confirm("Are you sure you want to delete this custom program?")) {
    const result = deleteCustomProgram(id);
    if (result.success) {
      updateLibraryState(appState);
      renderLibrary();
      showToast('Program deleted.');
    } else {
      showToast(result.message, true);
    }
  }
}

export function executeDuplicateProgram(id) {
  duplicateCustomProgram(id);
  updateLibraryState(appState);
  renderLibrary();
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
          if (s && s.c && s.type !== 'W') {
            sets++;
            volume += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
          }
        });
      }
    }

    const runData = weekData.runs?.[todayKey] || {};
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
      const liftNames = Object.keys(dayLifts).filter(l => Array.isArray(dayLifts[l]) && dayLifts[l].length > 0);
      if (liftNames.length > 0) {
        let html = '<div class="text-xs text-muted mb-2" style="text-transform:uppercase;letter-spacing:0.05em;">Set Breakdown</div>';
        liftNames.forEach(lift => {
          const completedSets = dayLifts[lift].filter(s => s && s.c);
          if (completedSets.length === 0) return;
          const displayLiftName = getLiftDisplayName(appState, lift);
          html += `<div class="mb-2"><div class="text-sm font-bold text-inverse mb-1">${displayLiftName}</div>`;
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
      prevDist = parseFloat(prevData.runs?.[todayKey]?.dist) || 0;

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
  if (action === 'switch-tab') switchGlobalAppTab(target.getAttribute('data-target'));
  else if (action === 'open-analytics') openAnalyticsView(target.getAttribute('data-context'));
  else if (action === 'set-day') setCockpitActiveDay(target.getAttribute('data-day'));
  else if (action === 'switch-browser-tab') switchBrowserSectionTab(target.getAttribute('data-tab'));
  
  // Timers
  else if (action === 'start-timer') startWorkoutTimer();
  else if (action === 'dismiss-rest') dismissRestTimer();

  // Programs & Library
  else if (action === 'switch-program-mode') switchProgramMode(target.getAttribute('data-mode'));
  else if (action === 'open-create-program') openCreateProgramModal();
  else if (action === 'close-create-program') closeCreateProgramModal();
  else if (action === 'execute-create-program') executeCreateProgram();
  else if (action === 'cancel-week-advance') cancelWeekAdvance();
  else if (action === 'confirm-week-advance') confirmWeekAdvance();
  else if (action === 'edit-program') triggerEditActiveProgram(progId);
  else if (action === 'make-active-program') triggerMakeActiveProgram(progId);
  else if (action === 'open-builder') openBuilder(progId);
  else if (action === 'delete-program') executeDeleteProgram(progId);
  else if (action === 'duplicate-program') executeDuplicateProgram(progId);

  // New Program Library actions
  else if (['open-program-detail', 'prog-filter', 'diff-filter', 'prog-quick-search', 'hero-dot', 'lib-tab', 'toggle-bookmark', 'continue-active-program'].includes(action)) {
    handleLibraryAction(action, target, e);
  }
  else if (['close-program-detail', 'make-active-from-detail', 'view-active-program', 'open-day-preview', 'close-day-preview', 'detail-toggle-bookmark', 'mark-program-complete'].includes(action)) {
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
  else if (action === 'set-rest-default') setRestDefault(parseInt(target.getAttribute('data-secs'), 10));
  else if (action === 'set-progression') setProgressionIncrement(parseFloat(target.getAttribute('data-kg')));
  else if (action === 'week-step') stepCurrentWeek(parseInt(target.getAttribute('data-delta'), 10));
  else if (action === 'export-data') exportData();
  else if (action === 'import-data') triggerImport();
  else if (action === 'reset-all-data') confirmResetAllData();
  else if (action === 'hc-toggle-connect') hcToggleConnect();
  else if (action === 'hc-sync-now') hcSyncNow();

  // Onboarding
  else if (['ob-next','ob-back','ob-goal','ob-program','ob-unit','ob-dist-unit','ob-finish'].includes(action)) {
    handleOnboardingAction(action, target);
  }

  // GPS Tracker
  else if (action === 'gps-start')  { startTracking(); }
  else if (action === 'gps-pause')  { pauseTracking(); }
  else if (action === 'gps-resume') { resumeTracking(); }
  else if (action === 'gps-stop')   { stopTracking(appState.currentWeek, selectedDay); }

  // Fasting
  else if (action === 'fast-start') {
    const goalEl = document.getElementById('fastingGoalSelect') ?? document.getElementById('fastingSheetGoalSelect');
    const goal = goalEl ? parseInt(goalEl.value, 10) : (appState.fastingSession?.goal ?? 16);
    startFast(appState, goal, () => saveStateToLocalStorage(true));
    renderHome();
    openFastingDetail();
  }
  else if (action === 'fast-stop') {
    stopFast(appState, () => saveStateToLocalStorage(true));
    closeFastingDetail();
    renderHome();
  }
  else if (action === 'fast-edit-start-time') {
    const sp = document.getElementById('fastingEditStartPanel');
    const ep = document.getElementById('fastingEditEndPanel');
    if (ep) ep.style.display = 'none';
    if (sp) sp.style.display = sp.style.display === 'none' ? '' : 'none';
  }
  else if (action === 'fast-cancel-edit-start') {
    const panel = document.getElementById('fastingEditStartPanel');
    if (panel) panel.style.display = 'none';
  }
  else if (action === 'fast-save-start-time') {
    const input = document.getElementById('fastingStartTimeInput');
    if (input?.value) {
      editFastStartTime(appState, input.value, () => saveStateToLocalStorage(true));
      openFastingDetail();
      renderHome();
    }
  }
  else if (action === 'fast-edit-end-time') {
    const sp = document.getElementById('fastingEditStartPanel');
    const ep = document.getElementById('fastingEditEndPanel');
    if (sp) sp.style.display = 'none';
    if (ep) ep.style.display = ep.style.display === 'none' ? '' : 'none';
  }
  else if (action === 'fast-cancel-edit-end') {
    const panel = document.getElementById('fastingEditEndPanel');
    if (panel) panel.style.display = 'none';
  }
  else if (action === 'fast-save-end-time') {
    const input = document.getElementById('fastingEndTimeInput');
    if (input?.value) {
      stopFastAtTime(appState, input.value, () => saveStateToLocalStorage(true));
      closeFastingDetail();
      renderHome();
    }
  }
  else if (action === 'open-fasting-detail')   { openFastingDetail(); }
  else if (action === 'close-fasting-detail')  { closeFastingDetail(); }
  else if (action === 'open-fasting-analytics') { closeFastingDetail(); openAnalyticsView('fasting'); }
  else if (action === 'fa-edu-cat' || action === 'fa-edu-article' || action === 'fa-edu-back') {
    import('./analytics/views/view-fasting.js').then(m => m.handleFastingEduAction(action, target, () => appState));
  }

  // Run Logger
  else if (action === 'open-run-logger') openRunLogger();
  else if (action === 'close-run-logger') closeRunLogger();
  else if (action === 'save-run-log')    saveManualRun();
  else if (action === 'rl-day')          { document.querySelectorAll('[data-action="rl-day"]').forEach(b => b.classList.remove('active')); target.classList.add('active'); }
  else if (action === 'rl-rpe')          handleRunLoggerRpeClick(target);

  // Export & Data
else if (action === 'export-csv') triggerCSVExport();
  
  // Auth
  else if (action === 'login-supabase') loginToSupabase();
  else if (action === 'signup-supabase') signUpToSupabase();
  else if (action === 'close-auth') {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = 'none';
  }
  
  // Summary Modals
  else if (action === 'open-today-summary') openTodaySummaryModal();
  else if (action === 'close-today-summary') closeTodaySummaryModal();
  else if (action === 'close-today-summary-nav') { 
    closeTodaySummaryModal(); 
    switchGlobalAppTab('workout'); 
  }
  
  // Athlete Profile
  else if (['set-pr-goal', 'confirm-pr-goal', 'close-pr-goal-modal', 'open-session-detail', 'close-session-detail', 'open-wellness-detail', 'close-wellness-detail'].includes(action))
    handleProfileAction(action, target);

  // Analytics
  else if (action === 'log-body-weight') logBodyWeight();
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
  const hcField = target.getAttribute?.('data-hc-field');
  if (hcField) { hcToggleSyncField(hcField, target.checked); return; }
  if (target.id === 'settingsAutoAdvance') { setAutoAdvanceWeek(target.checked); return; }

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
}, true);

document.addEventListener('input', (e) => {
  if (e.target.id === 'elSearchInput') handleExerciseSearch(e.target.value);
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
  if (id) {
    triggerMakeActiveProgram(id);
    updateLibraryState(appState);
    renderLibrary();
    showActivePlanView(true);
  }
});

document.addEventListener('library:view-active', () => {
  showActivePlanView(true);
});

document.addEventListener('library:continue-training', () => {
  switchGlobalAppTab('workout');
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
initWorkout(getState, getSelectedDay, getDays, saveState, switchGlobalAppTab);
initSettings(getState);
initRunLogger(getState);
initOnboarding(getState);
initProgramLibrary(appState);
initAthleteProfile(getState, getDays, saveState);
initGpsTracker();

// Save auto-filled inputs, persist km splits, and render the pace-zone map after GPS tracking finishes.
document.addEventListener('gps:route-saved', (e) => {
  const { week, day, distKm, splits, coords } = e.detail;

  // Write splits into state before commitWorkoutUIState spreads existing data.
  if (splits && splits.length > 0 && appState.weeks[week]) {
    const existing = appState.weeks[week].runs?.[day] || {};
    if (!appState.weeks[week].runs) appState.weeks[week].runs = {};
    appState.weeks[week].runs[day] = { ...existing, splits };
  }

  try { commitWorkoutUIState(); } catch (_) {}
  try {
    renderRunMap(week, day, distKm, {
      splits,
      thresholdSec: appState.thresholdPaceSeconds,
    });
  } catch (_) {}
});

// === DEVICE IMPORT WIRING ===

initGarminRunImport((distance, timeStr, coordinates, stats) => {
  const wk = appState.currentWeek;
  const sd = selectedDay;
  if (appState.weeks[wk]) {
    if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
    appState.weeks[wk].runs[sd] = {
      dist:           distance,
      time:           timeStr,
      rpe:            appState.weeks[wk].runs[sd]?.rpe || '',
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
    };
  }
  if (appState.weeks[wk]) {
    if (!appState.weeks[wk].dates) appState.weeks[wk].dates = {};
    if (!appState.weeks[wk].dates[sd]) {
      appState.weeks[wk].dates[sd] = new Date().toISOString().slice(0, 10);
    }
  }
  if (coordinates && coordinates.length > 0) {
    saveMapToDB(wk, sd, coordinates).then(() => {
      saveStateToLocalStorage(true); hydrateCurrentView();
    });
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
      appState.weeks[wk].dates[sd] = new Date().toISOString().slice(0, 10);
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

async function bootstrapApp() {
  try {
    determineDefaultCalendarDay();
    await checkActiveSession();
    await pullEngineDataFromStorage();

    const currentTab = activeTab || 'home';
    const currentDay = selectedDay || 'mon';

    verifyWeekStorageSchema(appState.currentWeek);
    setCockpitActiveDay(currentDay);
    switchGlobalAppTab(currentTab);
    checkActiveTimerOnLoad();
    window._hybridGetProgram = () => getProgramById(appState.activeProgramId);
    applySettingsOnBoot(appState);
    checkForAutomaticWeekAdvance();
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