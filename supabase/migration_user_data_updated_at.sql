-- ============================================================================
-- Helyx — server-managed updated_at on public.user_data   [You] APPLY IN DASHBOARD
-- ----------------------------------------------------------------------------
-- Phase 1 (Security + Data Safety) — powers divergence detection so a stale
-- device can't silently overwrite newer data written from another device.
--
-- The app reads this column on load (records it as the "last seen" version) and
-- checks it before every cloud save. A trigger keeps it authoritative on the
-- server, so a client can't spoof it.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → paste → Run. Idempotent.
-- ============================================================================

-- 1. Add the column (server default now()).
alter table public.user_data
  add column if not exists updated_at timestamptz not null default now();

-- 2. Trigger function: stamp updated_at on every insert/update, server-side.
create or replace function public.set_user_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3. Attach the trigger (drop first so re-running is safe).
drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
  before insert or update on public.user_data
  for each row
  execute function public.set_user_data_updated_at();

-- 4. Verify: this should show a recent timestamp after the next app save.
--    select user_id, updated_at from public.user_data;
