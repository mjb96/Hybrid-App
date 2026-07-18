// @ts-check
// ==========================================
// HYBRID BRAIN — LOAD MODELS (js/brain/load_models.js)
//
// Three-concept load model:
//   Strength Load  → completed tonnage (kg) — mechanical stimulus
//   Endurance Load → weekly distance (km)   — aerobic volume
//   Recovery Cost  → cross-modal sRPE (RPE × minutes), acute/chronic balance
//
// Also exports recomputeLoadMetrics() for EWMA-based CTL/ATL persistence.
// Called by state.js before every save so appState.loadMetrics stays current.
// ==========================================
import { dayVolume } from '../set-utils.js';
import { runDaySummary } from '../state/run-sessions.js';
import {
  dailyTrainingLoadTimeline,
  programWeekDailyLoads,
  programWeekLoadBalance,
  programWeekLoadBreakdown,
} from '../metrics/training-load.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// EWMA decay constants — span-based equivalents of 7-day (ATL) and 28-day (CTL)
const λ_ATL = 2 / (7 + 1);    // 0.25
const λ_CTL = 2 / (28 + 1);   // ≈ 0.0690

// ---- Weekly series (pure, no EWMA) ----------------------------------------

// Completed working-set tonnage per week. Excludes warmups and incomplete sets.
export function strengthLoadSeries(state, days, maxWeek) {
  const result = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    let tonnage = 0;
    if (wkData) {
      days.forEach(d => { tonnage += dayVolume(wkData.lifts?.[d]); });
    }
    result.push(tonnage);
  }
  return result;
}

// Weekly running distance (km).
export function enduranceLoadSeries(state, days, maxWeek) {
  const result = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    let dist = 0;
    if (wkData) {
      days.forEach(d => {
        dist += parseFloat(runDaySummary(wkData, d).dist) || 0;
      });
    }
    result.push(dist);
  }
  return result;
}

// Cross-modal sRPE (RPE × minutes) per week — the recovery-cost currency.
export function recoveryCostSeries(state, days, maxWeek) {
  return programWeekLoadBreakdown(state, days, maxWeek).total;
}

// Breakdown into gym (strength) and run (endurance) sRPE components.
export function recoveryCostBreakdown(state, days, maxWeek) {
  return programWeekLoadBreakdown(state, days, maxWeek);
}

// Acute/chronic ACWR on the recovery-cost series.
// Acute   = current week sRPE total.
// Chronic = mean of the prior weeks with load, over a rolling window of up to 4
//           (uncoupled ACWR, ~28-day chronic). Using a single prior week — as
//           this did before — let one easy week swing the ratio into the danger
//           band; a 4-week mean is the standard Gabbett/TrainingPeaks chronic.
// ACWR rounded to 2 decimal places.
export function recoveryCostBalance(state, days, currentWeek, maxWeek) {
  return programWeekLoadBalance(state, days, currentWeek, maxWeek);
}

// Bundles all three load concepts plus acute/chronic balance.
export function loadProfile(state, days, currentWeek, maxWeek) {
  return {
    strength:     strengthLoadSeries(state, days, maxWeek),
    endurance:    enduranceLoadSeries(state, days, maxWeek),
    recoveryCost: recoveryCostSeries(state, days, maxWeek),
    breakdown:    recoveryCostBreakdown(state, days, maxWeek),
    balance:      recoveryCostBalance(state, days, currentWeek, maxWeek),
  };
}

// ---- EWMA CTL/ATL (stored in appState.loadMetrics) ------------------------

// Returns { atl: number[], ctl: number[] } — EWMA ATL and CTL at end of each week.
// Advances through all 7 days per week (rest days contribute 0 load) so EWMA
// decay is calendar-correct. Series length equals maxWeek.
export function weeklyLoadMetricsSeries(state, days, maxWeek) {
  let atl = 0, ctl = 0;
  const atlSeries = [], ctlSeries = [];
  for (let w = 1; w <= maxWeek; w++) {
    programWeekDailyLoads(state, DAY_KEYS, w).forEach(dayLoad => {
      atl = dayLoad * λ_ATL + atl * (1 - λ_ATL);
      ctl = dayLoad * λ_CTL + ctl * (1 - λ_CTL);
    });
    atlSeries.push(atl);
    ctlSeries.push(ctl);
  }
  return { atl: atlSeries, ctl: ctlSeries };
}

// Recomputes CTL (28-day EWMA) and ATL (7-day EWMA) from the full history.
// Returns { atl, ctl } — stored as appState.loadMetrics and persisted on
// every save. TSB = CTL - ATL (positive = fresh, negative = fatigued).
export function recomputeLoadMetrics(state, options = {}) {
  const timeline = dailyTrainingLoadTimeline(state, options);
  let atl = 0, ctl = 0;
  for (const { load } of timeline) {
    atl = load * λ_ATL + atl * (1 - λ_ATL);
    ctl = load * λ_CTL + ctl * (1 - λ_CTL);
  }
  return { atl, ctl };
}
