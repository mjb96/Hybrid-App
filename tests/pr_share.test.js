// ==========================================
// PR SHARE TEST (tests/pr_share.test.js)
// C6b — the pure parts of the PR share card. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prShareCaption, topPR } from '../js/brain/pr-share.js';

test('caption names the lift, the 1RM and the unit', () => {
  const cap = prShareCaption({ name: 'Back Squat', e1rm: 142 }, { settings: { weightUnit: 'kg' } });
  assert.match(cap, /Back Squat/);
  assert.match(cap, /142kg/);
  assert.match(cap, /PR/);
});

test('caption respects lb and degrades without data', () => {
  assert.match(prShareCaption({ name: 'Bench', e1rm: 225 }, { settings: { weightUnit: 'lb' } }), /225lb/);
  assert.match(prShareCaption({}, {}), /new best/);
});

test('topPR picks the biggest PR and ignores non-PRs', () => {
  const lifts = [
    { name: 'Curl', pr: true, e1rm: 40 },
    { name: 'Squat', pr: true, e1rm: 150 },
    { name: 'Bench', pr: false, e1rm: 200 }, // not a PR — ignored despite higher e1rm
  ];
  assert.equal(topPR(lifts).name, 'Squat');
});

test('topPR returns null when there are no PRs', () => {
  assert.equal(topPR([{ name: 'x', pr: false, e1rm: 100 }]), null);
  assert.equal(topPR([]), null);
});
