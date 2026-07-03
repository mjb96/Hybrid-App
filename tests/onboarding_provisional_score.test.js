import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionalScore } from '../js/onboarding/provisional-score.js';
import { computeDials } from '../js/brain/hybrid-score/dials.js';

test('V2-2 — returns a live-card-shaped result the display layer can render', () => {
  const r = provisionalScore({ level: 'intermediate', frequency: 'some', recovery: 'ok' });
  assert.equal(typeof r.score, 'number');
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.equal(r.hasData, true);
  assert.equal(r.provisional, true);
  assert.ok(r.band && typeof r.band.color === 'string');
  assert.ok(r.level && r.level.tier === 1, 'everyone starts an Initiate');
  assert.equal(r.delta, null, 'no prior score → New today');
});

test('V2-2 — momentum & body stay null (honestly unknowable from onboarding)', () => {
  const r = provisionalScore({ level: 'advanced', frequency: 'high', recovery: 'fresh' });
  assert.equal(r.pillars.momentum.score, null);
  assert.equal(r.pillars.body.score, null);
});

test('V2-2 — dials compute; PROGRESS renormalises across only the known pillars', () => {
  const r = provisionalScore({ level: 'advanced', frequency: 'high', recovery: 'fresh' });
  const dials = computeDials(r);
  const progress = dials.find(d => d.id === 'progress');
  // strength + endurance have data; momentum + body do not.
  assert.deepEqual(progress.activePillars.sort(), ['endurance', 'strength']);
  assert.ok(progress.score != null && progress.score > 0);
});

test('V2-2 — answers move the number monotonically (better input never lowers it)', () => {
  const low  = provisionalScore({ level: 'beginner',     frequency: 'low',   recovery: 'low' });
  const mid  = provisionalScore({ level: 'intermediate', frequency: 'some',  recovery: 'ok' });
  const high = provisionalScore({ level: 'advanced',     frequency: 'high',  recovery: 'fresh' });
  assert.ok(low.score < mid.score, `${low.score} < ${mid.score}`);
  assert.ok(mid.score < high.score, `${mid.score} < ${high.score}`);
});

test('V2-2 — each self-report drives its own dial in isolation', () => {
  const base = { level: 'intermediate', frequency: 'some', recovery: 'ok' };
  const dial = (ans, id) => computeDials(provisionalScore(ans)).find(d => d.id === id).score;
  // Fresher recovery lifts RECOVER.
  assert.ok(dial({ ...base, recovery: 'fresh' }, 'recover') > dial({ ...base, recovery: 'low' }, 'recover'));
  // More frequency lifts TRAIN.
  assert.ok(dial({ ...base, frequency: 'high' }, 'train') > dial({ ...base, frequency: 'low' }, 'train'));
  // Higher level lifts PROGRESS.
  assert.ok(dial({ ...base, level: 'advanced' }, 'progress') > dial({ ...base, level: 'beginner' }, 'progress'));
});

test('V2-2 — tolerates missing/unknown answers via sensible defaults', () => {
  const r = provisionalScore({});
  assert.equal(typeof r.score, 'number');
  assert.ok(r.score > 0);
  const weird = provisionalScore({ level: 'wizard', frequency: 'sometimes', recovery: 'meh' });
  assert.equal(typeof weird.score, 'number');
});
