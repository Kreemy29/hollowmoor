import type { MinigameId } from '@/lib/types'

export interface GameProps {
  /** Called when a run completes. The shell handles Grit, catches and quests. */
  onFinish: (result: { score: number; durationSec: number }) => void
  /** Called when the player backs out. No reward, no guilt. */
  onQuit: () => void
  /** True when launched from the panic button rather than the arcade. */
  fromCraving?: boolean
}

export interface GameMeta {
  id: MinigameId
  name: string
  tagline: string
  /** What it's actually good for, in plain language. */
  purpose: string
  glyph: string
  /** Roughly how long a run takes, for the arcade cards. */
  minutes: string
}

export const GAME_META: GameMeta[] = [
  {
    id: 'crusher',
    name: 'Craving Crusher',
    tagline: 'Smash the Haze before it reaches the top.',
    purpose: 'Fast physical distraction. Best when the urge is loud and right now.',
    glyph: '💥',
    minutes: '45s',
  },
  {
    id: 'breath',
    name: 'Breath of the Deep',
    tagline: 'Dive with your Kindred on a four-seven-eight count.',
    purpose: 'Actually calms your nervous system. Best for stress and 3am.',
    glyph: '🫧',
    minutes: '2 min',
  },
  {
    id: 'memory',
    name: 'Memory of Restwick',
    tagline: 'Match the Kindred before the lamps go out.',
    purpose: 'Occupies the part of your brain that was about to negotiate.',
    glyph: '🃏',
    minutes: '2 min',
  },
  {
    id: 'delve',
    name: 'Focus Delve',
    tagline: 'Twenty-five minutes down. Stay for the rare loot.',
    purpose: 'A real focus block. Ties the app to something outside it.',
    glyph: '🕯',
    minutes: '25 min',
  },
]

export function gameMeta(id: MinigameId): GameMeta {
  return GAME_META.find((g) => g.id === id) ?? GAME_META[0]
}
