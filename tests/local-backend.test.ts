import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalBackend } from '@/lib/backend/local'
import type { Backend } from '@/lib/backend/types'

/**
 * An end-to-end run through the offline backend with a controllable clock:
 * onboard, build a streak, evolve, slip, rebuild. This is the journey the app
 * actually puts someone through, so it's the one worth simulating.
 */

const TZ = 'UTC'

function setDay(day: string) {
  vi.setSystemTime(new Date(`${day}T10:00:00Z`))
}

async function newBreaker(seedDays = 0): Promise<Backend> {
  const backend = createLocalBackend()
  await backend.auth.createGuest({
    handle: 'test_breaker',
    avatar: { skin: 0, hair: 0, outfit: 0, accessory: 0, accent: '#14e0bd' },
    starter: 'emberkin',
    seedDays,
    timezone: TZ,
  })
  return backend
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  setDay('2026-08-01')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('onboarding', () => {
  it('creates a Breaker with a companion and a friend code', async () => {
    const backend = await newBreaker()
    const snap = await backend.game.snapshot()
    expect(snap).not.toBeNull()
    expect(snap!.profile.handle).toBe('test_breaker')
    expect(snap!.profile.friendCode).toMatch(/^HM-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(snap!.kindred).toHaveLength(1)
    expect(snap!.kindred[0].isCompanion).toBe(true)
    expect(snap!.kindred[0].stage).toBe(1)
  })

  it('defaults sound to off', async () => {
    const backend = await newBreaker()
    const snap = await backend.game.snapshot()
    expect(snap!.profile.settings.audioEnabled).toBe(false)
  })

  it('gives an honest head start its earned evolution stage', async () => {
    const backend = await newBreaker(45)
    const snap = await backend.game.snapshot()
    expect(snap!.streaks.currentStreak).toBe(45)
    expect(snap!.kindred[0].stage).toBe(3)
  })
})

describe('the daily loop', () => {
  it('builds a streak, evolves at day 7, and pays Grit', async () => {
    const backend = await newBreaker()
    const startingGrit = (await backend.game.snapshot())!.grit

    let evolvedOn: number | null = null
    for (let day = 1; day <= 7; day += 1) {
      setDay(`2026-08-0${day}`)
      const outcome = await backend.game.checkIn({ result: 'clean' })
      expect(outcome.streaks.currentStreak).toBe(day)
      if (outcome.evolution?.direction === 'evolve') evolvedOn = day
    }

    expect(evolvedOn).toBe(7)
    const snap = await backend.game.snapshot()
    expect(snap!.kindred[0].stage).toBe(2)
    expect(snap!.streaks.bestStreak).toBe(7)
    expect(snap!.streaks.totalCleanDays).toBe(7)
    expect(snap!.grit).toBeGreaterThan(startingGrit)
  })

  it('refuses a second check-in on the same day', async () => {
    const backend = await newBreaker()
    await backend.game.checkIn({ result: 'clean' })
    await expect(backend.game.checkIn({ result: 'clean' })).rejects.toThrow(/already checked in/i)
  })

  it('dims one stage on a relapse and wakes on the next clean day', async () => {
    const backend = await newBreaker()
    for (let day = 1; day <= 7; day += 1) {
      setDay(`2026-08-0${day}`)
      await backend.game.checkIn({ result: 'clean' })
    }

    setDay('2026-08-08')
    const slip = await backend.game.checkIn({ result: 'relapse', triggerTag: 'stress' })
    expect(slip.streaks.currentStreak).toBe(0)
    expect(slip.evolution).toEqual({ from: 2, to: 1, direction: 'dim' })
    expect(slip.gritEarned).toBeGreaterThan(0) // honesty still pays

    let snap = await backend.game.snapshot()
    expect(snap!.kindred[0].dimmed).toBe(true)
    expect(snap!.streaks.bestStreak).toBe(7) // the record survives

    setDay('2026-08-09')
    await backend.game.checkIn({ result: 'clean' })
    snap = await backend.game.snapshot()
    expect(snap!.kindred[0].dimmed).toBe(false)
    expect(snap!.streaks.currentStreak).toBe(1)
  })

  it('logs the trigger tag so patterns can be surfaced later', async () => {
    const backend = await newBreaker()
    await backend.game.checkIn({ result: 'relapse', triggerTag: 'payday', note: 'got paid' })
    const history = await backend.game.history()
    expect(history[0].triggerTag).toBe('payday')
    expect(history[0].note).toBe('got paid')
  })

  it('lapses a streak when days are skipped entirely', async () => {
    const backend = await newBreaker()
    setDay('2026-08-01')
    await backend.game.checkIn({ result: 'clean' })
    setDay('2026-08-02')
    await backend.game.checkIn({ result: 'clean' })

    setDay('2026-08-10') // a week of silence
    const outcome = await backend.game.checkIn({ result: 'clean' })
    expect(outcome.streaks.currentStreak).toBe(1)
    expect(outcome.streaks.bestStreak).toBe(2)
  })
})

describe('economy', () => {
  it('will not sell an item you cannot afford', async () => {
    const backend = await newBreaker()
    await expect(backend.game.buyItem('accent-gold')).rejects.toThrow(/not enough grit/i)
  })

  it('spends Grit and grants a freeze token for the utility item', async () => {
    const backend = await newBreaker()
    // Earn enough to shop with.
    for (let day = 1; day <= 9; day += 1) {
      setDay(`2026-08-0${day}`)
      await backend.game.checkIn({ result: 'clean' })
    }
    const before = await backend.game.snapshot()
    const tokensBefore = before!.streaks.freezeTokens

    await backend.game.buyItem('freeze-token')
    const after = await backend.game.snapshot()
    expect(after!.grit).toBe(before!.grit - 260)
    expect(after!.streaks.freezeTokens).toBe(tokensBefore + 1)
  })

  it('caps minigame payouts so the shop cannot be farmed', async () => {
    const backend = await newBreaker()
    const huge = await backend.game.submitMinigame({
      game: 'crusher',
      score: 100_000,
      durationSec: 45,
    })
    expect(huge.gritEarned).toBeLessThanOrEqual(120)
  })
})

describe('quests', () => {
  it('advances a check-in quest and pays out once', async () => {
    const backend = await newBreaker()
    const { defs } = await backend.game.quests()
    const checkinQuest = defs.find((d) => d.kind === 'checkin' && d.cadence === 'daily')

    await backend.game.checkIn({ result: 'clean' })

    if (checkinQuest) {
      const { progress } = await backend.game.quests()
      const row = progress.find((p) => p.questId === checkinQuest.id)
      expect(row?.progress).toBeGreaterThanOrEqual(1)
      await backend.game.claimQuest(checkinQuest.id)
      await expect(backend.game.claimQuest(checkinQuest.id)).rejects.toThrow(/already claimed/i)
    }
  })
})

describe('data ownership', () => {
  it('exports everything and deletes everything on request', async () => {
    const backend = await newBreaker()
    await backend.game.checkIn({ result: 'clean' })

    const exported = (await backend.auth.exportData()) as { checkins: unknown[] }
    expect(exported.checkins).toHaveLength(1)

    await backend.auth.deleteAccount()
    expect(await backend.game.snapshot()).toBeNull()
  })
})

describe('the voice', () => {
  it('always has a line, with no API key and no network', async () => {
    const backend = await newBreaker()
    const daily = await backend.ai.daily()
    expect(daily.source).toBe('fallback')
    expect(daily.dealer.length).toBeGreaterThan(0)
    expect(daily.vale.length).toBeGreaterThan(0)
  })

  it('surfaces a nudge once a trigger repeats', async () => {
    const backend = await newBreaker()
    setDay('2026-08-01')
    await backend.game.checkIn({ result: 'relapse', triggerTag: 'payday' })
    setDay('2026-08-03')
    await backend.game.checkIn({ result: 'relapse', triggerTag: 'payday' })

    const daily = await backend.ai.daily()
    expect(daily.nudge).toBeTruthy()
  })
})
