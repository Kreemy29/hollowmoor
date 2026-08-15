-- ===========================================================================
-- HOLLOWMOOR — scheduled jobs
--
-- Requires the pg_cron extension (Database → Extensions in the Supabase
-- dashboard). Everything here is idempotent, so a missed run is harmless.
-- ===========================================================================

create extension if not exists pg_cron;

-- --------------------------------------------------------------------------
-- Weekly reset: settle duels, open the next raid.
-- --------------------------------------------------------------------------

create or replace function hm_settle_duels()
returns void language plpgsql security definer set search_path = public as $$
declare
  d duels%rowtype;
  c_score int;
  o_score int;
  winner uuid;
begin
  for d in select * from duels where status = 'active' and ends_at <= now() loop
    -- A duel is decided by clean days logged inside its week. Nothing else.
    select count(*) into c_score from checkins
     where user_id = d.challenger_id and result = 'clean'
       and hm_week_key(date) = d.week_key;
    select count(*) into o_score from checkins
     where user_id = d.opponent_id and result = 'clean'
       and hm_week_key(date) = d.week_key;

    winner := case when c_score > o_score then d.challenger_id
                   when o_score > c_score then d.opponent_id
                   else null end;

    update duels
       set status = 'settled',
           challenger_score = c_score,
           opponent_score = o_score,
           winner_id = winner
     where id = d.id;

    if winner is not null then
      perform hm_add_grit(winner, d.wager * 2, 'duel', 'Duel won');
    else
      -- A draw returns both stakes. Nobody loses Grit for a tie.
      if d.wager > 0 then
        perform hm_add_grit(d.challenger_id, d.wager, 'duel', 'Duel drawn');
        perform hm_add_grit(d.opponent_id, d.wager, 'duel', 'Duel drawn');
      end if;
    end if;
  end loop;
end;
$$;

create or replace function hm_weekly_reset()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform hm_settle_duels();
  perform hm_ensure_raid(hm_week_key(current_date));
end;
$$;

-- --------------------------------------------------------------------------
-- Housekeeping: the AI cache only needs the recent past.
-- --------------------------------------------------------------------------

create or replace function hm_prune()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from ai_content_cache where date < current_date - 30;
  delete from messages where created_at < now() - interval '30 days' and channel = 'global';
  delete from ranger_reports where created_at < now() - interval '60 days';
end;
$$;

-- --------------------------------------------------------------------------
-- Schedules (UTC)
-- --------------------------------------------------------------------------

select cron.unschedule('hollowmoor-weekly-reset')
  where exists (select 1 from cron.job where jobname = 'hollowmoor-weekly-reset');
select cron.schedule('hollowmoor-weekly-reset', '5 0 * * 1', $$select hm_weekly_reset()$$);

select cron.unschedule('hollowmoor-prune')
  where exists (select 1 from cron.job where jobname = 'hollowmoor-prune');
select cron.schedule('hollowmoor-prune', '30 3 * * *', $$select hm_prune()$$);

-- Duels are also swept hourly so a duel that ends mid-week settles promptly.
select cron.unschedule('hollowmoor-settle-duels')
  where exists (select 1 from cron.job where jobname = 'hollowmoor-settle-duels');
select cron.schedule('hollowmoor-settle-duels', '0 * * * *', $$select hm_settle_duels()$$);

revoke execute on function hm_settle_duels() from authenticated;
revoke execute on function hm_weekly_reset() from authenticated;
revoke execute on function hm_prune() from authenticated;
