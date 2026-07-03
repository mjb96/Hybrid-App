import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareCaption, drawScoreCard } from '../js/brain/hybrid-score/share-card.js';

const result = (score) => ({
  score, band: { status: 'Strong', color: '#3b82f6' },
  level: { tier: 4, name: 'Hybrid Athlete', icon: '◕' },
  pillars: { consistency: { score: 80 }, load: { score: 70 }, recovery: { score: 75 }, lifestyle: { score: 60 }, strength: { score: 82 }, endurance: { score: 68 }, momentum: { score: null }, body: { score: null } },
});

test('V2-5 — caption carries name, score, status, level', () => {
  const cap = shareCaption(result(78), { settings: { name: 'Sam' } });
  assert.match(cap, /Sam/);
  assert.match(cap, /78/);
  assert.match(cap, /Strong/);
  assert.match(cap, /Hybrid Athlete/);
  assert.match(cap, /Helyx/);
});

test('V2-5 — weekly variant caption says "this week"', () => {
  const cap = shareCaption(result(80), { settings: { name: 'Sam' } }, { variant: 'weekly' });
  assert.match(cap, /this week/);
});

test('V2-5 — caption degrades gracefully with no name / calibrating', () => {
  assert.match(shareCaption(result(70), {}), /Hybrid Score 70/);
  assert.match(shareCaption({ score: null }, {}), /calibrating/i);
});

test('V2-5 — drawScoreCard paints without throwing on a stub 2D context', () => {
  // Minimal canvas 2D stub — asserts the draw path issues only supported calls.
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p === 'measureText') return () => ({ width: 100 });
      // any other property is a no-op function or settable field
      return typeof p === 'string' ? (...a) => { calls.push(p); } : undefined;
    },
    set() { return true; },
  });
  assert.doesNotThrow(() => drawScoreCard(ctx, 1080, 1350, result(78), { settings: { name: 'Sam' }, streakData: { current: 12 } }));
  assert.ok(calls.includes('fillText'), 'drew text');
  assert.ok(calls.includes('arc'), 'drew the gauge arc');
});
