// ==========================================
// RUNNING METRICS (metrics/metrics-running.js)
// ==========================================
// Pure functions — no DOM, no imports, no side effects.
// ==========================================

function parseMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(timeStr) || 0;
}

// Returns pace in seconds/km for a given distance (km) and time string (MM:SS or HH:MM:SS).
function parsePaceSecs(dist, timeStr) {
  const d = parseFloat(dist) || 0;
  if (!d || !timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  let secs = 0;
  if (parts.length === 2) secs = parts[0] * 60 + parts[1];
  else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  return secs > 0 ? secs / d : 0;
}

function eachWeek(state, days, maxWeek, fn) {
  const result = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    result.push(fn(wkData, days));
  }
  return result;
}

// ---- public API -----------------------------------------------------------

// Total running distance (km) per week.
export function weeklyDistanceSeries(state, days, maxWeek) {
  return eachWeek(state, days, maxWeek, (wkData, days) => {
    let dist = 0;
    if (wkData) days.forEach(d => { dist += parseFloat(wkData.runs?.[d]?.dist) || 0; });
    return dist;
  });
}

// Total elevation gain (m) per week.
export function weeklyElevationSeries(state, days, maxWeek) {
  return eachWeek(state, days, maxWeek, (wkData, days) => {
    let elev = 0;
    if (wkData) days.forEach(d => { elev += parseFloat(wkData.runs?.[d]?.elev) || 0; });
    return elev;
  });
}

// Distance-weighted average pace (s/km) per week. Returns 0 for empty weeks.
export function weeklyPaceSeries(state, days, maxWeek) {
  return eachWeek(state, days, maxWeek, (wkData, days) => {
    let totalDist = 0, weightedSecs = 0;
    if (wkData) {
      days.forEach(d => {
        const run = wkData.runs?.[d] || {};
        const dist = parseFloat(run.dist) || 0;
        const pace = parsePaceSecs(dist, run.time || '');
        if (dist > 0 && pace > 0) { weightedSecs += pace * dist; totalDist += dist; }
      });
    }
    return totalDist > 0 ? weightedSecs / totalDist : 0;
  });
}

// Average and maximum HR per week. Returns {avgHr: number[], maxHr: number[]}.
export function weeklyHrSeries(state, days, maxWeek) {
  const avgHr = [], maxHr = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = (state.weeks || {})[String(w)];
    let hrSum = 0, hrCount = 0, hrMax = 0;
    if (wkData) {
      days.forEach(d => {
        const run = wkData.runs?.[d] || {};
        const avg = parseFloat(run.avgHR) || 0;
        const max = parseFloat(run.maxHR) || 0;
        if (avg > 0) { hrSum += avg; hrCount++; }
        if (max > hrMax) hrMax = max;
      });
    }
    avgHr.push(hrCount > 0 ? Math.round(hrSum / hrCount) : 0);
    maxHr.push(hrMax);
  }
  return { avgHr, maxHr };
}

// Accumulated HR zone minutes per week. Each entry is a 5-element array [z1..z5].
export function weeklyHrZonesSeries(state, days, maxWeek) {
  return eachWeek(state, days, maxWeek, (wkData, days) => {
    const zones = [0, 0, 0, 0, 0];
    if (wkData) {
      days.forEach(d => {
        const hrz = wkData.runs?.[d]?.hrZones;
        if (Array.isArray(hrz)) hrz.forEach((z, i) => { if (i < 5) zones[i] += parseFloat(z) || 0; });
      });
    }
    return zones;
  });
}

// Average cadence (spm) across all runs in a week.
export function weeklyCadenceSeries(state, days, maxWeek) {
  return eachWeek(state, days, maxWeek, (wkData, days) => {
    let sum = 0, count = 0;
    if (wkData) {
      days.forEach(d => {
        const c = parseFloat(wkData.runs?.[d]?.avgCadence) || 0;
        if (c > 0) { sum += c; count++; }
      });
    }
    return count > 0 ? sum / count : 0;
  });
}

// Average Training Effect across all runs in a week.
export function weeklyTrainingEffectSeries(state, days, maxWeek) {
  return eachWeek(state, days, maxWeek, (wkData, days) => {
    let sum = 0, count = 0;
    if (wkData) {
      days.forEach(d => {
        const te = parseFloat(wkData.runs?.[d]?.trainingEffect) || 0;
        if (te > 0) { sum += te; count++; }
      });
    }
    return count > 0 ? sum / count : 0;
  });
}
