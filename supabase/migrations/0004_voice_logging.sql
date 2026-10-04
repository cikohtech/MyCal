-- My Cal — logging a meal by saying it.
--
-- A voice log is an analysis with no photo behind it: the person talks, the
-- edge function transcribes and reads what they said, and the review screen
-- does the rest. Nothing about the ledger changes shape — this adds a source
-- for the entries it produces, a label on the analysis saying what was read,
-- and an allowance of its own so it is rationed like photos are.
--
-- The recording itself is never stored. It goes from the browser to the
-- transcription model inside one request; what is kept is the transcript, on
-- the analysis row, so the person can see what was heard.

-- ----------------------------------------------------------- provenance ---

-- Not used anywhere else in this file: Postgres refuses a new enum value in
-- the same transaction that adds it.
alter type entry_source add value if not exists 'voice_ai';

-- What the model was given. Photo analyses predate the column, hence the
-- default; a voice analysis has no image, so food_image_id stays null.
alter table public.ai_analyses
  add column if not exists input_kind text not null default 'photo'
    check (input_kind in ('photo', 'voice', 'text'));

-- ------------------------------------------------------------ allowance ---

-- Separate from the photo count, so adding voice neither eats into the photos
-- somebody has left nor hands them a second ten by the back door.
alter table public.user_plans
  add column if not exists free_voice_limit integer not null default 10
    check (free_voice_limit >= 0),
  -- Voice logs that came back with an estimate. Failures are refunded.
  add column if not exists voice_logs_analyzed integer not null default 0
    check (voice_logs_analyzed >= 0);

/** Takes one voice log from the caller's allowance, or refuses. One UPDATE, like photos. */
create or replace function public.claim_voice_log(p_user_id uuid)
returns table (allowed boolean, paid boolean, used integer, free_limit integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_plans (user_id, email)
  select u.id, u.email from auth.users u where u.id = p_user_id
  on conflict (user_id) do nothing;

  return query
    update public.user_plans as plan
       set voice_logs_analyzed = plan.voice_logs_analyzed + 1
     where plan.user_id = p_user_id
       and (plan.is_paid or plan.voice_logs_analyzed < plan.free_voice_limit)
    returning true, plan.is_paid, plan.voice_logs_analyzed, plan.free_voice_limit;

  if not found then
    return query
      select false, plan.is_paid, plan.voice_logs_analyzed, plan.free_voice_limit
        from public.user_plans as plan
       where plan.user_id = p_user_id;
  end if;
end;
$$;

/** Gives a voice log back when it did not produce an estimate. */
create or replace function public.refund_voice_log(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_plans
     set voice_logs_analyzed = greatest(voice_logs_analyzed - 1, 0)
   where user_id = p_user_id;
$$;

revoke all on function public.claim_voice_log(uuid) from public;
revoke all on function public.claim_voice_log(uuid) from anon;
revoke all on function public.claim_voice_log(uuid) from authenticated;
grant execute on function public.claim_voice_log(uuid) to service_role;

revoke all on function public.refund_voice_log(uuid) from public;
revoke all on function public.refund_voice_log(uuid) from anon;
revoke all on function public.refund_voice_log(uuid) from authenticated;
grant execute on function public.refund_voice_log(uuid) to service_role;
