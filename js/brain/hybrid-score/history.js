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
import { loggedDateSet } from '../../analytics/logged-days.js';

const MAX_HISTORY = 400; // ~13 months of daily snapshots
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// One-time XP backfill from already-logged history, so a returning athlete isn't
// stuck at Initiate just because daily scoring only began today. Grants a
// modest, honest amount per prior training day (less than a live day, which also
// earns a score bonus). Idempotent — runs once, then normal daily XP takes over.
function backfillXp(state) {
  const hs = state.hybridScore;
  if (!hs || hs._xpBackfilled) return;
  hs._xpBackfilled = true;
  try {
    const priorDays = loggedDateSet(state, WEEK_DAYS).size;
    hs.xp = Math.max(hs.xp || 0, priorDays * 15);
  } catch (_) { /* backfill is a nicety — never block scoring */ }
}

function ensure(state) {
  if (!state.hybridScore) state.hybridScore = { history: [], xp: 0, lastRecordedDate: null };
  if (!Array.isArray(state.hybridScore.history)) state.hybridScore.history = [];
  if (typeof state.hybridScore.xp !== 'number') state.hybridScore.xp = 0;
  return state.hybridScore;
}

// Idempotently record today's score + bank XP. Returns { changed, milestones }
// so the caller can persist and celebrate. Never double-counts a day, and
// milestones only fire on the FIRST record of a day (so they can't re-trigger
// on every render).
//
// Milestone kinds: { kind:'level', tier, name, icon } · { kind:'streak', days }
//                · { kind:'score', score } (first 90+).
// Compact per-pillar contribution map for a snapshot (E7 — powers the
// day-over-day "why it changed" attribution). Rounded ints keyed by pillar.
function contributionsOf(scoreResult) {
  const out = {};
  const pillars = scoreResult?.pillars || {};
  for (const k in pillars) {
    if (pillars[k]?.score != null && typeof pillars[k].contribution === 'number') {
      out[k] = pillars[k].contribution;
    }
  }
  return out;
}

// E6 — today's load-excluded readiness for the recovery-trend term (a pure
// recovery signal, ACWR removed so it doesn't overlap the Load pillar). null
// when no readiness signals exist yet.
function readinessOf(model) {
  return model?.readyNoLoad?.hasData ? model.readyNoLoad.score : null;
}

export function recordDailyScore(state, scoreResult, model, todayISO) {
  const hs = ensure(state);
  backfillXp(state);   // one-time, before any level comparison below
  const today = todayISO || new Date().toISOString().slice(0, 10);
  // A provisional (self-report-carried) score is a display estimate, not earned
  // progress: never bank its XP or seed a history point from it, or the level
  // ladder and day-over-day delta would be built on answers, not work.
  if (!scoreResult || scoreResult.score == null || scoreResult.provisional) return { changed: false, milestones: [] };
  if (hs.lastRecordedDate === today) {
    // Already recorded today — keep the snapshot fresh (score can move intraday
    // as sessions are logged) but do NOT re-bank XP or re-fire milestones.
    const entry = hs.history.find(h => h.date === today);
    if (entry) {
      // E6 — keep the day's readiness fresh even when the score itself is
      // unchanged, so the recovery-trend slope always has today's value.
      const rd = readinessOf(model);
      const readinessMoved = rd != null && entry.readiness !== rd;
      if (entry.score !== scoreResult.score || readinessMoved) {
        entry.score = scoreResult.score;
        entry.level = scoreResult.level?.tier ?? entry.level;
        entry.contributions = contributionsOf(scoreResult);
        if (rd != null) entry.readiness = rd;
        return { changed: true, milestones: [] };
      }
    }
    return { changed: false, milestones: [] };
  }

  const sessionCompleted = model?.rec?.badge === 'Session Done';
  const anyLogged = (model?.week?.consistencyDone || 0) > 0 || (model?.streak?.current || 0) > 0;
  const streak = model?.streak?.current || 0;

  const levelBefore = levelFromXp(hs.xp);
  hs.xp += xpForDay({ score: scoreResult.score, sessionCompleted, anyLogged, streak });
  const levelAfter = levelFromXp(hs.xp);

  // Milestones — evaluated against history BEFORE today's entry lands.
  const milestones = [];
  if (levelAfter.tier > levelBefore.tier) {
    milestones.push({ kind: 'level', tier: levelAfter.tier, name: levelAfter.name, icon: levelAfter.icon });
  }
  if (streak === 7 || streak === 30 || streak === 100) {
    milestones.push({ kind: 'streak', days: streak });
  }
  if (scoreResult.score >= 90 && !hs.history.some(h => h.score >= 90)) {
    milestones.push({ kind: 'score', score: scoreResult.score });
  }

  hs.history.push({ date: today, score: scoreResult.score, level: levelAfter.tier, contributions: contributionsOf(scoreResult), readiness: readinessOf(model) });
  if (hs.history.length > MAX_HISTORY) hs.history = hs.history.slice(-MAX_HISTORY);
  hs.lastRecordedDate = today;
  return { changed: true, milestones };
}

// Current career level from banked XP.
export function currentLevel(state) {
  if (state && !state.hybridScore) state.hybridScore = { history: [], xp: 0, lastRecordedDate: null };
  backfillXp(state);   // ensure a returning athlete's history counts even before Home renders
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
