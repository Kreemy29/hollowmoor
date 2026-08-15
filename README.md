# HOLLOWMOOR

A creature-collector world that helps you quit weed.

The addiction is **The Haze** — a purple fog over the region of Hollowmoor. You play a **Breaker**.
Your rank is your clean-day streak. You pick a **Kindred** that evolves as the streak grows and
**dims one stage** when you slip. You check in once a day, battle Cravings, clear **Trigger Trials**,
raid a weekly boss with friends, and climb out of Fogmouth toward **Clearsummit** at 365 days.

A snarky villain roasts the slip. A mentor backs you up. The roasting has limits and they are
enforced in code — see [Wellbeing & safety](#wellbeing--safety).

---

## Quick start

```bash
npm install
npm run dev
```

That's it. **No API keys, no database, no accounts.** With an empty environment the whole game runs
in the browser against `localStorage`:

- full daily check-in loop, streaks, Grit, XP, evolution and dimming
- all four minigames and the omnipresent **Craving now** button
- Codex, Trigger Trials, map, quests, shop
- the local voice library (120 written lines) standing in for Grok
- multiplayer screens populated by clearly-labelled **Echo Breakers** so nothing is an empty room

Adding a Supabase project turns the Echoes into real friends. Adding an x.ai key makes the writing
personal. Neither is required to play, ever.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the rules + backend test suite |
| `npm run seed` | Regenerate `supabase/seed.sql` from `app/data/*.ts` |
| `npm run icons` | Regenerate the favicon and PWA icons from the sprite engine |

---

## How it's put together

```
/app
  /components   shared UI, sprites, app shell
  /data         the world: Kindred roster, badges, quests, items, voice lines, events
  /features     one folder per screen (checkin, hub, codex, square, raid, arena, shop…)
  /lib          rules engine, backends, sprite generator, audio, time, moderation
  /scenes       Phaser scenes (arcade minigames)
  /store        zustand stores
/supabase
  /migrations   schema + RLS + server-side game logic + cron
  /functions    grok-generate, daily-cron, _shared/webpush
  seed.sql      GENERATED — run `npm run seed`
/scripts        seed + icon generators
/tests          vitest
```

Three things are worth knowing before you change anything:

**1. `app/lib/rules.ts` is the game.** Every number that decides how Hollowmoor *feels* — evolution
gates, Grit payouts, milestones, freeze tokens, route unlocks — lives there and nowhere else. The
Postgres function `hm_checkin` in `supabase/migrations/0002_functions.sql` mirrors it exactly. **If
you retune a reward, retune both.** The duplication is deliberate: the browser copy gives instant
feedback, the database copy is the one that actually decides what happened, so nobody can mint Grit
from devtools.

**2. There are two backends behind one interface.** `app/lib/backend/types.ts` defines it;
`local.ts` (localStorage) and `supabase.ts` (hosted) implement it. The app picks at runtime based on
whether `VITE_SUPABASE_URL` is set. Every screen works against both.

**3. All sprites are generated, not drawn.** `app/lib/sprite.ts` composes 16×16 pixel creatures from
a species' hue and archetype. Add a species to `app/data/kindred.ts` and it immediately has original
art at all three stages, a Codex entry, and an icon. No asset pipeline, no licensing questions.

---

## Going online

Multiplayer — friends, chat, live presence, raids, duels, trades, cross-device saves — needs a
Supabase project. It's free-tier friendly.

### 1. Create the project

Sign up at [supabase.com](https://supabase.com), create a project, then **Settings → API** and copy
the Project URL and the `anon` public key into `.env.local`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

The anon key is meant to be public — every table is protected by Row Level Security.

### 2. Run the migrations

Either paste each file into the SQL Editor in order, or use the CLI:

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

Order matters: `0001_schema.sql` → `0002_functions.sql` → `0003_cron.sql` → `0004_notifications.sql`.

`0003_cron.sql` needs the **pg_cron** extension — enable it under Database → Extensions first.

### 3. Seed the world

Run `supabase/seed.sql` in the SQL Editor. It's generated from the TypeScript data files, so the
database and the client can't drift. Regenerate it with `npm run seed` after editing `app/data`.

### 4. Turn on anonymous sign-in

**Authentication → Providers → Anonymous Sign-ins → Enable.** This is what makes guest accounts work
— your friends tap a link and are playing in about fifteen seconds, no email, no password.

Optional: Authentication → Providers → Email, if you want people to be able to save across devices
via magic link (Settings → "link email" in the app).

### 5. Enable Realtime

**Database → Replication** — the migration already adds `messages` and `raids` to the
`supabase_realtime` publication. Confirm both are listed. Presence needs nothing extra.

---

## The AI engine (optional)

Grok writes the Dealer's roast and Vale's tip, personalised to your check-in history and cached once
per player per day.

```bash
supabase secrets set XAI_API_KEY=xai-...
supabase functions deploy grok-generate
```

**The key stays server-side.** It is read only by `supabase/functions/grok-generate/index.ts`. There
is no `VITE_XAI_API_KEY` and there must never be one — `VITE_` variables are compiled into the
browser bundle and are visible to anyone who opens the app.

What the function guarantees:

- **Cached per user per day** in `ai_content_cache`, so refreshing the dashboard costs nothing.
- **Validated before display.** Anything matching the safety patterns in `isSafe()` is dropped
  entirely and the local library is used instead. Grok never gets to put unreviewed text about drug
  use, self-harm, or personal insults in front of a player.
- **Fails soft.** No key, a timeout, a bad response, a rate limit — all land on the same fallback
  path. `source` in the response tells you which voice you got.

Without a key the game uses 120 hand-written lines in `app/data/ai-lines.ts` (40 Dealer, 40 Vale
hype, 40 real anti-craving tips) plus trigger-specific nudges. It's fully playable forever this way.

---

## Notifications (optional)

```bash
npx web-push generate-vapid-keys
```

Public half goes in `.env.local` as `VITE_VAPID_PUBLIC_KEY`. Private half is a secret:

```bash
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
supabase functions deploy daily-cron --no-verify-jwt
```

Then schedule it hourly. In the SQL Editor (needs `pg_net`):

```sql
select cron.schedule(
  'hollowmoor-reminders', '0 * * * *',
  $$select net.http_post(
      url := 'https://<your-ref>.functions.supabase.co/daily-cron',
      headers := '{"Authorization":"Bearer <your CRON_SECRET>"}'::jsonb
    )$$
);
```

The function fires at **9am and 8pm in each player's own timezone**, and sends nothing at all to
anyone who has already checked in that day. A reminder to do something you've already done is how
apps get uninstalled.

---

## Deploying to Render

The app is a static bundle — Supabase is the whole backend, so there's no server
process and nothing to keep warm.

1. Push this repo to GitHub.
2. **Render → New → Blueprint**, pick the repo. It reads `render.yaml`.
3. Render prompts for the `VITE_*` variables. **You can skip every one of them** —
   the deploy will be the fully-playable offline build. Add them later and redeploy
   when you want friends, chat and raids.

`render.yaml` pins Node 22, sets SPA rewrites so `/checkin` survives a hard refresh,
caches hashed assets forever, and keeps `/sw.js` uncached so push registration never
sticks to an old build.

> ⚠️ **`XAI_API_KEY` does not go in Render.** Anything injected into a static build is
> compiled into the bundle and readable by anyone. The x.ai key belongs only in
> Supabase Edge Function secrets — see [The AI engine](#the-ai-engine-optional).

## Deploying to Vercel

```bash
npm i -g vercel
vercel
```

Or import the repo at [vercel.com/new](https://vercel.com/new). Vercel detects Vite automatically —
build command `npm run build`, output directory `dist`.

Add your `VITE_*` variables under **Settings → Environment Variables**, then redeploy. `vercel.json`
in the repo handles SPA routing so deep links like `/checkin` work on refresh.

---

## How to invite friends

1. Deploy, or run `npm run dev -- --host` and share your local network URL.
2. In the app: **More → The Board → Copy link.** That's an invite URL carrying your friend code.
3. Send it. They pick a handle, an avatar and a starter, and they're in — no email, no password.
4. Once they're playing, you'll see each other in the town square, on the leaderboard, and in the
   weekly raid.

Friend codes look like `HM-K4TP-9WQZ` and can also be typed in manually under The Board.

**A word on group dynamics.** The Ranger Report ("call out a liar") is friends-only, rate-limited,
purely cosmetic, and cannot delete anything — a majority vote puts a 🚩 ribbon on someone's card and
that is the entire effect. It exists so a group can rib each other. If it stops being funny in your
group, nobody has to use it.

---

## Wellbeing & safety

These aren't nice-to-haves; they're built into the code and the schema.

- **The roasting has limits.** Roasts target the slip, the loop and the excuses — never the person's
  worth, body, intelligence, or any protected group. Enforced twice: in the edge function's system
  prompt *and* in the `isSafe()` validator that runs on every generated line. Wins are celebrated
  louder than slips are roasted, and **every relapse flow ends on a same-day comeback**, never on the
  insult. **Gentle mode** (Settings) mutes the Dealer entirely.
- **Never pro-drug.** No content encourages, glorifies or explains use. The villain taunts about
  relapsing, never about the substance being good.
- **Honesty is never the expensive option.** Logging a relapse pays Grit and takes exactly as many
  taps as logging a clean day. The moment telling the truth costs more than lying, the data rots and
  the app stops working.
- **A quiet door to real help.** "Need real support?" is on the relapse screen, in Settings, in the
  craving overlay and in the menu. It surfaces once — quietly, non-blocking, no lecture — when
  several relapses land in a short window or a check-in note reads like genuine distress.

  > ⚠️ **Before you ship this to anyone, verify the helpline numbers in
  > `app/components/SupportSheet.tsx` and add entries for the regions your friends actually live in.**
  > Numbers change. A dead helpline number is worse than none.

- **Chat moderation.** Mute and block per user, rate limiting, a report queue, and no link-posting
  from accounts under a day old. General profanity is allowed on purpose — it's an edgy app —
  while slurs, targeted harassment and self-harm directives are blocked. Enforced client-side for
  instant feedback and again by a Postgres trigger that a crafted request can't skip. Point
  `VITE_BLOCKLIST` at a maintained slur list before opening this up beyond people you know.
- **Data and consent.** The app states plainly what's visible to whom. Streak, handle, avatar and
  companion are public to your friends; **check-in notes and trigger tags are private to their owner
  and no policy grants read access to anyone else.** You can go private, export everything as JSON,
  and delete your account outright — both are one button in Settings.
- **This is a game, not treatment.** The app says so in Settings and on the support sheet.

---

## Accessibility & quality floor

- Mobile-first; every screen is designed at 375px and scales up.
- Visible keyboard focus everywhere; the arcade games are playable without a pointer.
- `prefers-reduced-motion` respected globally, plus an in-app override in Settings.
- **Audio is off by default** and never initialises an AudioContext until you turn it on.
- Phaser (~1MB) is code-split and only downloaded when you open a canvas game — the daily check-in
  never pays for it.
- All sprites are vector-rendered SVG, so they stay crisp at any size and add no image weight.

---

## Testing

```bash
npm test
```

36 tests covering the parts where a bug would actually hurt someone: streak transitions, the
one-stage dimming rule, best-streak preservation across relapses, missed-day lapsing, freeze-token
grants and caps, Grit caps, quest claiming, seeded honest starts, data export and deletion, and the
guarantee that the voice library always has something to say with no key and no network.

---

## Licence & assets

All original. No Pokémon/Nintendo names, creatures, characters, sprites, music or trademarks —
Kindred, badges, icons and SFX are generated procedurally by code in this repo. The optional music
loop slot (`public/audio/theme.mp3`) ships empty; if you add a track, use something you have the
rights to.
