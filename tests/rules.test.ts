import { describe, expect, it } from 'vitest'
import {
  applyCheckin,
  canCheckInToday,
  daysToNextStage,
  eligibleBadges,
  gritForCleanDay,
  gritForRelapse,
  initialStreaks,
  isMilestone,
  lapsedStreak,
  shouldGrantFreezeToken,
  stageForStreak,
  unlockedRoutes,
} from '@/lib/rules'
import { weekKey } from '@/lib/time'
import type { Streaks } from '@/lib/types'

/**
 * The rulebook is the game. If these break, Hollowmoor stops being fair —
 * or worse, stops being honest.
 */

function streaks(patch: Partial<Streaks> = {}): Streaks {
  return { ...initialStreaks(0), ...patch }
}

describe('evolution gates', () => {
  it('stages at 7 and 30 days', () => {
    expect(stageForStreak(0)).toBe(1)
    expect(stageForStreak(6)).toBe(1)
    expect(stageForStreak(7)).toBe(2)
    expect(stageForStreak(29)).toBe(2)
    expect(stageForStreak(30)).toBe(3)
    expect(stageForStreak(400)).toBe(3)
  })

  it('counts down to the next stage and stops at max', () => {
    expect(daysToNextStage(0)).toBe(7)
    expect(daysToNextStage(6)).toBe(1)
    expect(daysToNextStage(7)).toBe(23)
    expect(daysToNextStage(30)).toBeNull()
  })
})

describe('clean check-in', () => {
  it('advances the streak and evolves on the gate day', () => {
    const before = streaks({ currentStreak: 6, bestStreak: 6, lastCheckinDate: '2026-08-15' })
    const after = applyCheckin(before, 1, 'clean', '2026-08-16')
    expect(after.streaks.currentStreak).toBe(7)
    expect(after.streaks.bestStreak).toBe(7)
    expect(after.streaks.totalCleanDays).toBe(1)
    expect(after.stageTo).toBe(2)
    expect(after.dimmed).toBe(false)
  })

  it('never lowers the companion stage on a clean day', () => {
    // Rebuilding after a relapse: streak is 1 but the Kindred is still stage 2.
    const after = applyCheckin(
      streaks({ currentStreak: 0, lastCheckinDate: '2026-08-15' }),
      2,
      'clean',
      '2026-08-16',
    )
    expect(after.stageTo).toBe(2)
  })

  it('wakes a dimmed Kindred', () => {
    const after = applyCheckin(streaks({ lastCheckinDate: '2026-08-15' }), 2, 'clean', '2026-08-16')
    expect(after.dimmed).toBe(false)
  })
})

describe('relapse', () => {
  it('resets the streak and dims exactly one stage', () => {
    const before = streaks({ currentStreak: 45, bestStreak: 45, lastCheckinDate: '2026-08-15' })
    const after = applyCheckin(before, 3, 'relapse', '2026-08-16')
    expect(after.streaks.currentStreak).toBe(0)
    expect(after.streaks.relapseCount).toBe(1)
    expect(after.stageTo).toBe(2)
    expect(after.dimmed).toBe(true)
  })

  it('never drops below stage 1 — the Kindred sleeps, it does not die', () => {
    const after = applyCheckin(streaks({ currentStreak: 2 }), 1, 'relapse', '2026-08-16')
    expect(after.stageTo).toBe(1)
    expect(after.dimmed).toBe(true)
  })

  it('preserves the best streak as a permanent record', () => {
    const before = streaks({ currentStreak: 90, bestStreak: 90 })
    const after = applyCheckin(before, 3, 'relapse', '2026-08-16')
    expect(after.streaks.bestStreak).toBe(90)
  })

  it('still pays Grit, so honesty is never the expensive option', () => {
    expect(gritForRelapse().total).toBeGreaterThan(0)
  })
})

describe('freeze tokens', () => {
  it('holds the streak without advancing it and spends a token', () => {
    const before = streaks({ currentStreak: 12, freezeTokens: 2, lastCheckinDate: '2026-08-15' })
    const after = applyCheckin(before, 2, 'freeze', '2026-08-16')
    expect(after.streaks.currentStreak).toBe(12)
    expect(after.streaks.totalCleanDays).toBe(0)
    expect(after.streaks.freezeTokens).toBe(1)
    expect(after.dimmed).toBe(false)
  })

  it('grants roughly one per week and caps the stockpile', () => {
    expect(shouldGrantFreezeToken(streaks({ currentStreak: 3 }), '2026-08-16')).toBe(true)
    expect(
      shouldGrantFreezeToken(
        streaks({ freezeTokens: 1, lastFreezeGrant: '2026-08-15' }),
        '2026-08-16',
      ),
    ).toBe(false)
    expect(
      shouldGrantFreezeToken(
        streaks({ freezeTokens: 1, lastFreezeGrant: '2026-08-09' }),
        '2026-08-16',
      ),
    ).toBe(true)
    expect(
      shouldGrantFreezeToken(
        streaks({ freezeTokens: 3, lastFreezeGrant: '2026-01-01' }),
        '2026-08-16',
      ),
    ).toBe(false)
  })
})

describe('missed days', () => {
  it('lapses the streak after a gap with no check-in', () => {
    const before = streaks({ currentStreak: 20, lastCheckinDate: '2026-08-10' })
    expect(lapsedStreak(before, '2026-08-16').currentStreak).toBe(0)
  })

  it('leaves a same-day or next-day check-in alone', () => {
    const before = streaks({ currentStreak: 20, lastCheckinDate: '2026-08-15' })
    expect(lapsedStreak(before, '2026-08-16').currentStreak).toBe(20)
  })

  it('blocks a second check-in on the same local day', () => {
    expect(canCheckInToday(streaks({ lastCheckinDate: '2026-08-16' }), '2026-08-16')).toBe(false)
    expect(canCheckInToday(streaks({ lastCheckinDate: '2026-08-15' }), '2026-08-16')).toBe(true)
  })
})

describe('grit', () => {
  it('scales with the streak but caps the bonus', () => {
    // Compared between non-milestone days: day 1 carries a milestone bonus and
    // would otherwise out-earn a longer streak.
    const day2 = gritForCleanDay(2).total
    const day10 = gritForCleanDay(10).total
    const day100 = gritForCleanDay(100).total
    expect(day10).toBeGreaterThan(day2)
    expect(day100).toBeGreaterThan(day10)
    // The streak bonus is capped, so a very long streak can't run away with it.
    expect(day100).toBeLessThan(day10 + 100)
  })

  it('pays a milestone bonus on milestone days only', () => {
    expect(isMilestone(30)).toBe(true)
    expect(isMilestone(31)).toBe(false)
    expect(gritForCleanDay(30).total).toBeGreaterThan(gritForCleanDay(31).total)
  })
})

describe('badges and routes', () => {
  it('gates trials on the current streak', () => {
    const eligible = eligibleBadges(streaks({ currentStreak: 7 }), new Set())
    expect(eligible.map((b) => b.id)).toContain('trial-stress')
    expect(eligible.map((b) => b.id)).not.toContain('trial-loneliness')
  })

  it('does not re-offer an earned badge', () => {
    const eligible = eligibleBadges(streaks({ currentStreak: 7 }), new Set(['trial-boredom']))
    expect(eligible.map((b) => b.id)).not.toContain('trial-boredom')
  })

  it('unlocks routes on the best streak so progress is never taken back', () => {
    expect(unlockedRoutes(0).map((r) => r.id)).toEqual(['fogmouth'])
    expect(unlockedRoutes(14).map((r) => r.id)).toContain('hollow-market')
    expect(unlockedRoutes(14).map((r) => r.id)).not.toContain('the-long-dark')
  })
})

describe('seeded starts', () => {
  it('carries an honest head start without burning today’s check-in', () => {
    const seeded = initialStreaks(45, '2026-08-16')
    expect(seeded.currentStreak).toBe(45)
    expect(seeded.bestStreak).toBe(45)
    expect(canCheckInToday(seeded, '2026-08-16')).toBe(true)
    // And the next clean day continues the run rather than lapsing it.
    expect(lapsedStreak(seeded, '2026-08-16').currentStreak).toBe(45)
  })
})

describe('week keys', () => {
  it('buckets a Fri→Sun weekend into one week', () => {
    expect(weekKey('2026-08-14')).toBe(weekKey('2026-08-16')) // Fri and Sun
    expect(weekKey('2026-08-16')).not.toBe(weekKey('2026-08-17')) // Sun vs Mon
  })
})
