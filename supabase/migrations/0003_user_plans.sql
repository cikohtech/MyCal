-- My Cal — free and paid accounts.
--
-- A free account gets a fixed number of photo estimates; a paid one gets as
-- many as the rate limits allow. There is no payment flow yet: a person is
-- made paid by hand, by setting is_paid on their row in this table.
--
-- This lives in its own table rather than on profiles because the browser may
-- update its own profile, and a flag the browser can write is a flag anybody
-- can set to true.

create table public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Copied from auth.users and kept in step by the trigger below, so the row
  -- to change can be found in the table editor by address, not by uuid.
  email text,
  is_paid boolean not null default false,
  -- Per account, so one person can be given more without changing everybody's.
  free_photo_limit integer not null default 10 check (free_photo_limit >= 0),
  -- Photos that came back with an estimate. Failed analyses are refunded, and
  -- the count keeps going while paid, so it is a usage figure as well.
  photos_analyzed integer not null default 0 check (photos_analyzed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_plans_touch before update on public.user_plans
  for each row execute function public.touch_updated_at();

-- Read-only to its owner. No insert, update or delete policy, on purpose: the
-- count is spent by the edge function under the service role, and is_paid is
-- set from the dashboard. "Delete everything" in the app does not reach this
-- table, so wiping your data does not hand you ten more photos.
alter table public.user_plans enable row level security;

create policy "read own plan" on public.user_plans
  for select to authenticated using (user_id = (select auth.uid()));

-- --------------------------------------------------------------- accounts ---

create or replace function public.create_user_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_plans (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_plan
  after insert on auth.users
  for each row execute function public.create_user_plan();

create or replace function public.sync_user_plan_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_plans set email = new.email where user_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_plan_email();

-- Everybody who signed up before this migration. Photos they have already had
-- estimated count towards the ten, so an existing account is not handed a
-- fresh allowance on top of what it has used.
insert into public.user_plans (user_id, email, photos_analyzed)
select
  u.id,
  u.email,
  (select count(*) from public.ai_analyses a where a.user_id = u.id and a.status = 'ready')
from auth.users u
on conflict (user_id) do nothing;

-- ------------------------------------------------------------------ spend ---

/**
 * Takes one photo from the caller's allowance, or refuses. The check and the
 * increment are one UPDATE, so several photos sent at once cannot all slip in
 * under the limit together.
 */
create or replace function public.claim_photo_analysis(p_user_id uuid)
returns table (allowed boolean, paid boolean, used integer, free_limit integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- An account the trigger missed still gets its row, and its free photos.
  insert into public.user_plans (user_id, email)
  select u.id, u.email from auth.users u where u.id = p_user_id
  on conflict (user_id) do nothing;

  return query
    update public.user_plans as plan
       set photos_analyzed = plan.photos_analyzed + 1
     where plan.user_id = p_user_id
       and (plan.is_paid or plan.photos_analyzed < plan.free_photo_limit)
    returning true, plan.is_paid, plan.photos_analyzed, plan.free_photo_limit;

  if not found then
    return query
      select false, plan.is_paid, plan.photos_analyzed, plan.free_photo_limit
        from public.user_plans as plan
       where plan.user_id = p_user_id;
  end if;
end;
$$;

/** Gives a photo back when the analysis it paid for did not produce an estimate. */
create or replace function public.refund_photo_analysis(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_plans
     set photos_analyzed = greatest(photos_analyzed - 1, 0)
   where user_id = p_user_id;
$$;

-- Service role only, like the rate-limit counter: otherwise a signed-in user
-- could refund themselves back to zero from the browser.
revoke all on function public.claim_photo_analysis(uuid) from public;
revoke all on function public.claim_photo_analysis(uuid) from anon;
revoke all on function public.claim_photo_analysis(uuid) from authenticated;
grant execute on function public.claim_photo_analysis(uuid) to service_role;

revoke all on function public.refund_photo_analysis(uuid) from public;
revoke all on function public.refund_photo_analysis(uuid) from anon;
revoke all on function public.refund_photo_analysis(uuid) from authenticated;
grant execute on function public.refund_photo_analysis(uuid) to service_role;
