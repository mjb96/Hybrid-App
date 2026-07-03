import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoveryPillar } from '../js/brain/hybrid-score/pillars.js';
import { recordDailyScore } from '../js/brain/hybrid-score/history.js';

const model = () => ({
  readyNoLoad: { hasData: true, score: 70, components: {} },
  ready: { hasData: true, score: 70, components: {} },
  load: { hasData: false },
});

test('E6 — a 3-day readiness decline nudges Recovery down before today looks bad', () => {
  const flat = recoveryPillar(model(), {
    hybridScore: { history: [{ readiness: 70 }, { readiness: 70 }, { readiness: 70 }] },
  });
  const declining = recoveryPillar(model(), {
    hybridScore: { history: [{ readiness: 85 }, { readiness: 77 }, { readiness: 70 }] },
  });
  // Same 70 reading today, but the downward slope pulls the pillar below flat.
  assert.ok(declining.score < flat.score, `declining (${declining.score}) < flat (${flat.score})`);
  assert.ok(declining.signals.includes('recovery trending down'));
});

test('E6 — an upward readiness trend nudges Recovery up', () => {
  const rising = recoveryPillar(model(), {
    hybridScore: { history: [{ readiness: 55 }, { readiness: 63 }, { readiness: 70 }] },
  });
  assert.ok(rising.score > 70, `rising trend (${rising.score}) should exceed the raw 70`);
  assert.ok(rising.signals.includes('recovery trending up'));
});

test('E6 — too little history (or none) applies no adjustment', () => {
  assert.equal(recoveryPillar(model(), {}).score, 70);
  assert.equal(recoveryPillar(model(), { hybridScore: { history: [{ readiness: 40 }, { readiness: 50 }] } }).score, 70);
});

test('E6 — recordDailyScore persists the load-excluded readiness onto the snapshot', () => {
  const state = {};
  const scoreResult = { score: 80, level: { tier: 2 }, pillars: {} };
  const m = { readyNoLoad: { hasData: true, score: 66 }, week: {}, streak: {} };
  recordDailyScore(state, scoreResult, m, '2026-07-03');
  const entry = state.hybridScore.history.find(h => h.date === '2026-07-03');
  assert.equal(entry.readiness, 66);

  // Intraday: readiness moves even if the composite score doesn't → snapshot updates.
  const m2 = { readyNoLoad: { hasData: true, score: 58 }, week: {}, streak: {} };
  const res = recordDailyScore(state, scoreResult, m2, '2026-07-03');
  assert.equal(res.changed, true);
  assert.equal(state.hybridScore.history.find(h => h.date === '2026-07-03').readiness, 58);
});
