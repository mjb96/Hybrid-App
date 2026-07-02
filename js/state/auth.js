// =============================================================================
// AUTHENTICATION — Supabase sign-in, sign-up, session check
// Uses an init callback to call pullEngineDataFromStorage after login
// so we avoid a circular import with state.js.
// =============================================================================
import { getSupabaseClient } from './supabase.js';
import { showToast } from '../toast.js';

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
  if (!sb) { showToast('Offline mode — cannot sign in.', true); return; }

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
  if (!sb) { showToast('Offline mode — cannot create account.', true); return; }
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

// Permanently delete the signed-in user's account + data. Prefers the
// `delete-account` edge function (which also removes the auth user via
// service_role — see supabase/functions/delete-account). Falls back to a
// direct row delete (RLS permits own-row delete) if the function isn't
// deployed, so the user's *data* is always erased even before [You] deploy it.
// Always clears local data and signs out.
export async function deleteAccount() {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, reason: 'offline' };

  let uid = null;
  try {
    const { data } = await sb.auth.getSession();
    uid = data?.session?.user?.id || null;
  } catch { /* ignore */ }
  if (!uid) return { ok: false, reason: 'not-signed-in' };

  let authDeleted = false;
  try {
    const { error } = await sb.functions.invoke('delete-account');
    if (!error) authDeleted = true;
  } catch { /* function not deployed — fall back below */ }

  if (!authDeleted) {
    // At minimum, erase the user's data row (the sensitive part).
    try { await sb.from('user_data').delete().eq('user_id', uid); } catch { /* ignore */ }
  }

  clearHelyxLocalData();
  try { await sb.auth.signOut(); } catch { /* ignore */ }

  return { ok: true, authDeleted };
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
