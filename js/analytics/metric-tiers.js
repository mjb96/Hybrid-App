// @ts-check
// =============================================================================
// METRIC TIERS (js/analytics/metric-tiers.js) — roadmap Phase 3B
//
// Analytics had many valid metrics but no hierarchy: a user could see numbers
// without knowing which mattered. This module is the one place that answers
// "how important is this metric, and where is it allowed to appear?".
//
// Four tiers, in descending prominence:
//
//   headline    A metric that can answer "is my training working?" on its own.
//               Allowed on the Progress landing. Deliberately scarce.
//   supporting  Gives a headline its context. Allowed on a domain Overview.
//   advanced    Real and useful, but needs interpretation. Stats tabs only.
//   diagnostic  For debugging your own data, not for judging training. Lives
//               behind a disclosure.
//
// The tier decides PLACEMENT, not correctness — an advanced metric is not a
// worse number, it is one that misleads without context. Keeping the mapping
// here (rather than implied by whichever screen happens to render something)
// is what lets a test prove no screen is quietly promoting a diagnostic to a
// headline.
// =============================================================================

export const TIERS = Object.freeze(['headline', 'supporting', 'advanced', 'diagnostic']);

/** Which surfaces each tier may appear on. Enforced by tests, not by hope. */
export const TIER_PLACEMENT = Object.freeze({
  headline: Object.freeze(['progress-landing', 'domain-overview', 'domain-stats']),
  supporting: Object.freeze(['domain-overview', 'domain-stats']),
  advanced: Object.freeze(['domain-stats']),
  diagnostic: Object.freeze(['domain-stats-disclosure']),
});

export const TIER_DESCRIPTION = Object.freeze({
  headline: 'Answers "is my training working?" on its own.',
  supporting: 'Gives a headline number its context.',
  advanced: 'Useful, but needs interpretation to read correctly.',
  diagnostic: 'For checking your own data, not for judging training.',
});

// -----------------------------------------------------------------------------
// The classification.
//
// SCOPE: this covers every metric SHOWN to a user, which is a superset of the
// metrics that have their own detail screen. `strength.e1rm-change` is the
// Strength headline on the Progress landing but has no drilldown of its own,
// while `strength.muscle-set-credits` has both. Classifying only the
// drilldown-able ones would leave the most prominent numbers in the app
// unclassified, which is the opposite of the point.
//
// Anything not listed defaults to `advanced`: a new metric has to EARN
// promotion by being named here, rather than defaulting onto a primary screen
// because someone forgot to classify it. That default is the point — it fails
// safe towards less prominence, never more.
// -----------------------------------------------------------------------------
/** @type {Record<string, 'headline'|'supporting'|'advanced'|'diagnostic'>} */
export const METRIC_TIERS = Object.freeze({
  // ---- Consistency: showing up is the strongest single predictor -----------
  'consistency.sessions-this-week': 'headline',
  'consistency.streak': 'supporting',
  'consistency.plan-adherence': 'supporting',

  // ---- Strength -----------------------------------------------------------
  // Same-exercise e1RM change is the honest "am I getting stronger" number.
  'strength.e1rm-change': 'headline',
  'strength.weekly-volume': 'supporting',
  'strength.muscle-set-credits': 'supporting',
  'strength.four-week-volume': 'advanced',
  'strength.volume-progression': 'advanced',
  'strength.lifetime-pr': 'supporting',
  // Load ratios are genuinely useful and genuinely easy to misread alone.
  'strength.acwr': 'advanced',
  'strength.atl': 'advanced',
  'strength.ctl': 'advanced',
  'strength.fatigue-trend': 'advanced',
  'strength.recovery-impact': 'diagnostic',
  'strength.rate-of-improvement': 'advanced',
  'strength.projected-pr': 'advanced',

  // ---- Running ------------------------------------------------------------
  'running.weekly-distance': 'headline',
  'running.vdot': 'supporting',
  'running.best-pace': 'supporting',
  'running.weekly-duration': 'supporting',
  'running.weekly-run-count': 'supporting',
  'running.four-week-distance': 'advanced',
  'running.total-distance': 'advanced',
  'running.total-run-count': 'advanced',
  'running.average-pace': 'advanced',
  'running.longest-run': 'advanced',
  'running.weekly-elevation': 'advanced',
  'running.average-heart-rate': 'advanced',
  'running.max-heart-rate': 'advanced',
  'running.cadence': 'advanced',
  'running.aerobic-training-effect': 'advanced',
  'running.anaerobic-training-effect': 'advanced',
  'running.intensity-distribution': 'advanced',
  'running.training-load': 'advanced',
  'running.load-ratio': 'advanced',
  'running.form': 'advanced',
  'running.training-stress': 'advanced',
  'running.threshold-pace': 'advanced',
  'running.threshold-heart-rate': 'advanced',
  'running.running-economy': 'diagnostic',
  'running.fitness-trend': 'advanced',
  'running.aerobic-efficiency': 'diagnostic',
  'running.pace-heart-rate': 'diagnostic',
  'running.endurance-score': 'advanced',
  'running.race-projections': 'advanced',
  'running.personal-bests': 'supporting',

  // ---- Recovery & load ----------------------------------------------------
  'recovery.readiness': 'headline',
  'recovery.sleep': 'supporting',
  'recovery.hrv': 'supporting',
  // Resting HR sits alongside HRV as a device-measured recovery signal.
  'recovery.resting-hr': 'supporting',
  // Steps describe general daily movement rather than training, so they inform
  // rather than headline.
  'recovery.steps': 'supporting',
  'recovery.form-tsb': 'advanced',
  'recovery.load-ratio': 'advanced',
  'recovery.soreness': 'supporting',
  'recovery.mood': 'supporting',
  'recovery.monotony': 'diagnostic',
  'recovery.strain': 'diagnostic',

  // ---- Synthesis ----------------------------------------------------------
  // Optional by roadmap decision: a composite is a summary of the domains
  // above, never a substitute for them, so it is not a headline.
  'hybrid.score': 'supporting',

  // ---- Body & projections -------------------------------------------------
  'bodyweight.trend': 'supporting',
  'projections.race-times': 'advanced',
  'projections.strength-milestones': 'advanced',
});

/**
 * The tier for a metric id. Unclassified metrics are `advanced` — the safe
 * direction, since it keeps an unreviewed metric off primary screens.
 * @param {string} metricId
 */
export function tierFor(metricId) {
  return METRIC_TIERS[metricId] || 'advanced';
}

/**
 * May a metric appear on this surface?
 * @param {string} metricId
 * @param {string} surface  one of the TIER_PLACEMENT values
 */
export function allowedOn(metricId, surface) {
  return TIER_PLACEMENT[tierFor(metricId)].includes(surface);
}

/** Every metric id classified at a given tier. */
export function metricsAtTier(tier) {
  return Object.keys(METRIC_TIERS).filter((id) => METRIC_TIERS[id] === tier).sort();
}

/** Counts per tier, for the inventory summary and tests. */
export function tierSummary() {
  const counts = Object.fromEntries(TIERS.map((tier) => [tier, 0]));
  for (const id of Object.keys(METRIC_TIERS)) counts[METRIC_TIERS[id]]++;
  return counts;
}
