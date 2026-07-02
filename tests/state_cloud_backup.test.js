// ==========================================
// CLOUD-PULL BACKUP TEST (tests/state_cloud_backup.test.js)
// Phase 1 data-safety net: before a cloud pull overwrites local state, the
// pre-pull local state is snapshotted so a stale/empty device clobbering real
// history can be recovered. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  snapshotLocalBeforeCloudPull,
  getCloudPullBackup,
  CLOUD_BACKUP_KEY,
} from '../js/state.js';

function fakeStorage(initial = {}) {
  const s = { ...initial };
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
    _dump: () => s,
  };
}

test('snapshots local state that carries logged history', () => {
  const storage = fakeStorage();
  const raw = JSON.stringify({ currentWeek: '3', weeks: { '1': { lifts: {} } } });
  const wrote = snapshotLocalBeforeCloudPull(raw, storage);
  assert.equal(wrote, true);
  const backup = getCloudPullBackup(storage);
  assert.ok(backup);
  assert.equal(backup.state.currentWeek, '3');
  assert.equal(typeof backup.savedAt, 'string');
});

test('does NOT overwrite a good backup with an empty/fresh state', () => {
  const storage = fakeStorage();
  // A prior good backup exists.
  const good = JSON.stringify({ weeks: { '1': {}, '2': {} } });
  assert.equal(snapshotLocalBeforeCloudPull(good, storage), true);

  // A fresh install (no weeks) must not clobber it.
  const empty = JSON.stringify({ currentWeek: '1', weeks: {} });
  assert.equal(snapshotLocalBeforeCloudPull(empty, storage), false);

  const backup = getCloudPullBackup(storage);
  assert.deepEqual(Object.keys(backup.state.weeks).sort(), ['1', '2']);
});

test('handles null/garbage input without throwing', () => {
  const storage = fakeStorage();
  assert.equal(snapshotLocalBeforeCloudPull(null, storage), false);
  assert.equal(snapshotLocalBeforeCloudPull('not json', storage), false);
  assert.equal(getCloudPullBackup(storage), null);
});

test('getCloudPullBackup returns null when nothing is stored', () => {
  assert.equal(getCloudPullBackup(fakeStorage()), null);
});

test('backup key is namespaced under the primary storage key', () => {
  assert.ok(CLOUD_BACKUP_KEY.startsWith('hybrid_engine_v2_state'));
  assert.match(CLOUD_BACKUP_KEY, /backup/);
});
