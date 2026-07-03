// @ts-check
// =============================================================================
// COACH MEMORY (js/brain/coach-memory.js)
//
// V2-4 — one coach with memory. A good coach remembers what you did last week,
// not just what the sensor says today. This turns the athlete's own Hybrid-Score
// history + streak into a single short line that references the past ("your third
// strong week in a row", "your highest score in a month", "your longest streak
// yet"). Every line is literally true of the stored data — no invented history —
// and when nothing noteworthy stands out it returns null so callers stay quiet.
//
// Pure: a function of (state, todayScore). No DOM, no persistence.
// =============================================================================

// ISO week key (year-Www) for grouping daily scores into weeks.
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  const day = (d.getUTCDay() + 6) % 7;              // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);           // nearest Thursday
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const ordinal = (n) => {
  const names = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  return names[n] || `${n}th`;
};

// Count consecutive most-recent weeks whose average Hybrid Score is "strong"
// (>= threshold). Requires each counted week to carry at least 2 recorded days
// so a single good day doesn't fake a "strong week".
function consecutiveStrongWeeks(history, threshold = 70) {
  const byWeek = new Map();
  for (const h of history) {
    if (typeof h.score !== 'number' || !h.date) continue;
    const k = isoWeekKey(h.date);
    if (!k) continue;
    if (!byWeek.has(k)) byWeek.set(k, []);
    byWeek.get(k).push(h.score);
  }
  const weeks = [...byWeek.keys()].sort();          // chronological
  let run = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const scores = byWeek.get(weeks[i]);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (scores.length >= 2 && avg >= threshold) run++;
    else break;
  }
  return run;
}

/**
 * One memory line, or null.
 * @param {any} state appState (reads hybridScore.history + streakData)
 * @param {number|null} [todayScore] today's computed score (for PB / recent-high)
 */
export function coachMemory(state, todayScore = null) {
  const history = (state?.hybridScore?.history || []).filter(h => typeof h.score === 'number' && h.date);
  const today = new Date().toISOString().slice(0, 10);
  const prior = history.filter(h => h.date < today);

  // 1) All-time personal best (needs a real history to beat).
  if (typeof todayScore === 'number' && prior.length >= 4) {
    const priorMax = Math.max(...prior.map(h => h.score));
    if (todayScore > priorMax) {
      return `That's a new personal best Hybrid Score — beating ${priorMax}.`;
    }
    // 2) Highest in the last 30 days (not an all-time PB, but a recent peak).
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recent = prior.filter(h => h.date >= cutoff);
    if (recent.length >= 4 && todayScore >= Math.max(...recent.map(h => h.score))) {
      return `Your highest score in a month.`;
    }
  }

  // 3) A run of strong weeks — the "you've been here before, and it's working" line.
  const strongWeeks = consecutiveStrongWeeks(history);
  if (strongWeeks >= 2) {
    return `Your ${ordinal(strongWeeks)} strong week in a row — momentum is real.`;
  }

  // 4) Longest streak yet.
  const cur = state?.streakData?.current || 0;
  const longest = state?.streakData?.longest || 0;
  if (cur >= 5 && cur >= longest) {
    return `${cur} days straight — your longest streak yet.`;
  }

  return null;
}
