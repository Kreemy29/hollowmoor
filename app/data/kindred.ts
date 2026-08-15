import type { KindredSpecies, StarterId } from '@/lib/types'

/**
 * The Codex roster. All original IP — no borrowed creatures, names or lore.
 *
 * `hue` and `archetype` feed the procedural sprite generator in
 * app/lib/sprite.ts, so adding a species here immediately gives it original
 * pixel art at all three stages with no asset pipeline.
 */

export type Archetype = 'beast' | 'wisp' | 'serpent' | 'moth'

export interface KindredDef extends KindredSpecies {
  archetype: Archetype
  /** Wild species only appear once the player's best streak clears this. */
  appearsAt: number
}

export const KINDRED: KindredDef[] = [
  {
    id: 'emberkin',
    dexNo: 1,
    stageNames: ['Emberkin', 'Kilnmaw', 'Forgewarden'],
    evolveAt: [7, 30],
    strength: 'Willpower',
    hue: 22,
    archetype: 'beast',
    rarity: 'common',
    isStarter: true,
    appearsAt: 0,
    dexEntry:
      'Runs hot. Sleeps in the ashes of things it decided not to do. Gets brighter the longer you hold the line.',
  },
  {
    id: 'tidewhelp',
    dexNo: 2,
    stageNames: ['Tidewhelp', 'Brinecaller', 'Deepsolace'],
    evolveAt: [7, 30],
    strength: 'Calm',
    hue: 194,
    archetype: 'serpent',
    rarity: 'common',
    isStarter: true,
    appearsAt: 0,
    dexEntry:
      'Breathes in fours, holds for seven, lets go for eight. Nobody has ever seen one panic.',
  },
  {
    id: 'mossling',
    dexNo: 3,
    stageNames: ['Mossling', 'Thornstead', 'Rootmonarch'],
    evolveAt: [7, 30],
    strength: 'Discipline',
    hue: 104,
    archetype: 'beast',
    rarity: 'common',
    isStarter: true,
    appearsAt: 0,
    dexEntry:
      'Grows a single ring per clean day. Cut one open and you can count exactly how stubborn it is.',
  },
  {
    id: 'idlewisp',
    dexNo: 4,
    stageNames: ['Idlewisp', 'Driftlamp', 'Beaconsoul'],
    evolveAt: [7, 30],
    strength: 'Purpose',
    hue: 188,
    archetype: 'wisp',
    rarity: 'common',
    isStarter: false,
    appearsAt: 2,
    dexEntry:
      'Drifts toward whoever has nothing to do. Harmless alone. Devastating in a long empty afternoon.',
  },
  {
    id: 'fogpup',
    dexNo: 5,
    stageNames: ['Fogpup', 'Misthound', 'Cloudreaver'],
    evolveAt: [7, 30],
    strength: 'Loyalty',
    hue: 262,
    archetype: 'beast',
    rarity: 'common',
    isStarter: false,
    appearsAt: 3,
    dexEntry:
      'Born in the Haze but refuses to serve it. Follows Breakers home and growls at the front door.',
  },
  {
    id: 'ashmoth',
    dexNo: 6,
    stageNames: ['Ashmoth', 'Cindermoth', 'Pyrewing'],
    evolveAt: [7, 30],
    strength: 'Patience',
    hue: 36,
    archetype: 'moth',
    rarity: 'common',
    isStarter: false,
    appearsAt: 4,
    dexEntry: 'Circles a craving for hours without landing on it. An excellent teacher.',
  },
  {
    id: 'snoozle',
    dexNo: 7,
    stageNames: ['Snoozle', 'Dozewyrm', 'Somnarch'],
    evolveAt: [7, 30],
    strength: 'Rest',
    hue: 232,
    archetype: 'serpent',
    rarity: 'common',
    isStarter: false,
    appearsAt: 5,
    dexEntry:
      'Only appears to Breakers who have stopped sleeping properly. Curls up on your chest until the ceiling gets boring.',
  },
  {
    id: 'knotwyrm',
    dexNo: 8,
    stageNames: ['Knotwyrm', 'Cordserpent', 'Unbinder'],
    evolveAt: [7, 30],
    strength: 'Release',
    hue: 158,
    archetype: 'serpent',
    rarity: 'uncommon',
    isStarter: false,
    appearsAt: 7,
    dexEntry: 'Ties itself in knots so you do not have to. Untangles one loop per slow breath.',
  },
  {
    id: 'lonefin',
    dexNo: 9,
    stageNames: ['Lonefin', 'Solowake', 'Tidechorus'],
    evolveAt: [7, 30],
    strength: 'Connection',
    hue: 208,
    archetype: 'serpent',
    rarity: 'uncommon',
    isStarter: false,
    appearsAt: 10,
    dexEntry:
      'Swims alone for years, then joins a chorus and never shuts up about it. Evolves only near other Breakers.',
  },
  {
    id: 'gigglespore',
    dexNo: 10,
    stageNames: ['Gigglespore', 'Chucklecap', 'Mirthbloom'],
    evolveAt: [7, 30],
    strength: 'Joy',
    hue: 304,
    archetype: 'wisp',
    rarity: 'uncommon',
    isStarter: false,
    appearsAt: 12,
    dexEntry:
      'Proof that a good night does not require the Haze. Blooms loudest at parties it was not invited to.',
  },
  {
    id: 'pressgang',
    dexNo: 11,
    stageNames: ['Pressgang', 'Crowdcoil', 'Chorusmaw'],
    evolveAt: [7, 30],
    strength: 'Boundaries',
    hue: 342,
    archetype: 'beast',
    rarity: 'uncommon',
    isStarter: false,
    appearsAt: 15,
    dexEntry:
      'Speaks in other people’s voices. Says "come on, one won’t hurt" in perfect impressions of your friends.',
  },
  {
    id: 'tickbell',
    dexNo: 12,
    stageNames: ['Tickbell', 'Chimewretch', 'Tollwarden'],
    evolveAt: [7, 30],
    strength: 'Timing',
    hue: 48,
    archetype: 'wisp',
    rarity: 'uncommon',
    isStarter: false,
    appearsAt: 18,
    dexEntry:
      'Rings once a day at the worst possible minute. Tamed Tollwardens ring at good minutes instead.',
  },
  {
    id: 'clinkrat',
    dexNo: 13,
    stageNames: ['Clinkrat', 'Coinchewer', 'Vaultgnash'],
    evolveAt: [7, 30],
    strength: 'Thrift',
    hue: 44,
    archetype: 'beast',
    rarity: 'uncommon',
    isStarter: false,
    appearsAt: 21,
    dexEntry:
      'Hoards every coin you did not spend on the Haze. By day sixty the pile is genuinely embarrassing.',
  },
  {
    id: 'lanternjack',
    dexNo: 14,
    stageNames: ['Lanternjack', 'Wickwraith', 'Hearthlord'],
    evolveAt: [7, 30],
    strength: 'Hope',
    hue: 40,
    archetype: 'wisp',
    rarity: 'rare',
    isStarter: false,
    appearsAt: 25,
    dexEntry: 'Carries a light it never lets go out, mostly out of spite.',
  },
  {
    id: 'grithound',
    dexNo: 15,
    stageNames: ['Grithound', 'Ironjaw', 'Bulwarkbeast'],
    evolveAt: [7, 30],
    strength: 'Endurance',
    hue: 14,
    archetype: 'beast',
    rarity: 'rare',
    isStarter: false,
    appearsAt: 30,
    dexEntry:
      'Has bitten through every excuse ever offered to it. Its jaw does not open again until day thirty.',
  },
  {
    id: 'hazelet',
    dexNo: 16,
    stageNames: ['Hazelet', 'Fogmaw', 'Murkcolossus'],
    evolveAt: [7, 30],
    strength: 'The Haze itself',
    hue: 278,
    archetype: 'moth',
    rarity: 'rare',
    isStarter: false,
    appearsAt: 45,
    dexEntry:
      'A piece of the Haze small enough to keep in your pocket. Some Breakers carry one as a reminder of the size of the thing.',
  },
  {
    id: 'clarion',
    dexNo: 17,
    stageNames: ['Clarion', 'Brightpeal', 'Dawnherald'],
    evolveAt: [7, 30],
    strength: 'Clarity',
    hue: 172,
    archetype: 'moth',
    rarity: 'mythic',
    isStarter: false,
    appearsAt: 90,
    dexEntry:
      'Only visible above the fog line. Breakers who reach Clearsummit say it was following them the entire way up.',
  },
]

export const STARTERS = KINDRED.filter((k) => k.isStarter) as (KindredDef & { id: StarterId })[]

export function speciesById(id: string): KindredDef | undefined {
  return KINDRED.find((k) => k.id === id)
}

export function speciesName(id: string, stage: 1 | 2 | 3): string {
  const s = speciesById(id)
  return s ? s.stageNames[stage - 1] : 'Unknown'
}

/** Wild pool available to a Breaker at their current progress. */
export function wildPool(bestStreak: number): KindredDef[] {
  return KINDRED.filter((k) => !k.isStarter && bestStreak >= k.appearsAt)
}

const RARITY_WEIGHT: Record<KindredSpecies['rarity'], number> = {
  common: 60,
  uncommon: 25,
  rare: 12,
  mythic: 3,
}

/** Weighted pick from the wild pool. `rand` is injectable so tests stay stable. */
export function rollWild(bestStreak: number, rand: () => number = Math.random): KindredDef | null {
  const pool = wildPool(bestStreak)
  if (pool.length === 0) return null
  const total = pool.reduce((sum, k) => sum + RARITY_WEIGHT[k.rarity], 0)
  let roll = rand() * total
  for (const k of pool) {
    roll -= RARITY_WEIGHT[k.rarity]
    if (roll <= 0) return k
  }
  return pool[pool.length - 1]
}
