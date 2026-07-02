// ==========================================
// SYNC GUARD TEST (tests/sync_guard.test.js)
// Phase 1: divergence detection so a stale device can't silently overwrite
// newer cloud data. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isServerNewer,
  getStoredCloudVersion,
  setStoredCloudVersion,
  clearStoredCloudVersion,
  CLOUD_VERSION_KEY,
} from '../js/state/sync-guard.js';

function fakeStorage(initial = {}) {
  const s = { ...initial };
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
    _dump: () => s,
  };
}

test('server strictly newer than last seen → divergence', () => {
  assert.equal(
    isServerNewer('2026-07-01T10:00:00Z', '2026-07-01T10:05:00Z'),
    true,
  );
});

test('server equal to last seen → NOT divergence (this device is current)', () => {
  const t = '2026-07-01T10:00:00Z';
  assert.equal(isServerNewer(t, t), false);
});

test('server older than last seen → NOT divergence', () => {
  assert.equal(
    isServerNewer('2026-07-01T10:05:00Z', '2026-07-01T10:00:00Z'),
    false,
  );
});

test('no local baseline but server has data → divergence (ask, do not clobber)', () => {
  assert.equal(isServerNewer(null, '2026-07-01T10:00:00Z'), true);
  assert.equal(isServerNewer(undefined, '2026-07-01T10:00:00Z'), true);
  assert.equal(isServerNewer('garbage', '2026-07-01T10:00:00Z'), true);
});

test('unparseable/absent server time → NOT divergence (no usable signal)', () => {
  assert.equal(isServerNewer('2026-07-01T10:00:00Z', null), false);
  assert.equal(isServerNewer('2026-07-01T10:00:00Z', 'not-a-date'), false);
  assert.equal(isServerNewer(null, null), false);
});

test('version persistence round-trips through storage', () => {
  const storage = fakeStorage();
  assert.equal(getStoredCloudVersion(storage), null);
  setStoredCloudVersion('2026-07-01T10:00:00Z', storage);
  assert.equal(getStoredCloudVersion(storage), '2026-07-01T10:00:00Z');
  assert.equal(storage._dump()[CLOUD_VERSION_KEY], '2026-07-01T10:00:00Z');
  clearStoredCloudVersion(storage);
  assert.equal(getStoredCloudVersion(storage), null);
});

test('setStoredCloudVersion ignores empty values', () => {
  const storage = fakeStorage();
  setStoredCloudVersion(null, storage);
  setStoredCloudVersion('', storage);
  assert.equal(getStoredCloudVersion(storage), null);
});
