import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsBackDestination } from '../js/analytics/navigation.js';

test('an Insights leaf opened from Home returns to Home', () => {
  assert.deepEqual(analyticsBackDestination('strength', 'home'), {
    action: 'switch-tab', target: 'home', label: '← Back to Home',
  });
});

test('an Insights leaf opened from the Insights hub returns to the hub', () => {
  assert.deepEqual(analyticsBackDestination('strength', 'insights'), {
    action: 'open-analytics', context: 'hub', label: '← Back to Insights',
  });
});

test('the Insights hub has no redundant back button', () => {
  assert.equal(analyticsBackDestination('hub', 'home'), null);
});

test('an entity drilldown returns to its parent analytics surface', () => {
  assert.deepEqual(analyticsBackDestination('exercise', 'insights', 'weekly-volume'), {
    action: 'open-analytics', context: 'weekly-volume', label: '← Back to Weekly Volume', preserveWeek: true,
  });
});

test('a Strength Stats metric returns to Strength Stats with a clear label', () => {
  assert.deepEqual(analyticsBackDestination('strength-metric', 'insights', 'strength_pr'), {
    action: 'open-analytics', context: 'strength_pr', label: '← Back to Strength', preserveWeek: true,
  });
});

test('a third-level drilldown restores the parent surface own return path', () => {
  assert.deepEqual(
    analyticsBackDestination('exercise', 'home', 'weekly-volume', 'strength', 'insights'),
    {
      action: 'open-analytics', context: 'weekly-volume', label: '← Back to Weekly Volume',
      preserveWeek: true, parentContext: 'strength', origin: 'insights',
    },
  );
  assert.deepEqual(
    analyticsBackDestination('exercise', 'home', 'weekly-volume', null, 'home'),
    {
      action: 'open-analytics', context: 'weekly-volume', label: '← Back to Weekly Volume',
      preserveWeek: true, origin: 'home',
    },
  );
});
