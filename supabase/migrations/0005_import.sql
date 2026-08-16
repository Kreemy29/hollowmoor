-- ===========================================================================
-- HOLLOWMOOR — restoring an offline save into a real account
--
-- The offline build keeps everything in one localStorage blob. This takes that
-- blob and writes it into Postgres for the signed-in user, so nobody has to
-- throw away a streak they built before the database existed.
--
-- Two safety rules:
--   * It refuses to run against an account that already has real progress.
--     A mis-tap on "restore" must never cost someone a live streak.
--   * It clamps everything it reads. The payload comes from a file on the
--     player's disk, so it is untrusted input — a hand-edited backup cannot
--     mint Grit or a 9,000-day streak.
-- ===========================================================================

create or replace function hm_import_save(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof jsonb := p_payload -> 'profile';
  st   jsonb := p_payload -> 'streaks';
  existing streaks%rowtype;
  k jsonb;
  c jsonb;
  b jsonb;
  imported_streak int;
  imported_best int;
  imported_total int;
  imported_grit int;
  species_ok text;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if prof is null or st is null then
    return jsonb_build_object('ok', false, 'message', 'That file is not a Hollowmoor save.');
  end if;

  select * into existing from streaks where user_id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Create your Breaker first, then restore.');
  end if;

  -- Never overwrite live progress.
  if existing.current_streak > 1 or existing.total_clean_days > 1 then
    return jsonb_build_object(
      'ok', false,
      'message', 'This account already has a streak going. Restoring would erase it.');
  end if;

  -- Clamp untrusted numbers to something a human could actually have done.
  imported_streak := least(greatest(coalesce((st ->> 'currentStreak')::int, 0), 0), 3650);
  imported_best   := least(greatest(coalesce((st ->> 'bestStreak')::int, 0), 0), 3650);
  imported_total  := least(greatest(coalesce((st ->> 'totalCleanDays')::int, 0), 0), 3650);
  imported_grit   := least(greatest(coalesce((p_payload ->> 'grit')::int, 0), 0), 100000);
  imported_best   := greatest(imported_best, imported_streak);

  update profiles
     set handle  = coalesce(prof ->> 'handle', handle),
         avatar  = coalesce(prof -> 'avatar', avatar),
         starter = coalesce(prof ->> 'starter', starter)
   where id = uid;

  update streaks
     set current_streak    = imported_streak,
         best_streak       = imported_best,
         total_clean_days  = imported_total,
         last_checkin_date = nullif(st ->> 'lastCheckinDate', '')::date,
         relapse_count     = least(coalesce((st ->> 'relapseCount')::int, 0), 10000),
         freeze_tokens     = least(greatest(coalesce((st ->> 'freezeTokens')::int, 0), 0), 3),
         last_freeze_grant = nullif(st ->> 'lastFreezeGrant', '')::date,
         grit              = imported_grit
   where user_id = uid;

  -- Kindred. Unknown species ids from a tampered file are simply skipped.
  for k in select * from jsonb_array_elements(coalesce(p_payload -> 'kindred', '[]'::jsonb)) loop
    select id into species_ok from kindred_species where id = k ->> 'speciesId';
    continue when species_ok is null;

    insert into user_kindred (user_id, species_id, nickname, stage, xp, dimmed, is_companion)
    values (
      uid,
      species_ok,
      left(coalesce(k ->> 'nickname', ''), 18),
      least(greatest(coalesce((k ->> 'stage')::int, 1), 1), 3),
      least(greatest(coalesce((k ->> 'xp')::int, 0), 0), 1000000),
      coalesce((k ->> 'dimmed')::boolean, false),
      coalesce((k ->> 'isCompanion')::boolean, false)
    )
    on conflict (user_id, species_id) do update
      set stage        = excluded.stage,
          xp           = excluded.xp,
          nickname     = excluded.nickname,
          dimmed       = excluded.dimmed,
          is_companion = excluded.is_companion;
  end loop;

  -- Check-in history, so the streak has evidence behind it and the trigger
  -- pattern nudges keep working after a restore.
  for c in select * from jsonb_array_elements(coalesce(p_payload -> 'checkins', '[]'::jsonb)) loop
    continue when (c ->> 'date') is null;
    insert into checkins (user_id, date, result, trigger_tag, note)
    values (
      uid,
      (c ->> 'date')::date,
      case when c ->> 'result' in ('clean','relapse','freeze') then c ->> 'result' else 'clean' end,
      c ->> 'triggerTag',
      left(coalesce(c ->> 'note', ''), 280)
    )
    on conflict (user_id, date) do nothing;
  end loop;

  for b in select * from jsonb_array_elements(coalesce(p_payload -> 'badges', '[]'::jsonb)) loop
    insert into user_badges (user_id, badge_id)
    select uid, b ->> 'badgeId'
     where exists (select 1 from badges where id = b ->> 'badgeId')
    on conflict do nothing;
  end loop;

  insert into grit_ledger (user_id, amount, reason, detail)
  values (uid, 0, 'admin_adjust', 'Restored from an offline save');

  return jsonb_build_object(
    'ok', true,
    'message', format('Welcome back, %s. %s days restored.',
                      coalesce(prof ->> 'handle', 'Breaker'), imported_streak));
end;
$$;
