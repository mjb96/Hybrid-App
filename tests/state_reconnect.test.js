// ==========================================
// RECONNECT RESYNC TEST (tests/state_reconnect.test.js)
// Phase 2 offline behavior: edits made offline still reach the cloud once
// connectivity returns. Guards the decision predicate. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldResyncOnReconnect } from '../js/state.js';

test('resyncs only when there are unsynced edits AND a cloud client', () => {
  assert.equal(shouldResyncOnReconnect(true, true, false), true);
});

test('no resync when nothing is dirty', () => {
  assert.equal(shouldResyncOnReconnect(false, true, false), false);
});

test('no resync in offline/local-only mode (no client)', () => {
  assert.equal(shouldResyncOnReconnect(true, false, false), false);
});

test('no resync while a conflict is awaiting the user (would re-prompt)', () => {
  assert.equal(shouldResyncOnReconnect(true, true, true), false);
});

test('coerces to a real boolean', () => {
  assert.equal(shouldResyncOnReconnect(1, 'client', 0), true);
  assert.equal(shouldResyncOnReconnect(0, null, 0), false);
});
