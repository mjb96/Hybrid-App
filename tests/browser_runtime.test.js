import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserIsRequired } from '../scripts/browser-runtime.mjs';

test('browser checks are mandatory with the CI flag or environment gate', () => {
  assert.equal(browserIsRequired(['node', 'check.mjs', '--required'], {}), true);
  assert.equal(browserIsRequired(['node', 'check.mjs'], { HELYX_BROWSER_REQUIRED: '1' }), true);
  assert.equal(browserIsRequired(['node', 'check.mjs'], {}), false);
});
