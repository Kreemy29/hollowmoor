import type { LocalDate } from './types'

/**
 * Everything in Hollowmoor turns on the player's *local* day, not UTC. A
 * check-in at 11pm in Auckland and one at 11pm in Los Angeles are both "today"
 * for the person doing it, so every date key is computed in their timezone.
 */

export function playerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** `YYYY-MM-DD` for the given instant in the given timezone. */
export function toLocalDate(when: Date = new Date(), timezone = playerTimezone()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(when)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Local wall-clock hour 0-23, used for the 4:20 nudge and evening reminders. */
export function localHour(when: Date = new Date(), timezone = playerTimezone()): number {
  const v = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(when)
  return Number.parseInt(v, 10) || 0
}

/** Day of week in the player's timezone, 0 = Sunday. */
export function localDayOfWeek(when: Date = new Date(), timezone = playerTimezone()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
    when,
  )
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/** Parses `YYYY-MM-DD` into a UTC-noon Date — noon dodges every DST edge. */
export function parseLocalDate(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0))
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const dt = parseLocalDate(date)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function isYesterday(date: LocalDate, relativeTo: LocalDate): boolean {
  return daysBetween(date, relativeTo) === 1
}

/**
 * ISO-ish week key (`2026-W33`) used to bucket raids, duels and weekly quests.
 * Weeks start Monday so the "weekend relapse" pattern stays inside one bucket.
 */
export function weekKey(date: LocalDate): string {
  const dt = parseLocalDate(date)
  const day = (dt.getUTCDay() + 6) % 7 // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - day + 3) // nearest Thursday
  const isoYear = dt.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  const week = 1 + Math.round((dt.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** Local date of the Monday that starts `date`'s week. */
export function weekStart(date: LocalDate): LocalDate {
  const dt = parseLocalDate(date)
  const day = (dt.getUTCDay() + 6) % 7
  return addDays(date, -day)
}

/** ms until the next local midnight — drives the "new day" refresh timer. */
export function msUntilLocalMidnight(timezone = playerTimezone()): number {
  const now = new Date()
  const today = toLocalDate(now, timezone)
  for (let minutes = 1; minutes <= 60 * 30; minutes += 1) {
    const probe = new Date(now.getTime() + minutes * 60_000)
    if (toLocalDate(probe, timezone) !== today) {
      return minutes * 60_000 - now.getSeconds() * 1000
    }
  }
  return 60 * 60_000
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
