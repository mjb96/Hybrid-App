import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserIsRequired, createBrowserContext } from '../scripts/browser-runtime.mjs';

test('browser checks are mandatory with the CI flag or environment gate', () => {
  assert.equal(browserIsRequired(['node', 'check.mjs', '--required'], {}), true);
  assert.equal(browserIsRequired(['node', 'check.mjs'], { HELYX_BROWSER_REQUIRED: '1' }), true);
  assert.equal(browserIsRequired(['node', 'check.mjs'], {}), false);
});

test('browser-check contexts allow local assets and block external hosts', async () => {
  let handler;
  let receivedOptions;
  const context = {
    async route(pattern, callback) {
      assert.equal(pattern, '**/*');
      handler = callback;
    },
  };
  const browser = {
    async newContext(options) {
      receivedOptions = options;
      return context;
    },
  };

  const result = await createBrowserContext(browser, { colorScheme: 'dark' });
  assert.equal(result, context);
  assert.deepEqual(receivedOptions, { colorScheme: 'dark' });
  assert.equal(typeof handler, 'function');

  const outcomes = [];
  const routeFor = (url) => ({
    request: () => ({ url: () => url }),
    continue: async () => outcomes.push(['continue', url]),
    abort: async (reason) => outcomes.push(['abort', url, reason]),
  });

  await handler(routeFor('http://127.0.0.1:4321/js/app.js'));
  await handler(routeFor('http://localhost:4321/css/styles.css'));
  await handler(routeFor('https://fonts.googleapis.com/css2?family=Test'));
  await handler(routeFor('data:image/png;base64,AA=='));

  assert.deepEqual(outcomes, [
    ['continue', 'http://127.0.0.1:4321/js/app.js'],
    ['continue', 'http://localhost:4321/css/styles.css'],
    ['abort', 'https://fonts.googleapis.com/css2?family=Test', 'blockedbyclient'],
    ['continue', 'data:image/png;base64,AA=='],
  ]);
});
