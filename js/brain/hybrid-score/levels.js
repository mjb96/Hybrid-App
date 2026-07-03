// @ts-check
// =============================================================================
// HYBRID SCORE — LEVELS & XP (js/brain/hybrid-score/levels.js)
//
// Career identity ladder. XP is cumulative and non-gameable: it accrues from
// completed *planned* work, sustained daily score, streak milestones and PRs —
// never from raw activity spam. Pure functions; the recorder in history.js
// decides when to bank a day's XP.
// =============================================================================
import { HYBRID_LEVELS } from './config.js';
import { clamp } from '../../analytics/calculations/math-utils.js';

// Resolve a cumulative XP total to a level + progress toward the next tier.
export function levelFromXp(xp) {
  const x = Math.max(0, Math.round(xp || 0));
  let current = HYBRID_LEVELS[0];
  for (const lvl of HYBRID_LEVELS) if (x >= lvl.minXp) current = lvl;
  const next = HYBRID_LEVELS.find(l => l.tier === current.tier + 1) || null;
  const span = next ? next.minXp - current.minXp : 0;
  const into = x - current.minXp;
  const progressPct = next && span > 0 ? clamp(Math.round((into / span) * 100), 0, 100) : 100;
  return {
    tier: current.tier,
    name: current.name,
    icon: current.icon,
    xp: x,
    next: next ? { name: next.name, minXp: next.minXp, xpToGo: Math.max(0, next.minXp - x) } : null,
    progressPct,
  };
}

// XP earned for a single day, from that day's score result + whether the
// planned session was actually completed. Designed so consistency + real
// progression pay far more than merely opening the app.
//
//   base            : showing up with any logged work            → up to 10
//   planned session : completing the day's prescribed work       → +15
//   score quality   : the day's Hybrid Score band                → 0..25
//   streak milestone: 7/30/100-day streaks                       → bonus
/** @param {{score?:number, sessionCompleted?:boolean, anyLogged?:boolean, streak?:number}} [d] */
export function xpForDay({ score, sessionCompleted, anyLogged, streak = 0 } = {}) {
  let xp = 0;
  if (anyLogged) xp += 10;
  if (sessionCompleted) xp += 15;
  if (typeof score === 'number') xp += Math.round(clamp((score - 40) / 60, 0, 1) * 25);
  // Milestone streak bumps (granted the day the streak crosses the threshold).
  if (streak === 7)   xp += 25;
  if (streak === 30)  xp += 100;
  if (streak === 100) xp += 500;
  return xp;
}
