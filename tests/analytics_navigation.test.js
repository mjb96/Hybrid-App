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
