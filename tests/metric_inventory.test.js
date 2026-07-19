import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANALYTICS_EXCLUSIONS,
  ANALYTICS_INVENTORY,
  analyticsInventorySummary,
} from '../js/analytics/metric-inventory.js';
import { RUNNING_METRICS } from '../js/analytics/running-detail.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every inventoried analytic has a complete data, period, interaction and evidence contract', () => {
  assert.ok(ANALYTICS_INVENTORY.length >= 100);
  assert.equal(new Set(ANALYTICS_INVENTORY.map((entry) => entry.id)).size, ANALYTICS_INVENTORY.length);
  const required = [
    'id', 'label', 'domain', 'surfaces', 'sourceRecords', 'calculationOwner', 'unit', 'timeScope',
    'comparisonRule', 'emptyState', 'beforeInteraction', 'currentInteractive', 'currentDestination',
    'intendedDestination', 'historicalSeries', 'exactEvidence', 'limitationsAndConfidence', 'tests', 'implementation',
  ];
  for (const entry of ANALYTICS_INVENTORY) {
    for (const field of required) {
      if (Array.isArray(entry[field])) assert.ok(entry[field].length > 0, `${entry.id} missing ${field}`);
      else assert.ok(entry[field], `${entry.id} missing ${field}`);
    }
  }
});

test('every registered running metric is an exact supported destination and appears in the Stats index', () => {
  const inventory = new Map(ANALYTICS_INVENTORY.map((entry) => [entry.id, entry]));
  const runningView = read('js/analytics/views/view-running.js');
  for (const metric of RUNNING_METRICS) {
    const entry = inventory.get(metric.id);
    assert.ok(entry, `${metric.id} missing inventory`);
    assert.equal(entry.currentInteractive, 'exact-detail');
    assert.equal(entry.currentDestination, `running-metric:${metric.id}`);
    assert.match(runningView, new RegExp(metric.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('running metric actions carry stable identity, accessible naming and the exact destination', () => {
  const primitives = read('js/analytics/charts/chart-primitives.js');
  const runningView = read('js/analytics/views/view-running.js');
  assert.match(primitives, /data-metric-id/);
  assert.match(primitives, /aria-label="View \$\{label\} details"/);
  assert.match(runningView, /data-context="running-metric"/);
  assert.match(runningView, /data-metric-id=/);
});

test('inventory summary and explicit non-analytic exclusions remain reviewable', () => {
  const summary = analyticsInventorySummary();
  assert.equal(summary.metrics, ANALYTICS_INVENTORY.length);
  assert.equal(summary.newlyExact, RUNNING_METRICS.length);
  assert.ok(summary.tileInstances >= summary.metrics);
  assert.ok(ANALYTICS_EXCLUSIONS.length >= 5);
});

test('Profile reads the canonical persisted Health Connect field names', () => {
  const profile = read('js/profile-stats.js');
  assert.match(profile, /latestHRVRecord\?\.rmssd/);
  assert.match(profile, /latestRHRRecord\?\.bpm/);
  assert.match(profile, /latestSleepRecord\?\.totalHours/);
});
