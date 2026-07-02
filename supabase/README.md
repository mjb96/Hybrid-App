# Supabase security — Phase 1 (Security + Data Safety)

The app ships a **public `anon` key** (`js/state/supabase.js`). That is safe
**only** if the database enforces Row Level Security so the anon key cannot
reach across users. This folder holds the SQL to enforce that and the proof.

## Files
- `rls_user_data.sql` — RLS policies for `public.user_data` (own-row only).
- `migration_user_data_updated_at.sql` — adds server-managed `updated_at` +
  trigger, powering stale-device divergence detection in the app.
- `../scripts/rls-adversarial-check.mjs` — proof that user A cannot read/write user B.

**`[You]` apply both SQL files** (`rls_user_data.sql` and
`migration_user_data_updated_at.sql`) in the SQL Editor. Order doesn't matter;
both are idempotent.

## Apply + prove (order matters)

1. **`[You]`** Supabase Dashboard → SQL Editor → paste `rls_user_data.sql` → Run.
2. **`[You]`** In the app, create two throwaway accounts (A and B). Sign in as
   each once so both have a `user_data` row.
3. **`[You]`** Run the adversarial proof with the anon key + both accounts:
   ```bash
   SUPABASE_URL="https://uzxvufzlaipdwuffxqyo.supabase.co" \
   SUPABASE_ANON_KEY="<anon key from js/state/supabase.js>" \
   A_EMAIL="a@example.com" A_PASSWORD="…" \
   B_EMAIL="b@example.com" B_PASSWORD="…" \
   node scripts/rls-adversarial-test.mjs
   ```
   Exit `0` + `✅ PASS` = isolation proven. Any `❌ FAIL` = leak, do not ship.

> The script needs no npm install — it uses Node 18+'s built-in `fetch` and the
> public REST/Auth API, i.e. exactly an attacker's surface. No secrets are
> committed; everything comes from environment variables.

## Secret sweep (Phase 1) — result: **clean**

Swept the repo for any private secret (`service_role` key, private keys,
`SUPABASE_SERVICE*`, embedded JWTs):

- The **only** key in the codebase is the Supabase **`anon`** key in
  `js/state/supabase.js`. Decoding its JWT payload confirms `"role":"anon"` —
  public by design, safe once the RLS above is enforced.
- **No `service_role` key**, private key, or other private secret is present in
  source, config, or the web assets.
- Android build inputs that could carry secrets (`android/local.properties`,
  bundled `assets/www/`) are gitignored and not tracked.

Re-run the sweep any time with:
```bash
grep -rniE "service_role|private_key|BEGIN [A-Z ]*PRIVATE KEY|SUPABASE_SERVICE" \
  --exclude-dir=.git .
```
