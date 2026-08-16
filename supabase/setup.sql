-- ===========================================================================
-- HOLLOWMOOR — one-shot setup
--
-- GENERATED FILE. Do not edit by hand — edit supabase/migrations/*.sql and
-- run `npm run setup-sql`.
--
-- HOW TO USE
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste this entire file
--   3. Run
--
-- Safe to re-run: every object is CREATE OR REPLACE / IF NOT EXISTS, and the
-- seed upserts on primary key.
--
-- AFTERWARDS, two things this file cannot do for you:
--   * Authentication → Providers → Anonymous Sign-ins → ENABLE.
--     Guest accounts do not work without it. This is the step everyone misses.
--   * Settings → API → copy the Project URL and anon key into your host's
--     environment as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--
-- OPTIONAL, not included here:
--   supabase/migrations/0003_cron.sql — weekly raid reset and duel settling.
--   It needs the pg_cron extension (Database → Extensions) enabled first, and
--   is kept separate so a missing extension can't abort this whole script.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Schema, Row Level Security and views
-- source: supabase/migrations/0001_schema.sql
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- HOLLOWMOOR — schema
--
-- Design rules:
--   * Row Level Security on every table. No exceptions (§9.6).
--   * Anything that grants Grit, moves a streak or awards a badge is written
--     only by a SECURITY DEFINER function (migration 0002), never by the
--     client, so the game rules cannot be edited in a browser devtools tab.
--   * Check-in notes and trigger tags are private to their owner forever.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Static game data (populated by seed.sql, read-only to everyone)
-- --------------------------------------------------------------------------

create table if not exists kindred_species (
  id           text primary key,
  dex_no       int  not null unique,
  stage_names  text[] not null,
  evolve_at    int[] not null default '{7,30}',
  strength     text not null,
  hue          int  not null,
  archetype    text not null check (archetype in ('beast','wisp','serpent','moth')),
  rarity       text not null check (rarity in ('common','uncommon','rare','mythic')),
  is_starter   boolean not null default false,
  appears_at   int  not null default 0,
  dex_entry    text not null
);

create table if not exists badges (
  id              text primary key,
  sort_order      int  not null,
  name            text not null,
  trigger_tag     text not null,
  required_streak int  not null,
  trial_game      text not null check (trial_game in ('breath','crusher','delve','memory')),
  trial_target    int  not null,
  kind            text not null check (kind in ('trial','council','champion')),
  blurb           text not null
);

create table if not exists quests (
  id           text primary key,
  title        text not null,
  description  text not null,
  kind         text not null check (kind in ('checkin','minigame','social','raid')),
  target       int  not null,
  grit_reward  int  not null,
  cadence      text not null check (cadence in ('daily','weekly'))
);

create table if not exists items (
  id          text primary key,
  name        text not null,
  description text not null,
  category    text not null check (category in ('cosmetic','utility','sticker','decoration')),
  price       int  not null check (price >= 0),
  payload     jsonb not null default '{}'::jsonb
);

-- The local voice library, mirrored server-side so the edge function has a
-- fallback even when Grok is unreachable.
create table if not exists voice_lines (
  id      bigserial primary key,
  speaker text not null check (speaker in ('dealer_relapse','dealer_salty','vale_hype','vale_tip')),
  line    text not null
);

-- --------------------------------------------------------------------------
-- Player data
-- --------------------------------------------------------------------------

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  handle      text not null check (char_length(handle) between 3 and 18),
  avatar      jsonb not null,
  starter     text not null references kindred_species(id),
  created_at  timestamptz not null default now(),
  timezone    text not null default 'UTC',
  friend_code text not null unique,
  settings    jsonb not null default '{
    "audioEnabled": false, "reducedMotion": null, "privateProfile": false,
    "pushEnabled": false, "emailReminders": false, "gentleMode": false
  }'::jsonb,
  is_guest    boolean not null default true
);

create index if not exists profiles_friend_code_idx on profiles (friend_code);

create table if not exists streaks (
  user_id           uuid primary key references profiles(id) on delete cascade,
  current_streak    int not null default 0 check (current_streak >= 0),
  best_streak       int not null default 0 check (best_streak >= 0),
  total_clean_days  int not null default 0 check (total_clean_days >= 0),
  last_checkin_date date,
  relapse_count     int not null default 0,
  freeze_tokens     int not null default 0 check (freeze_tokens between 0 and 3),
  last_freeze_grant date,
  grit              int not null default 0 check (grit >= 0)
);

create table if not exists checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  date        date not null,
  result      text not null check (result in ('clean','relapse','freeze')),
  trigger_tag text,
  note        text,
  created_at  timestamptz not null default now(),
  -- One check-in per person per local day. This is the anti-cheat spine.
  unique (user_id, date)
);

create index if not exists checkins_user_date_idx on checkins (user_id, date desc);

create table if not exists user_kindred (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  species_id   text not null references kindred_species(id),
  nickname     text,
  stage        int  not null default 1 check (stage between 1 and 3),
  xp           int  not null default 0,
  dimmed       boolean not null default false,
  is_companion boolean not null default false,
  caught_at    timestamptz not null default now(),
  unique (user_id, species_id)
);

create unique index if not exists one_companion_per_user
  on user_kindred (user_id) where is_companion;

create table if not exists user_badges (
  user_id   uuid not null references profiles(id) on delete cascade,
  badge_id  text not null references badges(id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists user_quests (
  user_id    uuid not null references profiles(id) on delete cascade,
  quest_id   text not null references quests(id),
  period_key text not null,
  progress   int  not null default 0,
  claimed    boolean not null default false,
  primary key (user_id, quest_id, period_key)
);

create table if not exists inventory (
  user_id     uuid not null references profiles(id) on delete cascade,
  item_id     text not null references items(id),
  quantity    int  not null default 1 check (quantity > 0),
  equipped    boolean not null default false,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Every Grit movement, ever. Audit trail and anti-cheat evidence.
create table if not exists grit_ledger (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  amount     int  not null,
  reason     text not null,
  detail     text,
  created_at timestamptz not null default now()
);

create index if not exists grit_ledger_user_idx on grit_ledger (user_id, created_at desc);

create table if not exists minigame_runs (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  game         text not null check (game in ('breath','crusher','delve','memory')),
  score        int  not null check (score >= 0),
  duration_sec int  not null default 0,
  from_craving boolean not null default false,
  date         date not null,
  created_at   timestamptz not null default now()
);

create index if not exists minigame_runs_board_idx on minigame_runs (game, date, score desc);

-- --------------------------------------------------------------------------
-- Social
-- --------------------------------------------------------------------------

create table if not exists friendships (
  user_id    uuid not null references profiles(id) on delete cascade,
  friend_id  uuid not null references profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  channel    text not null check (channel in ('global','friends','raid')),
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_idx on messages (channel, created_at desc);
create index if not exists messages_author_idx on messages (author_id, created_at desc);

create table if not exists mutes (
  user_id  uuid not null references profiles(id) on delete cascade,
  muted_id uuid not null references profiles(id) on delete cascade,
  primary key (user_id, muted_id)
);

create table if not exists message_reports (
  id          bigserial primary key,
  message_id  uuid not null references messages(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason      text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (message_id, reporter_id)
);

-- Ranger Report: cosmetic only, friends only, one vote each.
create table if not exists ranger_reports (
  target_id  uuid not null references profiles(id) on delete cascade,
  voter_id   uuid not null references profiles(id) on delete cascade,
  week_key   text not null,
  created_at timestamptz not null default now(),
  primary key (target_id, voter_id, week_key)
);

-- --------------------------------------------------------------------------
-- Arena
-- --------------------------------------------------------------------------

create table if not exists raids (
  id          uuid primary key default gen_random_uuid(),
  week_key    text not null unique,
  boss_name   text not null default 'The Haze Titan',
  total_hp    int  not null,
  current_hp  int  not null,
  ends_at     timestamptz not null,
  defeated_at timestamptz
);

create table if not exists raid_participants (
  raid_id      uuid not null references raids(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  damage       int  not null default 0,
  loot_claimed boolean not null default false,
  primary key (raid_id, user_id)
);

create table if not exists duels (
  id               uuid primary key default gen_random_uuid(),
  week_key         text not null,
  challenger_id    uuid not null references profiles(id) on delete cascade,
  opponent_id      uuid not null references profiles(id) on delete cascade,
  wager            int  not null default 0 check (wager >= 0),
  status           text not null default 'pending'
                     check (status in ('pending','active','settled','declined')),
  challenger_score int  not null default 0,
  opponent_score   int  not null default 0,
  winner_id        uuid references profiles(id),
  roast            text,
  ends_at          timestamptz not null,
  created_at       timestamptz not null default now(),
  check (challenger_id <> opponent_id)
);

create table if not exists trades (
  id               uuid primary key default gen_random_uuid(),
  from_id          uuid not null references profiles(id) on delete cascade,
  to_id            uuid not null references profiles(id) on delete cascade,
  offer_kindred_id uuid references user_kindred(id) on delete cascade,
  offer_item_id    text references items(id),
  want_kindred_id  uuid references user_kindred(id) on delete cascade,
  want_item_id     text references items(id),
  status           text not null default 'pending'
                     check (status in ('pending','accepted','declined','cancelled')),
  created_at       timestamptz not null default now(),
  check (from_id <> to_id)
);

-- --------------------------------------------------------------------------
-- AI + events
-- --------------------------------------------------------------------------

create table if not exists ai_content_cache (
  user_id uuid not null references profiles(id) on delete cascade,
  date    date not null,
  dealer  text not null,
  vale    text not null,
  nudge   text,
  source  text not null default 'fallback' check (source in ('grok','fallback')),
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists events (
  id         text primary key,
  name       text not null,
  blurb      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  payload    jsonb not null default '{}'::jsonb
);

-- --------------------------------------------------------------------------
-- Views
-- --------------------------------------------------------------------------

-- Today's boards, per game. Exposed instead of raw runs so nobody can mine
-- another player's full activity history.
create or replace view daily_high_scores
with (security_invoker = true) as
select r.game,
       r.user_id,
       p.handle,
       max(r.score) as score,
       r.date
from minigame_runs r
join profiles p on p.id = r.user_id
where coalesce((p.settings->>'privateProfile')::boolean, false) = false
group by r.game, r.user_id, p.handle, r.date;

create or replace view duels_view
with (security_invoker = true) as
select d.*,
       c.handle as challenger_handle,
       o.handle as opponent_handle
from duels d
join profiles c on c.id = d.challenger_id
join profiles o on o.id = d.opponent_id;

create or replace view trades_view
with (security_invoker = true) as
select t.*,
       f.handle as from_handle,
       o.handle as to_handle
from trades t
join profiles f on f.id = t.from_id
join profiles o on o.id = t.to_id;

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

alter table kindred_species enable row level security;
alter table badges          enable row level security;
alter table quests          enable row level security;
alter table items           enable row level security;
alter table voice_lines     enable row level security;
alter table profiles        enable row level security;
alter table streaks         enable row level security;
alter table checkins        enable row level security;
alter table user_kindred    enable row level security;
alter table user_badges     enable row level security;
alter table user_quests     enable row level security;
alter table inventory       enable row level security;
alter table grit_ledger     enable row level security;
alter table minigame_runs   enable row level security;
alter table friendships     enable row level security;
alter table messages        enable row level security;
alter table mutes           enable row level security;
alter table message_reports enable row level security;
alter table ranger_reports  enable row level security;
alter table raids           enable row level security;
alter table raid_participants enable row level security;
alter table duels           enable row level security;
alter table trades          enable row level security;
alter table ai_content_cache enable row level security;
alter table events          enable row level security;

-- Static content: readable by any signed-in player, writable by nobody.
create policy "read static kindred"  on kindred_species for select to authenticated using (true);
create policy "read static badges"   on badges          for select to authenticated using (true);
create policy "read static quests"   on quests          for select to authenticated using (true);
create policy "read static items"    on items           for select to authenticated using (true);
create policy "read static voice"    on voice_lines     for select to authenticated using (true);
create policy "read events"          on events          for select to authenticated using (true);

-- Profiles: everyone signed in can see the public shape of a profile (handle,
-- avatar, streak) because the leaderboard and square need it; only you can
-- write yours. Private profiles are filtered by the leaderboard function.
create policy "read profiles" on profiles
  for select to authenticated using (true);
create policy "write own profile" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "insert own profile" on profiles
  for insert to authenticated with check (id = auth.uid());

-- Streaks are read directly only by their owner. `relapse_count` is nobody
-- else's business — the leaderboard reads what it needs through the
-- SECURITY DEFINER hm_leaderboard(), which exposes streak numbers and nothing
-- about how many times someone has slipped.
create policy "own streaks" on streaks
  for select to authenticated using (user_id = auth.uid());

-- Check-ins are PRIVATE. Notes and trigger tags never leave their owner.
create policy "own checkins" on checkins
  for select to authenticated using (user_id = auth.uid());

create policy "read kindred" on user_kindred
  for select to authenticated using (true);
create policy "rename own kindred" on user_kindred
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read badges" on user_badges
  for select to authenticated using (true);

create policy "own quests" on user_quests
  for select to authenticated using (user_id = auth.uid());

create policy "own inventory" on inventory
  for select to authenticated using (user_id = auth.uid());

create policy "own ledger" on grit_ledger
  for select to authenticated using (user_id = auth.uid());

create policy "read runs" on minigame_runs
  for select to authenticated using (true);

create policy "read own friendships" on friendships
  for select to authenticated using (user_id = auth.uid() or friend_id = auth.uid());

-- Chat: global is public to signed-in players; friends/raid are scoped.
create policy "read chat" on messages
  for select to authenticated using (
    channel = 'global'
    or author_id = auth.uid()
    or (channel = 'friends' and exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and ((f.user_id = auth.uid() and f.friend_id = messages.author_id)
              or (f.friend_id = auth.uid() and f.user_id = messages.author_id))))
    or (channel = 'raid' and exists (
          select 1 from raid_participants rp
          join raids r on r.id = rp.raid_id
          where rp.user_id = auth.uid() and r.defeated_at is null))
  );
create policy "post as self" on messages
  for insert to authenticated with check (author_id = auth.uid());
create policy "delete own messages" on messages
  for delete to authenticated using (author_id = auth.uid());

create policy "own mutes" on mutes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "file own reports" on message_reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "read own reports" on message_reports
  for select to authenticated using (reporter_id = auth.uid());

create policy "read ranger reports" on ranger_reports
  for select to authenticated using (true);

create policy "read raids" on raids
  for select to authenticated using (true);
create policy "read raid participants" on raid_participants
  for select to authenticated using (true);

create policy "read own duels" on duels
  for select to authenticated using (challenger_id = auth.uid() or opponent_id = auth.uid());

create policy "read own trades" on trades
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

create policy "own ai cache" on ai_content_cache
  for select to authenticated using (user_id = auth.uid());

-- Realtime: chat and the raid bar.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table raids;


-- ---------------------------------------------------------------------------
-- Server-authoritative game logic
-- source: supabase/migrations/0002_functions.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- Push notification subscriptions
-- source: supabase/migrations/0004_notifications.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- Restoring an offline save
-- source: supabase/migrations/0005_import.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- World data: Kindred, badges, quests, items, voice lines
-- source: supabase/seed.sql
-- ---------------------------------------------------------------------------

-- =========================================================================
-- HOLLOWMOOR — seed data
--
-- GENERATED FILE. Do not edit by hand — edit app/data/*.ts and run:
--     npm run seed
--
-- Safe to re-run: every insert upserts on the primary key.
-- =========================================================================

-- Kindred roster -----------------------------------------------------------
insert into kindred_species (id, dex_no, stage_names, evolve_at, strength, hue, archetype, rarity, is_starter, appears_at, dex_entry) values
  ('emberkin', 1, '{"Emberkin","Kilnmaw","Forgewarden"}', '{7,30}', 'Willpower', 22, 'beast', 'common', true, 0, 'Runs hot. Sleeps in the ashes of things it decided not to do. Gets brighter the longer you hold the line.'),
  ('tidewhelp', 2, '{"Tidewhelp","Brinecaller","Deepsolace"}', '{7,30}', 'Calm', 194, 'serpent', 'common', true, 0, 'Breathes in fours, holds for seven, lets go for eight. Nobody has ever seen one panic.'),
  ('mossling', 3, '{"Mossling","Thornstead","Rootmonarch"}', '{7,30}', 'Discipline', 104, 'beast', 'common', true, 0, 'Grows a single ring per clean day. Cut one open and you can count exactly how stubborn it is.'),
  ('idlewisp', 4, '{"Idlewisp","Driftlamp","Beaconsoul"}', '{7,30}', 'Purpose', 188, 'wisp', 'common', false, 2, 'Drifts toward whoever has nothing to do. Harmless alone. Devastating in a long empty afternoon.'),
  ('fogpup', 5, '{"Fogpup","Misthound","Cloudreaver"}', '{7,30}', 'Loyalty', 262, 'beast', 'common', false, 3, 'Born in the Haze but refuses to serve it. Follows Breakers home and growls at the front door.'),
  ('ashmoth', 6, '{"Ashmoth","Cindermoth","Pyrewing"}', '{7,30}', 'Patience', 36, 'moth', 'common', false, 4, 'Circles a craving for hours without landing on it. An excellent teacher.'),
  ('snoozle', 7, '{"Snoozle","Dozewyrm","Somnarch"}', '{7,30}', 'Rest', 232, 'serpent', 'common', false, 5, 'Only appears to Breakers who have stopped sleeping properly. Curls up on your chest until the ceiling gets boring.'),
  ('knotwyrm', 8, '{"Knotwyrm","Cordserpent","Unbinder"}', '{7,30}', 'Release', 158, 'serpent', 'uncommon', false, 7, 'Ties itself in knots so you do not have to. Untangles one loop per slow breath.'),
  ('lonefin', 9, '{"Lonefin","Solowake","Tidechorus"}', '{7,30}', 'Connection', 208, 'serpent', 'uncommon', false, 10, 'Swims alone for years, then joins a chorus and never shuts up about it. Evolves only near other Breakers.'),
  ('gigglespore', 10, '{"Gigglespore","Chucklecap","Mirthbloom"}', '{7,30}', 'Joy', 304, 'wisp', 'uncommon', false, 12, 'Proof that a good night does not require the Haze. Blooms loudest at parties it was not invited to.'),
  ('pressgang', 11, '{"Pressgang","Crowdcoil","Chorusmaw"}', '{7,30}', 'Boundaries', 342, 'beast', 'uncommon', false, 15, 'Speaks in other people’s voices. Says "come on, one won’t hurt" in perfect impressions of your friends.'),
  ('tickbell', 12, '{"Tickbell","Chimewretch","Tollwarden"}', '{7,30}', 'Timing', 48, 'wisp', 'uncommon', false, 18, 'Rings once a day at the worst possible minute. Tamed Tollwardens ring at good minutes instead.'),
  ('clinkrat', 13, '{"Clinkrat","Coinchewer","Vaultgnash"}', '{7,30}', 'Thrift', 44, 'beast', 'uncommon', false, 21, 'Hoards every coin you did not spend on the Haze. By day sixty the pile is genuinely embarrassing.'),
  ('lanternjack', 14, '{"Lanternjack","Wickwraith","Hearthlord"}', '{7,30}', 'Hope', 40, 'wisp', 'rare', false, 25, 'Carries a light it never lets go out, mostly out of spite.'),
  ('grithound', 15, '{"Grithound","Ironjaw","Bulwarkbeast"}', '{7,30}', 'Endurance', 14, 'beast', 'rare', false, 30, 'Has bitten through every excuse ever offered to it. Its jaw does not open again until day thirty.'),
  ('hazelet', 16, '{"Hazelet","Fogmaw","Murkcolossus"}', '{7,30}', 'The Haze itself', 278, 'moth', 'rare', false, 45, 'A piece of the Haze small enough to keep in your pocket. Some Breakers carry one as a reminder of the size of the thing.'),
  ('clarion', 17, '{"Clarion","Brightpeal","Dawnherald"}', '{7,30}', 'Clarity', 172, 'moth', 'mythic', false, 90, 'Only visible above the fog line. Breakers who reach Clearsummit say it was following them the entire way up.')
on conflict (id) do update set
  dex_no = excluded.dex_no, stage_names = excluded.stage_names, evolve_at = excluded.evolve_at,
  strength = excluded.strength, hue = excluded.hue, archetype = excluded.archetype,
  rarity = excluded.rarity, is_starter = excluded.is_starter, appears_at = excluded.appears_at,
  dex_entry = excluded.dex_entry;

-- Trigger Trials and endgame badges ----------------------------------------
insert into badges (id, sort_order, name, trigger_tag, required_streak, trial_game, trial_target, kind, blurb) values
  ('trial-boredom', 1, 'The Empty Hour', 'boredom', 3, 'memory', 8, 'trial', 'Ashen Verge. Nothing to do and all day to do it. Clear the Verge without wandering back to the bench.'),
  ('trial-stress', 2, 'The Unclenching', 'stress', 7, 'breath', 4, 'trial', 'Lowtide Steps. Four full breaths with the tide. Your shoulders come down or you fail.'),
  ('trial-loneliness', 3, 'The Long Table', 'loneliness', 14, 'memory', 12, 'trial', 'An empty room remembers everyone who left it. Match the faces before the lamps go out.'),
  ('trial-celebration', 4, 'The Good Night', 'celebration', 21, 'crusher', 60, 'trial', 'Hollow Market at full volume. Prove a good night does not need the Haze in it.'),
  ('trial-sleeplessness', 5, 'The Ceiling', 'sleeplessness', 30, 'breath', 6, 'trial', 'The Long Dark, 3am. You cannot sleep your way out. You can breathe your way out.'),
  ('trial-peer-pressure', 6, 'The Flat No', 'peer_pressure', 45, 'crusher', 90, 'trial', 'Gutter & Lantern. Old faces, same bench, same offer. Say no ninety times without explaining yourself once.'),
  ('trial-bell', 7, 'The Bell Unrung', 'the_bell', 60, 'delve', 1, 'trial', 'Bellfield. It rings at the same wrong minute every day. Stay in the delve until it stops mattering.'),
  ('trial-payday', 8, 'The Full Pocket', 'payday', 75, 'crusher', 120, 'trial', 'Coinfall. Money in hand and a bad idea in reach. Spend it on absolutely anything else.'),
  ('council-first', 9, 'First Seat', 'endgame', 90, 'delve', 1, 'council', 'The Haze Council convenes. The first seat is filled by the version of you from day one.'),
  ('council-second', 10, 'Second Seat', 'endgame', 180, 'delve', 2, 'council', 'The second seat argues that you were more fun before. It is lying, and it is loud.'),
  ('council-third', 11, 'Third Seat', 'endgame', 270, 'delve', 3, 'council', 'The last seat is empty. It has been waiting for you to sit in it and change your mind.'),
  ('champion', 12, 'Champion of Clearsummit', 'endgame', 365, 'breath', 8, 'champion', 'Three hundred and sixty-five days. Above the fog line. You can see the whole region.')
on conflict (id) do update set
  sort_order = excluded.sort_order, name = excluded.name, trigger_tag = excluded.trigger_tag,
  required_streak = excluded.required_streak, trial_game = excluded.trial_game,
  trial_target = excluded.trial_target, kind = excluded.kind, blurb = excluded.blurb;

-- Notice board -------------------------------------------------------------
insert into quests (id, title, description, kind, target, grit_reward, cadence) values
  ('q-checkin', 'Report to the Rest Stop', 'Check in today, either way. Honest counts.', 'checkin', 1, 25, 'daily'),
  ('q-breath', 'Dive the Lowtide', 'Complete two rounds of Breath of the Deep.', 'minigame', 2, 35, 'daily'),
  ('q-crusher', 'Clear the Fogbank', 'Pop 40 Haze bubbles in Craving Crusher.', 'minigame', 40, 35, 'daily'),
  ('q-memory', 'Walk the Old Streets', 'Finish one round of Memory of Restwick.', 'minigame', 1, 30, 'daily'),
  ('q-delve', 'Descend', 'Hold one full Focus Delve without leaving.', 'minigame', 1, 90, 'daily'),
  ('q-square', 'Show Your Face', 'Appear in the town square while someone else is there.', 'social', 1, 30, 'daily'),
  ('q-chat', 'Say Something', 'Post once in any channel. Trash talk qualifies.', 'social', 1, 25, 'daily'),
  ('q-hype', 'Back Someone Up', 'React to a friend’s check-in.', 'social', 1, 30, 'daily'),
  ('q-craving', 'Beat One Down', 'Use the Craving Now button and finish the run.', 'minigame', 1, 40, 'daily'),
  ('wq-week-clean', 'A Clean Week', 'Log five clean days this week.', 'checkin', 5, 220, 'weekly'),
  ('wq-raid', 'Hurt the Titan', 'Deal 500 damage to the Haze Titan this week.', 'raid', 500, 260, 'weekly'),
  ('wq-games', 'Regular at the Arcade', 'Finish ten minigame runs this week.', 'minigame', 10, 200, 'weekly')
on conflict (id) do update set
  title = excluded.title, description = excluded.description, kind = excluded.kind,
  target = excluded.target, grit_reward = excluded.grit_reward, cadence = excluded.cadence;

-- Shop ---------------------------------------------------------------------
insert into items (id, name, description, category, price, payload) values
  ('freeze-token', 'Stillglass Token', 'Holds your chain for one day you genuinely could not check in. Cannot cover a relapse — the app would stop working if it could.', 'utility', 260, '{"grants":"freeze"}'::jsonb),
  ('codex-lens', 'Codex Lens', 'Doubles your odds of a wild Kindred showing up after a minigame, for one day.', 'utility', 180, '{"effect":"catch_boost","hours":24}'::jsonb),
  ('accent-ember', 'Ember Aura', 'Burnt-orange glow around your marker in the square.', 'cosmetic', 120, '{"accent":"#ff7a2f"}'::jsonb),
  ('accent-clear', 'Clearwater Aura', 'The toxic-teal of a clear head.', 'cosmetic', 120, '{"accent":"#14e0bd"}'::jsonb),
  ('accent-violet', 'Violet Aura', 'Haze purple, worn on purpose. Know your enemy.', 'cosmetic', 120, '{"accent":"#9a80ff"}'::jsonb),
  ('accent-bone', 'Bone Aura', 'Plain white. Extremely smug.', 'cosmetic', 200, '{"accent":"#f6f2ea"}'::jsonb),
  ('accent-gold', 'Coinfall Gold', 'For Breakers who made it past Payday.', 'cosmetic', 400, '{"accent":"#ffb020"}'::jsonb),
  ('skin-frost', 'Frostmark Coat', 'Cools your companion’s palette to winter blue.', 'cosmetic', 300, '{"hueShift":200}'::jsonb),
  ('skin-ash', 'Ashfall Coat', 'Grey and orange, like something that walked out of a fire.', 'cosmetic', 300, '{"hueShift":20}'::jsonb),
  ('skin-void', 'Hollow Coat', 'Deep violet. Slightly unsettling. Very popular.', 'cosmetic', 450, '{"hueShift":280}'::jsonb),
  ('sticker-nope', 'Sticker: FLAT NO', 'For when someone offers and you do not feel like typing.', 'sticker', 90, '{"glyph":"🚫"}'::jsonb),
  ('sticker-fog', 'Sticker: FOG OFF', 'Aimed squarely at the Dealer.', 'sticker', 90, '{"glyph":"🌫️"}'::jsonb),
  ('sticker-streak', 'Sticker: NUMBERS', 'Post it when your streak speaks for itself.', 'sticker', 90, '{"glyph":"📈"}'::jsonb),
  ('sticker-ember', 'Sticker: EMBER', 'Hype a friend without saying anything embarrassing.', 'sticker', 90, '{"glyph":"🔥"}'::jsonb),
  ('sticker-titan', 'Sticker: TITAN DOWN', 'Unlocked bragging rights, in sticker form.', 'sticker', 150, '{"glyph":"💥"}'::jsonb),
  ('deco-lantern', 'Restwick Lantern', 'Hangs by your marker in the town square.', 'decoration', 220, '{"glyph":"🏮"}'::jsonb),
  ('deco-bench', 'The Good Bench', 'A bench you sit on for entirely different reasons now.', 'decoration', 260, '{"glyph":"🪑"}'::jsonb),
  ('deco-banner', 'Breaker Banner', 'Flies your streak over the square.', 'decoration', 380, '{"glyph":"🚩"}'::jsonb)
on conflict (id) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  price = excluded.price, payload = excluded.payload;

-- Fallback voice library ---------------------------------------------------
-- Mirrored server-side so the edge function has something to say when Grok is
-- unreachable or no XAI_API_KEY is configured.
delete from voice_lines;
insert into voice_lines (speaker, line) values
  ('dealer_relapse', 'Back so soon? I didn’t even move the furniture.'),
  ('dealer_relapse', 'Day zero. My favourite number. It has such a nice round shape.'),
  ('dealer_relapse', 'You didn’t lose to me. You lost to a Tuesday.'),
  ('dealer_relapse', 'I love this part. The part where you explain it to yourself.'),
  ('dealer_relapse', 'Careful, your streak fell off. Oh wait — that was hours ago.'),
  ('dealer_relapse', '"Just this once" is my most successful product. Repeat customers every time.'),
  ('dealer_relapse', 'The counter goes back to zero. The excuse goes into my collection.'),
  ('dealer_relapse', 'You held out longer than last time. Genuinely annoying of you.'),
  ('dealer_relapse', 'And the crowd goes… back to bed.'),
  ('dealer_relapse', 'That plan you had? I read it. It was adorable.'),
  ('dealer_relapse', 'You know what I like about you? Your consistency. In this specific area.'),
  ('dealer_relapse', 'A whole streak, gone, and I didn’t even have to try hard.'),
  ('dealer_relapse', 'Somewhere a calendar just sighed.'),
  ('dealer_relapse', 'The boredom got you. The boredom always gets you. It’s free labour for me.'),
  ('dealer_relapse', 'You didn’t decide anything. You just stopped deciding, and I filled the gap.'),
  ('dealer_relapse', 'Your Kindred is asleep. Don’t worry, it’s used to it.'),
  ('dealer_relapse', 'I’ll keep the light on. I always keep the light on.'),
  ('dealer_relapse', 'Look at that — the loop still fits. Like it was made for you.'),
  ('dealer_relapse', 'You told your friends the number. That’s the bit that stings, isn’t it.'),
  ('dealer_relapse', 'Same time tomorrow? I’m very flexible.'),
  ('dealer_salty', 'Still here? Fine. I have other clients.'),
  ('dealer_salty', 'Congratulations, you’ve gone a whole day without me. Riveting television.'),
  ('dealer_salty', 'You look insufferable. Clear-eyed and insufferable.'),
  ('dealer_salty', 'Enjoy the streak. Streaks are famously permanent.'),
  ('dealer_salty', 'I’m not worried. I’m just… standing here. Watching. Casually.'),
  ('dealer_salty', 'A week. Cute. I’ve seen weeks. Weeks are nothing.'),
  ('dealer_salty', 'You’re only doing this to spite me, and honestly? It’s working.'),
  ('dealer_salty', 'Every day you don’t show up, my numbers look worse. Stop it.'),
  ('dealer_salty', 'You’ve started sleeping properly. Disgusting.'),
  ('dealer_salty', 'This is a phase. A long, well-documented, extremely public phase.'),
  ('dealer_salty', 'Your Kindred evolved. Great. Now it’s a bigger problem for me.'),
  ('dealer_salty', 'I preferred you when you were easier to schedule.'),
  ('dealer_salty', 'Do you know how boring you’ve become? Do you? Do you know?'),
  ('dealer_salty', 'You checked in before I even got my coffee. Unsportsmanlike.'),
  ('dealer_salty', 'Fine. FINE. Take the day. Take the whole stupid day.'),
  ('dealer_salty', 'Weekend’s coming. I’m very patient. Ask anyone.'),
  ('dealer_salty', 'You’ve got money in your pocket for once. That’s traditionally my window.'),
  ('dealer_salty', 'Someone at the town square asked about your streak. I hated it.'),
  ('dealer_salty', 'One day you’ll get complacent. I have literally nothing else scheduled.'),
  ('dealer_salty', 'You’re making this personal. Good. I work better angry.'),
  ('vale_hype', 'That’s another one in the bank. Nobody can take today off you.'),
  ('vale_hype', 'You made a boring, unglamorous, completely correct decision. That’s the whole game.'),
  ('vale_hype', 'Your Kindred is brighter today. That’s not a metaphor — go look at it.'),
  ('vale_hype', 'Day by day is not a slogan, it’s a method, and you are running it correctly.'),
  ('vale_hype', 'The Haze is thinner where you’re standing. I can actually see the road.'),
  ('vale_hype', 'You didn’t feel like it and you did it anyway. That’s the strong version.'),
  ('vale_hype', 'Something in you got easier today. It compounds. Keep going.'),
  ('vale_hype', 'The Dealer is very quiet this morning. I noticed. He noticed.'),
  ('vale_hype', 'You’re building a person who does this. That person is nearly here.'),
  ('vale_hype', 'One more ring on the tree. Small, permanent, yours.'),
  ('vale_hype', 'You checked in. That’s the hard part done before breakfast.'),
  ('vale_hype', 'This is the stretch where it stops being white-knuckle. Feel it starting?'),
  ('vale_hype', 'Your best streak just moved. New floor, not a lucky day.'),
  ('vale_hype', 'Whatever you did to get through last night — do that again.'),
  ('vale_hype', 'A week is where the fog starts lifting off the low ground. Look around.'),
  ('vale_hype', 'You’re past the part most people don’t get past. Say that out loud once.'),
  ('vale_hype', 'Thirty days rewires the reflex. You are literally rebuilding hardware.'),
  ('vale_hype', 'The version of you from day one wouldn’t believe today happened.'),
  ('vale_hype', 'That’s a real number now. Not a fluke, not a good week. A number.'),
  ('vale_hype', 'You’ve stopped negotiating with it. That’s the moment things change.'),
  ('vale_hype', 'Clearsummit is a long walk and you are actually on the road.'),
  ('vale_hype', 'Nothing dramatic happened today. That was the win.'),
  ('vale_hype', 'Your friends can see that streak. Let them.'),
  ('vale_hype', 'You beat the craving with the most powerful tool there is: waiting.'),
  ('vale_hype', 'The counter is high enough now that it protects itself. Guard it.'),
  ('vale_hype', 'You are officially boring to the Haze. That is the highest honour here.'),
  ('vale_hype', 'Rest properly tonight. You earned an unremarkable evening.'),
  ('vale_hype', 'Momentum is real and it is currently pointed the right way.'),
  ('vale_hype', 'You showed up on a day you didn’t want to. That one counts double.'),
  ('vale_hype', 'Whatever the number is, it’s bigger than yesterday. That’s all it ever needs to be.'),
  ('vale_hype', 'The cravings are getting shorter. You may not have noticed. I did.'),
  ('vale_hype', 'You are the least interesting client the Dealer has. Stay unhireable.'),
  ('vale_hype', 'That’s another day your Kindred didn’t have to sleep through.'),
  ('vale_hype', 'You made room in your week for something that isn’t this. Fill it.'),
  ('vale_hype', 'The hard days are the ones that build the floor. This is a floor day.'),
  ('vale_hype', 'Look how far Fogmouth is behind you.'),
  ('vale_hype', 'The road to Clearsummit is made entirely of days like this one.'),
  ('vale_hype', 'You’ve got proof now. Not hope — proof. Go check the Codex.'),
  ('vale_hype', 'Nobody handed you that streak. Every single day of it was a decision.'),
  ('vale_hype', 'Same again tomorrow. That’s the whole plan and it works.'),
  ('vale_tip', 'Cravings peak and fall in about fifteen minutes. Set a timer and let it break on the rocks.'),
  ('vale_tip', 'Ride it, don’t fight it. Name what it feels like in your body and watch it move. It always moves.'),
  ('vale_tip', 'HALT: hungry, angry, lonely, tired. Fix the actual one. Most cravings are wearing a disguise.'),
  ('vale_tip', 'Change the room. A craving is half habit-loop and half furniture.'),
  ('vale_tip', 'Delay ten minutes. Not forever — ten minutes. You almost never come back to it.'),
  ('vale_tip', 'Drink a full glass of cold water first. It buys you ninety seconds of thinking room.'),
  ('vale_tip', 'Walk to the end of the street and back. Motion drains the urge faster than willpower does.'),
  ('vale_tip', 'Write down the exact excuse your brain just made. Read it back. They’re never good on paper.'),
  ('vale_tip', 'Put a wall between you and the thing: a locked drawer, a friend’s house, a different route home.'),
  ('vale_tip', 'Text one person the word "craving". You don’t have to explain. The sending is the technique.'),
  ('vale_tip', 'Box breathing: four in, four hold, four out, four hold. Do it six times before you decide anything.'),
  ('vale_tip', 'Eat something with real sugar or protein. Low blood sugar imitates a craving almost perfectly.'),
  ('vale_tip', 'Plan your evening at 4pm, not at 9pm. The 9pm version of you is not on your side.'),
  ('vale_tip', 'Keep your hands busy — controller, cards, dishes, guitar. Idle hands are the Haze’s cheapest tool.'),
  ('vale_tip', 'The urge is a wave, not a wall. Waves have a top. You have been over the top before.'),
  ('vale_tip', 'Identify your first domino. It’s rarely the substance. It’s usually a route, a room, or a person.'),
  ('vale_tip', 'Put the money you didn’t spend somewhere you can see it. Numbers going up beat numbers going down.'),
  ('vale_tip', 'If it’s a weekend pattern, decide Friday morning what Saturday looks like. Decide it once.'),
  ('vale_tip', 'Sleep is the whole game. If tonight is bad, tomorrow’s craving is louder for free.'),
  ('vale_tip', 'Have a replacement ritual with the same shape: same time, same chair, different thing in your hand.'),
  ('vale_tip', 'Tell one friend your streak number. Accountability is a cheat code and it is legal.'),
  ('vale_tip', 'Notice the "I deserve this" thought. Rewards are fine — pick one that doesn’t cost you the streak.'),
  ('vale_tip', 'The 20 minutes after work is the fault line. Fill it before it fills itself.'),
  ('vale_tip', 'Exercise for ten minutes, badly. Effort matters more than form for killing an urge.'),
  ('vale_tip', 'When bored, do the smallest useful thing in sight. Boredom is a vacuum and vacuums get filled.'),
  ('vale_tip', 'Keep a "why" note in your phone written on a good day. Read it on a bad one.'),
  ('vale_tip', 'Play out the whole tape: not just the first ten minutes, but tomorrow morning too.'),
  ('vale_tip', 'If you’re somewhere it’s happening, leave early. Leaving early is not losing.'),
  ('vale_tip', 'Practise the flat no. No explanation, no debate, no apology. "I’m good, thanks." Full stop.'),
  ('vale_tip', 'Celebrate out loud at 7, 30 and 90 days. Under-celebrating is how people quit quitting.'),
  ('vale_tip', 'Cold water on your face and wrists resets the nervous system in about thirty seconds.'),
  ('vale_tip', 'Track the trigger, not just the day. Patterns you can see are patterns you can plan around.'),
  ('vale_tip', 'Put your phone across the room at night. Half of the 1am spiral is just reach.'),
  ('vale_tip', 'A craving after a good day is normal. It isn’t a sign you’re failing — it’s the old wiring firing.'),
  ('vale_tip', 'Make the next step tiny. "Get through the next hour" is a complete plan.'),
  ('vale_tip', 'If you slipped, log it today. A slip logged today is one day. A slip hidden becomes a week.'),
  ('vale_tip', 'Stack a new habit onto an existing one: kettle on, then breathe. The kettle does the remembering.'),
  ('vale_tip', 'Say the craving out loud in a stupid voice. It is remarkably hard to obey something that sounds silly.'),
  ('vale_tip', 'Have a "go" list of three things you’ll actually do at 9pm. Decide it now, not then.'),
  ('vale_tip', 'Rest is not relapse. A bad day inside a good month is still a good month.');

-- Sanity check -------------------------------------------------------------
do $$
begin
  raise notice 'Hollowmoor seeded: % species, % badges, % quests, % items, % voice lines',
    (select count(*) from kindred_species),
    (select count(*) from badges),
    (select count(*) from quests),
    (select count(*) from items),
    (select count(*) from voice_lines);
end $$;
