/**
 * Generates supabase/seed.sql from the TypeScript game data.
 *
 * The client and the database must agree on every species, badge, quest and
 * item — a divergence there means the server rejects rewards the UI already
 * promised. Generating the seed from the same source removes that whole class
 * of bug. Re-run with `npm run seed` after changing anything in app/data.
 */
import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, '.scratch')
mkdirSync(outDir, { recursive: true })

const entry = path.join(outDir, 'seed-entry.ts')
writeFileSync(
  entry,
  `export { KINDRED } from '@/data/kindred'
export { BADGES } from '@/data/badges'
export { QUESTS } from '@/data/quests'
export { ITEMS } from '@/data/items'
export {
  DEALER_RELAPSE, DEALER_SALTY, VALE_HYPE, VALE_TIPS,
} from '@/data/ai-lines'
`,
)

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  outfile: path.join(outDir, 'seed-data.mjs'),
  alias: { '@': path.join(root, 'app') },
  logLevel: 'error',
})

// Windows absolute paths must be file:// URLs for the ESM loader.
const data = await import(pathToFileURL(path.join(outDir, 'seed-data.mjs')).href)

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (list) => `'{${list.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')}}'`
const nums = (list) => `'{${list.join(',')}}'`

const lines = []
lines.push(`-- =========================================================================
-- HOLLOWMOOR — seed data
--
-- GENERATED FILE. Do not edit by hand — edit app/data/*.ts and run:
--     npm run seed
--
-- Safe to re-run: every insert upserts on the primary key.
-- =========================================================================
`)

lines.push('-- Kindred roster -----------------------------------------------------------')
lines.push(
  'insert into kindred_species (id, dex_no, stage_names, evolve_at, strength, hue, archetype, rarity, is_starter, appears_at, dex_entry) values',
)
lines.push(
  data.KINDRED.map(
    (k) =>
      `  (${q(k.id)}, ${k.dexNo}, ${arr(k.stageNames)}, ${nums(k.evolveAt)}, ${q(k.strength)}, ${k.hue}, ${q(k.archetype)}, ${q(k.rarity)}, ${k.isStarter}, ${k.appearsAt}, ${q(k.dexEntry)})`,
  ).join(',\n') +
    `\non conflict (id) do update set
  dex_no = excluded.dex_no, stage_names = excluded.stage_names, evolve_at = excluded.evolve_at,
  strength = excluded.strength, hue = excluded.hue, archetype = excluded.archetype,
  rarity = excluded.rarity, is_starter = excluded.is_starter, appears_at = excluded.appears_at,
  dex_entry = excluded.dex_entry;\n`,
)

lines.push('-- Trigger Trials and endgame badges ----------------------------------------')
lines.push(
  'insert into badges (id, sort_order, name, trigger_tag, required_streak, trial_game, trial_target, kind, blurb) values',
)
lines.push(
  data.BADGES.map(
    (b) =>
      `  (${q(b.id)}, ${b.order}, ${q(b.name)}, ${q(b.trigger)}, ${b.requiredStreak}, ${q(b.trialGame)}, ${b.trialTarget}, ${q(b.kind)}, ${q(b.blurb)})`,
  ).join(',\n') +
    `\non conflict (id) do update set
  sort_order = excluded.sort_order, name = excluded.name, trigger_tag = excluded.trigger_tag,
  required_streak = excluded.required_streak, trial_game = excluded.trial_game,
  trial_target = excluded.trial_target, kind = excluded.kind, blurb = excluded.blurb;\n`,
)

lines.push('-- Notice board -------------------------------------------------------------')
lines.push('insert into quests (id, title, description, kind, target, grit_reward, cadence) values')
lines.push(
  data.QUESTS.map(
    (t) =>
      `  (${q(t.id)}, ${q(t.title)}, ${q(t.description)}, ${q(t.kind)}, ${t.target}, ${t.gritReward}, ${q(t.cadence)})`,
  ).join(',\n') +
    `\non conflict (id) do update set
  title = excluded.title, description = excluded.description, kind = excluded.kind,
  target = excluded.target, grit_reward = excluded.grit_reward, cadence = excluded.cadence;\n`,
)

lines.push('-- Shop ---------------------------------------------------------------------')
lines.push('insert into items (id, name, description, category, price, payload) values')
lines.push(
  data.ITEMS.map(
    (i) =>
      `  (${q(i.id)}, ${q(i.name)}, ${q(i.description)}, ${q(i.category)}, ${i.price}, ${q(JSON.stringify(i.payload))}::jsonb)`,
  ).join(',\n') +
    `\non conflict (id) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  price = excluded.price, payload = excluded.payload;\n`,
)

lines.push(`-- Fallback voice library ---------------------------------------------------
-- Mirrored server-side so the edge function has something to say when Grok is
-- unreachable or no XAI_API_KEY is configured.
delete from voice_lines;`)
lines.push('insert into voice_lines (speaker, line) values')
const voice = [
  ...data.DEALER_RELAPSE.map((l) => ['dealer_relapse', l]),
  ...data.DEALER_SALTY.map((l) => ['dealer_salty', l]),
  ...data.VALE_HYPE.map((l) => ['vale_hype', l]),
  ...data.VALE_TIPS.map((l) => ['vale_tip', l]),
]
lines.push(voice.map(([s, l]) => `  (${q(s)}, ${q(l)})`).join(',\n') + ';\n')

lines.push(`-- Sanity check -------------------------------------------------------------
do $$
begin
  raise notice 'Hollowmoor seeded: % species, % badges, % quests, % items, % voice lines',
    (select count(*) from kindred_species),
    (select count(*) from badges),
    (select count(*) from quests),
    (select count(*) from items),
    (select count(*) from voice_lines);
end $$;
`)

const out = path.join(root, 'supabase', 'seed.sql')
writeFileSync(out, lines.join('\n'))
console.log(
  `seed.sql written: ${data.KINDRED.length} species, ${data.BADGES.length} badges, ` +
    `${data.QUESTS.length} quests, ${data.ITEMS.length} items, ${voice.length} voice lines`,
)
