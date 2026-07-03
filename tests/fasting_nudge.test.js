import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastingNudge, maybePushFastingNudge } from '../js/fasting/fasting-nudge.js';

const ctx = (over) => ({ active: true, progressPct: 40, goal: 16, zone: { id: 'glycogen', name: 'Glycogen Depletion' }, ...over });

test('S1d — no nudge when idle, or while still in the opening Fed state', () => {
  assert.equal(fastingNudge({ active: false }, {}), null);
  assert.equal(fastingNudge(ctx({ zone: { id: 'fed', name: 'Fed State' } }), { zoneId: 'fed' }), null);
});

test('S1d — crossing into a new stage fires a stage nudge once', () => {
  const first = fastingNudge(ctx(), { zoneId: 'blood_sugar' });
  assert.equal(first.kind, 'stage');
  assert.match(first.title, /Glycogen Depletion/);
  // Already notified for this zone → no repeat.
  assert.equal(fastingNudge(ctx(), { zoneId: 'glycogen' }), null);
});

test('S1d — reaching the goal fires a goal nudge once, before further stage nudges', () => {
  const goal = fastingNudge(ctx({ progressPct: 100, zone: { id: 'fat_adapt', name: 'Fat Adaptation' } }), { zoneId: 'blood_sugar' });
  assert.equal(goal.kind, 'goal');
  assert.match(goal.title, /goal reached/i);
  // Once goalNotified, the goal doesn't re-fire (a stage may still).
  const after = fastingNudge(ctx({ progressPct: 100, zone: { id: 'fat_adapt', name: 'Fat Adaptation' } }), { zoneId: 'fat_adapt', goalNotified: true });
  assert.equal(after, null);
});

test('S1d — firer respects the granted gate and the active gate', () => {
  const state = { fastingSession: { active: true, startTime: 't1', goal: 16 } };
  let sent = 0;
  const opts = { notifyFn: () => sent++, granted: false, saveFn: () => {} };
  assert.equal(maybePushFastingNudge(state, opts), null); // not granted
  assert.equal(sent, 0);
  assert.equal(maybePushFastingNudge({ fastingSession: { active: false } }, { ...opts, granted: true }), null);
  assert.equal(sent, 0);
});

test('S1d — firer fires once per stage and persists the marker so it never repeats', () => {
  // A fast 13h in → glycogen zone (12–16h), well short of a 16h goal.
  const start = new Date(Date.now() - 13 * 3600e3).toISOString();
  const state = { fastingSession: { active: true, startTime: start, goal: 16, history: [] } };
  let sent = [];
  const opts = { notifyFn: (t, b, tag) => sent.push([t, tag]), granted: true, saveFn: () => {} };

  const first = maybePushFastingNudge(state, opts);
  assert.equal(first.kind, 'stage');
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1], 'fasting-stage');
  assert.equal(state.fastingSession._nudge.zoneId, 'glycogen'); // marker persisted

  // Second call, same zone → nothing new.
  assert.equal(maybePushFastingNudge(state, opts), null);
  assert.equal(sent.length, 1);
});

test('S1d — a brand-new fast (startTime change) resets the marker', () => {
  const start = new Date(Date.now() - 13 * 3600e3).toISOString();
  const state = { fastingSession: { active: true, startTime: start, goal: 16, _nudge: { startTime: 'OLD', zoneId: 'glycogen', goalNotified: true } } };
  const fired = maybePushFastingNudge(state, { notifyFn: () => {}, granted: true, saveFn: () => {} });
  // Old marker was for a different fast; the current glycogen crossing re-fires.
  assert.equal(fired.kind, 'stage');
  assert.equal(state.fastingSession._nudge.startTime, start);
});
