import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialsRow, heroHTML } from '../js/brain/hybrid-score/ui.js';

const P = (score, weight) => ({ score, weight, signals: [] });
const result = () => ({
  score: 82, hasData: true,
  band: { color: '#10b981', status: 'Competitor' },
  level: { icon: '◆', name: 'Competitor' },
  delta: 3, momentum: { dir: 'up', label: 'climbing' }, confidence: 74,
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
});

test('V2-2a — a data-less dial shows the calibrating placeholder, not a zero', () => {
  const r = result();
  r.pillars.recovery = { score: null };
  r.pillars.lifestyle = { score: null };
  const html = dialsRow(r);
  assert.match(html, /· ·/); // RECOVER has no data → placeholder
});
