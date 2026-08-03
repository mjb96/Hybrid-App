import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHTML = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../js/dashboard.js', import.meta.url), 'utf8');

test('Home preserves both owner-preferred In Focus cards', () => {
  assert.match(indexHTML, /id="strengthBarChart"/);
  assert.match(indexHTML, /id="runBarChart"/);
  assert.match(indexHTML, />In Focus</);
});

test('Home removes the repeated At-a-Glance grid', () => {
  assert.doesNotMatch(indexHTML, /id="glanceGrid"/);
  assert.doesNotMatch(indexHTML, />At a Glance</);
});

test('the dormant tile catalogue no longer defines a Home tile selection', () => {
  assert.doesNotMatch(dashboardSource, /HOME_TILE_IDS/);
});
