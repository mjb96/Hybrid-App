// @ts-check
// =============================================================================
// HYBRID SCORE — HISTORY & XP RECORDER (js/brain/hybrid-score/history.js)
//
// Persists one Hybrid Score snapshot per calendar day (idempotent — safe to
// call on every render) and banks that day's XP exactly once. Also derives the
// daily/weekly/monthly trends the UI charts.
//
// State shape (state.hybridScore):
//   { history: [{date, score, level}], xp, lastRecordedDate }
// =============================================================================
import { xpForDay, levelFromXp } from './levels.js';

const MAX_HISTORY = 400; // ~13 months of daily snapshots

function ensure(state) {
  if (!state.hybridScore) state.hybridScore = { history: [], xp: 0, lastRecordedDate: null };
  if (!Array.isArray(state.hybridScore.history)) state.hybridScore.history = [];
  if (typeof state.hybridScore.xp !== 'number') state.hybridScore.xp = 0;
  return state.hybridScore;
}

// Idempotently record today's score + bank XP. Returns { changed } so the caller
// can decide whether to persist. Never double-counts a day.
export function recordDailyScore(state, scoreResult, model, todayISO) {
  const hs = ensure(state);
  const today = todayISO || new Date().toISOString().slice(0, 10);
  if (!scoreResult || scoreResult.score == null) return { changed: false };
  if (hs.lastRecordedDate === today) {
    // Already recorded today — keep the snapshot fresh (score can move intraday
    // as sessions are logged) but do NOT re-bank XP.
    const entry = hs.history.find(h => h.date === today);
    if (entry && entry.score !== scoreResult.score) {
      entry.score = scoreResult.score;
      entry.level = scoreResult.level?.tier ?? entry.level;
      return { changed: true };
    }
    return { changed: false };
  }

  const sessionCompleted = model?.rec?.badge === 'Session Done';
  const anyLogged = (model?.week?.consistencyDone || 0) > 0 || (model?.streak?.current || 0) > 0;
  hs.xp += xpForDay({
    score: scoreResult.score,
    sessionCompleted,
    anyLogged,
    streak: model?.streak?.current || 0,
  });

  hs.history.push({ date: today, score: scoreResult.score, level: scoreResult.level?.tier ?? 1 });
  if (hs.history.length > MAX_HISTORY) hs.history = hs.history.slice(-MAX_HISTORY);
  hs.lastRecordedDate = today;
  return { changed: true };
}

// Current career level from banked XP.
export function currentLevel(state) {
  return levelFromXp(state?.hybridScore?.xp || 0);
}

// Daily score series (chronological) for a sparkline — last `n` days present.
export function dailySeries(state, n = 30) {
  const h = [...(state?.hybridScore?.history || [])].sort((a, b) => a.date.localeCompare(b.date));
  return h.slice(-n).map(e => e.score);
}

// Bucketed averages for weekly / monthly trend views.
// `by` = 'week' (ISO-ish 7-day buckets from the first entry) or 'month' (YYYY-MM).
export function bucketedTrend(state, by = 'week') {
  const h = [...(state?.hybridScore?.history || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!h.length) return [];
  const buckets = new Map();
  const first = new Date(h[0].date + 'T00:00:00').getTime();
  h.forEach(e => {
    let key;
    if (by === 'month') {
      key = e.date.slice(0, 7);
    } else {
      const days = Math.floor((new Date(e.date + 'T00:00:00').getTime() - first) / 86400000);
      key = `W${Math.floor(days / 7) + 1}`;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e.score);
  });
  return [...buckets.entries()].map(([label, scores]) => ({
    label,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    n: scores.length,
  }));
}
