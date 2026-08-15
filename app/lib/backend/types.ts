import type {
  AvatarConfig,
  ChatChannel,
  ChatMessage,
  Checkin,
  CheckinOutcome,
  CheckinResult,
  DailyContent,
  Duel,
  Friendship,
  GameSnapshot,
  HighScore,
  InventoryEntry,
  MinigameId,
  PlayerSettings,
  PresenceEntry,
  Profile,
  PublicPlayer,
  Quest,
  Raid,
  RaidParticipant,
  RangerReport,
  StarterId,
  Trade,
  TriggerTag,
  UserKindred,
  UserQuest,
} from '../types'

export type BackendMode = 'local' | 'supabase'

export interface CreateGuestInput {
  handle: string
  avatar: AvatarConfig
  starter: StarterId
  /** Honest head start: days already clean before installing. */
  seedDays: number
  timezone: string
  /** Friend code from an invite link, joined on signup. */
  inviteCode?: string
}

export interface CheckinInput {
  result: CheckinResult
  triggerTag?: TriggerTag | null
  note?: string | null
}

export interface MinigameResult {
  game: MinigameId
  score: number
  /** Seconds of genuine engagement — Focus Delve pays out on this. */
  durationSec: number
  /** Set when the run was launched from the panic "Craving now" button. */
  fromCraving?: boolean
}

export interface AuthApi {
  /** Resolves the stored session, if any. */
  currentUserId(): Promise<string | null>
  createGuest(input: CreateGuestInput): Promise<GameSnapshot>
  /** Optional upgrade: magic-link email so a guest can move devices. */
  linkEmail(email: string): Promise<{ sent: boolean; message: string }>
  signOut(): Promise<void>
  /** Wipes every row this player owns. Required by §9.6. */
  deleteAccount(): Promise<void>
  /** Full data export as a JSON-serialisable object. Required by §9.6. */
  exportData(): Promise<unknown>
}

export interface GameApi {
  snapshot(): Promise<GameSnapshot | null>
  updateProfile(patch: Partial<Pick<Profile, 'handle' | 'avatar'>>): Promise<Profile>
  updateSettings(patch: Partial<PlayerSettings>): Promise<PlayerSettings>
  checkIn(input: CheckinInput): Promise<CheckinOutcome>
  history(limit?: number): Promise<Checkin[]>
  setCompanion(userKindredId: string): Promise<UserKindred[]>
  renameKindred(userKindredId: string, nickname: string | null): Promise<UserKindred[]>
  /** Claims a Trigger Trial badge after its minigame target is cleared. */
  claimBadge(badgeId: string): Promise<{ badgeId: string; gritEarned: number }>
  submitMinigame(result: MinigameResult): Promise<{
    gritEarned: number
    caught: string | null
    highScore: boolean
    questProgress: string[]
  }>
  quests(): Promise<{ defs: Quest[]; progress: UserQuest[] }>
  claimQuest(questId: string): Promise<{ gritEarned: number }>
  shop(): Promise<{ stock: string[]; inventory: InventoryEntry[]; grit: number }>
  buyItem(itemId: string): Promise<{ grit: number; inventory: InventoryEntry[] }>
  equipItem(itemId: string, equipped: boolean): Promise<InventoryEntry[]>
  highScores(game: MinigameId): Promise<HighScore[]>
}

export interface SocialApi {
  friends(): Promise<Friendship[]>
  addFriendByCode(code: string): Promise<{ ok: boolean; message: string }>
  acceptFriend(friendId: string): Promise<void>
  removeFriend(friendId: string): Promise<void>
  leaderboard(scope: 'friends' | 'global'): Promise<PublicPlayer[]>
  /** Live presence in Restwick town square. Returns an unsubscribe fn. */
  subscribePresence(
    self: Omit<PresenceEntry, 'emote'>,
    onChange: (entries: PresenceEntry[]) => void,
  ): () => void
  setEmote(emote: string | null): void
  reportPlayer(targetId: string): Promise<RangerReport>
  reportStatus(targetId: string): Promise<RangerReport>
}

export interface ChatApi {
  history(channel: ChatChannel, limit?: number): Promise<ChatMessage[]>
  send(channel: ChatChannel, body: string): Promise<{ ok: boolean; message?: string }>
  subscribe(channel: ChatChannel, onMessage: (m: ChatMessage) => void): () => void
  mute(userId: string): Promise<void>
  unmute(userId: string): Promise<void>
  mutedIds(): Promise<string[]>
  reportMessage(messageId: string, reason: string): Promise<void>
}

export interface ArenaApi {
  currentRaid(): Promise<{ raid: Raid; participants: RaidParticipant[]; myDamage: number } | null>
  subscribeRaid(onChange: (hp: number) => void): () => void
  claimRaidLoot(): Promise<{ gritEarned: number; caught: string | null }>
  duels(): Promise<Duel[]>
  challenge(friendId: string, wager: number): Promise<Duel>
  respondToDuel(duelId: string, accept: boolean): Promise<Duel>
  trades(): Promise<Trade[]>
  offerTrade(input: {
    toId: string
    offerKindredId?: string
    offerItemId?: string
    wantKindredId?: string
    wantItemId?: string
  }): Promise<Trade>
  respondToTrade(tradeId: string, accept: boolean): Promise<Trade>
}

export interface AiApi {
  /** Today's Dealer roast + Vale tip, cached server-side per user per day. */
  daily(): Promise<DailyContent>
  /** A one-off line for a moment the daily cache doesn't cover. */
  moment(kind: 'relapse' | 'milestone' | 'duel_loss' | 'raid_taunt', context?: string): Promise<string>
}

export interface Backend {
  readonly mode: BackendMode
  /** False in local mode — the UI hides or labels multiplayer accordingly. */
  readonly online: boolean
  auth: AuthApi
  game: GameApi
  social: SocialApi
  chat: ChatApi
  arena: ArenaApi
  ai: AiApi
}

/** Thrown by online-only calls in local mode so callers can offer the upgrade. */
export class OfflineError extends Error {
  constructor(feature: string) {
    super(`${feature} needs a Supabase project. See README → "Going online".`)
    this.name = 'OfflineError'
  }
}
