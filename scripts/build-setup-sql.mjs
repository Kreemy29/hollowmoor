/**
 * Bundles the migrations + seed into a single `supabase/setup.sql`.
 *
 * Running five files in the right order through a web SQL editor is five
 * chances to get it wrong, and a half-applied schema fails in confusing ways.
 * This produces one paste that sets up everything.
 *
 * pg_cron (0003) is deliberately left OUT: it needs an extension that isn't
 * enabled by default, and a failure there would abort the whole transaction
 * and take the working schema down with it. It's optional and documented
 * separately.
 *
 * Regenerate with `npm run setup-sql` after changing any migration.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sql = (p) => readFileSync(path.join(root, 'supabase', p), 'utf8')

const PARTS = [
  ['Schema, Row Level Security and views', 'migrations/0001_schema.sql'],
  ['Server-authoritative game logic', 'migrations/0002_functions.sql'],
  ['Push notification subscriptions', 'migrations/0004_notifications.sql'],
  ['Restoring an offline save', 'migrations/0005_import.sql'],
  ['World data: Kindred, badges, quests, items, voice lines', 'seed.sql'],
]

const header = `-- ===========================================================================
-- HOLLOWMOOR — one-shot setup
--
-- GENERATED FILE. Do not edit by hand — edit supabase/migrations/*.sql and
-- run \`npm run setup-sql\`.
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

`

const body = PARTS.map(([label, file]) => {
  const bar = '-'.repeat(75)
  return `\n-- ${bar}\n-- ${label}\n-- source: supabase/${file}\n-- ${bar}\n\n${sql(file)}`
}).join('\n')

const out = path.join(root, 'supabase', 'setup.sql')
writeFileSync(out, header + body)

const lines = (header + body).split('\n').length
console.log(`supabase/setup.sql written — ${PARTS.length} files, ${lines} lines`)
