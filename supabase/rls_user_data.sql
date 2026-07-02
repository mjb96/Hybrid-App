-- ============================================================================
-- Helyx — Row Level Security for public.user_data   [You] APPLY IN DASHBOARD
-- ----------------------------------------------------------------------------
-- Phase 1 (Security + Data Safety).
--
-- WHY: the app ships a public `anon` Supabase key (js/state/supabase.js). That
-- key is only safe if the database refuses cross-user access. Without RLS, ANY
-- holder of the anon key can read/write EVERY row in user_data. RLS makes each
-- authenticated user able to touch ONLY their own row (user_id = auth.uid()).
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → paste this whole file → Run.
-- Safe to run more than once (idempotent: drops policies before recreating).
--
-- AFTER APPLYING: run the adversarial proof (see scripts/rls-adversarial-test.mjs
-- and supabase/README.md) to confirm user A cannot read user B's data.
-- ============================================================================

-- The app persists one JSON blob per user via:
--   upsert({ user_id, state_data }, { onConflict: 'user_id' })
-- so user_data has at least: user_id (uuid) + state_data (jsonb).

-- 1. Ownership column must never be null — every RLS check depends on it.
alter table public.user_data
  alter column user_id set not null;

-- 2. One row per user. Required for onConflict:'user_id' upserts to be
--    well-defined, and prevents a user accumulating duplicate rows.
create unique index if not exists user_data_user_id_key
  on public.user_data (user_id);

-- 3. Turn RLS ON. Once enabled, every row is DENIED until a policy allows it —
--    including to the anon/authenticated roles the app uses.
alter table public.user_data enable row level security;

-- Optional but recommended: apply RLS even to the table owner, so a stray
-- owner-context query can't bypass ownership. Uncomment if you don't run
-- privileged server-side maintenance that needs to see all rows:
-- alter table public.user_data force row level security;

-- 4. Policies — authenticated users, own row only.
--    `to authenticated` means the unauthenticated anon role gets nothing at all
--    (the app only reads/writes after sign-in).
drop policy if exists "user_data owner can select" on public.user_data;
drop policy if exists "user_data owner can insert" on public.user_data;
drop policy if exists "user_data owner can update" on public.user_data;
drop policy if exists "user_data owner can delete" on public.user_data;

create policy "user_data owner can select"
  on public.user_data for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_data owner can insert"
  on public.user_data for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_data owner can update"
  on public.user_data for update
  to authenticated
  using (auth.uid() = user_id)          -- may only target own row
  with check (auth.uid() = user_id);    -- and may not re-assign it to someone else

create policy "user_data owner can delete"
  on public.user_data for delete
  to authenticated
  using (auth.uid() = user_id);

-- 5. Verify RLS is on and policies exist (this SELECT should return 4 rows).
--    Run these read-backs after the block above:
--    select relname, relrowsecurity from pg_class where relname = 'user_data';
--    select policyname, cmd from pg_policies where tablename = 'user_data';
