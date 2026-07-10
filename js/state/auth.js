// =============================================================================
// AUTHENTICATION — Supabase sign-in, sign-up, session check
// Uses an init callback to call pullEngineDataFromStorage after login
// so we avoid a circular import with state.js.
// =============================================================================
import { getSupabaseClient } from './supabase.js';
import { showToast } from '../toast.js';
import { clearRouteDatabase } from '../db.js';

let _onLoginSuccess = null;

export function initAuth(onLoginSuccessFn) {
  _onLoginSuccess = onLoginSuccessFn;
}

function _setAuthLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = isLoading;
  const textEl = btn.querySelector('.auth-submit-text');
  if (textEl) textEl.style.opacity = isLoading ? '0.5' : '1';
}

function _showAuthError(errorElId, msg) {
  const el = document.getElementById(errorElId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

export async function loginToSupabase() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const pass  = document.getElementById('loginPassword')?.value;

  const sb = getSupabaseClient();
  if (!sb) {
    // Surface it inline (not just a 2.5s toast that leaves the form looking
    // untouched) so the user knows why nothing happened.
    _showAuthError('authSigninError', "You're offline — connect to the internet to sign in. Your data is saved on this device.");
    showToast('Offline — cannot sign in.', true);
    return;
  }

  _setAuthLoading('authSigninBtn', true);
  _showAuthError('authSigninError', '');

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

  _setAuthLoading('authSigninBtn', false);

  if (error) {
    _showAuthError('authSigninError', error.message);
  } else {
    const authOverlay = document.getElementById('authOverlay');
    if (authOverlay) authOverlay.style.display = 'none';
    showToast('Securely Logged In ✓');
    if (_onLoginSuccess) await _onLoginSuccess();
    window.location.reload();
  }
}
if (typeof window !== 'undefined') window.loginToSupabase = loginToSupabase;

export async function signUpToSupabase() {
  const email = document.getElementById('signupEmail')?.value?.trim();
  const pass  = document.getElementById('signupPassword')?.value;

  const sb = getSupabaseClient();
  if (!sb) {
    _showAuthError('authSignupError', "You're offline — connect to the internet to create an account. Your data is saved on this device.");
    showToast('Offline — cannot create account.', true);
    return;
  }
  if (!email || !pass) { _showAuthError('authSignupError', 'Please enter your email and a password.'); return; }
  if (pass.length < 8)  { _showAuthError('authSignupError', 'Password must be at least 8 characters.'); return; }

  _setAuthLoading('authSignupBtn', true);
  _showAuthError('authSignupError', '');
  const successEl = document.getElementById('authSignupSuccess');
  if (successEl) successEl.style.display = 'none';

  const { data, error } = await sb.auth.signUp({ email, password: pass });

  _setAuthLoading('authSignupBtn', false);

  if (error) {
    _showAuthError('authSignupError', error.message);
  } else if (data?.session) {
    const authOverlay = document.getElementById('authOverlay');
    if (authOverlay) authOverlay.style.display = 'none';
    showToast('Account created! Welcome ✓');
    window.location.reload();
  } else {
    if (successEl) successEl.style.display = '';
    const btn = document.getElementById('authSignupBtn');
    if (btn) btn.disabled = true;
  }
}
if (typeof window !== 'undefined') window.signUpToSupabase = signUpToSupabase;

export async function checkActiveSession() {
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    const sessionPromise = sb.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));
    const response = await Promise.race([sessionPromise, timeoutPromise]);
    if (response?.data?.session && !response.error) {
      const authOverlay = document.getElementById('authOverlay');
      if (authOverlay) authOverlay.style.display = 'none';
    }
  } catch (err) {
    console.warn('Session check failed or timed out. Defaulting to manual login.');
  }
}

export async function getCloudUser() {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch { return null; }
}

// Remove all Helyx-owned localStorage keys (state + rolling backups + cloud
// version). Namespaced by the storage key prefix so unrelated keys are left
// alone. Returns how many keys were removed. Exported for testing.
export function clearHelyxLocalData(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return 0;
  const toRemove = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('hybrid_engine_v2_state')) toRemove.push(k);
    }
  } catch {
    return 0;
  }
  toRemove.forEach((k) => storage.removeItem(k));
  return toRemove.length;
}

// A Supabase functions error means "auth identity not confirmed deleted". A
// missing/undeployed function (404 or fetch failure) is distinguished from a
// runtime failure so the UI can word the two cases correctly.
function _functionUnavailable(error) {
  if (!error) return false;
  const status = error?.context?.status ?? error?.status;
  if (status === 404) return true;
  return error?.name === 'FunctionsFetchError' || error?.name === 'FunctionsRelayError';
}

// Testable core of account deletion. Side effects (local wipe, IndexedDB wipe)
// are injected so the seven deletion scenarios can be unit-tested without a
// browser. Returns an HONEST result — `ok` is true ONLY when the auth identity
// is confirmed removed; otherwise it reports exactly what was and wasn't done.
//
// Contract:
//   { ok:true,  authDeleted:true,  dataDeleted:true }                full success
//   { ok:false, reason:'offline' }                                   no client
//   { ok:false, reason:'not-signed-in' }                             no session
//   { ok:false, reason:'function-unavailable', dataDeleted:bool }    server fn missing
//   { ok:false, reason:'auth-delete-failed',   dataDeleted:bool }    fn ran, failed
export async function performAccountDeletion({ sb, clearLocal, clearIndexed }) {
  if (!sb) return { ok: false, reason: 'offline', authDeleted: false, dataDeleted: false };

  let uid = null;
  try {
    const { data } = await sb.auth.getSession();
    uid = data?.session?.user?.id || null;
  } catch { /* ignore */ }
  if (!uid) return { ok: false, reason: 'not-signed-in', authDeleted: false, dataDeleted: false };

  // 1) The privileged edge function removes BOTH the auth user (service_role)
  //    and the data row. This is the only path that can delete the identity.
  let authDeleted = false;
  let fnError = null;
  try {
    const { error } = await sb.functions.invoke('delete-account');
    if (!error) authDeleted = true; else fnError = error;
  } catch (e) {
    fnError = e;
  }

  if (authDeleted) {
    // Only now — identity confirmed gone — is it safe to wipe the device.
    await _run(clearLocal);
    await _run(clearIndexed);
    try { await sb.auth.signOut(); } catch { /* ignore */ }
    return { ok: true, authDeleted: true, dataDeleted: true };
  }

  // 2) Auth NOT deleted. Still erase the sensitive cloud DATA row (RLS permits
  //    own-row delete), but DO NOT wipe local or sign out — keep the user signed
  //    in so a retry can finish, and so we can show an accurate message. Never
  //    claim the account was deleted.
  let dataDeleted = false;
  try {
    const { error } = await sb.from('user_data').delete().eq('user_id', uid);
    if (!error) dataDeleted = true;
  } catch { /* ignore — report dataDeleted:false */ }

  return {
    ok: false,
    authDeleted: false,
    dataDeleted,
    reason: _functionUnavailable(fnError) ? 'function-unavailable' : 'auth-delete-failed',
  };
}

async function _run(fn) { try { await fn?.(); } catch { /* best-effort side effect */ } }

// Permanently delete the signed-in user's account + data. Thin wrapper wiring
// the real Supabase client and the local/IndexedDB wipes into the tested core.
export async function deleteAccount() {
  return performAccountDeletion({
    sb: getSupabaseClient(),
    clearLocal: () => clearHelyxLocalData(),
    clearIndexed: () => clearRouteDatabase(),
  });
}

export async function signOutSupabase() {
  const sb = getSupabaseClient();
  if (!sb) { showToast('Not signed in.'); return; }
  try {
    await sb.auth.signOut();
    showToast('Signed out.');
    window.location.reload();
  } catch (err) {
    showToast('Sign out failed: ' + (err.message || 'Unknown error'));
  }
}
