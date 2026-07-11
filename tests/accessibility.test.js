// ==========================================
// ACCESSIBILITY STATIC CHECK (tests/accessibility.test.js)
// ------------------------------------------
// Automated a11y guards for the critical screens' markup in index.html:
//   • no icon-only button lacks an accessible name;
//   • key interactive inputs have an accessible name;
//   • every role="dialog" declares aria-modal + a label;
//   • the viewport doesn't block zoom (low-vision).
// These lock the fixes from this audit so they can't silently regress.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

test('no icon-only button lacks an accessible name', () => {
  const offenders = [];
  for (const m of HTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = m[1];
    const hasName = /aria-label|aria-labelledby|title=/.test(attrs);
    const text = m[2].replace(/<[^>]*>/g, '');
    const hasVisibleText = /[A-Za-z0-9]/.test(text);
    if (!hasName && !hasVisibleText) offenders.push(m[0].slice(0, 80));
  }
  assert.deepEqual(offenders, [], `icon-only buttons need aria-label:\n${offenders.join('\n')}`);
});

test('key interactive inputs have an accessible name', () => {
  const mustHaveName = [
    'loginEmail', 'loginPassword', 'signupEmail', 'signupPassword',
    'runInputDist', 'runInputTime', 'progSearchInput', 'rlDate',
  ];
  for (const id of mustHaveName) {
    const re = new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`);
    const tag = HTML.match(re)?.[0];
    assert.ok(tag, `input #${id} not found`);
    assert.match(tag, /aria-label|aria-labelledby/, `input #${id} needs an accessible name`);
  }
});

test('every dialog declares aria-modal and a label', () => {
  for (const m of HTML.matchAll(/<[a-z0-9]+\b([^>]*\brole="dialog"[^>]*)>/g)) {
    const attrs = m[1];
    assert.match(attrs, /aria-modal="true"/, `dialog missing aria-modal: ${m[0].slice(0, 90)}`);
    assert.match(attrs, /aria-label|aria-labelledby/, `dialog missing a label: ${m[0].slice(0, 90)}`);
  }
});

test('viewport allows zoom (no user-scalable=no / maximum-scale=1)', () => {
  const vp = HTML.match(/<meta[^>]*name="viewport"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(vp, /user-scalable\s*=\s*no/i, 'viewport must not disable zoom');
  assert.doesNotMatch(vp, /maximum-scale\s*=\s*1(\.0)?\b/i, 'viewport must not clamp zoom');
});
