// ==========================================
// ACCOUNT DELETE TEST (tests/account_delete.test.js)
// Phase 3 data-safety: clearHelyxLocalData wipes all Helyx-owned localStorage
// keys (state + backups + cloud version) and leaves unrelated keys alone.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearHelyxLocalData } from '../js/state/auth.js';

// Fake Web Storage: supports length + key(i) enumeration like the real thing.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _keys: () => Array.from(map.keys()),
  };
}

test('removes every Helyx-namespaced key, keeps others', () => {
  const storage = fakeStorage({
    'hybrid_engine_v2_state': '{}',
    'hybrid_engine_v2_state_backup': '{}',
    'hybrid_engine_v2_state_cloud_backup': '{}',
    'hybrid_engine_v2_state_cloud_version': '2026-07-01T00:00:00Z',
    'sb-uzxvufzlaipdwuffxqyo-auth-token': 'keep-me',   // Supabase session (signOut handles)
    'theme': 'dark',                                     // unrelated pref
  });
  const removed = clearHelyxLocalData(storage);
  assert.equal(removed, 4);
  assert.deepEqual(storage._keys().sort(), ['sb-uzxvufzlaipdwuffxqyo-auth-token', 'theme']);
});

test('returns 0 with no storage (SSR/Node)', () => {
  assert.equal(clearHelyxLocalData(null), 0);
});

test('no-op when there is nothing to remove', () => {
  const storage = fakeStorage({ theme: 'dark' });
  assert.equal(clearHelyxLocalData(storage), 0);
  assert.deepEqual(storage._keys(), ['theme']);
});
