// @ts-check
// =============================================================================
// STREAK FREEZES (js/brain/streak.js) — roadmap R7
//
// Duolingo-style streak protection: a small stock of "freezes" that auto-cover
// an occasional missed day so one slip doesn't wipe a long streak (the single
// biggest cause of streak-driven churn). Freezes are EARNED by consistency, so
// the mechanic rewards the behaviour it protects rather than excusing it.
//
// Pure + idempotent, mutates state.streakFreezes only when something actually
// changes (safe to call on every render). Frozen dates are honoured by
// computeStreak via activeTrainingDates + state.streakFreezes.used.
// =============================================================================
import { activeTrainingDates } from '../home/dashboard-model.js';

const MAX_FREEZES = 2;
const DAY_MS = 86400000;

const isoOffset = (todayISO, n) => {
  const d = new Date(todayISO + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function ensure(state) {
  if (!state.streakFreezes || typeof state.streakFreezes !== 'object') {
    // New/returning users start with one freeze in the bank.
    state.streakFreezes = { available: 1, used: [], earnedTier: 0 };
  }
  const f = state.streakFreezes;
  if (typeof f.available !== 'number') f.available = 1;
  if (!Array.isArray(f.used)) f.used = [];
  if (typeof f.earnedTier !== 'number') f.earnedTier = 0;
  return f;
}

// Current streak length ending today, given a set of active ISO dates.
function currentStreak(active, todayISO) {
  let n = 0;
  for (let i = 0; i <= 400; i++) {
    const ds = isoOffset(todayISO, i);
    if (active.has(ds)) { if (i === n) n++; }
    else if (i === n) break;
  }
  return n;
}

// Reconcile freezes for `today`. Two effects, both idempotent:
//   1. AUTO-FREEZE: if yesterday was missed but the day before was a training
//      day (an ongoing streak) and a freeze is in the bank, spend one to cover
//      yesterday — preserving the streak.
//   2. EARN: crossing each new 7-day tier tops the bank back up (capped).
// Returns { changed, froze, frozeDate, earned }.
export function reconcileStreakFreezes(state, days, todayISO = new Date().toISOString().slice(0, 10)) {
  const f = ensure(state);
  const logged = activeTrainingDates(state.weeks || {}, days, state);
  const activeWithFreezes = new Set([...logged, ...f.used]);

  let changed = false, froze = false, frozeDate = null, earned = false;

  // 1. Auto-freeze yesterday if it would otherwise break an ongoing streak.
  const yest = isoOffset(todayISO, 1);
  const dayBefore = isoOffset(todayISO, 2);
  const yestMissed = !logged.has(yest) && !f.used.includes(yest);
  if (yestMissed && activeWithFreezes.has(dayBefore) && f.available > 0) {
    f.used.push(yest);
    f.available -= 1;
    activeWithFreezes.add(yest);
    changed = froze = true;
    frozeDate = yest;
  }

  // Keep the used list bounded (only the last ~60 days matter for any streak).
  const cutoff = isoOffset(todayISO, 60);
  const trimmed = f.used.filter(d => d >= cutoff);
  if (trimmed.length !== f.used.length) { f.used = trimmed; changed = true; }

  // 2. Earn a freeze on each new 7-day tier (capped at MAX_FREEZES).
  const streak = currentStreak(activeWithFreezes, todayISO);
  const tier = Math.floor(streak / 7);
  if (tier > f.earnedTier) {
    if (f.available < MAX_FREEZES) { f.available = Math.min(MAX_FREEZES, f.available + (tier - f.earnedTier)); earned = true; }
    f.earnedTier = tier;
    changed = true;
  }

  return { changed, froze, frozeDate, earned };
}

// Display snapshot for the streak view / tile.
export function streakFreezeInfo(state) {
  const f = ensure(state);
  return {
    available: f.available,
    max: MAX_FREEZES,
    usedRecently: [...f.used].sort().slice(-5),
  };
}

// Loss-aversion line: shown when a meaningful streak is at risk (nothing logged
// yet today). Escalates when there's no freeze to catch a miss. Pure.
export function streakRiskLine(state, model, todayISO = new Date().toISOString().slice(0, 10)) {
  const cur = model?.streak?.current || 0;
  if (cur < 3) return null;
  const logged = activeTrainingDates(state?.weeks || {}, ['mon','tue','wed','thu','fri','sat','sun'], state);
  if (logged.has(todayISO)) return null; // already trained today — safe
  const f = ensure(state);
  if (f.available > 0) {
    return { text: `Your ${cur}-day streak is unprotected today — train to keep it, or a freeze will catch one miss.`, tone: 'caution' };
  }
  return { text: `Don't lose your ${cur}-day streak — no freezes left. Even 20 minutes counts today.`, tone: 'warning' };
}
