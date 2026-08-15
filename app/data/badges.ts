import type { Badge } from '@/lib/types'

/**
 * The eight Trigger Trials, then the endgame.
 *
 * Every trial is named for a real relapse trigger, gated on a streak, and
 * cleared by a themed minigame — so the badge is earned by both showing up and
 * playing well, not by waiting.
 */
export const BADGES: Badge[] = [
  {
    id: 'trial-boredom',
    order: 1,
    name: 'The Empty Hour',
    trigger: 'boredom',
    requiredStreak: 3,
    trialGame: 'memory',
    trialTarget: 8,
    kind: 'trial',
    blurb:
      'Ashen Verge. Nothing to do and all day to do it. Clear the Verge without wandering back to the bench.',
  },
  {
    id: 'trial-stress',
    order: 2,
    name: 'The Unclenching',
    trigger: 'stress',
    requiredStreak: 7,
    trialGame: 'breath',
    trialTarget: 4,
    kind: 'trial',
    blurb: 'Lowtide Steps. Four full breaths with the tide. Your shoulders come down or you fail.',
  },
  {
    id: 'trial-loneliness',
    order: 3,
    name: 'The Long Table',
    trigger: 'loneliness',
    requiredStreak: 14,
    trialGame: 'memory',
    trialTarget: 12,
    kind: 'trial',
    blurb:
      'An empty room remembers everyone who left it. Match the faces before the lamps go out.',
  },
  {
    id: 'trial-celebration',
    order: 4,
    name: 'The Good Night',
    trigger: 'celebration',
    requiredStreak: 21,
    trialGame: 'crusher',
    trialTarget: 60,
    kind: 'trial',
    blurb: 'Hollow Market at full volume. Prove a good night does not need the Haze in it.',
  },
  {
    id: 'trial-sleeplessness',
    order: 5,
    name: 'The Ceiling',
    trigger: 'sleeplessness',
    requiredStreak: 30,
    trialGame: 'breath',
    trialTarget: 6,
    kind: 'trial',
    blurb: 'The Long Dark, 3am. You cannot sleep your way out. You can breathe your way out.',
  },
  {
    id: 'trial-peer-pressure',
    order: 6,
    name: 'The Flat No',
    trigger: 'peer_pressure',
    requiredStreak: 45,
    trialGame: 'crusher',
    trialTarget: 90,
    kind: 'trial',
    blurb:
      'Gutter & Lantern. Old faces, same bench, same offer. Say no ninety times without explaining yourself once.',
  },
  {
    id: 'trial-bell',
    order: 7,
    name: 'The Bell Unrung',
    trigger: 'the_bell',
    requiredStreak: 60,
    trialGame: 'delve',
    trialTarget: 1,
    kind: 'trial',
    blurb:
      'Bellfield. It rings at the same wrong minute every day. Stay in the delve until it stops mattering.',
  },
  {
    id: 'trial-payday',
    order: 8,
    name: 'The Full Pocket',
    trigger: 'payday',
    requiredStreak: 75,
    trialGame: 'crusher',
    trialTarget: 120,
    kind: 'trial',
    blurb: 'Coinfall. Money in hand and a bad idea in reach. Spend it on absolutely anything else.',
  },
  {
    id: 'council-first',
    order: 9,
    name: 'First Seat',
    trigger: 'endgame',
    requiredStreak: 90,
    trialGame: 'delve',
    trialTarget: 1,
    kind: 'council',
    blurb: 'The Haze Council convenes. The first seat is filled by the version of you from day one.',
  },
  {
    id: 'council-second',
    order: 10,
    name: 'Second Seat',
    trigger: 'endgame',
    requiredStreak: 180,
    trialGame: 'delve',
    trialTarget: 2,
    kind: 'council',
    blurb: 'The second seat argues that you were more fun before. It is lying, and it is loud.',
  },
  {
    id: 'council-third',
    order: 11,
    name: 'Third Seat',
    trigger: 'endgame',
    requiredStreak: 270,
    trialGame: 'delve',
    trialTarget: 3,
    kind: 'council',
    blurb: 'The last seat is empty. It has been waiting for you to sit in it and change your mind.',
  },
  {
    id: 'champion',
    order: 12,
    name: 'Champion of Clearsummit',
    trigger: 'endgame',
    requiredStreak: 365,
    trialGame: 'breath',
    trialTarget: 8,
    kind: 'champion',
    blurb: 'Three hundred and sixty-five days. Above the fog line. You can see the whole region.',
  },
]

export function badgeFor(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id)
}

export const TRIALS = BADGES.filter((b) => b.kind === 'trial')
