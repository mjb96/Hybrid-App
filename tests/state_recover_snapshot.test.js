// ==========================================
// PRE-SYNC SNAPSHOT RECOVERY (tests/state_recover_snapshot.test.js)
// The cloud pull silently overwrites local data on sign-in but keeps a
// pre-pull snapshot. This covers surfacing + restoring that snapshot so a user
// whose device data was replaced by a cloud copy can get it back.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  initImportExport,
  hasCloudPullSnapshot,
  recoverCloudPullSnapshot,
} from '../js/state/import-export.js';

// showToast() reaches for document.getElementById; stub it so the module under
// test runs headless under `node --test` (no jsdom).
beforeEach(() => {
  globalThis.document = { getElementById: () => null, createElement: () => ({ setAttribute() {}, click() {}, remove() {} }), body: { appendChild() {} } };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
});

function wire({ snapshot, migrate = (s) => s }) {
  let current = { weeks: { cloud: {} }, tag: 'cloud' };
  let cleared = false;
  initImportExport({
    getState: () => current,
    setState: (s) => { current = s; },
    saveState: () => {},
    defaultDays: ['mon'],
    migrate,
    storageKey: 'test_key',
    getCloudBackup: () => snapshot,
    clearCloudBackup: () => { cleared = true; },
  });
  return { get: () => current, wasCleared: () => cleared };
}

test('hasCloudPullSnapshot is true only when the snapshot holds real history', () => {
  wire({ snapshot: { savedAt: 'now', state: { weeks: { '1': {} } } } });
  assert.equal(hasCloudPullSnapshot(), true);

  wire({ snapshot: { savedAt: 'now', state: { weeks: {} } } });
  assert.equal(hasCloudPullSnapshot(), false);

  wire({ snapshot: null });
  assert.equal(hasCloudPullSnapshot(), false);
});

test('recoverCloudPullSnapshot replaces current state with the snapshot and clears it', () => {
  const h = wire({ snapshot: { savedAt: 'now', state: { weeks: { '1': { lifts: {} } }, tag: 'local' } } });
  const ok = recoverCloudPullSnapshot();
  assert.equal(ok, true);
  assert.equal(h.get().tag, 'local');
  assert.deepEqual(Object.keys(h.get().weeks), ['1']);
  assert.equal(h.wasCleared(), true);
});

test('recoverCloudPullSnapshot refuses an empty snapshot and leaves state untouched', () => {
  const h = wire({ snapshot: { savedAt: 'now', state: { weeks: {} } } });
  const ok = recoverCloudPullSnapshot();
  assert.equal(ok, false);
  assert.equal(h.get().tag, 'cloud');
  assert.equal(h.wasCleared(), false);
});

test('recoverCloudPullSnapshot keeps current data when snapshot migration fails', () => {
  const h = wire({
    snapshot: { savedAt: 'now', state: { weeks: { '1': { lifts: {} } }, tag: 'local' } },
    migrate: (candidate) => {
      candidate.partiallyMutated = true;
      throw new Error('injected migration fault');
    },
  });
  const ok = recoverCloudPullSnapshot();
  assert.equal(ok, false);
  assert.equal(h.get().tag, 'cloud');
  assert.equal(h.get().partiallyMutated, undefined);
  assert.equal(h.wasCleared(), false);
});
