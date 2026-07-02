// ==========================================
// "SO WHAT?" TESTS (tests/so_what.test.js)
// R8: every analytics leaf must produce one prescriptive, data-aware line.
// Pure — hand-built dashboard-model fragments per rule.
// ==========================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSoWhat } from '../js/analytics/so-what.js';

const base = (over = {}) => ({
  load: { hasData: true, acwr: 0.9, tsb: 2 },
  ready: { hasData: true, score: 70, available: ['wellness', 'load'] },
  week: {
    volume: { current: 5000, prev: 5000, delta: null },
    distance: { current: 10, prev: 10, delta: null },
    consistencyDone: 5, consistencyTotal: 10, consistencyPct: 50,
  },
  streak: { current: 4, longest: 9 },
  bodyweight: { hasData: true, delta7: 0.2 },
  goal: { avgConsistency: 85 },
  pace: { hasData: true },
  fasting: { active: false, streak: 0 },
  ...over,
});

test('prescribing surfaces get no banner', () => {
  assert.equal(buildSoWhat('hub', base(), {}), null);
  assert.equal(buildSoWhat('hybrid-score', base(), {}), null);
  assert.equal(buildSoWhat('weekly-review', base(), {}), null);
  assert.equal(buildSoWhat('running', null, {}), null); // no model → nothing
});

test('load group: spike warns with deload advice; productive encourages', () => {
  const hot = buildSoWhat('training-status', base({ load: { hasData: true, acwr: 1.6 } }), {});
  assert.equal(hot.tone, 'warning');
  assert.match(hot.text, /deload/i);
  const good = buildSoWhat('stress-balance', base(), {});
  assert.equal(good.tone, 'positive');
  assert.match(good.text, /productive zone/);
  const cold = buildSoWhat('load-focus', base({ load: { hasData: true, acwr: 0.4 } }), {});
  assert.equal(cold.tone, 'caution');
  assert.match(cold.text, /Add a session/);
});

test('recovery: high readiness → push; low → protect; missing check-in → prompt', () => {
  assert.match(buildSoWhat('recovery-score', base({ ready: { hasData: true, score: 90, available: ['wellness'] } }), {}).text, /green light/i);
  assert.equal(buildSoWhat('recovery', base({ ready: { hasData: true, score: 35, available: ['wellness'] } }), {}).tone, 'warning');
  assert.match(buildSoWhat('recovery', base({ ready: { hasData: true, score: 75, available: ['load'] } }), {}).text, /check-in/);
});

test('strength: volume down → schedule; up → temper the spike', () => {
  const down = buildSoWhat('strength', base({ week: { volume: { current: 4000, prev: 5000, delta: { dir: 'down', good: false, pctLabel: '20%' } }, distance: { current: 0 }, consistencyTotal: 0, consistencyPct: 0 } }), {});
  assert.equal(down.tone, 'caution');
  assert.match(down.text, /down 20%/);
  const up = buildSoWhat('weekly-volume', base({ week: { volume: { current: 6000, prev: 5000, delta: { dir: 'up', good: true, pctLabel: '20%' } }, distance: { current: 0 }, consistencyTotal: 0, consistencyPct: 0 } }), {});
  assert.match(up.text, /under ~10%/);
});

test('running: none this week → Zone 2 nudge', () => {
  const r = buildSoWhat('running', base({ week: { volume: { current: 0 }, distance: { current: 0, delta: null }, consistencyTotal: 0, consistencyPct: 0 } }), {});
  assert.equal(r.tone, 'caution');
  assert.match(r.text, /Zone 2/);
});

test('vdot: missing threshold pace → setup prompt', () => {
  assert.match(buildSoWhat('vdot', base(), {}).text, /threshold pace/i);
  assert.match(buildSoWhat('vdot', base(), { thresholdPaceSeconds: 240 }).text, /Retest/);
});

test('bodyweight: goal-aware coaching', () => {
  const offCut = buildSoWhat('bodyweight', base({ bodyweight: { hasData: true, delta7: 0.8 } }), { settings: { weightGoal: 'cut' } });
  assert.equal(offCut.tone, 'caution');
  assert.match(offCut.text, /nutrition/);
  const noData = buildSoWhat('bodyweight', base({ bodyweight: { hasData: false } }), {});
  assert.match(noData.text, /Log a weight/);
});

test('streak: record framing', () => {
  assert.match(buildSoWhat('streak', base(), {}).text, /5 more to beat your record of 9/);
  assert.match(buildSoWhat('streak', base({ streak: { current: 12, longest: 12 } }), {}).text, /this IS your record/);
});

test('fasting: active fast counts down; goal reached advises the break', () => {
  const mid = buildSoWhat('fasting', base({ fasting: { active: true, hours: 10.4, goal: 16 } }), {});
  assert.match(mid.text, /10h in — 6h to goal/);
  const done = buildSoWhat('fasting', base({ fasting: { active: true, hours: 17, goal: 16 } }), {});
  assert.match(done.text, /protein first/);
});

test('weekly-summary default: plan-gap coaching, complete → recover', () => {
  assert.match(buildSoWhat('weekly-summary', base(), {}).text, /50% of this week's plan/);
  const doneAll = buildSoWhat('weekly-summary', base({ week: { volume: {}, distance: {}, consistencyDone: 10, consistencyTotal: 10, consistencyPct: 100 } }), {});
  assert.equal(doneAll.tone, 'positive');
  assert.match(doneAll.text, /recovery is the training/i);
});
