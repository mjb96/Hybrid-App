// @ts-check
// =============================================================================
// PROVISIONAL HYBRID SCORE (js/onboarding/provisional-score.js)
//
// V2-2 — "3 questions → a Score, instantly." The real engine needs logged
// sessions and wellness data; onboarding has none. So from three honest
// self-reports (experience level, weekly training frequency, how recovered you
// usually feel) we infer a LOW-CONFIDENCE starting estimate for the handful of
// pillars those answers can actually speak to, then hand it to the SAME display
// layer as the live card (scoreBand + levelFromXp + computeDials/heroHTML). The
// number is real math on real (if self-reported) inputs — not a fake — and the
// confidence meter tells the truth about how provisional it is. Momentum and
// Body stay null: nothing in onboarding can honestly fill them, so the dials
// renormalise across what we know rather than inventing data.
//
// Pure module (no DOM, no state) so it is trivially testable.
// =============================================================================
import { scoreBand } from '../brain/hybrid-score/config.js';
import { levelFromXp } from '../brain/hybrid-score/levels.js';
import { PILLAR_WEIGHTS } from '../brain/hybrid-score/config.js';

// Self-report → provisional pillar sub-score (0–100). Deliberately conservative
// and monotonic: a better answer never lowers its pillar. These are starting
// estimates the first few logged days will overwrite, not verdicts.
const FREQ_CONSISTENCY = { low: 45, some: 66, high: 82, daily: 90 };
const FREQ_LOAD        = { low: 52, some: 66, high: 74, daily: 70 }; // very-high freq stops rewarding — overreach risk
const RECOVERY_RECOVER = { low: 44, ok: 68, fresh: 85 };
const RECOVERY_LIFE    = { low: 50, ok: 66, fresh: 78 };
const LEVEL_STRENGTH   = { beginner: 50, intermediate: 65, advanced: 78 };
const LEVEL_ENDURANCE  = { beginner: 48, intermediate: 60, advanced: 72 };

const pick = (map, key, fallbackKey) => map[key] != null ? map[key] : map[fallbackKey];

/**
 * Build a provisional score result shaped exactly like a live computeHybridScore
 * result, so heroHTML / dialsRow render it unchanged.
 * @param {{level?:string, frequency?:string, recovery?:string}} answers
 *   level:    'beginner' | 'intermediate' | 'advanced'
 *   frequency:'low' | 'some' | 'high' | 'daily'   (sessions per week, bucketed)
 *   recovery: 'low' | 'ok' | 'fresh'
 */
export function provisionalScore({ level = 'intermediate', frequency = 'some', recovery = 'ok' } = {}) {
  const pillars = {
    consistency: { score: pick(FREQ_CONSISTENCY, frequency, 'some') },
    load:        { score: pick(FREQ_LOAD, frequency, 'some') },
    recovery:    { score: pick(RECOVERY_RECOVER, recovery, 'ok') },
    lifestyle:   { score: pick(RECOVERY_LIFE, recovery, 'ok') },
    strength:    { score: pick(LEVEL_STRENGTH, level, 'intermediate') },
    endurance:   { score: pick(LEVEL_ENDURANCE, level, 'intermediate') },
    // Honestly unknown from onboarding — left null so the model calibrates them.
    momentum:    { score: null },
    body:        { score: null },
  };

  // Composite = weight-renormalised mean over the pillars we could estimate.
  let weighted = 0, wsum = 0;
  for (const [k, p] of Object.entries(pillars)) {
    if (p.score == null) continue;
    const w = (PILLAR_WEIGHTS[k] || 0) * 100 || 1;
    weighted += p.score * w;
    wsum += w;
  }
  const score = wsum > 0 ? Math.round(weighted / wsum) : null;

  return {
    score,
    band: scoreBand(score),
    level: levelFromXp(0),          // everyone starts an Initiate; XP is earned, not claimed
    hasData: true,
    provisional: true,
    confidence: 0,                  // parity with Home: computeHybridScore counts
                                     // only logged data toward confidence, so it
                                     // reads 0% seconds later. Showing 22% here
                                     // (self-reported) contradicted that; the
                                     // "Provisional — sharpens as you log" caption
                                     // already explains the 0.
    delta: null,                    // → "New today"
    momentum: { dir: 'flat', label: 'Baseline' },
    topContributor: null,
    recommendation: 'Log your first session to make this real.',
    pillars,
  };
}
