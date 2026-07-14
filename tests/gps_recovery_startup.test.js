import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('native GPS recovery initializes only after persisted state is loaded', () => {
  const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const pull = source.indexOf('await pullEngineDataFromStorage();');
  const recover = source.indexOf('initGpsTracker();');
  assert.ok(pull >= 0, 'storage pull call must exist');
  assert.ok(recover > pull, 'GPS recovery must not save before storage is loaded');
});
