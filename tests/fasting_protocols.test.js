import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FASTING_PROTOCOLS,
  protocolById,
  protocolForGoalHours,
  protocolLabelForGoal,
  FAST_GOAL_OPTIONS,
} from '../js/fasting.js';

test('S1a — the named protocol set covers the standard IF windows + extended fasts', () => {
  const ids = FASTING_PROTOCOLS.map(p => p.id);
  for (const expected of ['14:10', '16:8', '18:6', '20:4', 'omad', '24h', '36h', '48h']) {
    assert.ok(ids.includes(expected), `missing protocol ${expected}`);
  }
});

test('S1a — fast + eat hours are internally consistent for sub-24h protocols', () => {
  for (const p of FASTING_PROTOCOLS) {
    if (p.fastHours < 24) {
      assert.equal(p.fastHours + p.eatHours, 24, `${p.id} fast+eat should span a 24h day`);
    } else {
      assert.equal(p.eatHours, 0, `${p.id} is a full-day+ fast, no daily eating window`);
    }
  }
});

test('S1a — only extended (≥24h) fasts carry the medical-caution flag', () => {
  for (const p of FASTING_PROTOCOLS) {
    if (p.fastHours >= 24) assert.equal(p.caution, true, `${p.id} should be flagged caution`);
    else assert.ok(!p.caution, `${p.id} should not be flagged caution`);
  }
});

test('S1a — protocolById resolves known ids and rejects unknown/custom', () => {
  assert.equal(protocolById('16:8')?.fastHours, 16);
  assert.equal(protocolById('omad')?.fastHours, 23);
  assert.equal(protocolById('nope'), null);
  assert.equal(protocolById('custom'), null);
});

test('S1a — protocolForGoalHours maps a preset goal, null for a custom window', () => {
  assert.equal(protocolForGoalHours(18)?.id, '18:6');
  assert.equal(protocolForGoalHours(48)?.id, '48h');
  assert.equal(protocolForGoalHours(13), null); // 13h is not a preset
});

test('S1a — protocolLabelForGoal names presets and falls back to Custom · Nh', () => {
  assert.equal(protocolLabelForGoal(16), '16:8');
  assert.equal(protocolLabelForGoal(23), 'OMAD');
  assert.equal(protocolLabelForGoal(13), 'Custom · 13h');
});

test('S1a — every preset fast-hours value is a legacy goal option (back-compat)', () => {
  // The old raw-hours dropdown must still offer every protocol goal so existing
  // sessions and the pre-S1b select keep working.
  for (const p of FASTING_PROTOCOLS) {
    assert.ok(FAST_GOAL_OPTIONS.includes(p.fastHours), `${p.fastHours}h missing from FAST_GOAL_OPTIONS`);
  }
});
