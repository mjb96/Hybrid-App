// =============================================================================
// SYNC GUARD — divergence detection for the cloud blob.
//
// The cloud store is one JSON row per user, written last-write-wins with no
// merge. Without a guard, a stale device (offline for a while, or a second
// phone) silently overwrites newer data written elsewhere. To catch that we
// track the server's `updated_at` we last saw, and before overwriting we check
// whether the server row is newer than that baseline. If it is, another device
// wrote since we loaded — we must NOT clobber it, we ask the user.
//
// This module is pure logic + localStorage plumbing so it is unit-testable
// without a DOM or network. The actual Supabase calls live in state.js.
// =============================================================================

export const CLOUD_VERSION_KEY = 'hybrid_engine_v2_state_cloud_version';

function _storage() {
  return (typeof localStorage !== 'undefined') ? localStorage : null;
}

// The server `updated_at` this device last observed (ISO string) or null.
export function getStoredCloudVersion(storage = _storage()) {
  if (!storage) return null;
  try { return storage.getItem(CLOUD_VERSION_KEY); } catch { return null; }
}

export function setStoredCloudVersion(iso, storage = _storage()) {
  if (!storage || !iso) return;
  try { storage.setItem(CLOUD_VERSION_KEY, String(iso)); } catch { /* ignore */ }
}

export function clearStoredCloudVersion(storage = _storage()) {
  if (!storage) return;
  try { storage.removeItem(CLOUD_VERSION_KEY); } catch { /* ignore */ }
}

// True when the server row is strictly newer than what this device last saw —
// i.e. another device wrote since we loaded, so overwriting would clobber it.
//
//  - Unparseable/absent server time → false (no usable signal, don't block a save).
//  - Server time present but no local baseline → true (we can't prove we're
//    current, and the server already has data, so treat as divergent and ask).
//  - Otherwise compare timestamps; equal is NOT newer (this device is current).
export function isServerNewer(lastSeen, serverUpdatedAt) {
  const s = Date.parse(serverUpdatedAt);
  if (Number.isNaN(s)) return false;
  const l = (lastSeen == null) ? NaN : Date.parse(lastSeen);
  if (Number.isNaN(l)) return true;
  return s > l;
}
