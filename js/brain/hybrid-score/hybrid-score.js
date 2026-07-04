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
import { PILLAR_WEIGHTS, PILLAR_META, SCORE_BANDS, scoreBand, isDeloadWeek } from './config.js';
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

  // Pillars actually backed by logged data.
  const realKeys = Object.keys(pillars).filter(k => pillars[k].score != null);

  // Provisional priors (from the onboarding self-report, persisted at finish)
  // fill pillars that have NO real data yet, so a brand-new athlete meets their
  // starting Score on Home — matching the reveal — instead of a punishing 0.
  // They decay automatically: a real pillar always overrides its prior, and a
  // prior never counts toward confidence, so the meter stays honest and the
  // Score becomes fully "earned" as the first weeks are logged.
  const prov = state?.hybridScore?.provisional?.pillars || null;
  const provKeys = prov
    ? Object.keys(prov).filter(k => weights[k] != null && pillars[k]?.score == null && typeof prov[k] === 'number')
    : [];

  const scoringKeys = [...realKeys, ...provKeys];
  if (scoringKeys.length === 0) {
    return {
      score: null, band: scoreBand(null), hasData: false, confidence: 0,
      pillars, drivers: [], level: levelFromXp(state?.hybridScore?.xp),
      delta: null, deltaBreakdown: null, momentum: { dir: 'flat', label: 'No trend yet' },
      deload, returning,
      headline: 'Your Hybrid Score is calibrating',
      recommendation: 'Log a few sessions and a wellness check-in to unlock your Hybrid Score.',
      topContributor: null, topOpportunity: null,
    };
  }

  // Materialise provisional pillars so the dials + card render them; they carry a
  // score but no `contribution` (they are not "why today" drivers — the user
  // didn't earn them) and are flagged so history/XP skip them.
  provKeys.forEach(k => {
    pillars[k] = { score: clamp(Math.round(prov[k]), 0, 100), signals: ['from your onboarding answers'], provisional: true };
  });
  const usedProvisional = provKeys.length > 0;

  const totalWeightAll = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
  const scoringWeight = scoringKeys.reduce((s, k) => s + weights[k], 0);

  // Weighted average → score. Contributions cᵢ = wᵢ′·(pillarᵢ − 50) sum to score − 50
  // (real pillars only; provisional priors move the number but aren't drivers).
  let score = 0;
  const contributions = {};
  scoringKeys.forEach(k => {
    const wNorm = weights[k] / scoringWeight;
    score += pillars[k].score * wNorm;
    pillars[k].weight = Math.round(wNorm * 100);
    if (pillars[k].provisional) return;
    contributions[k] = wNorm * (pillars[k].score - 50);
    pillars[k].contribution = Math.round(contributions[k]);
  });
  score = clamp(Math.round(score), 0, 100);

  // Confidence: how much of the model's weight is backed by REAL logged data
  // (provisional priors are deliberately excluded so it never over-claims).
  const realWeight = realKeys.reduce((s, k) => s + weights[k], 0);
  const confidence = Math.round((realWeight / totalWeightAll) * 100);

  // Only real pillars are "why today" drivers.
  const available = realKeys;

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
  const yEntry = prior.length ? prior[prior.length - 1] : null;
  const delta = yEntry ? score - yEntry.score : null;

  // E7 — "why it changed": attribute the delta to the pillars that moved since
  // yesterday. Diffing the stored per-pillar contributions (which sum to
  // score−50) means Σ pillar-deltas ≈ today−yesterday, so the breakdown
  // literally explains the number the athlete sees. Needs yesterday to carry
  // contributions (older snapshots without them simply produce no breakdown).
  let deltaBreakdown = null;
  if (yEntry && yEntry.contributions) {
    const yc = yEntry.contributions;
    const keys = new Set([...available, ...Object.keys(yc)]);
    deltaBreakdown = [...keys].map(k => {
      const todayC = available.includes(k) ? (pillars[k].contribution || 0) : 0;
      const d = todayC - (yc[k] || 0);
      return { pillar: k, label: PILLAR_META[k]?.label || k, delta: d,
               tone: d > 0 ? 'good' : d < 0 ? 'bad' : 'neutral' };
    }).filter(x => Math.abs(x.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  const level_ = levelFromXp(state?.hybridScore?.xp);

  // Band, with a provisional floor: while the estimate is still mostly self-
  // reported (real-data confidence is low AND priors are carrying the number),
  // never brand a brand-new athlete "Fragile"/"At Risk" — we haven't earned that
  // judgement. Keep the honest number; lift only the label/colour to "Building".
  const LOW_CONFIDENCE = 40;
  let band = scoreBand(score);
  if (usedProvisional && confidence < LOW_CONFIDENCE) {
    const floor = SCORE_BANDS.find(b => b.status === 'Building');
    if (floor && score < floor.min) band = floor;
  }

  const noRealData = realKeys.length === 0;
  const recommendation = (usedProvisional && noRealData)
    ? 'Log your first session to turn this into your real Score.'
    : topOpportunity
      ? topOpportunity.action
      : (deload ? 'Deload week — keep it light and let fitness consolidate.'
                : 'Everything is trending well — repeat what you did today.');

  return {
    score, band, hasData: true, confidence,
    provisional: usedProvisional,
    pillars, drivers, positives, negatives,
    topContributor, topOpportunity,
    momentum, delta, deltaBreakdown, level: level_,
    deload, returning,
    headline: (usedProvisional && noRealData) ? 'Your starting Hybrid Score' : `Your Hybrid Score is ${score}`,
    recommendation,
  };
}
