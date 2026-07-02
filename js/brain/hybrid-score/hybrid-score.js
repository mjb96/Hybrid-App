// @ts-check
// =============================================================================
// HYBRID SCORE — ENGINE (js/brain/hybrid-score/hybrid-score.js)
//
// Composes the eight pillars into ONE daily 0–100 Hybrid Score, with a fully
// explainable additive breakdown (contributions sum to score − 50), a career
// level, momentum, confidence, day-over-day delta, and the single most useful
// action to raise tomorrow's score.
//
// Pure: a function of (dashboardModel, state, days). The only persistence is the
// idempotent daily snapshot handled separately in history.js.
// =============================================================================
import { WEEK_PHASE_NAMES } from '../../constants.js';
import { clamp } from '../../analytics/calculations/math-utils.js';
import { PILLAR_WEIGHTS, PILLAR_META, scoreBand, isDeloadWeek } from './config.js';
import { computePillars } from './pillars.js';
import { levelFromXp } from './levels.js';

// One concrete, actionable next step per pillar (drives the daily recommendation).
const PILLAR_ACTIONS = Object.freeze({
  consistency: "Complete today's planned session — adherence moves your score most.",
  recovery:    'Protect recovery: an earlier night and an easy day will lift tomorrow.',
  strength:    'Log your key lifts and chase a small progression on a top movement.',
  endurance:   'Get an easy Zone 2 run in to build your aerobic base.',
  load:        'Bring your training load back toward the productive zone.',
  momentum:    'String a few sessions together this week to rebuild momentum.',
  body:        'Keep nutrition aligned with your body-composition goal.',
  lifestyle:   'Aim for 7.5h+ sleep and hit your step goal today.',
});

function loadActionFor(model) {
  const acwr = model.load?.acwr || 0;
  if (acwr >= 1.3) return 'Ease off — trim volume to bring your load back to the sweet spot.';
  if (acwr > 0 && acwr < 0.8) return 'Add a session — your training load has dropped below productive.';
  return PILLAR_ACTIONS.load;
}

// Heuristic "returning from a layoff": chronic load is very low yet the athlete
// is active again with a meaningful training past. Caps load penalties so a
// comeback isn't punished.
function detectReturning(model) {
  const ctl = model.load?.ctl || 0;
  return ctl > 0 && ctl < 8 && (model.streak?.current || 0) >= 1 && (model.streak?.longest || 0) >= 5;
}

export function computeHybridScore(model, state, days) {
  const level = state?.settings?.fitnessLevel || 'intermediate';
  const phaseName = WEEK_PHASE_NAMES[String(state?.currentWeek ?? '')];
  const deload = isDeloadWeek(state, phaseName);
  const returning = detectReturning(model);

  const pillars = computePillars(model, state, days, { level, deload });

  // Comeback protection: don't let a low-load pillar drag a returning athlete.
  if (returning && pillars.load?.score != null) {
    pillars.load = { score: Math.max(pillars.load.score, 55), signals: ['comeback — load rebuilding', ...pillars.load.signals] };
  }

  // Available pillars only; renormalise weights across them.
  const weights = { ...PILLAR_WEIGHTS };
  if (deload) {
    // A well-executed deload leans on recovery + consistency; progression is
    // expected to pause, so shift half of strength/endurance weight across.
    const shift = (weights.strength + weights.endurance) * 0.5;
    weights.strength *= 0.5; weights.endurance *= 0.5;
    weights.recovery += shift * 0.5; weights.consistency += shift * 0.5;
  }

  const available = Object.keys(pillars).filter(k => pillars[k].score != null);
  if (available.length === 0) {
    return {
      score: null, band: scoreBand(null), hasData: false, confidence: 0,
      pillars, drivers: [], level: levelFromXp(state?.hybridScore?.xp),
      delta: null, momentum: { dir: 'flat', label: 'No trend yet' },
      deload, returning,
      headline: 'Your Hybrid Score is calibrating',
      recommendation: 'Log a few sessions and a wellness check-in to unlock your Hybrid Score.',
      topContributor: null, topOpportunity: null,
    };
  }

  const totalWeightAll = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
  const availWeight = available.reduce((s, k) => s + weights[k], 0);

  // Weighted average → score. Contributions cᵢ = wᵢ′·(pillarᵢ − 50) sum to score − 50.
  let score = 0;
  const contributions = {};
  available.forEach(k => {
    const wNorm = weights[k] / availWeight;
    score += pillars[k].score * wNorm;
    contributions[k] = wNorm * (pillars[k].score - 50);
    pillars[k].contribution = Math.round(contributions[k]);
    pillars[k].weight = Math.round(wNorm * 100);
  });
  score = clamp(Math.round(score), 0, 100);

  // Confidence: how much of the model's weight is actually backed by data.
  const confidence = Math.round((availWeight / totalWeightAll) * 100);

  // Additive drivers (the "why today" list), signed, ranked by magnitude.
  const drivers = available
    .map(k => ({
      pillar: k,
      label: `${PILLAR_META[k].label} — ${pillars[k].signals[0] || ''}`.trim(),
      points: Math.round(contributions[k]),
      tone: contributions[k] > 0.5 ? 'good' : contributions[k] < -0.5 ? 'bad' : 'neutral',
    }))
    .filter(d => Math.abs(d.points) >= 1)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  const positives = drivers.filter(d => d.points > 0);
  const negatives = drivers.filter(d => d.points < 0);
  const topContributor = positives[0] || null;

  // Biggest actionable drag → the single recommended action for tomorrow.
  const ACTIONABLE = ['consistency', 'recovery', 'load', 'endurance', 'strength', 'lifestyle'];
  const oppDriver = negatives.find(d => ACTIONABLE.includes(d.pillar)) || negatives[0] || null;
  const topOpportunity = oppDriver
    ? { pillar: oppDriver.pillar, points: oppDriver.points,
        action: oppDriver.pillar === 'load' ? loadActionFor(model) : PILLAR_ACTIONS[oppDriver.pillar] }
    : null;

  // Momentum from the momentum pillar (falls back to flat).
  const mScore = pillars.momentum?.score;
  const momentum = mScore == null
    ? { dir: 'flat', label: 'Building trend' }
    : mScore >= 58 ? { dir: 'up', label: 'Momentum building' }
    : mScore <= 42 ? { dir: 'down', label: 'Momentum slowing' }
    : { dir: 'flat', label: 'Holding steady' };

  // Day-over-day delta from stored history (yesterday's score).
  const hist = state?.hybridScore?.history || [];
  const today = new Date().toISOString().slice(0, 10);
  const prior = [...hist].filter(h => h.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const delta = prior.length ? score - prior[prior.length - 1].score : null;

  const level_ = levelFromXp(state?.hybridScore?.xp);

  const recommendation = topOpportunity
    ? topOpportunity.action
    : (deload ? 'Deload week — keep it light and let fitness consolidate.'
              : 'Everything is trending well — repeat what you did today.');

  return {
    score, band: scoreBand(score), hasData: true, confidence,
    pillars, drivers, positives, negatives,
    topContributor, topOpportunity,
    momentum, delta, level: level_,
    deload, returning,
    headline: `Your Hybrid Score is ${score}`,
    recommendation,
  };
}
