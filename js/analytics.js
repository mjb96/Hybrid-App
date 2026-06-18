// ==========================================
// PERFORMANCE MATRIX — analytics.js (orchestrator)
// ==========================================
import { getProgramById, saveStateToLocalStorage } from './state.js';
import { todayKey } from './dates.js';
import { parsePaceSeconds } from './analytics/utils.js';
import { renderStrengthAnalytics, render1RMList, render1RMProgressSection } from './analytics/views/view-strength.js';
import { renderRunningAnalytics } from './analytics/views/view-running.js';
import { renderRecoveryAnalytics, renderRecoveryScoreDetail } from './analytics/views/view-recovery.js';
import { renderBodyWeightAnalytics } from './analytics/views/view-bodyweight.js';
import {
  renderProgressAnalytics,
  renderWeeklyVolumeDetail,
  renderStreakDetail,
  renderGoalProgressDetail,
} from './analytics/views/view-progress.js';
import { renderTrainingStatusAnalytics } from './analytics/views/view-training-status.js';
import { renderLoadFocusAnalytics } from './analytics/views/view-load-focus.js';
import { renderRunCrossRefAnalytics } from './analytics/views/view-run-crossref.js';
import { renderVdotAnalytics } from './analytics/views/view-vdot.js';

let _getState;
let _getDays;

export function initAnalytics(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays = getDaysFn;
}

// ==========================================
// LOCAL STATE MUTATORS
// ==========================================
export function saveThresholdPace(val) {
  if (!_getState) return;
  const appState = _getState();
  appState.thresholdPaceSeconds = parseInt(val, 10) || 0;
  saveStateToLocalStorage(true);
  renderAnalytics();
}

export function logBodyWeight() {
  if (!_getState) return;
  const input = document.getElementById('analyticsBwInput');
  if (!input || !input.value) return;

  const appState = _getState();
  const weight = parseFloat(input.value);
  if (isNaN(weight)) return;

  if (!appState.bodyWeightLog) appState.bodyWeightLog = [];

  const today = todayKey();
  const existingIdx = appState.bodyWeightLog.findIndex(l => l.date === today);
  if (existingIdx >= 0) {
    appState.bodyWeightLog[existingIdx].weight = weight;
  } else {
    appState.bodyWeightLog.push({ date: today, weight: weight });
  }

  saveStateToLocalStorage(true);
  input.value = '';
  renderAnalytics();
}

// ==========================================
// DATA COLLECTION
// ==========================================
function collectAnalyticsData() {
  const appState     = _getState();
  const DEFAULT_DAYS = _getDays();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;

  const data = {
    dynamicStats: {},
    weekLabels: [],
    volData: [],
    runData: [],
    rpeData: [],
    paceData: [],

    cadenceData: [],
    teData: [],
    gymHrData: [],
    gymCalsData: [],
    hrZonesData: [],

    globalTotalDist: 0,
    globalTotalElev: 0,
    globalTotalCals: 0,
    globalTotalSets: 0,
    globalTotalVol: 0,
    absoluteMesoPeakVol: 0,

    globalTotalGymCals: 0,
    globalAvgGymHr: 0,

    thresholdSecs: appState.thresholdPaceSeconds || null,
    bodyWeightLog: appState.bodyWeightLog || [],
  };

  if (appState.weeks) {
    Object.keys(appState.weeks).forEach(wKey => {
      const wkData = appState.weeks[wKey];
      if (!wkData || !wkData.lifts) return;

      DEFAULT_DAYS.forEach(d => {
        const dayLifts = wkData.lifts[d];
        if (!dayLifts) return;

        for (const lift in dayLifts) {
          if (!Array.isArray(dayLifts[lift])) continue;

          if (!data.dynamicStats[lift]) {
            data.dynamicStats[lift] = { allTimeMax: 0, currentEstimatedMax: 0, previousWeekMax: 0 };
          }

          const prevWeek = (parseInt(appState.currentWeek, 10) - 1).toString();

          dayLifts[lift].forEach(s => {
            const completed = s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
            const weight = parseFloat(s.w) || 0;
            const reps   = parseInt(s.r, 10) || 0;

            if (completed && weight > 0 && reps > 0) {
              const e1rm = weight * (1 + reps / 30);
              if (e1rm > data.dynamicStats[lift].allTimeMax)          data.dynamicStats[lift].allTimeMax = e1rm;
              if (wKey === appState.currentWeek && e1rm > data.dynamicStats[lift].currentEstimatedMax) data.dynamicStats[lift].currentEstimatedMax = e1rm;
              if (wKey === prevWeek && e1rm > data.dynamicStats[lift].previousWeekMax)                 data.dynamicStats[lift].previousWeekMax = e1rm;
            }
          });
        }
      });
    });
  }

  for (let w = 1; w <= maxWeek; w++) {
    const wKey   = w.toString();
    data.weekLabels.push('W' + w);
    const wkData = appState.weeks?.[wKey];

    if (!wkData) {
      data.volData.push(0); data.runData.push(0); data.rpeData.push(0); data.paceData.push(0);
      data.cadenceData.push(0); data.teData.push(0); data.gymHrData.push(0); data.gymCalsData.push(0);
      data.hrZonesData.push([0, 0, 0, 0, 0]);
      continue;
    }

    let weekVol = 0, weekDist = 0, weekElev = 0, weekCals = 0;
    let weekRpeSum = 0, weekRpeCount = 0;
    let weekRunTime = 0, weekRunDist = 0;
    let weekCadenceSum = 0, weekCadenceCount = 0;
    let weekTeSum = 0, weekTeCount = 0;
    let weekGymHrSum = 0, weekGymHrCount = 0;
    let weekGymCals = 0;
    let weekHrZones = [0, 0, 0, 0, 0];

    DEFAULT_DAYS.forEach(d => {
      const run  = wkData.runs?.[d] || {};
      const dist = parseFloat(run.dist) || 0;
      const elev = parseFloat(run.elev) || 0;
      const cals = parseFloat(run.cals) || 0;
      weekDist += dist; weekElev += elev; weekCals += cals;

      const paceS = parsePaceSeconds(dist, run.time || '');
      if (paceS > 0 && dist > 0) { weekRunTime += paceS * dist; weekRunDist += dist; }

      const runRpe = parseFloat(run.rpe) || 0;
      if (runRpe > 0) { weekRpeSum += runRpe; weekRpeCount++; }

      if (run.avgCadence)    { weekCadenceSum += parseFloat(run.avgCadence); weekCadenceCount++; }
      if (run.trainingEffect){ weekTeSum += parseFloat(run.trainingEffect); weekTeCount++; }
      if (Array.isArray(run.hrZones)) {
        run.hrZones.forEach((z, i) => { if (i < 5) weekHrZones[i] += parseFloat(z) || 0; });
      }

      const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
      if (gymRpe > 0) { weekRpeSum += gymRpe; weekRpeCount++; }

      const gym = wkData.gymStats?.[d] || {};
      if (gym.avgHR) { weekGymHrSum += parseFloat(gym.avgHR); weekGymHrCount++; }
      if (gym.cals)  { weekGymCals += parseFloat(gym.cals); weekCals += parseFloat(gym.cals); }

      const dayLifts = wkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          const completed = s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1;
          if (completed) {
            weekVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
            data.globalTotalSets++;
          }
        });
      }
    });

    data.globalTotalDist += weekDist;
    data.globalTotalElev += weekElev;
    data.globalTotalCals += weekCals;
    data.globalTotalVol  += weekVol;
    if (weekVol > data.absoluteMesoPeakVol) data.absoluteMesoPeakVol = weekVol;

    data.volData.push(weekVol);
    data.runData.push(weekDist);
    data.rpeData.push(weekRpeCount > 0 ? weekRpeSum / weekRpeCount : 0);
    data.paceData.push(weekRunDist > 0 ? weekRunTime / weekRunDist : 0);
    data.cadenceData.push(weekCadenceCount > 0 ? weekCadenceSum / weekCadenceCount : 0);
    data.teData.push(weekTeCount > 0 ? weekTeSum / weekTeCount : 0);
    data.gymHrData.push(weekGymHrCount > 0 ? weekGymHrSum / weekGymHrCount : 0);
    data.gymCalsData.push(weekGymCals);
    data.hrZonesData.push(weekHrZones);
  }

  data.globalTotalGymCals = data.gymCalsData.reduce((a, b) => a + b, 0);
  const validGymHr = data.gymHrData.filter(h => h > 0);
  data.globalAvgGymHr = validGymHr.length ? validGymHr.reduce((a, b) => a + b, 0) / validGymHr.length : 0;

  return data;
}

// ==========================================
// MASTER ROUTER
// ==========================================
export function renderAnalytics() {
  if (!_getState || !_getDays) return;

  const data    = collectAnalyticsData();
  const context = window.analyticsContext || 'overview';

  document.querySelectorAll('.analytics-section').forEach(sec => sec.classList.remove('active'));

  switch (context) {
    case 'strength':
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
      break;
    case 'strength_pr':
      document.getElementById('analytics-strength_pr').classList.add('active');
      render1RMList(document.getElementById('allLiftsRmContainer_PR'), data.dynamicStats);
      render1RMProgressSection(document.getElementById('analytics-strength_pr'), data.weekLabels, _getState, _getDays);
      break;
    case 'running':
      document.getElementById('analytics-running').classList.add('active');
      renderRunningAnalytics(data);
      break;
    case 'recovery':
      document.getElementById('analytics-recovery').classList.add('active');
      renderRecoveryAnalytics(data, _getState, _getDays);
      break;
    case 'recovery-score':
      document.getElementById('analytics-recovery-score').classList.add('active');
      renderRecoveryScoreDetail(data, _getState, _getDays);
      break;
    case 'bodyweight':
      document.getElementById('analytics-bodyweight').classList.add('active');
      renderBodyWeightAnalytics(data, _getState);
      break;
    case 'progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressAnalytics(data, _getState);
      break;
    case 'weekly-volume':
      document.getElementById('analytics-weekly-volume').classList.add('active');
      renderWeeklyVolumeDetail(data, _getState, _getDays);
      break;
    case 'streak':
      document.getElementById('analytics-streak').classList.add('active');
      renderStreakDetail(data, _getState, _getDays);
      break;
    case 'goal-progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressAnalytics(data, _getState);
      renderGoalProgressDetail(data, _getState);
      break;
    case 'training-status':
      document.getElementById('analytics-training-status').classList.add('active');
      renderTrainingStatusAnalytics(data, _getState, _getDays);
      break;
    case 'load-focus':
      document.getElementById('analytics-load-focus').classList.add('active');
      renderLoadFocusAnalytics(data, _getState, _getDays);
      break;
    case 'run-crossref':
      document.getElementById('analytics-run-crossref').classList.add('active');
      renderRunCrossRefAnalytics(data, _getState, _getDays);
      break;
    case 'vdot':
      document.getElementById('analytics-vdot').classList.add('active');
      renderVdotAnalytics(data, _getState, _getDays);
      break;
    default:
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
  }
}
