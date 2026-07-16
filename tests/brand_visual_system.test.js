import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const brand = readFileSync(new URL('../css/brand-consistency.css', import.meta.url), 'utf8');
const programs = readFileSync(new URL('../css/programs.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('approved technical palette is the final loaded visual decision', () => {
  assert.match(brand, /--brand-midnight:\s*#07111f/i);
  assert.match(brand, /--brand-gunmetal:\s*#101b2a/i);
  assert.match(brand, /--brand-cobalt:\s*#2563eb/i);
  assert.match(brand, /--brand-ice:\s*#60a5fa/i);
  assert.match(brand, /--brand-burnt-orange:\s*#f97316/i);

  const brandLink = index.indexOf('./css/brand-consistency.css');
  assert.ok(brandLink > index.indexOf('./css/hybrid-score.css'));
  assert.ok(brandLink > index.indexOf('./css/analytics.css'));
  assert.ok(brandLink > index.indexOf('./css/programs.css'));
});

test('core screens consume one shared surface and brand interaction language', () => {
  for (const selector of [
    '#homePrimaryCta.btn-green',
    '#startWorkoutBtn.btn-green',
    '.bottom-nav',
    '.cockpit-exercise:not(.collapsed)',
    '.an-tab--active',
    '.profile-stat-card',
    '.prog-search-input-wrap',
  ]) assert.ok(brand.includes(selector), `missing shared brand selector ${selector}`);

  assert.match(brand, /html\[data-theme="light"\]/);
  assert.match(brand, /prefers-reduced-motion:\s*reduce/);
});

test('Programs chrome no longer establishes violet as the app brand', () => {
  assert.doesNotMatch(programs, /rgba\(139,\s*92,\s*246/i);
  assert.doesNotMatch(programs, /#(?:8b5cf6|a78bfa|c4b5fd|7c3aed|6d28d9|4f46e5)/i);
});

test('burnt orange stays a restrained today marker, not a primary action', () => {
  const orangeUses = brand.match(/var\(--brand-burnt-orange\)/g) || [];
  assert.equal(orangeUses.length, 3); // semantic alias + today's border + today's dot
  assert.doesNotMatch(brand, /#homePrimaryCta[\s\S]{0,250}brand-burnt-orange/);
});

test('brand gradient never paints over a Home profile photo', () => {
  assert.match(brand, /\.home-avatar:not\(\.home-avatar--img\)/);
  assert.doesNotMatch(brand, /(?:^|,)\s*\.home-avatar\s*,[\s\S]{0,160}background:\s*var\(--brand-gradient\)\s*!important/m);
});
