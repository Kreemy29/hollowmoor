import type {
  Backend,
  CheckinInput,
  CreateGuestInput,
  MinigameResult,
} from './types'
import { OfflineError } from './types'
import type {
  ChatChannel,
  ChatMessage,
  Checkin,
  CheckinOutcome,
  DailyContent,
  Duel,
  Friendship,
  GameSnapshot,
  GritEntry,
  GritReason,
  HighScore,
  InventoryEntry,
  MinigameId,
  PlayerSettings,
  PresenceEntry,
  Profile,
  PublicPlayer,
  Raid,
  RaidParticipant,
  RangerReport,
  Trade,
  UserBadge,
  UserKindred,
  UserQuest,
} from '../types'
import {
  applyCheckin,
  canCheckInToday,
  catchChance,
  eligibleBadges,
  gritForCleanDay,
  gritForRelapse,
  initialStreaks,
  isMilestone,
  shouldGrantFreezeToken,
  xpForCleanDay,
} from '../rules'
import { badgeFor } from '@/data/badges'
import { rollWild, speciesById } from '@/data/kindred'
import { dailyQuests, questById, weeklyQuest } from '@/data/quests'
import { itemById, weeklyStock } from '@/data/items'
import { ECHOES, echoAsPublic, echoOnline, echoPosition, echoStreak } from '@/data/echo'
import { fallbackDealer, fallbackNudge, fallbackVale, seedFrom } from '@/data/ai-lines'
import { moderateMessage } from '../moderation'
import { addDays, playerTimezone, toLocalDate, weekKey } from '../time'

/**
 * The offline backend.
 *
 * Everything lives in one localStorage blob. This is what runs when no Supabase
 * project is configured, and it is a complete single-player game — the brief's
 * hard requirement is that Hollowmoor is playable at every phase with no keys
 * and no server. Multiplayer surfaces are populated by Echo Breakers (see
 * data/echo.ts), which the UI always labels as offline stand-ins.
 */

const STORE_KEY = 'hollowmoor:v1'
const SESSION_KEY = 'hollowmoor:v1:session'

interface LocalStore {
  version: 1
  userId: string
  profile: Profile
  streaks: ReturnType<typeof initialStreaks>
  kindred: UserKindred[]
  badges: UserBadge[]
  checkins: Checkin[]
  inventory: InventoryEntry[]
  quests: UserQuest[]
  grit: number
  ledger: GritEntry[]
  highScores: Partial<Record<MinigameId, number>>
  muted: string[]
  chat: ChatMessage[]
  friends: Friendship[]
  duels: Duel[]
  trades: Trade[]
  reports: Record<string, { votes: number; votedByMe: boolean }>
  raid: { weekKey: string; currentHp: number; myDamage: number; lootClaimed: boolean } | null
  minigameRuns: { game: MinigameId; score: number; date: string; fromCraving: boolean }[]
  recentMessageAt: string[]
}

function uid(prefix = ''): string {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${rand}` : rand
}

function makeFriendCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  return `HM-${pick()}-${pick()}`
}

function read(): LocalStore | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as LocalStore) : null
  } catch {
    return null
  }
}

/**
 * Persists the save.
 *
 * iOS Safari in Private Browsing exposes `localStorage` but throws
 * QuotaExceededError on every write, so an unguarded setItem here takes the
 * whole app down with an unhandled rejection the moment someone taps "Enter
 * Restwick" on a phone. Fail with a sentence a human can act on instead.
 */
function write(store: LocalStore): LocalStore {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new Error(
        'This browser won’t let Hollowmoor save. If you’re in Private Browsing, open it in a normal tab — your streak needs somewhere to live.',
      )
    }
    throw new Error('Couldn’t save your progress in this browser.')
  }
  return store
}

/** True when this browser can actually persist a save at all. */
export function storageAvailable(): boolean {
  try {
    const probe = `${STORE_KEY}:probe`
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

function mustRead(): LocalStore {
  const s = read()
  if (!s) throw new Error('No local save. Start a new Breaker first.')
  return s
}

function today(store?: LocalStore): string {
  return toLocalDate(new Date(), store?.profile.timezone ?? playerTimezone())
}

function addGrit(store: LocalStore, amount: number, reason: GritReason, detail?: string) {
  store.grit = Math.max(0, store.grit + amount)
  store.ledger.unshift({
    id: uid('grit'),
    amount,
    reason,
    detail: detail ?? null,
    createdAt: new Date().toISOString(),
  })
  store.ledger = store.ledger.slice(0, 300)
}

function snapshotOf(store: LocalStore): GameSnapshot {
  return {
    profile: store.profile,
    streaks: store.streaks,
    kindred: store.kindred,
    badges: store.badges,
    checkins: store.checkins,
    inventory: store.inventory,
    quests: store.quests,
    grit: store.grit,
    highScores: {
      breath: store.highScores.breath ?? 0,
      crusher: store.highScores.crusher ?? 0,
      delve: store.highScores.delve ?? 0,
      memory: store.highScores.memory ?? 0,
    },
  }
}

function companionOf(store: LocalStore): UserKindred {
  return store.kindred.find((k) => k.isCompanion) ?? store.kindred[0]
}

/** Ensures today's/this week's quest rows exist, discarding expired periods. */
function syncQuests(store: LocalStore): UserQuest[] {
  const date = today(store)
  const wk = weekKey(date)
  const wanted = [
    ...dailyQuests(date).map((q) => ({ questId: q.id, periodKey: date })),
    { questId: weeklyQuest(wk).id, periodKey: wk },
  ]
  const kept = store.quests.filter((q) =>
    wanted.some((w) => w.questId === q.questId && w.periodKey === q.periodKey),
  )
  for (const w of wanted) {
    if (!kept.some((k) => k.questId === w.questId && k.periodKey === w.periodKey)) {
      kept.push({ questId: w.questId, periodKey: w.periodKey, progress: 0, claimed: false })
    }
  }
  store.quests = kept
  return kept
}

/** Advances any active quest of the given kind. Returns the quests it touched. */
function bumpQuests(
  store: LocalStore,
  kind: 'checkin' | 'minigame' | 'social' | 'raid',
  amount: number,
  questId?: string,
): string[] {
  syncQuests(store)
  const touched: string[] = []
  for (const uq of store.quests) {
    const def = questById(uq.questId)
    if (!def || uq.claimed) continue
    if (def.kind !== kind) continue
    if (questId && def.id !== questId && def.cadence === 'daily') continue
    if (uq.progress >= def.target) continue
    uq.progress = Math.min(def.target, uq.progress + amount)
    touched.push(def.id)
  }
  return touched
}

function newKindred(speciesId: string, isCompanion: boolean, stage: 1 | 2 | 3 = 1): UserKindred {
  return {
    id: uid('k'),
    speciesId,
    nickname: null,
    stage,
    xp: 0,
    dimmed: false,
    isCompanion,
    caughtAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Echo chat — keeps the room alive when nobody else is in it.
// ---------------------------------------------------------------------------

function echoBacklog(date: string): ChatMessage[] {
  const out: ChatMessage[] = []
  ECHOES.forEach((echo, i) => {
    echo.lines.forEach((line, j) => {
      const minutesAgo = ((Math.abs(seedFrom(`${date}:${echo.id}:${j}`)) % 600) + i * 7 + j * 3)
      out.push({
        id: `echo-msg-${echo.id}-${j}-${date}`,
        channel: 'global',
        authorId: echo.id,
        authorHandle: echo.handle,
        authorAvatar: echo.avatar,
        body: line,
        createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      })
    })
  })
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// ---------------------------------------------------------------------------
// Raid — a solo Titan with echo contributions so the bar actually moves.
// ---------------------------------------------------------------------------

const RAID_TOTAL_HP = 12_000

function syncRaid(store: LocalStore) {
  const wk = weekKey(today(store))
  if (!store.raid || store.raid.weekKey !== wk) {
    store.raid = { weekKey: wk, currentHp: RAID_TOTAL_HP, myDamage: 0, lootClaimed: false }
  }
}

function echoRaidDamage(wk: string): { participants: RaidParticipant[]; total: number } {
  // Echo damage ramps through the week so the bar is never static.
  const dayOfWeek = new Date().getUTCDay() || 7
  const participants = ECHOES.map((echo) => {
    const base = Math.abs(seedFrom(`${wk}:${echo.id}`)) % 700
    return {
      userId: echo.id,
      handle: echo.handle,
      avatar: echo.avatar,
      damage: Math.round((base + 260) * (dayOfWeek / 7) * 1.4),
      lootClaimed: false,
    }
  })
  return { participants, total: participants.reduce((a, p) => a + p.damage, 0) }
}

// ---------------------------------------------------------------------------

export function createLocalBackend(): Backend {
  let presenceTimer: number | null = null
  let chatTimer: number | null = null
  let currentEmote: string | null = null

  const api: Backend = {
    mode: 'local',
    online: false,

    auth: {
      async currentUserId() {
        const store = read()
        if (!store) return null
        localStorage.setItem(SESSION_KEY, store.userId)
        return store.userId
      },

      async createGuest(input: CreateGuestInput): Promise<GameSnapshot> {
        const now = new Date().toISOString()
        const tz = input.timezone || playerTimezone()
        const date = toLocalDate(new Date(), tz)
        const streaks = initialStreaks(input.seedDays, date)
        const companion = newKindred(input.starter, true)
        // An honest head start earns the evolution it has already lived.
        if (streaks.currentStreak >= 30) companion.stage = 3
        else if (streaks.currentStreak >= 7) companion.stage = 2

        const store: LocalStore = {
          version: 1,
          userId: uid('u'),
          profile: {
            id: '',
            handle: input.handle,
            avatar: input.avatar,
            starter: input.starter,
            createdAt: now,
            timezone: tz,
            friendCode: makeFriendCode(),
            isGuest: true,
            settings: {
              audioEnabled: false, // §7 quality floor: muted by default
              reducedMotion: null,
              privateProfile: false,
              pushEnabled: false,
              emailReminders: false,
              gentleMode: false,
            },
          },
          streaks,
          kindred: [companion],
          badges: [],
          checkins: [],
          inventory: [],
          quests: [],
          grit: 50,
          ledger: [],
          highScores: {},
          muted: [],
          chat: [],
          friends: [],
          duels: [],
          trades: [],
          reports: {},
          raid: null,
          minigameRuns: [],
          recentMessageAt: [],
        }
        store.profile.id = store.userId
        addGrit(store, 0, 'daily_login', 'Starting kit')
        syncQuests(store)
        write(store)
        localStorage.setItem(SESSION_KEY, store.userId)
        return snapshotOf(store)
      },

      async linkEmail() {
        return {
          sent: false,
          message:
            'Saving across devices needs a Supabase project. Your progress is safe in this browser until then.',
        }
      },

      async signOut() {
        localStorage.removeItem(SESSION_KEY)
      },

      async deleteAccount() {
        localStorage.removeItem(STORE_KEY)
        localStorage.removeItem(SESSION_KEY)
      },

      async exportData() {
        return read()
      },
    },

    game: {
      async snapshot() {
        const store = read()
        if (!store) return null
        syncQuests(store)
        syncRaid(store)
        write(store)
        return snapshotOf(store)
      },

      async updateProfile(patch) {
        const store = mustRead()
        store.profile = { ...store.profile, ...patch }
        write(store)
        return store.profile
      },

      async updateSettings(patch: Partial<PlayerSettings>) {
        const store = mustRead()
        store.profile.settings = { ...store.profile.settings, ...patch }
        write(store)
        return store.profile.settings
      },

      async checkIn(input: CheckinInput): Promise<CheckinOutcome> {
        const store = mustRead()
        const date = today(store)
        if (!canCheckInToday(store.streaks, date)) {
          throw new Error('You’ve already checked in today. Come back after midnight.')
        }
        if (input.result === 'freeze' && store.streaks.freezeTokens <= 0) {
          throw new Error('No Stillglass Tokens left.')
        }

        const companion = companionOf(store)
        const transition = applyCheckin(store.streaks, companion.stage, input.result, date)
        store.streaks = transition.streaks

        const checkin: Checkin = {
          id: uid('c'),
          date,
          result: input.result,
          triggerTag: input.triggerTag ?? null,
          note: input.note ?? null,
          createdAt: new Date().toISOString(),
        }
        store.checkins.unshift(checkin)

        // --- rewards ---------------------------------------------------------
        const clean = input.result === 'clean'
        const { total: gritEarned, breakdown } =
          input.result === 'relapse'
            ? gritForRelapse()
            : clean
              ? gritForCleanDay(store.streaks.currentStreak)
              : { total: 0, breakdown: [] as { label: string; amount: number }[] }
        if (gritEarned > 0) {
          addGrit(
            store,
            gritEarned,
            clean ? 'checkin_clean' : 'checkin_streak_bonus',
            `Day ${store.streaks.currentStreak}`,
          )
        }

        const xpEarned = clean ? xpForCleanDay(store.streaks.currentStreak) : 0
        companion.xp += xpEarned
        companion.stage = transition.stageTo
        companion.dimmed = transition.dimmed

        // --- evolution / dimming --------------------------------------------
        const evolution =
          transition.stageFrom !== transition.stageTo
            ? {
                from: transition.stageFrom,
                to: transition.stageTo,
                direction: transition.stageTo > transition.stageFrom ? ('evolve' as const) : ('dim' as const),
              }
            : null

        // --- milestone / badges ---------------------------------------------
        const milestone = clean && isMilestone(store.streaks.currentStreak) ? store.streaks.currentStreak : null
        const earnedIds = new Set(store.badges.map((b) => b.badgeId))
        const nowEligible = eligibleBadges(store.streaks, earnedIds)
        // The badge isn't granted here — the trial minigame still has to be
        // cleared. We only surface the first newly-unlocked trial.
        const badgeUnlocked = clean && nowEligible.length > 0 ? nowEligible[0].id : null

        // --- wild encounter --------------------------------------------------
        let caught: string | null = null
        if (clean && Math.random() < catchChance(store.streaks.currentStreak)) {
          const species = rollWild(store.streaks.bestStreak)
          if (species && !store.kindred.some((k) => k.speciesId === species.id)) {
            store.kindred.push(newKindred(species.id, false))
            caught = species.id
          }
        }

        // --- freeze token ----------------------------------------------------
        let freezeTokenGranted = false
        if (clean && shouldGrantFreezeToken(store.streaks, date)) {
          store.streaks.freezeTokens += 1
          store.streaks.lastFreezeGrant = date
          freezeTokenGranted = true
        }

        bumpQuests(store, 'checkin', 1)
        write(store)

        return {
          checkin,
          streaks: store.streaks,
          gritEarned,
          gritBreakdown: breakdown,
          xpEarned,
          evolution,
          milestone,
          badgeUnlocked,
          caught,
          freezeTokenGranted,
        }
      },

      async history(limit = 60) {
        return mustRead().checkins.slice(0, limit)
      },

      async setCompanion(userKindredId) {
        const store = mustRead()
        store.kindred = store.kindred.map((k) => ({ ...k, isCompanion: k.id === userKindredId }))
        write(store)
        return store.kindred
      },

      async renameKindred(userKindredId, nickname) {
        const store = mustRead()
        const k = store.kindred.find((x) => x.id === userKindredId)
        if (k) k.nickname = nickname?.slice(0, 18) || null
        write(store)
        return store.kindred
      },

      async claimBadge(badgeId) {
        const store = mustRead()
        const badge = badgeFor(badgeId)
        if (!badge) throw new Error('Unknown badge.')
        if (store.badges.some((b) => b.badgeId === badgeId)) throw new Error('Already earned.')
        if (store.streaks.currentStreak < badge.requiredStreak) {
          throw new Error(`Needs a ${badge.requiredStreak}-day streak.`)
        }
        const runs = store.minigameRuns.filter((r) => r.game === badge.trialGame)
        const best = runs.reduce((m, r) => Math.max(m, r.score), 0)
        if (best < badge.trialTarget) throw new Error('Clear the trial first.')

        store.badges.push({ badgeId, earnedAt: new Date().toISOString() })
        const gritEarned = 150 + badge.order * 40
        addGrit(store, gritEarned, 'trial', badge.name)
        write(store)
        return { badgeId, gritEarned }
      },

      async submitMinigame(result: MinigameResult) {
        const store = mustRead()
        const date = today(store)
        store.minigameRuns.unshift({
          game: result.game,
          score: result.score,
          date,
          fromCraving: !!result.fromCraving,
        })
        store.minigameRuns = store.minigameRuns.slice(0, 200)

        // Grit scales with the game's effort, capped per run so nobody can
        // farm the shop by mashing Crusher for an hour.
        const perGame: Record<MinigameId, number> = {
          breath: 12,
          crusher: 1,
          delve: 4,
          memory: 8,
        }
        const raw = Math.round(result.score * perGame[result.game])
        const gritEarned = Math.min(raw, result.game === 'delve' ? 260 : 120)
        if (gritEarned > 0) addGrit(store, gritEarned, 'minigame', result.game)

        const prev = store.highScores[result.game] ?? 0
        const highScore = result.score > prev
        if (highScore) store.highScores[result.game] = result.score

        let caught: string | null = null
        const lens = store.inventory.find((i) => i.itemId === 'codex-lens' && i.equipped)
        if (Math.random() < (lens ? 0.24 : 0.12)) {
          const species = rollWild(store.streaks.bestStreak)
          if (species && !store.kindred.some((k) => k.speciesId === species.id)) {
            store.kindred.push(newKindred(species.id, false))
            caught = species.id
          }
        }

        const questProgress = bumpQuests(
          store,
          'minigame',
          result.game === 'crusher' ? result.score : 1,
        )
        if (result.fromCraving) questProgress.push(...bumpQuests(store, 'minigame', 1, 'q-craving'))

        write(store)
        return { gritEarned, caught, highScore, questProgress }
      },

      async quests() {
        const store = mustRead()
        const progress = syncQuests(store)
        write(store)
        const date = today(store)
        const defs = [...dailyQuests(date), weeklyQuest(weekKey(date))]
        return { defs, progress }
      },

      async claimQuest(questId) {
        const store = mustRead()
        syncQuests(store)
        const def = questById(questId)
        const uq = store.quests.find((q) => q.questId === questId)
        if (!def || !uq) throw new Error('That quest isn’t on the board.')
        if (uq.claimed) throw new Error('Already claimed.')
        if (uq.progress < def.target) throw new Error('Not finished yet.')
        uq.claimed = true
        addGrit(store, def.gritReward, 'quest', def.title)
        write(store)
        return { gritEarned: def.gritReward }
      },

      async shop() {
        const store = mustRead()
        return {
          stock: weeklyStock(weekKey(today(store))),
          inventory: store.inventory,
          grit: store.grit,
        }
      },

      async buyItem(itemId) {
        const store = mustRead()
        const item = itemById(itemId)
        if (!item) throw new Error('Not stocked.')
        if (store.grit < item.price) throw new Error('Not enough Grit.')
        addGrit(store, -item.price, 'shop_purchase', item.name)

        if (item.payload.grants === 'freeze') {
          store.streaks.freezeTokens += 1
        } else {
          const existing = store.inventory.find((i) => i.itemId === itemId)
          if (existing) existing.quantity += 1
          else
            store.inventory.push({
              itemId,
              quantity: 1,
              equipped: false,
              acquiredAt: new Date().toISOString(),
            })
        }
        write(store)
        return { grit: store.grit, inventory: store.inventory }
      },

      async equipItem(itemId, equipped) {
        const store = mustRead()
        const item = itemById(itemId)
        const entry = store.inventory.find((i) => i.itemId === itemId)
        if (!entry || !item) throw new Error('You don’t own that.')
        // One equipped item per cosmetic slot.
        if (equipped) {
          for (const other of store.inventory) {
            const otherItem = itemById(other.itemId)
            if (otherItem && otherItem.category === item.category) other.equipped = false
          }
        }
        entry.equipped = equipped
        if (equipped && typeof item.payload.accent === 'string') {
          store.profile.avatar = { ...store.profile.avatar, accent: item.payload.accent }
        }
        write(store)
        return store.inventory
      },

      async highScores(game): Promise<HighScore[]> {
        const store = mustRead()
        const date = today(store)
        const mine = store.minigameRuns
          .filter((r) => r.game === game && r.date === date)
          .reduce((m, r) => Math.max(m, r.score), 0)
        const rows: HighScore[] = ECHOES.map((e) => ({
          game,
          userId: e.id,
          handle: e.handle,
          score: Math.abs(seedFrom(`${date}:${e.id}:${game}`)) % (game === 'crusher' ? 140 : 12),
          date,
        }))
        rows.push({ game, userId: store.userId, handle: store.profile.handle, score: mine, date })
        return rows.sort((a, b) => b.score - a.score).slice(0, 10)
      },
    },

    social: {
      async friends(): Promise<Friendship[]> {
        return mustRead().friends
      },

      async addFriendByCode(code) {
        const store = mustRead()
        if (code.trim().toUpperCase() === store.profile.friendCode) {
          return { ok: false, message: 'That’s your own code.' }
        }
        // Offline, any well-formed code befriends an Echo so the flow is testable.
        const echo = ECHOES[Math.abs(seedFrom(code)) % ECHOES.length]
        if (store.friends.some((f) => f.friendId === echo.id)) {
          return { ok: false, message: 'Already on your list.' }
        }
        store.friends.push({
          friendId: echo.id,
          handle: echo.handle,
          since: new Date().toISOString(),
          status: 'accepted',
          outgoing: false,
        })
        write(store)
        return {
          ok: true,
          message: `${echo.handle} joined your list — offline echo. Connect Supabase for real friends.`,
        }
      },

      async acceptFriend(friendId) {
        const store = mustRead()
        const f = store.friends.find((x) => x.friendId === friendId)
        if (f) f.status = 'accepted'
        write(store)
      },

      async removeFriend(friendId) {
        const store = mustRead()
        store.friends = store.friends.filter((f) => f.friendId !== friendId)
        write(store)
      },

      async leaderboard(scope): Promise<PublicPlayer[]> {
        const store = mustRead()
        const date = today(store)
        const companion = companionOf(store)
        const me: PublicPlayer = {
          id: store.userId,
          handle: store.profile.handle,
          avatar: store.profile.avatar,
          currentStreak: store.streaks.currentStreak,
          bestStreak: store.streaks.bestStreak,
          companionSpeciesId: companion.speciesId,
          companionStage: companion.stage,
          contested: !!store.reports[store.userId]?.votedByMe,
          lastSeen: new Date().toISOString(),
        }
        const friendIds = new Set(store.friends.map((f) => f.friendId))
        const echoes = ECHOES.filter((e) => scope === 'global' || friendIds.has(e.id)).map((e) =>
          echoAsPublic(e, date),
        )
        for (const e of echoes) e.contested = !!store.reports[e.id]?.votedByMe
        return [me, ...echoes].sort((a, b) => b.currentStreak - a.currentStreak)
      },

      subscribePresence(self, onChange) {
        const emit = () => {
          const bucket = Math.floor(Date.now() / 60_000)
          const date = toLocalDate()
          const entries: PresenceEntry[] = ECHOES.filter((e) => echoOnline(e, bucket)).map((e) => ({
            id: e.id,
            handle: e.handle,
            avatar: e.avatar,
            currentStreak: echoStreak(e, date),
            emote: null,
            ...echoPosition(e, bucket),
          }))
          entries.push({ ...self, emote: currentEmote })
          onChange(entries)
        }
        emit()
        presenceTimer = window.setInterval(emit, 6000)
        return () => {
          if (presenceTimer) window.clearInterval(presenceTimer)
          presenceTimer = null
        }
      },

      setEmote(emote) {
        currentEmote = emote
      },

      async reportPlayer(targetId): Promise<RangerReport> {
        const store = mustRead()
        const entry = store.reports[targetId] ?? { votes: 0, votedByMe: false }
        if (!entry.votedByMe) {
          entry.votes += 1
          entry.votedByMe = true
        }
        store.reports[targetId] = entry
        write(store)
        const threshold = 2
        return {
          targetId,
          votes: entry.votes,
          threshold,
          contested: entry.votes >= threshold,
          votedByMe: entry.votedByMe,
        }
      },

      async reportStatus(targetId): Promise<RangerReport> {
        const store = mustRead()
        const entry = store.reports[targetId] ?? { votes: 0, votedByMe: false }
        return {
          targetId,
          votes: entry.votes,
          threshold: 2,
          contested: entry.votes >= 2,
          votedByMe: entry.votedByMe,
        }
      },
    },

    chat: {
      async history(channel, limit = 80) {
        const store = mustRead()
        const backlog = channel === 'global' ? echoBacklog(today(store)) : []
        const mine = store.chat.filter((m) => m.channel === channel)
        return [...backlog, ...mine]
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(-limit)
          .map((m) => ({ ...m, hidden: store.muted.includes(m.authorId) }))
      },

      async send(channel: ChatChannel, body: string) {
        const store = mustRead()
        const verdict = moderateMessage(body, {
          recentTimestamps: store.recentMessageAt,
          accountCreatedAt: store.profile.createdAt,
        })
        if (!verdict.ok) return { ok: false, message: verdict.reason }

        const msg: ChatMessage = {
          id: uid('m'),
          channel,
          authorId: store.userId,
          authorHandle: store.profile.handle,
          authorAvatar: store.profile.avatar,
          body: body.trim(),
          createdAt: new Date().toISOString(),
        }
        store.chat.push(msg)
        store.chat = store.chat.slice(-200)
        store.recentMessageAt = [msg.createdAt, ...store.recentMessageAt].slice(0, 12)
        bumpQuests(store, 'social', 1)
        write(store)
        listeners[channel]?.forEach((fn) => fn(msg))
        return { ok: true }
      },

      subscribe(channel, onMessage) {
        listeners[channel] = listeners[channel] ?? []
        listeners[channel].push(onMessage)

        // Echoes chime in occasionally so the global room isn't a ghost town.
        if (channel === 'global' && !chatTimer) {
          chatTimer = window.setInterval(() => {
            if (Math.random() > 0.35) return
            const echo = ECHOES[Math.floor(Math.random() * ECHOES.length)]
            const line = echo.lines[Math.floor(Math.random() * echo.lines.length)]
            listeners.global?.forEach((fn) =>
              fn({
                id: uid('m'),
                channel: 'global',
                authorId: echo.id,
                authorHandle: echo.handle,
                authorAvatar: echo.avatar,
                body: line,
                createdAt: new Date().toISOString(),
              }),
            )
          }, 25_000)
        }

        return () => {
          listeners[channel] = (listeners[channel] ?? []).filter((fn) => fn !== onMessage)
          if (!listeners.global?.length && chatTimer) {
            window.clearInterval(chatTimer)
            chatTimer = null
          }
        }
      },

      async mute(userId) {
        const store = mustRead()
        if (!store.muted.includes(userId)) store.muted.push(userId)
        write(store)
      },

      async unmute(userId) {
        const store = mustRead()
        store.muted = store.muted.filter((id) => id !== userId)
        write(store)
      },

      async mutedIds() {
        return mustRead().muted
      },

      async reportMessage() {
        // Offline there is no queue to file into; the mute is the real remedy.
      },
    },

    arena: {
      async currentRaid() {
        const store = mustRead()
        syncRaid(store)
        const wk = store.raid!.weekKey
        const { participants, total } = echoRaidDamage(wk)
        const currentHp = Math.max(0, RAID_TOTAL_HP - total - store.raid!.myDamage)
        const companion = companionOf(store)
        const all: RaidParticipant[] = [
          ...participants,
          {
            userId: store.userId,
            handle: store.profile.handle,
            avatar: store.profile.avatar,
            damage: store.raid!.myDamage,
            lootClaimed: store.raid!.lootClaimed,
          },
        ].sort((a, b) => b.damage - a.damage)
        void companion
        write(store)

        const raid: Raid = {
          id: `raid-${wk}`,
          weekKey: wk,
          bossName: 'The Haze Titan',
          totalHp: RAID_TOTAL_HP,
          currentHp,
          endsAt: addDays(today(store), 7) + 'T00:00:00Z',
          defeatedAt: currentHp <= 0 ? new Date().toISOString() : null,
        }
        return { raid, participants: all, myDamage: store.raid!.myDamage }
      },

      subscribeRaid(onChange) {
        const timer = window.setInterval(() => {
          const store = read()
          if (!store?.raid) return
          const { total } = echoRaidDamage(store.raid.weekKey)
          onChange(Math.max(0, RAID_TOTAL_HP - total - store.raid.myDamage))
        }, 8000)
        return () => window.clearInterval(timer)
      },

      async claimRaidLoot() {
        const store = mustRead()
        syncRaid(store)
        const { total } = echoRaidDamage(store.raid!.weekKey)
        if (RAID_TOTAL_HP - total - store.raid!.myDamage > 0) throw new Error('The Titan is still up.')
        if (store.raid!.lootClaimed) throw new Error('Loot already claimed this week.')
        store.raid!.lootClaimed = true
        const gritEarned = 300 + Math.round(store.raid!.myDamage / 4)
        addGrit(store, gritEarned, 'raid', 'Haze Titan')
        let caught: string | null = null
        const species = rollWild(store.streaks.bestStreak)
        if (species && !store.kindred.some((k) => k.speciesId === species.id)) {
          store.kindred.push(newKindred(species.id, false))
          caught = species.id
        }
        write(store)
        return { gritEarned, caught }
      },

      async duels() {
        const store = mustRead()
        return store.duels.filter((d) => d.weekKey === weekKey(today(store)))
      },

      async challenge(friendId, wager) {
        const store = mustRead()
        if (wager > store.grit) throw new Error('You can’t cover that wager.')
        const echo = ECHOES.find((e) => e.id === friendId)
        const wk = weekKey(today(store))
        const duel: Duel = {
          id: uid('d'),
          weekKey: wk,
          challengerId: store.userId,
          challengerHandle: store.profile.handle,
          opponentId: friendId,
          opponentHandle: echo?.handle ?? 'unknown',
          wager,
          status: 'active',
          challengerScore: 0,
          opponentScore: 0,
          winnerId: null,
          roast: null,
          endsAt: addDays(today(store), 7) + 'T00:00:00Z',
        }
        store.duels.push(duel)
        if (wager > 0) addGrit(store, -wager, 'duel_wager', 'Duel stake')
        write(store)
        return duel
      },

      async respondToDuel(duelId, accept) {
        const store = mustRead()
        const duel = store.duels.find((d) => d.id === duelId)
        if (!duel) throw new Error('Duel not found.')
        duel.status = accept ? 'active' : 'declined'
        write(store)
        return duel
      },

      async trades() {
        return mustRead().trades
      },

      async offerTrade(input) {
        const store = mustRead()
        const echo = ECHOES.find((e) => e.id === input.toId)
        const trade: Trade = {
          id: uid('t'),
          fromId: store.userId,
          fromHandle: store.profile.handle,
          toId: input.toId,
          toHandle: echo?.handle ?? 'unknown',
          offerKindredId: input.offerKindredId ?? null,
          offerItemId: input.offerItemId ?? null,
          wantKindredId: input.wantKindredId ?? null,
          wantItemId: input.wantItemId ?? null,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        store.trades.push(trade)
        write(store)
        return trade
      },

      async respondToTrade(tradeId, accept) {
        const store = mustRead()
        const trade = store.trades.find((t) => t.id === tradeId)
        if (!trade) throw new Error('Trade not found.')
        trade.status = accept ? 'accepted' : 'declined'
        if (accept && trade.wantKindredId) {
          const species = speciesById(trade.wantKindredId)
          if (species && !store.kindred.some((k) => k.speciesId === species.id)) {
            store.kindred.push(newKindred(species.id, false))
          }
        }
        if (accept && trade.offerKindredId) {
          store.kindred = store.kindred.filter(
            (k) => k.id !== trade.offerKindredId || k.isCompanion,
          )
        }
        write(store)
        return trade
      },
    },

    ai: {
      async daily(): Promise<DailyContent> {
        const store = mustRead()
        const date = today(store)
        const lastWasRelapse = store.checkins[0]?.result === 'relapse'
        // Pick the nudge from the trigger this player logs most often.
        const counts = new Map<string, number>()
        for (const c of store.checkins.slice(0, 30)) {
          if (c.result === 'relapse' && c.triggerTag) {
            counts.set(c.triggerTag, (counts.get(c.triggerTag) ?? 0) + 1)
          }
        }
        const topTag = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
        return {
          date,
          dealer: fallbackDealer(date, store.userId, lastWasRelapse),
          vale: fallbackVale(date, store.userId, !lastWasRelapse && store.streaks.currentStreak > 0),
          nudge: topTag && topTag[1] >= 2 ? fallbackNudge(topTag[0], date, store.userId) : null,
          source: 'fallback',
        }
      },

      async moment(kind) {
        const store = mustRead()
        const date = today(store)
        if (kind === 'relapse') return fallbackDealer(date, store.userId + ':m', true)
        if (kind === 'milestone') return fallbackVale(date, store.userId + ':m', false)
        return fallbackDealer(date, store.userId + ':m', false)
      },
    },
  }

  return api
}

const listeners: Partial<Record<ChatChannel, ((m: ChatMessage) => void)[]>> = {}

/** Exposed so callers can distinguish "offline" from a genuine failure. */
export { OfflineError }
