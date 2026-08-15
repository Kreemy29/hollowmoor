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
