// @ts-check
// =============================================================================
// SESSION COMPARISON (analytics/calculations/session-compare.js)
//
// Pure, DOM-free helpers for comparing one strength session against the SAME
// weekday in the previous week — i.e. "this week's Push vs last week's Push".
// The weekday is the stable identity of a workout across weeks (the program
// assigns Push to e.g. Monday every week), so comparing weeks[N][day] against
// weeks[N-1][day] lines up like-for-like. Metrics are the two the user reads
// first: the heaviest working set (top set) and total working-set tonnage.
// =============================================================================
import { isCompletedSet, isWarmupSet, setVolume } from '../../set-utils.js';

/**
 * Per-exercise summary of one session's working sets: the heaviest working set
 * (its weight × reps) and total tonnage. Warm-ups and incomplete sets excluded.
 * @param {any} weekData  one week's stored data (`weeks[wk]`)
 * @param {string} day    weekday key (mon..sun)
 * @returns {{ lifts: Record<string, {topWeight:number, topReps:number, volume:number}>, totalVolume:number }}
 */
export function summarizeSessionLifts(weekData, day) {
  const dayLifts = weekData?.lifts?.[day] || {};
  /** @type {Record<string, {topWeight:number, topReps:number, volume:number}>} */
  const lifts = {};
  let totalVolume = 0;

  for (const name of Object.keys(dayLifts)) {
    const sets = dayLifts[name];
    if (!Array.isArray(sets)) continue;
    let topWeight = 0, topReps = 0, volume = 0, hasWork = false;
    for (const s of sets) {
      if (!isCompletedSet(s) || isWarmupSet(s)) continue;
      const w = parseFloat(s.w) || 0;
      const r = parseInt(s.r, 10) || 0;
      volume += setVolume(s);
      hasWork = true;
      // Heaviest set wins; ties keep the higher rep count as the "top" set.
      if (w > topWeight || (w === topWeight && r > topReps)) { topWeight = w; topReps = r; }
    }
    if (hasWork) {
      lifts[name] = { topWeight, topReps, volume };
      totalVolume += volume;
    }
  }
  return { lifts, totalVolume };
}

/**
 * Compare a session to the same weekday in the previous week. Rows cover every
 * lift present in EITHER session (aligned by name), so a lift added or dropped
 * this week is visible rather than silently missing. Deltas are null when the
 * lift is missing on one side (no honest comparison to make).
 * @param {Record<string, any>} weeks  `state.weeks`
 * @param {string|number} week         the session's week
 * @param {string} day                 weekday key (mon..sun)
 */
export function compareSessionToPrevWeek(weeks, week, day) {
  const wkNum = parseInt(String(week), 10) || 0;
  const cur = summarizeSessionLifts(weeks?.[String(wkNum)], day);
  const prevWeekData = weeks?.[String(wkNum - 1)];
  const hasPrev = wkNum > 1 && !!prevWeekData;
  const prev = hasPrev ? summarizeSessionLifts(prevWeekData, day) : { lifts: {}, totalVolume: 0 };

  // Preserve current-session order first (the order the user trained), then any
  // lifts that only existed last week.
  const names = [...Object.keys(cur.lifts), ...Object.keys(prev.lifts).filter(n => !(n in cur.lifts))];
  const rows = names.map(name => {
    const c = cur.lifts[name] || null;
    const p = prev.lifts[name] || null;
    return {
      name,
      cur: c,
      prev: p,
      topWeightDelta: (c && p) ? Math.round((c.topWeight - p.topWeight) * 100) / 100 : null,
      volumeDelta: (c && p) ? Math.round((c.volume - p.volume) * 100) / 100 : null,
    };
  });

  return {
    hasPrev,
    prevWeek: wkNum - 1,
    rows,
    totalCur: cur.totalVolume,
    totalPrev: prev.totalVolume,
    totalDelta: hasPrev ? Math.round((cur.totalVolume - prev.totalVolume) * 100) / 100 : null,
  };
}
