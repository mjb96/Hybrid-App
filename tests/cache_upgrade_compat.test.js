import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('new comparison callers do not require a newly-added export from the legacy cached module', () => {
  const weekChart = read('js/analytics/week-chart-model.js');
  const strengthEntity = read('js/analytics/views/view-strength-entity.js');
  const legacyComparison = read('js/analytics/comparison.js');

  assert.match(weekChart, /from '\.\/period-comparison\.js'/);
  assert.match(strengthEntity, /from '\.\.\/period-comparison\.js'/);
  assert.match(legacyComparison, /export \{ comparePeriodValues \} from '\.\/period-comparison\.js'/);
  assert.doesNotMatch(weekChart, /import \{ comparePeriodValues \} from '\.\/comparison\.js'/);
  assert.doesNotMatch(strengthEntity, /import \{ comparePeriodValues \} from '\.\.\/comparison\.js'/);
});

test('service-worker update registration runs before and independently of the app module graph', () => {
  const index = read('index.html');
  const updater = read('js/sw-reload.js');
  const app = read('js/app.js');
  const updaterTag = '<script src="./js/sw-reload.js"></script>';
  const appTag = '<script type="module" src="./js/app.js"></script>';

  assert.ok(index.indexOf(updaterTag) >= 0, 'upgrade-safety script must be loaded');
  assert.ok(index.indexOf(updaterTag) < index.indexOf(appTag), 'upgrade-safety script must run before app imports');
  assert.match(updater, /serviceWorker\.register\('\.\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(updater, /navigator\.serviceWorker\.controller/);
  assert.match(updater, /controllerchange/);
  assert.doesNotMatch(updater, /^\s*(?:import|export)\s/m, 'upgrade-safety script must stay dependency-free');
  assert.doesNotMatch(app, /serviceWorker\.register/, 'app boot must not own update discovery');
});
