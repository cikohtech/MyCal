-- My Cal — rate limiting that survives an instance recycling.
--
-- The AI key is the expensive thing this app owns, and until now the only
-- thing standing in front of it was a Map inside one edge-function instance:
-- it reset whenever the instance did, it was per-user only, and every instance
-- kept its own idea of the count. So a signed-up-in-bulk abuser, or one account
-- driven from a script, could spend real money.
--
-- This is the shared counter those instances lack. One row per (bucket, window)
-- — a bucket being a user, or a hashed IP — incremented atomically, checked
-- against a limit, and left to expire.

create table public.rate_limit_counters (
  -- Opaque: "u:<user id>:1m", "ip:<sha256>:1h". Never a raw address.
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  expires_at timestamptz not null,
  primary key (bucket, window_start)
);

create index rate_limit_counters_expiry_idx
  on public.rate_limit_counters (expires_at);

-- No policies, on purpose. RLS on with nothing granted means the anon and
-- authenticated roles cannot read, forge or clear a counter; only the service
-- role — which bypasses RLS and lives in the edge functions — touches this.
alter table public.rate_limit_counters enable row level security;

-- ------------------------------------------------------------------ spend ---

/**
 * Consumes one request against every rule in order, stopping at the first one
 * that is spent. Rules are evaluated tightest-first by the caller, so a request
 * that is already blocked by the per-minute window never burns the daily quota.
 *
 * p_rules: [{ "key": "u:<id>:1m", "scope": "user", "limit": 8, "window_seconds": 60 }, ...]
 */
create or replace function public.consume_rate_limits(p_rules jsonb)
returns table (allowed boolean, scope text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  rule jsonb;
  v_key text;
  v_limit integer;
  v_window integer;
  v_window_start timestamptz;
  v_hits integer;
begin
  allowed := true;
  scope := null;
  retry_after_seconds := 0;

  -- Housekeeping, spread thin: roughly one call in a hundred pays for it, so
  -- expired rows never need a scheduled job to disappear.
  if random() < 0.01 then
    delete from public.rate_limit_counters where expires_at < now();
  end if;

  for rule in select value from jsonb_array_elements(p_rules) loop
    v_key := rule ->> 'key';
    v_limit := (rule ->> 'limit')::integer;
    v_window := (rule ->> 'window_seconds')::integer;
    continue when v_key is null or v_limit is null or v_window is null or v_window <= 0;

    -- A fixed window, floored to the window size, so every instance agrees on
    -- which bucket "now" belongs to without any coordination.
    v_window_start := to_timestamp(
      floor(extract(epoch from clock_timestamp()) / v_window) * v_window
    );

    insert into public.rate_limit_counters as counter (bucket, window_start, hits, expires_at)
    values (v_key, v_window_start, 1, v_window_start + make_interval(secs => v_window * 2))
    on conflict (bucket, window_start)
      do update set hits = counter.hits + 1
    returning counter.hits into v_hits;

    if v_hits > v_limit then
      allowed := false;
      scope := rule ->> 'scope';
      retry_after_seconds := greatest(1, ceil(extract(
        epoch from (v_window_start + make_interval(secs => v_window)) - clock_timestamp()
      ))::integer);
      return next;
      return;
    end if;
  end loop;

  return next;
end;
$$;

-- Only the service role may spend against a counter. Revoking from the browser
-- roles matters: `authenticated` could otherwise drain its own quota, or
-- somebody else's, straight from the client.
revoke all on function public.consume_rate_limits(jsonb) from public;
revoke all on function public.consume_rate_limits(jsonb) from anon;
revoke all on function public.consume_rate_limits(jsonb) from authenticated;
grant execute on function public.consume_rate_limits(jsonb) to service_role;
