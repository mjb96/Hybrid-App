import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function mainNavigationMarkup() {
  return index.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
}

test('the product shell has four intent-led destinations', () => {
  const navigation = mainNavigationMarkup();
  const items = [...navigation.matchAll(/<button class="nav-item[^"]*"[^>]*data-target="([^"]+)"[\s\S]*?<span>([^<]+)<\/span><\/button>/g)]
    .map((match) => ({ target: match[1], label: match[2] }));

  assert.deepEqual(items, [
    { target: 'home', label: 'Home' },
    { target: 'workout', label: 'Train' },
    { target: 'analytics', label: 'Progress' },
    { target: 'program', label: 'Plans' },
  ]);
  assert.doesNotMatch(navigation, /nav-fab|open-quick-start/);
});

test('Quick Start remains available inside Train while route ids stay stable', () => {
  const train = index.match(/<section id="view-workout"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(train, /aria-label="Train"/);
  assert.match(train, /data-action="open-quick-start"/);
  assert.match(train, />Quick start</);

  assert.match(index, /<section id="view-analytics"[^>]+aria-label="Progress"/);
  assert.match(index, /<section id="view-program"[^>]+aria-label="Plans"/);
});
