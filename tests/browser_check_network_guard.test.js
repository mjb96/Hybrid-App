// Browser product checks exercise local application behaviour. External hosts
// are neither part of their contract nor stable enough to gate a release: a
// transient Google Fonts 404 made two identical post-merge workflows fail in
// different, random subsets while every functional assertion passed.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

test('every browser product check uses the external-network-isolated context', () => {
  const browserChecks = readdirSync(SCRIPTS)
    .filter((name) => name.endsWith('-check.mjs'))
    .map((name) => ({ name, source: readFileSync(path.join(SCRIPTS, name), 'utf8') }))
    .filter(({ source }) => source.includes('resolveChromium'));

  const offenders = browserChecks
    .filter(({ source }) => !source.includes('createBrowserContext'))
    .map(({ name }) => name);

  assert.ok(browserChecks.length >= 25, `expected browser product checks, found ${browserChecks.length}`);
  assert.deepEqual(offenders, [],
    `${offenders.join(', ')}: create contexts with createBrowserContext so external availability cannot gate product assertions`);
});

test('the performance baseline retains direct contexts for its explicit online/offline scenarios', () => {
  const source = readFileSync(path.join(SCRIPTS, 'performance-baseline.mjs'), 'utf8');
  assert.match(source, /browser\.newContext\(/);
  assert.doesNotMatch(source, /createBrowserContext/);
  assert.match(source, /if \(opts\.offline\) await ctx\.route/);
});
