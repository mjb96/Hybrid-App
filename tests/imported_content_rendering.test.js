import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeCssColor } from '../js/util.js';
import { celebrationContentHtml } from '../js/ui/celebration.js';
import { renderProgramCard } from '../js/programs/program-card.js';
import { render1RMProgressionChart } from '../js/analytics/charts/strength-charts.js';

const HOSTILE = '<img src=x onerror="globalThis.pwned=1">';

test('imported profile copy is escaped before celebration markup is built', () => {
  const html = celebrationContentHtml({ icon: HOSTILE, title: `Welcome, ${HOSTILE}`, subtitle: HOSTILE });
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('&lt;img'), true);
});

test('imported program card text and attribute values cannot create markup', () => {
  const html = renderProgramCard({
    id: `custom\" onmouseover=\"${HOSTILE}`,
    name: HOSTILE,
    category: HOSTILE,
    accentColor: `red; background:url(https://invalid.example/x)`,
    coverGradient: [`\" onmouseover=\"x`, 'javascript:alert(1)'],
    days: {},
  });
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('url(https://invalid.example/x)'), false);
  assert.equal(html.includes('javascript:'), false);
  assert.match(html, /data-program-id="custom&quot;/);
  assert.match(html, /#8b5cf6/);
});

test('imported lift name is escaped in the empty strength-chart state', () => {
  const container = { innerHTML: '' };
  render1RMProgressionChart(container, [], [], [], [], 0, HOSTILE);
  assert.equal(container.innerHTML.includes('<img'), false);
  assert.equal(container.innerHTML.includes('&lt;img'), true);
});

test('safeCssColor permits app tokens and rejects declarations or URLs', () => {
  assert.equal(safeCssColor('#3b82f6'), '#3b82f6');
  assert.equal(safeCssColor('var(--accent-blue)'), 'var(--accent-blue)');
  assert.equal(safeCssColor('red; background:url(https://invalid.example)'), '#3b82f6');
  assert.equal(safeCssColor('" onmouseover="x', '#111827'), '#111827');
});
