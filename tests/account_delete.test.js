// ==========================================
// ACCOUNT DELETE TEST (tests/account_delete.test.js)
// ------------------------------------------
// Two layers:
//  1. clearHelyxLocalData wipes all Helyx-owned localStorage keys, leaves others.
//  2. performAccountDeletion reports the TRUTH about what was deleted — it never
//     claims the account is gone unless the auth identity is confirmed removed,
//     and it only wipes the device on full success.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearHelyxLocalData, performAccountDeletion } from '../js/state/auth.js';

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
    'hybrid_engine_v2_state_active_gps_session': '{}',
    'sb-uzxvufzlaipdwuffxqyo-auth-token': 'keep-me',   // Supabase session (signOut handles)
    'theme': 'dark',                                     // unrelated pref
  });
  const removed = clearHelyxLocalData(storage);
  assert.equal(removed, 5);
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

// ── performAccountDeletion — the seven scenarios ─────────────────────────────

// Build a fake Supabase client with configurable behaviour + call tracking.
function fakeSb({ session = 'user-123', fnError = undefined, fnThrow = false, rowError = undefined } = {}) {
  const calls = { fnInvoked: 0, rowDeleted: 0, signedOut: 0 };
  return {
    calls,
    auth: {
      getSession: async () => ({ data: { session: session ? { user: { id: session } } : null } }),
      signOut: async () => { calls.signedOut++; },
    },
    functions: {
      invoke: async () => {
        calls.fnInvoked++;
        if (fnThrow) throw Object.assign(new Error('network'), { name: 'FunctionsFetchError' });
        return { error: fnError };
      },
    },
    from: () => ({
      delete: () => ({
        eq: async () => { calls.rowDeleted++; return { error: rowError }; },
      }),
    }),
  };
}

function sideEffects() {
  const state = { local: 0, indexed: 0 };
  return {
    state,
    clearLocal: () => { state.local++; },
    clearIndexed: () => { state.indexed++; },
  };
}

test('complete successful deletion — identity gone, device wiped, signed out', async () => {
  const sb = fakeSb({ fnError: undefined });
  const se = sideEffects();
  const res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.deepEqual(res, { ok: true, authDeleted: true, dataDeleted: true });
  assert.equal(se.state.local, 1, 'local wiped');
  assert.equal(se.state.indexed, 1, 'IndexedDB routes wiped');
  assert.equal(sb.calls.signedOut, 1, 'signed out');
});

test('server-side delete function UNAVAILABLE (404) — not claimed as deleted, device preserved', async () => {
  const sb = fakeSb({ fnError: { context: { status: 404 } } });
  const se = sideEffects();
  const res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.equal(res.ok, false);
  assert.equal(res.authDeleted, false);
  assert.equal(res.reason, 'function-unavailable');
  assert.equal(res.dataDeleted, true, 'cloud data row still erased as a fallback');
  assert.equal(se.state.local, 0, 'device NOT wiped when account still exists');
  assert.equal(sb.calls.signedOut, 0, 'stays signed in so a retry can finish');
});

test('function throws (network) — treated as unavailable, honest failure', async () => {
  const sb = fakeSb({ fnThrow: true });
  const se = sideEffects();
  const res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'function-unavailable');
});

test('auth account deletion FAILURE (fn ran, returned error) — reported, not claimed done', async () => {
  const sb = fakeSb({ fnError: { context: { status: 500 }, message: 'boom' } });
  const se = sideEffects();
  const res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.equal(res.ok, false);
  assert.equal(res.authDeleted, false);
  assert.equal(res.reason, 'auth-delete-failed');
  assert.equal(se.state.local, 0);
});

test('cloud-data deletion FAILURE after auth also failed — dataDeleted:false surfaced', async () => {
  const sb = fakeSb({ fnError: { context: { status: 500 } }, rowError: { message: 'rls' } });
  const se = sideEffects();
  const res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.equal(res.ok, false);
  assert.equal(res.dataDeleted, false);
  assert.equal(res.reason, 'auth-delete-failed');
});

test('offline (no client) — refuses, never claims success', async () => {
  const se = sideEffects();
  const res = await performAccountDeletion({ sb: null, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.deepEqual(res, { ok: false, reason: 'offline', authDeleted: false, dataDeleted: false });
  assert.equal(se.state.local, 0);
});

test('not signed in — refuses without touching data', async () => {
  const sb = fakeSb({ session: null });
  const se = sideEffects();
  const res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.equal(res.reason, 'not-signed-in');
  assert.equal(sb.calls.fnInvoked, 0, 'never calls the delete function without a session');
  assert.equal(se.state.local, 0);
});

test('retry after a partial failure eventually succeeds (idempotent path)', async () => {
  const se = sideEffects();
  // First attempt: function unavailable.
  let sb = fakeSb({ fnError: { context: { status: 404 } } });
  let res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.equal(res.ok, false);
  // Function later deployed → retry succeeds and wipes the device exactly once.
  sb = fakeSb({ fnError: undefined });
  res = await performAccountDeletion({ sb, clearLocal: se.clearLocal, clearIndexed: se.clearIndexed });
  assert.equal(res.ok, true);
  assert.equal(se.state.local, 1);
  assert.equal(se.state.indexed, 1);
});
