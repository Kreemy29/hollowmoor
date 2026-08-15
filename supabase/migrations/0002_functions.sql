-- ===========================================================================
-- HOLLOWMOOR — server-authoritative game logic
--
-- These functions mirror app/lib/rules.ts exactly. The client runs that copy
-- for instant feedback; this copy is the one that decides what actually
-- happened. If you retune a reward, retune both — the numbers are duplicated
-- deliberately so the browser never gets a vote on the economy.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Helpers
-- --------------------------------------------------------------------------

create or replace function hm_week_key(d date)
returns text language sql immutable as $$
  select to_char(d, 'IYYY-"W"IW');
$$;

create or replace function hm_stage_for_streak(streak int)
returns int language sql immutable as $$
  select case when streak >= 30 then 3 when streak >= 7 then 2 else 1 end;
$$;

create or replace function hm_is_milestone(streak int)
returns boolean language sql immutable as $$
  select streak = any (array[1,3,7,14,21,30,45,60,90,120,180,270,365]);
$$;

create or replace function hm_friend_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := 'HM-';
    for i in 1..8 loop
      if i = 5 then code := code || '-'; end if;
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

-- Single write path for currency. Every movement lands in the ledger.
create or replace function hm_add_grit(p_user uuid, p_amount int, p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare new_total int;
begin
  update streaks
     set grit = greatest(0, grit + p_amount)
   where user_id = p_user
  returning grit into new_total;

  insert into grit_ledger (user_id, amount, reason, detail)
  values (p_user, p_amount, p_reason, p_detail);

  return new_total;
end;
$$;

-- --------------------------------------------------------------------------
-- Onboarding
-- --------------------------------------------------------------------------

create or replace function hm_create_profile(
  p_handle text,
  p_avatar jsonb,
  p_starter text,
  p_seed_days int,
  p_timezone text,
  p_invite_code text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  seeded int := greatest(0, least(3650, coalesce(p_seed_days, 0)));
  today date := (now() at time zone coalesce(p_timezone, 'UTC'))::date;
  inviter uuid;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if exists (select 1 from profiles where id = uid) then return; end if;

  insert into profiles (id, handle, avatar, starter, timezone, friend_code)
  values (uid, p_handle, p_avatar, p_starter, coalesce(p_timezone, 'UTC'), hm_friend_code());

  insert into streaks (user_id, current_streak, best_streak, total_clean_days, last_checkin_date, grit)
  values (
    uid, seeded, seeded, seeded,
    -- Backdated one day so a seeded streak continues instead of instantly
    -- lapsing, and today's check-in is still available.
    case when seeded > 0 then today - 1 else null end,
    50
  );

  insert into user_kindred (user_id, species_id, stage, is_companion)
  values (uid, p_starter, hm_stage_for_streak(seeded), true);

  perform hm_add_grit(uid, 0, 'daily_login', 'Starting kit');

  if p_invite_code is not null then
    select id into inviter from profiles where friend_code = upper(p_invite_code);
    if inviter is not null and inviter <> uid then
      insert into friendships (user_id, friend_id, status)
      values (inviter, uid, 'accepted')
      on conflict do nothing;
    end if;
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- The check-in — the heart of the whole thing
-- --------------------------------------------------------------------------

create or replace function hm_checkin(
  p_result text,
  p_trigger_tag text,
  p_note text,
  p_local_date date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s streaks%rowtype;
  comp user_kindred%rowtype;
  today date := p_local_date;
  gap int;
  base_streak int;
  new_streak int;
  stage_from int;
  stage_to int;
  is_dimmed boolean := false;
  grit_total int := 0;
  breakdown jsonb := '[]'::jsonb;
  streak_bonus int;
  xp_earned int := 0;
  milestone int := null;
  badge_unlocked text := null;
  caught text := null;
  freeze_granted boolean := false;
  new_checkin checkins%rowtype;
  evolution jsonb := null;
  wk text := hm_week_key(p_local_date);
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if p_result not in ('clean','relapse','freeze') then
    raise exception 'Unknown check-in result.';
  end if;
  -- Trust the client's local date only within a sane window of the server's.
  if today is null or today > (now() + interval '2 days')::date
     or today < (now() - interval '2 days')::date then
    raise exception 'That date is not today.';
  end if;

  select * into s from streaks where user_id = uid for update;
  if not found then raise exception 'No Breaker found.'; end if;
  if s.last_checkin_date = today then
    raise exception 'You have already checked in today. Come back after midnight.';
  end if;

  select * into comp from user_kindred where user_id = uid and is_companion limit 1;
  stage_from := coalesce(comp.stage, 1);

  -- A missed day is not a relapse, but it does break the chain.
  gap := case when s.last_checkin_date is null then 0 else today - s.last_checkin_date end;
  base_streak := case when gap > 1 then 0 else s.current_streak end;

  if p_result = 'relapse' then
    new_streak := 0;
    stage_to   := greatest(1, stage_from - 1);
    is_dimmed  := true;
    grit_total := 10; -- honesty is never the expensive option
    breakdown  := '[{"label":"Told the truth","amount":10}]'::jsonb;

    update streaks
       set current_streak = 0,
           last_checkin_date = today,
           relapse_count = relapse_count + 1
     where user_id = uid;

  elsif p_result = 'freeze' then
    if s.freeze_tokens <= 0 then raise exception 'No Stillglass Tokens left.'; end if;
    new_streak := s.current_streak;
    stage_to   := stage_from;

    update streaks
       set last_checkin_date = today,
           freeze_tokens = freeze_tokens - 1
     where user_id = uid;

  else -- clean
    new_streak := base_streak + 1;
    stage_to   := greatest(stage_from, hm_stage_for_streak(new_streak));
    xp_earned  := 40 + least(new_streak, 30) * 4;

    grit_total := 15;
    breakdown  := jsonb_build_array(jsonb_build_object('label','Clean day','amount',15));

    streak_bonus := least((new_streak - 1) * 2, 40);
    if streak_bonus > 0 then
      grit_total := grit_total + streak_bonus;
      breakdown := breakdown || jsonb_build_object(
        'label', 'Streak x' || new_streak, 'amount', streak_bonus);
    end if;

    if hm_is_milestone(new_streak) then
      milestone := new_streak;
      grit_total := grit_total + 120;
      breakdown := breakdown || jsonb_build_object(
        'label', 'Day ' || new_streak || ' milestone', 'amount', 120);
    end if;

    update streaks
       set current_streak = new_streak,
           best_streak = greatest(best_streak, new_streak),
           total_clean_days = total_clean_days + 1,
           last_checkin_date = today
     where user_id = uid;

    -- ~1 freeze token a week, capped at 3 so they can't become immunity.
    select * into s from streaks where user_id = uid;
    if s.freeze_tokens < 3
       and ((s.last_freeze_grant is null and s.current_streak >= 3)
            or (s.last_freeze_grant is not null and today - s.last_freeze_grant >= 7)) then
      update streaks set freeze_tokens = freeze_tokens + 1, last_freeze_grant = today
       where user_id = uid;
      freeze_granted := true;
    end if;

    -- Wild encounter.
    if random() < least(0.18 + new_streak * 0.004, 0.4) then
      select ks.id into caught
        from kindred_species ks
       where ks.is_starter = false
         and ks.appears_at <= (select best_streak from streaks where user_id = uid)
         and not exists (select 1 from user_kindred uk
                          where uk.user_id = uid and uk.species_id = ks.id)
       order by case ks.rarity when 'common' then 1 when 'uncommon' then 2
                               when 'rare' then 3 else 4 end,
                random()
       limit 1;

      if caught is not null then
        insert into user_kindred (user_id, species_id) values (uid, caught)
        on conflict do nothing;
      end if;
    end if;
  end if;

  -- Companion stage + sleep state.
  if comp.id is not null then
    update user_kindred
       set stage = stage_to, dimmed = is_dimmed, xp = xp + xp_earned
     where id = comp.id;
  end if;

  if stage_to <> stage_from then
    evolution := jsonb_build_object(
      'from', stage_from, 'to', stage_to,
      'direction', case when stage_to > stage_from then 'evolve' else 'dim' end);
  end if;

  insert into checkins (user_id, date, result, trigger_tag, note)
  values (uid, today, p_result, p_trigger_tag, p_note)
  returning * into new_checkin;

  if grit_total > 0 then
    perform hm_add_grit(uid, grit_total,
      case when p_result = 'clean' then 'checkin_clean' else 'checkin_streak_bonus' end,
      'Day ' || new_streak);
  end if;

  -- First newly-eligible trial, surfaced as an unlock (not yet awarded — the
  -- trial minigame still has to be cleared).
  if p_result = 'clean' then
    select b.id into badge_unlocked
      from badges b
     where b.required_streak <= new_streak
       and not exists (select 1 from user_badges ub
                        where ub.user_id = uid and ub.badge_id = b.id)
     order by b.sort_order
     limit 1;

    -- Quests + raid damage.
    update user_quests uq
       set progress = least(q.target, uq.progress + 1)
      from quests q
     where q.id = uq.quest_id and uq.user_id = uid
       and q.kind = 'checkin' and uq.claimed = false
       and uq.period_key in (today::text, wk);

    perform hm_raid_damage(uid, 120, wk);
  end if;

  select * into s from streaks where user_id = uid;

  return jsonb_build_object(
    'checkin', jsonb_build_object(
      'id', new_checkin.id, 'date', new_checkin.date, 'result', new_checkin.result,
      'triggerTag', new_checkin.trigger_tag, 'note', new_checkin.note,
      'createdAt', new_checkin.created_at),
    'streaks', jsonb_build_object(
      'currentStreak', s.current_streak, 'bestStreak', s.best_streak,
      'totalCleanDays', s.total_clean_days, 'lastCheckinDate', s.last_checkin_date,
      'relapseCount', s.relapse_count, 'freezeTokens', s.freeze_tokens,
      'lastFreezeGrant', s.last_freeze_grant),
    'gritEarned', grit_total,
    'gritBreakdown', breakdown,
    'xpEarned', xp_earned,
    'evolution', evolution,
    'milestone', milestone,
    'badgeUnlocked', badge_unlocked,
    'caught', caught,
    'freezeTokenGranted', freeze_granted
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Minigames
-- --------------------------------------------------------------------------

create or replace function hm_submit_minigame(
  p_game text, p_score int, p_duration_sec int, p_from_craving boolean, p_local_date date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  per_point numeric;
  cap int;
  grit_earned int;
  caught text := null;
  best int;
  wk text := hm_week_key(p_local_date);
  touched text[] := '{}';
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if p_score < 0 or p_score > 100000 then raise exception 'Impossible score.'; end if;

  -- Focus Delve pays the most and is the easiest to fake, so it also has to
  -- have taken a plausible amount of wall-clock time.
  if p_game = 'delve' and p_duration_sec < 60 * 20 then
    raise exception 'That delve was too short to count.';
  end if;

  per_point := case p_game when 'breath' then 12 when 'crusher' then 1
                           when 'delve' then 4 else 8 end;
  cap := case when p_game = 'delve' then 260 else 120 end;
  grit_earned := least((p_score * per_point)::int, cap);

  insert into minigame_runs (user_id, game, score, duration_sec, from_craving, date)
  values (uid, p_game, p_score, p_duration_sec, coalesce(p_from_craving,false), p_local_date);

  if grit_earned > 0 then
    perform hm_add_grit(uid, grit_earned, 'minigame', p_game);
  end if;

  if random() < 0.12 then
    select ks.id into caught
      from kindred_species ks
     where ks.is_starter = false
       and ks.appears_at <= (select best_streak from streaks where user_id = uid)
       and not exists (select 1 from user_kindred uk
                        where uk.user_id = uid and uk.species_id = ks.id)
     order by random() limit 1;
    if caught is not null then
      insert into user_kindred (user_id, species_id) values (uid, caught) on conflict do nothing;
    end if;
  end if;

  update user_quests uq
     set progress = least(q.target, uq.progress + case when p_game = 'crusher' then p_score else 1 end)
    from quests q
   where q.id = uq.quest_id and uq.user_id = uid
     and q.kind = 'minigame' and uq.claimed = false
     and uq.period_key in (p_local_date::text, wk);

  perform hm_raid_damage(uid, least(p_score, 300), wk);

  select coalesce(max(score),0) into best
    from minigame_runs
   where user_id = uid and game = p_game and date = p_local_date and score < p_score;

  return jsonb_build_object(
    'gritEarned', grit_earned,
    'caught', caught,
    'highScore', p_score > best,
    'questProgress', to_jsonb(touched));
end;
$$;

-- --------------------------------------------------------------------------
-- Quests
-- --------------------------------------------------------------------------

-- The notice board is chosen HERE, not by the client. Three dailies and one
-- weekly, picked deterministically from the date so every player sees the same
-- board and nobody can reroll into the highest-paying quest.
create or replace function hm_daily_board(p_local_date date)
returns table (id text, title text, description text, kind text,
               target int, grit_reward int, cadence text)
language sql stable set search_path = public as $$
  (select q.id, q.title, q.description, q.kind, q.target, q.grit_reward, q.cadence
     from quests q
    where q.cadence = 'daily'
    order by md5(q.id || p_local_date::text)
    limit 3)
  union all
  (select q.id, q.title, q.description, q.kind, q.target, q.grit_reward, q.cadence
     from quests q
    where q.cadence = 'weekly'
    order by md5(q.id || hm_week_key(p_local_date))
    limit 1);
$$;

create or replace function hm_sync_quests(p_local_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wk text := hm_week_key(p_local_date);
  q record;
begin
  if uid is null then raise exception 'Not signed in.'; end if;

  -- Drop expired periods so the board never accumulates dead rows.
  delete from user_quests
   where user_id = uid and period_key not in (p_local_date::text, wk);

  for q in select * from hm_daily_board(p_local_date) loop
    insert into user_quests (user_id, quest_id, period_key)
    values (uid, q.id, case when q.cadence = 'daily' then p_local_date::text else wk end)
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function hm_claim_quest(p_quest_id text, p_local_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q quests%rowtype;
  uq user_quests%rowtype;
  wk text := hm_week_key(p_local_date);
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into q from quests where id = p_quest_id;
  if not found then raise exception 'That quest is not on the board.'; end if;

  select * into uq from user_quests
   where user_id = uid and quest_id = p_quest_id
     and period_key = case when q.cadence = 'daily' then p_local_date::text else wk end
   for update;

  if not found then raise exception 'Not started.'; end if;
  if uq.claimed then raise exception 'Already claimed.'; end if;
  if uq.progress < q.target then raise exception 'Not finished yet.'; end if;

  update user_quests set claimed = true
   where user_id = uid and quest_id = p_quest_id and period_key = uq.period_key;

  perform hm_add_grit(uid, q.grit_reward, 'quest', q.title);
  perform hm_raid_damage(uid, q.grit_reward, wk);

  return jsonb_build_object('gritEarned', q.grit_reward);
end;
$$;

-- --------------------------------------------------------------------------
-- Badges, companion, shop
-- --------------------------------------------------------------------------

create or replace function hm_claim_badge(p_badge_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b badges%rowtype;
  cur int;
  best int;
  reward int;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into b from badges where id = p_badge_id;
  if not found then raise exception 'Unknown badge.'; end if;
  if exists (select 1 from user_badges where user_id = uid and badge_id = p_badge_id) then
    raise exception 'Already earned.';
  end if;

  select current_streak into cur from streaks where user_id = uid;
  if cur < b.required_streak then
    raise exception 'Needs a %-day streak.', b.required_streak;
  end if;

  select coalesce(max(score),0) into best
    from minigame_runs where user_id = uid and game = b.trial_game;
  if best < b.trial_target then raise exception 'Clear the trial first.'; end if;

  insert into user_badges (user_id, badge_id) values (uid, p_badge_id);
  reward := 150 + b.sort_order * 40;
  perform hm_add_grit(uid, reward, 'trial', b.name);

  return jsonb_build_object('badgeId', p_badge_id, 'gritEarned', reward);
end;
$$;

create or replace function hm_set_companion(p_kindred_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  update user_kindred set is_companion = false where user_id = uid and is_companion;
  update user_kindred set is_companion = true where id = p_kindred_id and user_id = uid;
end;
$$;

create or replace function hm_buy_item(p_item_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  it items%rowtype;
  balance int;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into it from items where id = p_item_id;
  if not found then raise exception 'Not stocked.'; end if;

  select grit into balance from streaks where user_id = uid for update;
  if balance < it.price then raise exception 'Not enough Grit.'; end if;

  perform hm_add_grit(uid, -it.price, 'shop_purchase', it.name);

  if it.payload->>'grants' = 'freeze' then
    update streaks set freeze_tokens = least(3, freeze_tokens + 1) where user_id = uid;
  else
    insert into inventory (user_id, item_id) values (uid, p_item_id)
    on conflict (user_id, item_id) do update set quantity = inventory.quantity + 1;
  end if;

  select grit into balance from streaks where user_id = uid;
  return jsonb_build_object('grit', balance);
end;
$$;

create or replace function hm_equip_item(p_item_id text, p_equipped boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cat text;
  accent text;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select category, payload->>'accent' into cat, accent from items where id = p_item_id;
  if cat is null then raise exception 'Unknown item.'; end if;
  if not exists (select 1 from inventory where user_id = uid and item_id = p_item_id) then
    raise exception 'You do not own that.';
  end if;

  if p_equipped then
    update inventory i set equipped = false
      from items it
     where i.user_id = uid and it.id = i.item_id and it.category = cat;
  end if;

  update inventory set equipped = p_equipped where user_id = uid and item_id = p_item_id;

  if p_equipped and accent is not null then
    update profiles set avatar = jsonb_set(avatar, '{accent}', to_jsonb(accent)) where id = uid;
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- Social
-- --------------------------------------------------------------------------

create or replace function hm_add_friend_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target uuid;
  target_handle text;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select id, handle into target, target_handle from profiles where friend_code = upper(p_code);
  if target is null then return jsonb_build_object('ok', false, 'message', 'No Breaker with that code.'); end if;
  if target = uid then return jsonb_build_object('ok', false, 'message', 'That is your own code.'); end if;
  if exists (select 1 from friendships
              where (user_id = uid and friend_id = target)
                 or (user_id = target and friend_id = uid)) then
    return jsonb_build_object('ok', false, 'message', 'Already on your list.');
  end if;

  insert into friendships (user_id, friend_id, status) values (uid, target, 'pending');
  return jsonb_build_object('ok', true, 'message', target_handle || ' has been asked.');
end;
$$;

create or replace function hm_accept_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  update friendships set status = 'accepted'
   where user_id = p_friend_id and friend_id = uid and status = 'pending';
end;
$$;

create or replace function hm_remove_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  delete from friendships
   where (user_id = uid and friend_id = p_friend_id)
      or (user_id = p_friend_id and friend_id = uid);
end;
$$;

create or replace function hm_leaderboard(p_scope text)
returns table (
  id uuid, handle text, avatar jsonb, current_streak int, best_streak int,
  companion_species_id text, companion_stage int, contested boolean, last_seen timestamptz
) language sql security definer set search_path = public as $$
  select p.id,
         p.handle,
         p.avatar,
         s.current_streak,
         s.best_streak,
         k.species_id,
         k.stage,
         (select count(*) >= 2 from ranger_reports rr where rr.target_id = p.id
           and rr.week_key = hm_week_key(current_date)),
         null::timestamptz
    from profiles p
    join streaks s on s.user_id = p.id
    left join user_kindred k on k.user_id = p.id and k.is_companion
   where (
      -- Private profiles are visible to friends only, never the global board.
      coalesce((p.settings->>'privateProfile')::boolean, false) = false
      or p.id = auth.uid()
      or exists (select 1 from friendships f
                  where f.status = 'accepted'
                    and ((f.user_id = auth.uid() and f.friend_id = p.id)
                      or (f.friend_id = auth.uid() and f.user_id = p.id)))
     )
     and (
      p_scope <> 'friends'
      or p.id = auth.uid()
      or exists (select 1 from friendships f
                  where f.status = 'accepted'
                    and ((f.user_id = auth.uid() and f.friend_id = p.id)
                      or (f.friend_id = auth.uid() and f.user_id = p.id)))
     )
   order by s.current_streak desc, s.best_streak desc
   limit 100;
$$;

-- Ranger Report: friends only, one vote per week, cosmetic outcome only.
create or replace function hm_ranger_report(p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wk text := hm_week_key(current_date);
  votes int;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if uid = p_target_id then raise exception 'You cannot report yourself.'; end if;
  if not exists (select 1 from friendships f
                  where f.status = 'accepted'
                    and ((f.user_id = uid and f.friend_id = p_target_id)
                      or (f.friend_id = uid and f.user_id = p_target_id))) then
    raise exception 'Ranger Reports are friends-only.';
  end if;

  insert into ranger_reports (target_id, voter_id, week_key)
  values (p_target_id, uid, wk)
  on conflict do nothing;

  select count(*) into votes from ranger_reports
   where target_id = p_target_id and week_key = wk;

  return jsonb_build_object('targetId', p_target_id, 'votes', votes,
    'threshold', 2, 'contested', votes >= 2, 'votedByMe', true);
end;
$$;

create or replace function hm_ranger_status(p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  wk text := hm_week_key(current_date);
  votes int;
  mine boolean;
begin
  select count(*) into votes from ranger_reports where target_id = p_target_id and week_key = wk;
  select exists (select 1 from ranger_reports
                  where target_id = p_target_id and voter_id = auth.uid() and week_key = wk)
    into mine;
  return jsonb_build_object('targetId', p_target_id, 'votes', votes,
    'threshold', 2, 'contested', votes >= 2, 'votedByMe', mine);
end;
$$;

-- --------------------------------------------------------------------------
-- Chat moderation trigger — the client checks too, but this is the one that
-- actually stops anything (§9.5).
-- --------------------------------------------------------------------------

create or replace function hm_moderate_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  flat text;
  recent int;
  account_age interval;
begin
  flat := lower(regexp_replace(new.body, '[^a-zA-Z0-9 ]', '', 'g'));

  -- Targeted harm and self-harm directives are blocked outright. General
  -- profanity is deliberately allowed — this is an edgy app.
  if flat ~ '(kill|hang|hurt) ?(your ?self|urself)'
     or flat ~ '\ykys\y'
     or flat ~ 'you should (die|not exist)'
     or flat ~ 'i hope you (die|overdose)' then
    raise exception 'That one crosses the line.';
  end if;

  -- Rate limit: 6 messages per 20 seconds.
  select count(*) into recent from messages
   where author_id = new.author_id and created_at > now() - interval '20 seconds';
  if recent >= 6 then raise exception 'Slow down — you are posting too fast.'; end if;

  -- No links from brand-new accounts.
  select now() - created_at into account_age from profiles where id = new.author_id;
  if account_age < interval '24 hours'
     and new.body ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|gg|xyz|link|ru|cn))' then
    raise exception 'New Breakers cannot post links for the first day.';
  end if;

  return new;
end;
$$;

drop trigger if exists moderate_messages on messages;
create trigger moderate_messages before insert on messages
for each row execute function hm_moderate_message();

-- --------------------------------------------------------------------------
-- Raid
-- --------------------------------------------------------------------------

create or replace function hm_ensure_raid(p_week_key text)
returns raids language plpgsql security definer set search_path = public as $$
declare r raids%rowtype;
begin
  select * into r from raids where week_key = p_week_key;
  if not found then
    insert into raids (week_key, total_hp, current_hp, ends_at)
    values (p_week_key, 12000, 12000, date_trunc('week', now()) + interval '7 days')
    on conflict (week_key) do nothing;
    select * into r from raids where week_key = p_week_key;
  end if;
  return r;
end;
$$;

create or replace function hm_raid_damage(p_user uuid, p_amount int, p_week_key text)
returns void language plpgsql security definer set search_path = public as $$
declare r raids%rowtype;
begin
  r := hm_ensure_raid(p_week_key);
  if r.defeated_at is not null then return; end if;

  insert into raid_participants (raid_id, user_id, damage)
  values (r.id, p_user, p_amount)
  on conflict (raid_id, user_id) do update set damage = raid_participants.damage + p_amount;

  update raids
     set current_hp = greatest(0, current_hp - p_amount),
         defeated_at = case when current_hp - p_amount <= 0 then now() else defeated_at end
   where id = r.id;
end;
$$;

create or replace function hm_current_raid()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r raids%rowtype;
  parts jsonb;
  mine int;
begin
  r := hm_ensure_raid(hm_week_key(current_date));

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.damage desc), '[]'::jsonb)
    into parts
    from (select rp.user_id, p.handle, p.avatar, rp.damage, rp.loot_claimed
            from raid_participants rp join profiles p on p.id = rp.user_id
           where rp.raid_id = r.id) x;

  select coalesce(damage, 0) into mine from raid_participants
   where raid_id = r.id and user_id = uid;

  return jsonb_build_object('raid', row_to_json(r)::jsonb,
                            'participants', parts,
                            'my_damage', coalesce(mine, 0));
end;
$$;

create or replace function hm_claim_raid_loot()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r raids%rowtype;
  rp raid_participants%rowtype;
  reward int;
  caught text := null;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into r from raids where week_key = hm_week_key(current_date);
  if not found or r.defeated_at is null then raise exception 'The Titan is still up.'; end if;

  select * into rp from raid_participants where raid_id = r.id and user_id = uid for update;
  if not found then raise exception 'You did not join this raid.'; end if;
  if rp.loot_claimed then raise exception 'Loot already claimed this week.'; end if;

  update raid_participants set loot_claimed = true where raid_id = r.id and user_id = uid;
  reward := 300 + (rp.damage / 4)::int;
  perform hm_add_grit(uid, reward, 'raid', 'Haze Titan');

  select ks.id into caught from kindred_species ks
   where ks.is_starter = false
     and not exists (select 1 from user_kindred uk where uk.user_id = uid and uk.species_id = ks.id)
   order by random() limit 1;
  if caught is not null then
    insert into user_kindred (user_id, species_id) values (uid, caught) on conflict do nothing;
  end if;

  return jsonb_build_object('gritEarned', reward, 'caught', caught);
end;
$$;

-- --------------------------------------------------------------------------
-- Duels & trades
-- --------------------------------------------------------------------------

create or replace function hm_create_duel(p_opponent uuid, p_wager int)
returns duels language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d duels%rowtype;
  balance int;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if not exists (select 1 from friendships f
                  where f.status = 'accepted'
                    and ((f.user_id = uid and f.friend_id = p_opponent)
                      or (f.friend_id = uid and f.user_id = p_opponent))) then
    raise exception 'You can only duel friends.';
  end if;

  select grit into balance from streaks where user_id = uid;
  if balance < p_wager then raise exception 'You cannot cover that wager.'; end if;

  insert into duels (week_key, challenger_id, opponent_id, wager, status, ends_at)
  values (hm_week_key(current_date), uid, p_opponent, p_wager, 'pending',
          date_trunc('week', now()) + interval '7 days')
  returning * into d;

  if p_wager > 0 then perform hm_add_grit(uid, -p_wager, 'duel_wager', 'Duel stake'); end if;
  return d;
end;
$$;

create or replace function hm_respond_duel(p_duel_id uuid, p_accept boolean)
returns duels language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d duels%rowtype;
begin
  select * into d from duels where id = p_duel_id and opponent_id = uid for update;
  if not found then raise exception 'Duel not found.'; end if;

  if p_accept then
    if (select grit from streaks where user_id = uid) < d.wager then
      raise exception 'You cannot cover that wager.';
    end if;
    if d.wager > 0 then perform hm_add_grit(uid, -d.wager, 'duel_wager', 'Duel stake'); end if;
    update duels set status = 'active' where id = p_duel_id;
  else
    -- Declined: refund the challenger's stake in full.
    if d.wager > 0 then perform hm_add_grit(d.challenger_id, d.wager, 'duel_wager', 'Duel declined'); end if;
    update duels set status = 'declined' where id = p_duel_id;
  end if;

  select * into d from duels where id = p_duel_id;
  return d;
end;
$$;

create or replace function hm_offer_trade(
  p_to uuid, p_offer_kindred uuid, p_offer_item text, p_want_kindred uuid, p_want_item text
) returns trades language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t trades%rowtype;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if p_offer_kindred is not null then
    if not exists (select 1 from user_kindred
                    where id = p_offer_kindred and user_id = uid and is_companion = false) then
      -- Your companion is never tradeable; losing it mid-streak would be cruel.
      raise exception 'You can only trade Kindred you own and are not walking with.';
    end if;
  end if;

  insert into trades (from_id, to_id, offer_kindred_id, offer_item_id, want_kindred_id, want_item_id)
  values (uid, p_to, p_offer_kindred, p_offer_item, p_want_kindred, p_want_item)
  returning * into t;
  return t;
end;
$$;

create or replace function hm_respond_trade(p_trade_id uuid, p_accept boolean)
returns trades language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t trades%rowtype;
begin
  select * into t from trades where id = p_trade_id and to_id = uid and status = 'pending' for update;
  if not found then raise exception 'Trade not found.'; end if;

  if p_accept then
    if t.offer_kindred_id is not null then
      update user_kindred set user_id = t.to_id, is_companion = false where id = t.offer_kindred_id;
    end if;
    if t.want_kindred_id is not null then
      update user_kindred set user_id = t.from_id, is_companion = false where id = t.want_kindred_id;
    end if;
    update trades set status = 'accepted' where id = p_trade_id;
  else
    update trades set status = 'declined' where id = p_trade_id;
  end if;

  select * into t from trades where id = p_trade_id;
  return t;
end;
$$;

-- --------------------------------------------------------------------------
-- Data ownership (§9.6)
-- --------------------------------------------------------------------------

create or replace function hm_export_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  return jsonb_build_object(
    'profile',   (select row_to_json(p) from profiles p where p.id = uid),
    'streaks',   (select row_to_json(s) from streaks s where s.user_id = uid),
    'checkins',  (select coalesce(jsonb_agg(row_to_json(c)), '[]') from checkins c where c.user_id = uid),
    'kindred',   (select coalesce(jsonb_agg(row_to_json(k)), '[]') from user_kindred k where k.user_id = uid),
    'badges',    (select coalesce(jsonb_agg(row_to_json(b)), '[]') from user_badges b where b.user_id = uid),
    'inventory', (select coalesce(jsonb_agg(row_to_json(i)), '[]') from inventory i where i.user_id = uid),
    'grit',      (select coalesce(jsonb_agg(row_to_json(g)), '[]') from grit_ledger g where g.user_id = uid),
    'runs',      (select coalesce(jsonb_agg(row_to_json(r)), '[]') from minigame_runs r where r.user_id = uid),
    'messages',  (select coalesce(jsonb_agg(row_to_json(m)), '[]') from messages m where m.author_id = uid)
  );
end;
$$;

create or replace function hm_delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  -- Everything player-owned cascades from profiles; the auth row goes last.
  delete from profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- --------------------------------------------------------------------------
-- Grants — the client may only call the functions, never write the tables.
-- --------------------------------------------------------------------------

grant execute on all functions in schema public to authenticated;
revoke execute on function hm_add_grit(uuid, int, text, text) from authenticated;
revoke execute on function hm_raid_damage(uuid, int, text) from authenticated;
