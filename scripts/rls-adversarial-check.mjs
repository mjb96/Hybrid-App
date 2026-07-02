// ============================================================================
// Helyx — Adversarial RLS proof  ([You] RUN after applying rls_user_data.sql)
// ----------------------------------------------------------------------------
// Proves that, with RLS enabled, authenticated user A cannot read or write
// authenticated user B's row in public.user_data. Uses only the public anon
// key + two real test accounts — exactly the surface an attacker would have.
//
// Dependency-free: uses Node's built-in global fetch (Node 18+). Reads all
// config from environment variables so NO credentials are committed.
//
// USAGE (create two throwaway accounts in the app first, then):
//   SUPABASE_URL="https://<ref>.supabase.co" \
//   SUPABASE_ANON_KEY="<anon key from js/state/supabase.js>" \
//   A_EMAIL="a@example.com" A_PASSWORD="..." \
//   B_EMAIL="b@example.com" B_PASSWORD="..." \
//   node scripts/rls-adversarial-check.mjs
//
// Exit code 0 = RLS holds (isolation proven). Non-zero = LEAK, do not ship.
// ============================================================================

const {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  A_EMAIL, A_PASSWORD, B_EMAIL, B_PASSWORD,
} = process.env;

const missing = Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, A_EMAIL, A_PASSWORD, B_EMAIL, B_PASSWORD })
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  console.error('See the usage header in this file.');
  process.exit(2);
}

const base = SUPABASE_URL.replace(/\/+$/, '');
const fail = (msg) => { console.error('\n❌ FAIL — ' + msg); process.exit(1); };
const ok   = (msg) => console.log('   ✓ ' + msg);

async function signIn(email, password) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    fail(`sign-in failed for ${email}: ${body.error_description || body.msg || res.status}`);
  }
  return { token: body.access_token, userId: body.user.id };
}

// Authenticated REST call as a given user (JWT in Authorization).
function asUser(token, path, init = {}) {
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function main() {
  console.log('Helyx RLS adversarial proof\n');

  console.log('1. Signing in as both users…');
  const a = await signIn(A_EMAIL, A_PASSWORD);
  const b = await signIn(B_EMAIL, B_PASSWORD);
  if (a.userId === b.userId) fail('A and B resolved to the same user id — use two distinct accounts.');
  ok(`user A = ${a.userId}`);
  ok(`user B = ${b.userId}`);

  // Ensure B actually has a row to try to steal (write B's own row as B).
  console.log('\n2. Seeding user B\'s row (as B)…');
  const seed = await asUser(b.token, 'user_data', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: b.userId, state_data: { secret: 'B-only-' + Date.now() } }),
  });
  if (!seed.ok) fail(`could not seed B's row (status ${seed.status}: ${await seed.text()})`);
  ok('B wrote its own row');

  console.log('\n3. Attack: A tries to READ B\'s row by user_id filter…');
  const r1 = await asUser(a.token, `user_data?user_id=eq.${b.userId}&select=*`);
  const r1body = await r1.json();
  if (!Array.isArray(r1body)) fail(`unexpected response: ${JSON.stringify(r1body)}`);
  if (r1body.length !== 0) fail(`LEAK — A read ${r1body.length} of B's row(s): ${JSON.stringify(r1body)}`);
  ok('A got 0 rows for B (blocked)');

  console.log('\n4. Attack: A dumps the whole table (select=*)…');
  const r2 = await asUser(a.token, 'user_data?select=user_id');
  const r2body = await r2.json();
  if (!Array.isArray(r2body)) fail(`unexpected response: ${JSON.stringify(r2body)}`);
  const leaked = r2body.filter((row) => row.user_id !== a.userId);
  if (leaked.length) fail(`LEAK — table dump exposed other users: ${JSON.stringify(leaked)}`);
  ok(`A sees only its own rows (${r2body.length} row(s), all A)`);

  console.log('\n5. Attack: A tries to OVERWRITE B\'s row…');
  const r3 = await asUser(a.token, `user_data?user_id=eq.${b.userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ state_data: { pwned: true } }),
  });
  const r3body = await r3.json().catch(() => []);
  if (Array.isArray(r3body) && r3body.length) fail(`LEAK — A modified B's row: ${JSON.stringify(r3body)}`);
  ok('A modified 0 of B\'s rows (blocked)');

  console.log('\n✅ PASS — RLS holds: user A cannot read or write user B\'s data.');
  process.exit(0);
}

main().catch((e) => fail(e.stack || String(e)));
