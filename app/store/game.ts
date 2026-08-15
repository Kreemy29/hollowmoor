import { create } from 'zustand'
import type {
  CheckinOutcome,
  DailyContent,
  GameSnapshot,
  PlayerSettings,
  UserKindred,
} from '@/lib/types'
import type { Backend, CheckinInput, CreateGuestInput, MinigameResult } from '@/lib/backend'
import { getBackend } from '@/lib/backend'
import { canCheckInToday } from '@/lib/rules'
import { msUntilLocalMidnight, playerTimezone, toLocalDate } from '@/lib/time'

type Status = 'loading' | 'anonymous' | 'ready' | 'error'

interface GameState {
  status: Status
  error: string | null
  backend: Backend | null
  snapshot: GameSnapshot | null
  daily: DailyContent | null
  /** The player's current local date; refreshed automatically at midnight. */
  today: string

  bootstrap: () => Promise<void>
  createGuest: (input: Omit<CreateGuestInput, 'timezone'>) => Promise<void>
  refresh: () => Promise<void>
  refreshDaily: () => Promise<void>
  checkIn: (input: CheckinInput) => Promise<CheckinOutcome>
  submitMinigame: (result: MinigameResult) => Promise<Awaited<ReturnType<Backend['game']['submitMinigame']>>>
  updateSettings: (patch: Partial<PlayerSettings>) => Promise<void>
  setCompanion: (id: string) => Promise<void>
  renameKindred: (id: string, nickname: string | null) => Promise<void>
  claimBadge: (badgeId: string) => Promise<void>
  spendGrit: (delta: number) => void
  signOut: () => Promise<void>
}

let midnightTimer: number | null = null

export const useGame = create<GameState>((set, get) => ({
  status: 'loading',
  error: null,
  backend: null,
  snapshot: null,
  daily: null,
  today: toLocalDate(),

  async bootstrap() {
    try {
      const backend = await getBackend()
      const userId = await backend.auth.currentUserId()
      const snapshot = userId ? await backend.game.snapshot() : null
      const tz = snapshot?.profile.timezone ?? playerTimezone()

      set({
        backend,
        snapshot,
        today: toLocalDate(new Date(), tz),
        status: snapshot ? 'ready' : 'anonymous',
        error: null,
      })

      if (snapshot) void get().refreshDaily()
      scheduleMidnightRefresh(set, get)
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Failed to load.' })
    }
  },

  async createGuest(input) {
    const backend = get().backend ?? (await getBackend())
    const snapshot = await backend.auth.createGuest({ ...input, timezone: playerTimezone() })
    set({ backend, snapshot, status: 'ready', today: toLocalDate(new Date(), snapshot.profile.timezone) })
    void get().refreshDaily()
  },

  async refresh() {
    const backend = get().backend ?? (await getBackend())
    const snapshot = await backend.game.snapshot()
    if (snapshot) set({ snapshot, backend })
  },

  async refreshDaily() {
    const backend = get().backend ?? (await getBackend())
    try {
      set({ daily: await backend.ai.daily() })
    } catch {
      // The daily voice is flavour — never let it block the loop.
    }
  },

  async checkIn(input) {
    const backend = get().backend ?? (await getBackend())
    const outcome = await backend.game.checkIn(input)
    await get().refresh()
    void get().refreshDaily()
    return outcome
  },

  async submitMinigame(result) {
    const backend = get().backend ?? (await getBackend())
    const res = await backend.game.submitMinigame(result)
    await get().refresh()
    return res
  },

  async updateSettings(patch) {
    const backend = get().backend ?? (await getBackend())
    const settings = await backend.game.updateSettings(patch)
    const snapshot = get().snapshot
    if (snapshot) {
      set({ snapshot: { ...snapshot, profile: { ...snapshot.profile, settings } } })
    }
  },

  async setCompanion(id) {
    const backend = get().backend ?? (await getBackend())
    const kindred = await backend.game.setCompanion(id)
    const snapshot = get().snapshot
    if (snapshot) set({ snapshot: { ...snapshot, kindred } })
  },

  async renameKindred(id, nickname) {
    const backend = get().backend ?? (await getBackend())
    const kindred = await backend.game.renameKindred(id, nickname)
    const snapshot = get().snapshot
    if (snapshot) set({ snapshot: { ...snapshot, kindred } })
  },

  async claimBadge(badgeId) {
    const backend = get().backend ?? (await getBackend())
    await backend.game.claimBadge(badgeId)
    await get().refresh()
  },

  spendGrit(delta) {
    const snapshot = get().snapshot
    if (snapshot) set({ snapshot: { ...snapshot, grit: Math.max(0, snapshot.grit + delta) } })
  },

  async signOut() {
    const backend = get().backend ?? (await getBackend())
    await backend.auth.signOut()
    set({ snapshot: null, status: 'anonymous', daily: null })
  },
}))

/**
 * Hollowmoor's whole loop is keyed to the player's local day, so when midnight
 * passes while the app is open we roll the date over and re-fetch rather than
 * leaving a stale "already checked in" state on screen.
 */
function scheduleMidnightRefresh(
  set: (partial: Partial<GameState>) => void,
  get: () => GameState,
) {
  if (midnightTimer) window.clearTimeout(midnightTimer)
  const tz = get().snapshot?.profile.timezone ?? playerTimezone()
  midnightTimer = window.setTimeout(
    () => {
      set({ today: toLocalDate(new Date(), tz) })
      void get().refresh()
      void get().refreshDaily()
      scheduleMidnightRefresh(set, get)
    },
    Math.max(30_000, msUntilLocalMidnight(tz) + 2000),
  )
}

// --- selectors --------------------------------------------------------------

export function useCompanion(): UserKindred | null {
  return useGame((s) => s.snapshot?.kindred.find((k) => k.isCompanion) ?? s.snapshot?.kindred[0] ?? null)
}

export function useCanCheckIn(): boolean {
  return useGame((s) => (s.snapshot ? canCheckInToday(s.snapshot.streaks, s.today) : false))
}

export function useStreak(): number {
  return useGame((s) => s.snapshot?.streaks.currentStreak ?? 0)
}

export function useGrit(): number {
  return useGame((s) => s.snapshot?.grit ?? 0)
}
