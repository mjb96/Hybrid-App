import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialsRow, heroHTML, detailHTML } from '../js/brain/hybrid-score/ui.js';

const P = (score, weight) => ({ score, weight, signals: [] });
const result = () => ({
  score: 82, hasData: true,
  band: { color: '#10b981', status: 'Strong' },
  level: { icon: '◆', name: 'Competitor' },
  delta: 3, momentum: { dir: 'up', label: 'climbing' }, confidence: 74,
  drivers: [], deltaBreakdown: null,
  recommendation: 'Push the run today.',
  pillars: {
    consistency: P(88, 22), load: P(80, 12),
    recovery: P(70, 18), lifestyle: P(78, 5),
    strength: P(84, 14), endurance: P(76, 14), momentum: P(72, 10), body: P(80, 5),
  },
});

test('V2-2a — dialsRow renders exactly the three dials with their values', () => {
  const html = dialsRow(result());
  for (const label of ['TRAIN', 'RECOVER', 'PROGRESS']) assert.match(html, new RegExp(label));
  assert.equal((html.match(/hs-dial__val/g) || []).length, 3);
});

test('V2-2a — the home hero carries the 3 dials when there is data', () => {
  const html = heroHTML(result(), { showAction: false });
  assert.match(html, /hs-dials/);
  assert.match(html, /TRAIN/);
  assert.match(html, /PROGRESS/);
  assert.match(html, /Hybrid focus/);
  assert.doesNotMatch(html, /◆ Competitor/);
});

test('V2-2a — a data-less dial shows the calibrating placeholder, not a zero', () => {
  const r = result();
  r.pillars.recovery = { score: null };
  r.pillars.lifestyle = { score: null };
  const html = dialsRow(r);
  assert.match(html, /· ·/); // RECOVER has no data → placeholder
});

test('score detail is training-led and keeps XP ranks out of the primary surface', () => {
  const r = result();
  r.goalLabel = 'Strength focus';
  r.goalWeights = { consistency: .24, recovery: .2, strength: .24, endurance: 0, load: .12, momentum: .12, body: .04, lifestyle: .04 };
  r.pillars.endurance.included = false;
  const html = detailHTML(r, { hybridScore: { history: [] } });
  assert.match(html, /Strength focus/);
  assert.doesNotMatch(html, /XP to|top tier reached|◆ Competitor/);
  assert.doesNotMatch(html, />Endurance</);
});

test('score pillars are expandable and expose their supporting signals', () => {
  const r = result();
  r.goalWeights = { consistency: 1 };
  r.pillars.consistency.signals = ['3 training days', 'up from last week'];
  const html = detailHTML(r, { hybridScore: { history: [] } });
  assert.match(html, /<details class="hs-pillar">/);
  assert.match(html, /3 training days/);
  assert.match(html, /up from last week/);
  assert.match(html, /Tap to explain/);
});
