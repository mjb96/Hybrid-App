// ==========================================
// PERFORMANCE MATRIX — analytics.js (orchestrator)
// ==========================================
import { getProgramById, saveStateToLocalStorage } from './state.js';
import { isCompletedSet } from './set-utils.js';
import { todayKey } from './dates.js';
import { parsePaceSeconds } from './analytics/utils.js';
import { renderStrengthAnalytics, render1RMList, render1RMProgressSection, setStrengthTab } from './analytics/views/view-strength.js';
import { renderRunningAnalytics, setRunningTab } from './analytics/views/view-running.js';
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
import { renderAvgPaceAnalytics } from './analytics/views/view-avg-pace.js';
import { renderStressBalanceAnalytics } from './analytics/views/view-stress-balance.js';
import { renderActivityCalendar } from './home.js';
import { initWeekNav, updateWeekNavDisplay, getSelectedWeek, resetWeekNav } from './analytics/week-nav.js';
import { renderWeeklySummaryAnalytics } from './analytics/views/view-weekly-summary.js';
import { renderFastingAnalytics } from './analytics/views/view-fasting.js';
import { computeDashboardModel } from './home/dashboard-model.js';
import { computeHybridScore } from './brain/hybrid-score/hybrid-score.js';
import { detailHTML as hybridScoreDetailHTML } from './brain/hybrid-score/ui.js';
import { buildWeeklyReview } from './brain/weekly-review.js';
import { renderWeeklyReview } from './analytics/views/view-weekly-review.js';
import { renderProjections } from './analytics/views/view-projections.js';
import { renderMonthlyReport } from './analytics/views/view-monthly-report.js';
import { buildSoWhat } from './analytics/so-what.js';

let _getState;
let _getDays;
let _analyticsContext = 'weekly-summary';

export function setAnalyticsContext(ctx) { _analyticsContext = ctx || 'weekly-summary'; }

export function initAnalytics(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays  = getDaysFn;
  initWeekNav(_getState, renderAnalytics);
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
    distUnit: appState.settings?.distanceUnit || 'km',
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

          const displayName = lift;

          if (!data.dynamicStats[displayName]) {
            data.dynamicStats[displayName] = { allTimeMax: 0, currentEstimatedMax: 0, previousWeekMax: 0 };
          }

          const prevWeek = (parseInt(appState.currentWeek, 10) - 1).toString();

          dayLifts[lift].forEach(s => {
            const completed = isCompletedSet(s);
            const weight = parseFloat(s.w) || 0;
            const reps   = parseInt(s.r, 10) || 0;

            if (completed && weight > 0 && reps > 0 && s.type !== 'W') {
              const e1rm = weight * (1 + reps / 30);
              if (e1rm > data.dynamicStats[displayName].allTimeMax)          data.dynamicStats[displayName].allTimeMax = e1rm;
              if (wKey === appState.currentWeek && e1rm > data.dynamicStats[displayName].currentEstimatedMax) data.dynamicStats[displayName].currentEstimatedMax = e1rm;
              if (wKey === prevWeek && e1rm > data.dynamicStats[displayName].previousWeekMax)                 data.dynamicStats[displayName].previousWeekMax = e1rm;
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

      const gym = wkData.gymStats?.[d] || {};
      if (gym.avgHR) { weekGymHrSum += parseFloat(gym.avgHR); weekGymHrCount++; }
      if (gym.cals)  { weekGymCals += parseFloat(gym.cals); weekCals += parseFloat(gym.cals); }

      const dayLifts = wkData.lifts?.[d] || {};
      let daySetRpeSum = 0, daySetRpeCount = 0;
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          const completed = isCompletedSet(s);
          if (completed && s.type !== 'W') {
            weekVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
            data.globalTotalSets++;
          }
          if (completed && s.rpe && s.type !== 'W') {
            daySetRpeSum += parseFloat(s.rpe) || 0;
            daySetRpeCount++;
          }
        });
      }
      // Per-set RPEs take priority; fall back to session-level gymRpe when absent.
      if (daySetRpeCount > 0) {
        weekRpeSum += daySetRpeSum / daySetRpeCount;
        weekRpeCount++;
      } else {
        const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
        if (gymRpe > 0) { weekRpeSum += gymRpe; weekRpeCount++; }
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

  const trainingDays = [];
  Object.keys(appState.weeks || {}).forEach(wk => {
    const wkData = appState.weeks[wk];
    DEFAULT_DAYS.forEach((d, dayIdx) => {
      const dayLifts = wkData?.lifts?.[d] || {};
      let completedSets = 0;
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          if (isCompletedSet(s)) completedSets++;
        });
      }
      const gymHasData = completedSets > 0;
      const runHasData = parseFloat(wkData?.runs?.[d]?.dist) > 0;
      if (gymHasData || runHasData) {
        trainingDays.push({ week: parseInt(wk, 10), dayIdx, gym: gymHasData, run: runHasData });
      }
    });
  });
  data._trainingDays = trainingDays;

  return data;
}

// ==========================================
// MASTER ROUTER
// ==========================================
export function renderAnalytics() {
  if (!_getState || !_getDays) return;

  updateWeekNavDisplay(_getState);

  const data    = collectAnalyticsData();
  const context = _analyticsContext;

  document.querySelectorAll('.analytics-section').forEach(sec => sec.classList.remove('active'));

  // The hub is an index screen: hide the week navigator (it has no meaning there)
  // and send "back" to the dashboard. Every leaf section instead routes "back" to
  // the hub, so you can browse multiple sections without bouncing home each time.
  const weekNav = document.getElementById('analyticsWeekNav');
  if (weekNav) weekNav.style.display = (context === 'hub' || context === 'hybrid-score' || context === 'weekly-review' || context === 'projections' || context === 'monthly-report') ? 'none' : '';
  const backBtn = document.querySelector('#view-analytics .subview-back-btn');
  if (backBtn) {
    if (context === 'hub') {
      // The hub is now a top-level nav destination — the bottom nav is the way
      // out, so no back button is needed on the index itself.
      backBtn.style.display = 'none';
    } else {
      backBtn.style.display = '';
      backBtn.setAttribute('data-action', 'open-analytics');
      backBtn.setAttribute('data-context', 'hub');
      backBtn.textContent = '← Back to Insights';
    }
  }

  switch (context) {
    case 'hub':
      document.getElementById('analytics-hub').classList.add('active');
      break;
    case 'weekly-review': {
      document.getElementById('analytics-weekly-review').classList.add('active');
      const stR = _getState();
      const review = buildWeeklyReview(stR, _getDays(), getProgramById(stR.activeProgramId));
      renderWeeklyReview(review, stR);
      break;
    }
    case 'projections':
      document.getElementById('analytics-projections').classList.add('active');
      renderProjections(_getState, _getDays);
      break;
    case 'monthly-report':
      document.getElementById('analytics-monthly-report').classList.add('active');
      renderMonthlyReport(_getState, _getDays, () => getProgramById(_getState().activeProgramId));
      break;
    case 'hybrid-score': {
      document.getElementById('analytics-hybrid-score').classList.add('active');
      const st = _getState();
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
      const model = computeDashboardModel(st, _getDays(), getProgramById(st.activeProgramId), dayKey);
      const result = computeHybridScore(model, st, _getDays());
      const el = document.getElementById('hybridScoreDetail');
      if (el) el.innerHTML = hybridScoreDetailHTML(result, st);
      break;
    }
    case 'weekly-summary': {
      document.getElementById('analytics-weekly-summary').classList.add('active');
      const selectedWk = getSelectedWeek(_getState().currentWeek);
      renderWeeklySummaryAnalytics(data, _getState, _getDays, selectedWk);
      break;
    }
    case 'strength':
      setStrengthTab('overview');
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data, _getState, _getDays);
      break;
    // V2 (S2): the old 1RM (strength_pr) and Weekly-Volume leaves are absorbed
    // into the Strength screen's Stats tab — redirect so deep links still resolve.
    case 'strength_pr':
    case 'weekly-volume':
      setStrengthTab('stats');
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data, _getState, _getDays);
      break;
    case 'running':
      setRunningTab('overview');
      document.getElementById('analytics-running').classList.add('active');
      renderRunningAnalytics(data, _getState, _getDays);
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
    // V2 (S2): avg-pace, vdot, run-crossref are absorbed into the Running
    // screen's Stats tab — redirect so deep links still resolve.
    case 'run-crossref':
    case 'vdot':
    case 'avg-pace':
      setRunningTab('stats');
      document.getElementById('analytics-running').classList.add('active');
      renderRunningAnalytics(data, _getState, _getDays);
      break;
    case 'stress-balance':
      document.getElementById('analytics-stress-balance').classList.add('active');
      renderStressBalanceAnalytics(data, _getState, _getDays);
      break;
    case 'activity':
      document.getElementById('analytics-activity').classList.add('active');
      renderActivityCalendar(_getState(), 'analyticsCalendarContainer');
      break;
    case 'fasting':
      document.getElementById('analytics-fasting').classList.add('active');
      renderFastingAnalytics(_getState);
      break;
    default: {
      document.getElementById('analytics-weekly-summary').classList.add('active');
      const selectedWkDef = getSelectedWeek(_getState().currentWeek);
      renderWeeklySummaryAnalytics(data, _getState, _getDays, selectedWkDef);
      break;
    }
  }

  renderSoWhatBanner(context);
}

// ==========================================
// "SO WHAT?" BANNER (R8) — one prescriptive line at the top of every leaf,
// injected here so the 19 view modules stay untouched. buildSoWhat is pure
// and returns null for surfaces that already prescribe (hub / hybrid-score /
// weekly-review). Text is app-generated only — safe to inject.
// ==========================================
function renderSoWhatBanner(context) {
  const active = document.querySelector('.analytics-section.active');
  if (!active) return;
  active.querySelectorAll('.so-what').forEach(n => n.remove());

  let sw = null;
  try {
    const st = _getState();
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
    const model = computeDashboardModel(st, _getDays(), getProgramById(st.activeProgramId), dayKey);
    sw = buildSoWhat(context, model, st);
  } catch (_) { /* banner is best-effort — never block the view */ }
  if (!sw) return;

  const div = document.createElement('div');
  div.className = `so-what so-what--${sw.tone}`;
  div.innerHTML = `<span class="so-what__k">So what?</span><span class="so-what__t">${sw.text}</span>`;
  active.prepend(div);
}
