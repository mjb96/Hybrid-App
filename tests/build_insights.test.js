// ==========================================
// INSIGHTS ORCHESTRATOR TEST (tests/build_insights.test.js)
// The recap + analytics views share one insight source. Guards the category
// mapping and that the orchestrator degrades safely on empty/sparse state.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRankedInsights, sessionInsightCategories, insightsForSession } from '../js/analytics/insights/build-insights.js';

test('sessionInsightCategories maps session types to relevant categories', () => {
  assert.deepEqual([...sessionInsightCategories(['gym'])].sort(), ['load', 'strength']);
  assert.deepEqual([...sessionInsightCategories(['run'])].sort(), ['load', 'running']);
  assert.deepEqual([...sessionInsightCategories(['walk'])].sort(), ['load', 'running']);
  // Combined day gets both strength and running.
  assert.deepEqual([...sessionInsightCategories(['gym', 'run'])].sort(), ['load', 'running', 'strength']);
  // Unknown/empty → all categories (don't hide anything).
  assert.deepEqual([...sessionInsightCategories([])].sort(), ['load', 'running', 'strength']);
});

test('buildRankedInsights returns an array and never throws on empty state', () => {
  assert.deepEqual(buildRankedInsights(null), []);
  assert.deepEqual(buildRankedInsights({}), []);
  const res = buildRankedInsights({ weeks: {} });
  assert.ok(Array.isArray(res));
});

test('insightsForSession only returns categories relevant to the session', () => {
  // Even with no real data, the result must be an array and respect the cap.
  const res = insightsForSession({ weeks: {} }, ['run'], 4);
  assert.ok(Array.isArray(res));
  assert.ok(res.length <= 4);
  assert.ok(res.every((i) => ['running', 'load'].includes(i.category)));
});
