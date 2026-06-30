// ==========================================
// BRAIN BRIEFING TESTS (tests/brain_briefing.test.js) — `node --test`
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trainingStatus } from '../js/brain/briefing.js';

test('trainingStatus maps ACWR to a COROS-style word', () => {
  assert.equal(trainingStatus({ hasData: false }).status, 'Building');
  assert.equal(trainingStatus({ hasData: true, acwr: 0.7 }).status, 'Detraining');
  assert.equal(trainingStatus({ hasData: true, acwr: 0.95 }).status, 'Maintaining');
  assert.equal(trainingStatus({ hasData: true, acwr: 1.15 }).status, 'Productive');
  assert.equal(trainingStatus({ hasData: true, acwr: 1.4 }).status, 'Overreaching');
  assert.equal(trainingStatus({ hasData: true, acwr: 1.7 }).status, 'Strained');
  assert.equal(trainingStatus({ hasData: true, acwr: 1.15 }).tone, 'progress');
});
