import type { AvatarConfig, PublicPlayer } from '@/lib/types'
import { seedFrom } from './ai-lines'
import { daysBetween } from '@/lib/time'

/**
 * Echo Breakers — the offline stand-ins.
 *
 * With no Supabase project the multiplayer screens would be empty rooms, and an
 * empty room is the fastest way to make an app feel dead. Echoes fill the
 * square, the leaderboard and the raid so every phase is playable and reviewable
 * from `npm run dev` alone. They are labelled "echo" everywhere they appear —
 * the UI never passes them off as real people.
 */

export interface EchoBreaker {
  id: string
  handle: string
  avatar: AvatarConfig
  /** Streak on day zero; drifts forward with real time from `origin`. */
  baseStreak: number
  /** How often this echo "relapses", in days. Nobody is perfect, not even a bot. */
  relapseEvery: number
  companion: string
  lines: string[]
}

export const ECHOES: EchoBreaker[] = [
  {
    id: 'echo-fen',
    handle: 'fen_the_flat_no',
    avatar: { skin: 2, hair: 1, outfit: 3, accessory: 0, accent: '#14e0bd' },
    baseStreak: 41,
    relapseEvery: 0,
    companion: 'tidewhelp',
    lines: [
      'day 41. the bell rang and I ignored it like a champion',
      'anyone else find evenings weirdly long now',
      'breath of the deep before bed. genuinely works, I hate it',
    ],
  },
  {
    id: 'echo-marrow',
    handle: 'marrow',
    avatar: { skin: 4, hair: 3, outfit: 1, accessory: 2, accent: '#ff7a2f' },
    baseStreak: 17,
    relapseEvery: 23,
    companion: 'emberkin',
    lines: [
      'kilnmaw evolved. it is enormous. I am emotional',
      'payday tomorrow, someone yell at me',
      'the dealer said something rude about my streak and honestly? fair',
    ],
  },
  {
    id: 'echo-quill',
    handle: 'quill.exe',
    avatar: { skin: 0, hair: 4, outfit: 2, accessory: 1, accent: '#9a80ff' },
    baseStreak: 88,
    relapseEvery: 0,
    companion: 'mossling',
    lines: [
      'council spire unlocked. taking applications for a raid team',
      '88 days. the first 9 were the whole battle',
      'focus delve twice today. rootmonarch is glowing',
    ],
  },
  {
    id: 'echo-tam',
    handle: 'tamsin_v',
    avatar: { skin: 3, hair: 0, outfit: 0, accessory: 3, accent: '#ffb020' },
    baseStreak: 6,
    relapseEvery: 14,
    companion: 'tidewhelp',
    lines: [
      'day 6 and my brinecaller is ONE DAY away, do not perceive me',
      'craving now button has been earning its keep tonight',
      'reset on saturday. back on it. whatever',
    ],
  },
  {
    id: 'echo-bram',
    handle: 'bram_hollow',
    avatar: { skin: 1, hair: 2, outfit: 4, accessory: 0, accent: '#f6f2ea' },
    baseStreak: 132,
    relapseEvery: 0,
    companion: 'mossling',
    lines: [
      'titan is at 40%. get in there',
      'four months. the trick was making saturday boring on purpose',
      'someone contested my streak lmao. check the ledger, ranger',
    ],
  },
  {
    id: 'echo-nix',
    handle: 'nixwave',
    avatar: { skin: 5, hair: 1, outfit: 2, accessory: 4, accent: '#58f5da' },
    baseStreak: 2,
    relapseEvery: 9,
    companion: 'emberkin',
    lines: [
      'day 2. day 2 is such a stupid day',
      'ok the memory game is actually fun, I was not expecting that',
      'starting over AGAIN but starting over today not monday',
    ],
  },
]

/** Reference date the echo streaks are measured from. */
const ORIGIN = '2026-01-01'

/**
 * An echo's streak on a given day: it climbs with real time, and if the echo
 * has a relapse cycle it periodically drops to zero and rebuilds.
 */
export function echoStreak(echo: EchoBreaker, today: string): number {
  const elapsed = Math.max(0, daysBetween(ORIGIN, today))
  const raw = echo.baseStreak + elapsed
  if (echo.relapseEvery <= 0) return raw
  return raw % echo.relapseEvery
}

export function echoAsPublic(echo: EchoBreaker, today: string): PublicPlayer {
  const streak = echoStreak(echo, today)
  return {
    id: echo.id,
    handle: echo.handle,
    avatar: echo.avatar,
    currentStreak: streak,
    bestStreak: Math.max(streak, echo.baseStreak),
    companionSpeciesId: echo.companion,
    companionStage: streak >= 30 ? 3 : streak >= 7 ? 2 : 1,
    contested: false,
    lastSeen: new Date().toISOString(),
  }
}

/** Deterministic "is this echo currently in the square" so presence feels real. */
export function echoOnline(echo: EchoBreaker, minuteBucket: number): boolean {
  const s = Math.abs(seedFrom(`${echo.id}:${Math.floor(minuteBucket / 7)}`))
  return s % 10 < 6
}

export function echoPosition(echo: EchoBreaker, minuteBucket: number): { x: number; y: number } {
  const s = Math.abs(seedFrom(`${echo.id}:pos:${Math.floor(minuteBucket / 3)}`))
  return { x: 0.12 + ((s % 76) / 100), y: 0.35 + (((s >> 8) % 50) / 100) }
}

export function isEcho(id: string): boolean {
  return id.startsWith('echo-')
}
