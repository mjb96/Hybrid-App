// ============================================================================
// Supabase Edge Function: delete-account   [You] DEPLOY
// ----------------------------------------------------------------------------
// Fully deletes the calling user: their user_data row AND their auth account.
// Deleting the auth user requires the service_role key, which must NEVER ship
// in the app — so it lives here, server-side. The caller is identified from
// their own JWT, so a user can only ever delete themselves.
//
// The app calls this via supabase.functions.invoke('delete-account'); if it
// isn't deployed, the client falls back to deleting just the data row (see
// js/state/auth.js deleteAccount), so user data is erased either way.
//
// DEPLOY:
//   supabase functions deploy delete-account
// The function automatically has SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY in its environment — do not hardcode them.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  const url         = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their JWT (they can only delete themselves).
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !user) return json({ error: 'Unauthorized' }, 401);

  // Privileged client for the actual deletions.
  const admin = createClient(url, serviceKey);

  const { error: dataErr } = await admin.from('user_data').delete().eq('user_id', user.id);
  if (dataErr) return json({ error: `data delete failed: ${dataErr.message}` }, 500);

  const { error: userErr } = await admin.auth.admin.deleteUser(user.id);
  if (userErr) return json({ error: `auth delete failed: ${userErr.message}` }, 500);

  return json({ ok: true });
});
