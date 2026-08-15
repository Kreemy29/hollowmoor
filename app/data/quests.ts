import type { Quest } from '@/lib/types'
import { seedFrom } from './ai-lines'

/**
 * The Restwick notice board. Three daily quests and one weekly, rotated
 * deterministically from the date so every device shows the same board and
 * nobody can reroll for an easier one.
 */
export const QUESTS: Quest[] = [
  { id: 'q-checkin', title: 'Report to the Rest Stop', description: 'Check in today, either way. Honest counts.', kind: 'checkin', target: 1, gritReward: 25, cadence: 'daily' },
  { id: 'q-breath', title: 'Dive the Lowtide', description: 'Complete two rounds of Breath of the Deep.', kind: 'minigame', target: 2, gritReward: 35, cadence: 'daily' },
  { id: 'q-crusher', title: 'Clear the Fogbank', description: 'Pop 40 Haze bubbles in Craving Crusher.', kind: 'minigame', target: 40, gritReward: 35, cadence: 'daily' },
  { id: 'q-memory', title: 'Walk the Old Streets', description: 'Finish one round of Memory of Restwick.', kind: 'minigame', target: 1, gritReward: 30, cadence: 'daily' },
  { id: 'q-delve', title: 'Descend', description: 'Hold one full Focus Delve without leaving.', kind: 'minigame', target: 1, gritReward: 90, cadence: 'daily' },
  { id: 'q-square', title: 'Show Your Face', description: 'Appear in the town square while someone else is there.', kind: 'social', target: 1, gritReward: 30, cadence: 'daily' },
  { id: 'q-chat', title: 'Say Something', description: 'Post once in any channel. Trash talk qualifies.', kind: 'social', target: 1, gritReward: 25, cadence: 'daily' },
  { id: 'q-hype', title: 'Back Someone Up', description: 'React to a friend’s check-in.', kind: 'social', target: 1, gritReward: 30, cadence: 'daily' },
  { id: 'q-craving', title: 'Beat One Down', description: 'Use the Craving Now button and finish the run.', kind: 'minigame', target: 1, gritReward: 40, cadence: 'daily' },

  { id: 'wq-week-clean', title: 'A Clean Week', description: 'Log five clean days this week.', kind: 'checkin', target: 5, gritReward: 220, cadence: 'weekly' },
  { id: 'wq-raid', title: 'Hurt the Titan', description: 'Deal 500 damage to the Haze Titan this week.', kind: 'raid', target: 500, gritReward: 260, cadence: 'weekly' },
  { id: 'wq-games', title: 'Regular at the Arcade', description: 'Finish ten minigame runs this week.', kind: 'minigame', target: 10, gritReward: 200, cadence: 'weekly' },
]

const DAILY = QUESTS.filter((q) => q.cadence === 'daily')
const WEEKLY = QUESTS.filter((q) => q.cadence === 'weekly')

/** Three dailies for a given local date, stable for everyone on that date. */
export function dailyQuests(date: string): Quest[] {
  const seed = Math.abs(seedFrom(date))
  const picked: Quest[] = []
  const pool = [...DAILY]
  for (let i = 0; i < 3 && pool.length > 0; i += 1) {
    const idx = (seed >> (i * 4)) % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

export function weeklyQuest(weekKeyValue: string): Quest {
  return WEEKLY[Math.abs(seedFrom(weekKeyValue)) % WEEKLY.length]
}

export function questById(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id)
}
