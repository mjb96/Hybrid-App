// ==========================================
// LOAD / READINESS METRICS (metrics/metrics-load.js)
// ==========================================
// Pure functions — no DOM, no imports, no side effects.
// ==========================================

function parseMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(timeStr) || 0;
}

// ---- public API -----------------------------------------------------------

// sRPE-based weekly load broken into lift and run components.
// lift load = gymRpe × gymTime(min); run load = runRpe × runTime(min).
// Returns {lift: number[], run: number[]}, each of length maxWeek.
export function weeklyLoadSeries(state, days, maxWeek) {
  const lift = [], run = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    let liftLoad = 0, runLoad = 0;
    if (wkData) {
      days.forEach(d => {
        const gymRpe  = parseFloat(wkData.gymRpe?.[d]) || 0;
        const gymMins = parseFloat(wkData.gymStats?.[d]?.time) || 0;
        if (gymRpe > 0 && gymMins > 0) liftLoad += gymRpe * gymMins;

        const runEntry = wkData.runs?.[d] || {};
        const runRpe   = parseFloat(runEntry.rpe) || 0;
        const runMins  = parseMinutes(runEntry.time);
        if (runRpe > 0 && runMins > 0) runLoad += runRpe * runMins;
      });
    }
    lift.push(liftLoad);
    run.push(runLoad);
  }
  return { lift, run };
}

// Average of all gym and run RPE readings per week. 0 when none logged.
export function weeklyRpeSeries(state, days, maxWeek) {
  const result = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    let sum = 0, count = 0;
    if (wkData) {
      days.forEach(d => {
        const gRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
        if (gRpe > 0) { sum += gRpe; count++; }
        const rRpe = parseFloat(wkData.runs?.[d]?.rpe) || 0;
        if (rRpe > 0) { sum += rRpe; count++; }
      });
    }
    result.push(count > 0 ? sum / count : 0);
  }
  return result;
}

// ACWR-based readiness: acute = currentWeek combined load, chronic = previous week.
// Requires at least 2 weeks of data. Returns {hasData, acwr, acute, chronic}.
export function readinessMetrics(state, days, currentWeek, maxWeek) {
  const wkNum = parseInt(currentWeek, 10) || 1;
  if (maxWeek < 2 || wkNum < 2) return { hasData: false, acwr: 0, acute: 0, chronic: 0 };

  const loads = weeklyLoadSeries(state, days, maxWeek);
  const idx = wkNum - 1;
  if (idx >= loads.lift.length) return { hasData: false, acwr: 0, acute: 0, chronic: 0 };

  const acute   = loads.lift[idx]     + loads.run[idx];
  const chronic = loads.lift[idx - 1] + loads.run[idx - 1];

  if (acute === 0 && chronic === 0) return { hasData: false, acwr: 0, acute, chronic };

  const acwr = chronic > 0 ? acute / chronic : 0;
  return { hasData: true, acwr, acute, chronic };
}

// Recovery score (0–100) based on current-week average RPE.
// Returns {hasData, score, recommendation}.
export function recoveryMetrics(state, days) {
  const curWk = String(state.currentWeek || '1');
  const wkData = (state.weeks || {})[curWk];
  let sum = 0, count = 0;

  if (wkData) {
    days.forEach(d => {
      const gRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
      if (gRpe > 0) { sum += gRpe; count++; }
      const rRpe = parseFloat(wkData.runs?.[d]?.rpe) || 0;
      if (rRpe > 0) { sum += rRpe; count++; }
    });
  }

  if (count === 0) return { hasData: false, score: 0, recommendation: '' };

  const avgRpe = sum / count;
  const score  = Math.round(Math.max(0, Math.min(100, ((10 - avgRpe) / 9) * 100)));

  let recommendation;
  if      (score >= 80) recommendation = 'Well recovered. You can push intensity today.';
  else if (score >= 60) recommendation = 'Moderately recovered. Stick to planned volume.';
  else if (score >= 40) recommendation = 'Fatigue accumulating. Prioritise sleep tonight.';
  else                  recommendation = 'High fatigue load. Consider a deload or rest day.';

  return { hasData: true, score, recommendation };
}

// Form/TSB (training-stress balance = fitness − fatigue) for the Recovery leaf's
// stat card. TSB is only meaningful once real training-load history exists; with
// no data currentCTL is 0 and TSB collapses to 0, which must NOT be shown as a
// confident "0 · fresh / peaking" verdict. Returns a neutral empty state instead,
// mirroring the ACWR card and the Stats-tab TSB. Pure + unit-tested.
export function formatFormTSB(currentCTL, currentATL) {
  const hasData = (Number(currentCTL) || 0) > 0;
  if (!hasData) return { value: '--', sub: 'Log training to build this' };
  const tsb = Math.round((Number(currentCTL) || 0) - (Number(currentATL) || 0));
  return {
    value: tsb > 0 ? `+${tsb}` : String(tsb),
    sub: tsb >= 0 ? 'fresh / peaking' : 'carrying fatigue',
  };
}

// Streak view derived from stored streakData. Detects broken streaks (last
// activity > 1 day ago). Uses UTC dates to match how lastActivityDate is stored.
export function streakView(streakData) {
  if (!streakData || !streakData.lastActivityDate) {
    return { hasData: false, current: 0, longest: 0, broken: false };
  }

  const todayUTC = new Date().toISOString().slice(0, 10);
  const da = new Date(streakData.lastActivityDate + 'T00:00:00Z');
  const db = new Date(todayUTC + 'T00:00:00Z');
  const diff = isNaN(da.getTime()) ? null : Math.round((db - da) / 86400000);

  const broken = diff !== null && diff > 1;
  return {
    hasData:  true,
    current:  broken ? 0 : (streakData.current || 0),
    longest:  streakData.longest || 0,
    broken,
  };
}
