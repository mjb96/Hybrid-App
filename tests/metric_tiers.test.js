// =============================================================================
// METRIC TIERS — roadmap Phase 3B.
//
// Analytics had many valid metrics and no hierarchy. These tests hold the
// hierarchy honest: headline stays scarce, an unclassified metric can never
// default onto a primary screen, and every classified id is a real metric.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, TIER_PLACEMENT, METRIC_TIERS, tierFor, allowedOn, metricsAtTier, tierSummary,
} from '../js/analytics/metric-tiers.js';
import { RUNNING_METRICS } from '../js/analytics/running-detail.js';
import { STRENGTH_METRICS } from '../js/analytics/strength-detail.js';

test('every classified metric uses a known tier', () => {
  for (const [id, tier] of Object.entries(METRIC_TIERS)) {
    assert.ok(TIERS.includes(tier), `${id} has unknown tier "${tier}"`);
  }
});

test('an unclassified metric defaults to advanced, never to a primary screen', () => {
  // The default must fail SAFE — towards less prominence. A new metric earns
  // promotion by being classified, rather than landing on the Progress landing
  // because nobody got round to it.
  assert.equal(tierFor('strength.brand-new-thing'), 'advanced');
  assert.equal(allowedOn('strength.brand-new-thing', 'progress-landing'), false);
  assert.equal(allowedOn('strength.brand-new-thing', 'domain-overview'), false);
  assert.equal(allowedOn('strength.brand-new-thing', 'domain-stats'), true);
});

test('only headline metrics may appear on the Progress landing', () => {
  for (const id of Object.keys(METRIC_TIERS)) {
    const permitted = allowedOn(id, 'progress-landing');
    assert.equal(permitted, tierFor(id) === 'headline', `${id} landing permission`);
  }
});

test('headline stays scarce — one per domain, four in total', () => {
  const headlines = metricsAtTier('headline');
  assert.deepEqual(headlines, [
    'consistency.sessions-this-week',
    'recovery.readiness',
    'running.weekly-distance',
    'strength.e1rm-change',
  ]);
  // Exactly the four domains the Progress landing renders. If a fifth headline
  // is ever added, this fails and forces the landing design to be revisited.
  assert.equal(headlines.length, 4);
});

test('the Hybrid Score is not a headline', () => {
  // Roadmap decision: a composite summarises the domains, it does not replace
  // them, so it must not outrank the numbers it is built from.
  assert.equal(tierFor('hybrid.score'), 'supporting');
  assert.equal(allowedOn('hybrid.score', 'progress-landing'), false);
});

test('diagnostics are confined to a disclosure', () => {
  for (const id of metricsAtTier('diagnostic')) {
    assert.deepEqual(TIER_PLACEMENT.diagnostic, ['domain-stats-disclosure']);
    assert.equal(allowedOn(id, 'domain-overview'), false, `${id} must not reach an overview`);
    assert.equal(allowedOn(id, 'domain-stats'), false, `${id} must not reach a bare stats tab`);
  }
});

test('every classified running metric is a real metric id', () => {
  // Guards against a tier entry drifting off a renamed or deleted metric,
  // which would silently stop classifying the real one.
  const real = new Set(RUNNING_METRICS.map((metric) => metric.id));
  const classified = Object.keys(METRIC_TIERS).filter((id) => id.startsWith('running.'));
  const unknown = classified.filter((id) => !real.has(id));
  assert.deepEqual(unknown, [], `classified running ids that no longer exist: ${unknown.join(', ')}`);
});

test('every real running metric is classified', () => {
  const classified = new Set(Object.keys(METRIC_TIERS));
  const missing = RUNNING_METRICS.map((metric) => metric.id).filter((id) => !classified.has(id));
  assert.deepEqual(missing, [], `unclassified running metrics: ${missing.join(', ')}`);
});

test('the tier summary accounts for every classified metric', () => {
  const summary = tierSummary();
  const total = TIERS.reduce((sum, tier) => sum + summary[tier], 0);
  assert.equal(total, Object.keys(METRIC_TIERS).length);
  assert.ok(summary.headline < summary.advanced, 'headline must be scarcer than advanced');
});

test('every metric with its own detail screen is classified', () => {
  // The tier map covers displayed metrics generally, but anything a user can
  // drill into MUST be classified — its detail footer states the tier, so an
  // unclassified one would silently describe itself as "advanced".
  const classified = new Set(Object.keys(METRIC_TIERS));
  const registered = [...RUNNING_METRICS, ...STRENGTH_METRICS].map((metric) => metric.id);
  const missing = registered.filter((id) => !classified.has(id));
  assert.deepEqual(missing, [], `metrics with a detail screen but no tier: ${missing.join(', ')}`);
});

test('classified strength ids that claim a detail screen really have one', () => {
  const real = new Set(STRENGTH_METRICS.map((metric) => metric.id));
  // These three are the registered detail metrics; the rest of the strength
  // entries are displayed-only and deliberately have no drilldown yet.
  const withDetail = ['strength.four-week-volume', 'strength.volume-progression', 'strength.muscle-set-credits'];
  for (const id of withDetail) {
    assert.ok(real.has(id), `${id} is no longer a registered strength metric`);
    assert.ok(METRIC_TIERS[id], `${id} lost its tier`);
  }
});
