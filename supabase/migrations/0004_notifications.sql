-- ===========================================================================
-- HOLLOWMOOR — web push subscriptions
--
-- Reminders are the single highest-leverage retention hook in a daily-check-in
-- app, and also the fastest way to make one feel like nagging. The rules here:
-- one morning nudge, one evening check-in reminder, and event pings the player
-- actually opted into. Nothing fires once the day is already logged.
-- ===========================================================================

create table if not exists push_subscriptions (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  -- The player's UTC offset in minutes, so the cron can fire at *their* 9am.
  tz_offset  int not null default 0,
  created_at timestamptz not null default now(),
  failed_at  timestamptz
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "own push subscriptions" on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function hm_register_push(
  p_endpoint text, p_p256dh text, p_auth text, p_tz_offset int
) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, tz_offset)
  values (uid, p_endpoint, p_p256dh, p_auth, p_tz_offset)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        tz_offset = excluded.tz_offset,
        failed_at = null;
end;
$$;

create or replace function hm_unregister_push(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

/**
 * Who should hear from us in this hour, and about what.
 *
 * Called by the daily-cron edge function once an hour. It returns only players
 * whose local time matches the slot AND who have not already checked in today,
 * so nobody is ever reminded to do something they've done.
 */
create or replace function hm_due_reminders(p_utc_hour int)
returns table (
  user_id uuid, endpoint text, p256dh text, auth text,
  handle text, current_streak int, kind text
) language sql security definer set search_path = public as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth,
         p.handle,
         st.current_streak,
         case when ((p_utc_hour * 60 + s.tz_offset) / 60 + 24) % 24 = 9
              then 'morning' else 'evening' end as kind
    from push_subscriptions s
    join profiles p on p.id = s.user_id
    join streaks st on st.user_id = s.user_id
   where s.failed_at is null
     and coalesce((p.settings->>'pushEnabled')::boolean, false) = true
     and ((((p_utc_hour * 60 + s.tz_offset) / 60 + 24) % 24) in (9, 20))
     -- Already logged today in their own timezone? Then stay quiet.
     and coalesce(st.last_checkin_date, date '1900-01-01')
         < ((now() + make_interval(mins => s.tz_offset)) at time zone 'UTC')::date;
$$;

revoke execute on function hm_due_reminders(int) from authenticated;
