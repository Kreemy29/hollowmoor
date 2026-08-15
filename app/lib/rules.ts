import type {
  Badge,
  CheckinResult,
  LocalDate,
  Streaks,
  UserKindred,
} from './types'
import { BADGES } from '@/data/badges'
import { addDays, daysBetween } from './time'

/**
 * The rulebook. Every number that decides how Hollowmoor feels lives here, and
 * nowhere else — the local backend runs these functions directly, and the
 * Postgres `hm_checkin` RPC mirrors them exactly (see the migration). If you
 * retune a reward, retune both.
 */

export const EVOLVE_AT: [number, number] = [7, 30]

/** Days at which we throw a celebration. */
export const MILESTONES = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365]

/** Cumulative XP at which each stage begins. Index = stage - 1. */
export const XP_PER_STAGE: number[] = [0, 700, 3000]

/** Grit tuning. Deliberately generous early — week one is where people quit. */
const GRIT_BASE_CLEAN = 15
const GRIT_STREAK_BONUS_PER_DAY = 2
const GRIT_STREAK_BONUS_CAP = 40
const GRIT_MILESTONE = 120
const GRIT_COMEBACK = 10 // paid for logging an honest relapse — honesty is rewarded

export function stageForStreak(streak: number): 1 | 2 | 3 {
  if (streak >= EVOLVE_AT[1]) return 3
  if (streak >= EVOLVE_AT[0]) return 2
  return 1
}

/**
 * Days until the companion's next evolution, or null when fully grown.
 * Drives the "3 days from evolving" hook on the dashboard.
 */
export function daysToNextStage(streak: number): number | null {
  if (streak < EVOLVE_AT[0]) return EVOLVE_AT[0] - streak
  if (streak < EVOLVE_AT[1]) return EVOLVE_AT[1] - streak
  return null
}

/** Breaker rank. Slower than the streak so it keeps meaning past day 30. */
export function breakerLevel(totalCleanDays: number, bestStreak: number): number {
  return 1 + Math.floor(totalCleanDays / 3) + Math.floor(bestStreak / 5)
}

export function nextMilestone(streak: number): number | null {
  return MILESTONES.find((m) => m > streak) ?? null
}

export function isMilestone(streak: number): boolean {
  return MILESTONES.includes(streak)
}

export function xpForCleanDay(streak: number): number {
  return 40 + Math.min(streak, 30) * 4
}

/** XP progress inside the current stage, for the dashboard bar. */
export function stageProgress(k: UserKindred): { current: number; needed: number; pct: number } {
  const floor = XP_PER_STAGE[k.stage - 1] ?? 0
  const ceiling = XP_PER_STAGE[k.stage]
  // Final stage: nothing left to fill, so the bar reads as complete.
  if (ceiling === undefined) return { current: k.xp, needed: 0, pct: 1 }
  const current = Math.max(0, k.xp - floor)
  const span = Math.max(1, ceiling - floor)
  return { current, needed: span, pct: Math.max(0, Math.min(1, current / span)) }
}

export function gritForCleanDay(newStreak: number): {
  total: number
  breakdown: { label: string; amount: number }[]
} {
  const breakdown: { label: string; amount: number }[] = [
    { label: 'Clean day', amount: GRIT_BASE_CLEAN },
  ]
  const streakBonus = Math.min((newStreak - 1) * GRIT_STREAK_BONUS_PER_DAY, GRIT_STREAK_BONUS_CAP)
  if (streakBonus > 0) breakdown.push({ label: `Streak x${newStreak}`, amount: streakBonus })
  if (isMilestone(newStreak)) {
    breakdown.push({ label: `Day ${newStreak} milestone`, amount: GRIT_MILESTONE })
  }
  return { total: breakdown.reduce((a, b) => a + b.amount, 0), breakdown }
}

export function gritForRelapse(): { total: number; breakdown: { label: string; amount: number }[] } {
  // You still get paid for telling the truth. The app only works if honest
  // logging never feels worse than lying, so the comeback has a floor.
  return {
    total: GRIT_COMEBACK,
    breakdown: [{ label: 'Told the truth', amount: GRIT_COMEBACK }],
  }
}

/**
 * A missed day is not a relapse — but it does break the chain. If the player
 * last checked in more than one day ago and has no freeze covering the gap,
 * the streak lapses back to zero before today's check-in is applied.
 */
export function lapsedStreak(streaks: Streaks, today: LocalDate): Streaks {
  if (!streaks.lastCheckinDate) return streaks
  const gap = daysBetween(streaks.lastCheckinDate, today)
  if (gap <= 1) return streaks
  return { ...streaks, currentStreak: 0 }
}

export function canCheckInToday(streaks: Streaks, today: LocalDate): boolean {
  return streaks.lastCheckinDate !== today
}

/** ~1 freeze token per week, capped so they can't be hoarded into immunity. */
export const FREEZE_TOKEN_CAP = 3
const FREEZE_GRANT_INTERVAL_DAYS = 7

export function shouldGrantFreezeToken(streaks: Streaks, today: LocalDate): boolean {
  if (streaks.freezeTokens >= FREEZE_TOKEN_CAP) return false
  if (!streaks.lastFreezeGrant) return streaks.currentStreak >= 3
  return daysBetween(streaks.lastFreezeGrant, today) >= FREEZE_GRANT_INTERVAL_DAYS
}

export interface StreakTransition {
  streaks: Streaks
  /** Companion stage change, if any. */
  stageFrom: 1 | 2 | 3
  stageTo: 1 | 2 | 3
  dimmed: boolean
}

/**
 * The single source of truth for what a check-in does to a streak.
 *
 * Relapse deliberately does NOT drop the companion to stage 1. It dims it by
 * exactly one stage: falling from Stage 3 to Stage 2 stings enough to be the
 * retention engine, while dropping to Stage 1 would feel like losing a month of
 * work in one tap and is the fastest way to make someone delete the app.
 */
export function applyCheckin(
  streaks: Streaks,
  companionStage: 1 | 2 | 3,
  result: CheckinResult,
  today: LocalDate,
): StreakTransition {
  const base = lapsedStreak(streaks, today)
  const stageFrom = companionStage

  if (result === 'relapse') {
    const stageTo = Math.max(1, stageFrom - 1) as 1 | 2 | 3
    return {
      streaks: {
        ...base,
        currentStreak: 0,
        lastCheckinDate: today,
        relapseCount: base.relapseCount + 1,
      },
      stageFrom,
      stageTo,
      dimmed: true,
    }
  }

  if (result === 'freeze') {
    // A freeze holds the chain without advancing it. No streak, no reward —
    // it only stops a travel day or a sick day from wiping the counter.
    return {
      streaks: {
        ...base,
        currentStreak: streaks.currentStreak,
        lastCheckinDate: today,
        freezeTokens: Math.max(0, base.freezeTokens - 1),
      },
      stageFrom,
      stageTo: stageFrom,
      dimmed: false,
    }
  }

  const currentStreak = base.currentStreak + 1
  const stageTo = Math.max(stageFrom, stageForStreak(currentStreak)) as 1 | 2 | 3
  return {
    streaks: {
      ...base,
      currentStreak,
      bestStreak: Math.max(base.bestStreak, currentStreak),
      totalCleanDays: base.totalCleanDays + 1,
      lastCheckinDate: today,
    },
    stageFrom,
    stageTo,
    dimmed: false,
  }
}

/** Badges whose streak gate is met but which haven't been earned yet. */
export function eligibleBadges(streaks: Streaks, earned: Set<string>): Badge[] {
  return BADGES.filter((b) => !earned.has(b.id) && streaks.currentStreak >= b.requiredStreak)
}

export function badgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id)
}

/** Chance a clean check-in also turns up a wild Kindred. */
export function catchChance(streak: number): number {
  return Math.min(0.18 + streak * 0.004, 0.4)
}

// ---------------------------------------------------------------------------
// Map / routes
// ---------------------------------------------------------------------------

export interface Route {
  id: string
  name: string
  unlockAt: number
  blurb: string
}

export const ROUTES: Route[] = [
  { id: 'fogmouth', name: 'Fogmouth', unlockAt: 0, blurb: 'Where the Haze is thickest. You woke up here.' },
  { id: 'restwick', name: 'Restwick', unlockAt: 1, blurb: 'The hub. Rest Stop, shop, notice board, town square.' },
  { id: 'ashen-verge', name: 'Ashen Verge', unlockAt: 3, blurb: 'Burnt scrub where bored Breakers wander in circles.' },
  { id: 'lowtide-steps', name: 'Lowtide Steps', unlockAt: 7, blurb: 'Salt stairs down to the water. Breathing gets easier here.' },
  { id: 'hollow-market', name: 'Hollow Market', unlockAt: 14, blurb: 'Crowded, loud, and full of people offering you things.' },
  { id: 'the-long-dark', name: 'The Long Dark', unlockAt: 21, blurb: 'The 3am stretch. Nothing here but you and the ceiling.' },
  { id: 'gutter-lantern', name: 'Gutter & Lantern', unlockAt: 30, blurb: 'Old haunts. Old faces. Same bench.' },
  { id: 'bellfield', name: 'Bellfield', unlockAt: 45, blurb: 'A tower that rings once a day, at exactly the wrong time.' },
  { id: 'coinfall', name: 'Coinfall', unlockAt: 60, blurb: 'Payday town. Money burns a hole in more than pockets.' },
  { id: 'council-spire', name: 'Council Spire', unlockAt: 90, blurb: 'The Haze Council waits above the cloud line.' },
  { id: 'clearsummit', name: 'Clearsummit', unlockAt: 365, blurb: 'Above the fog. You can see the whole region from here.' },
]

export function unlockedRoutes(bestStreak: number): Route[] {
  return ROUTES.filter((r) => bestStreak >= r.unlockAt)
}

export function nextRoute(bestStreak: number): Route | null {
  return ROUTES.find((r) => bestStreak < r.unlockAt) ?? null
}

/** A blank slate for a brand-new Breaker, optionally seeded with honest days. */
export function initialStreaks(seedDays = 0, today?: LocalDate): Streaks {
  const seeded = Math.max(0, Math.floor(seedDays))
  return {
    currentStreak: seeded,
    bestStreak: seeded,
    totalCleanDays: seeded,
    // Backdate so the seeded streak continues rather than instantly lapsing,
    // and so today's check-in is still available.
    lastCheckinDate: seeded > 0 && today ? addDays(today, -1) : null,
    relapseCount: 0,
    freezeTokens: 0,
    lastFreezeGrant: null,
  }
}
