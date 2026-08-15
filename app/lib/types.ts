/**
 * Hollowmoor domain types.
 *
 * These mirror the Postgres schema in /supabase/migrations. When you change a
 * shape here, change the migration too — the local backend and the Supabase
 * backend both promise to produce exactly these objects.
 */

/** A local calendar date, `YYYY-MM-DD`, in the player's own timezone. */
export type LocalDate = string

export type StarterId = 'emberkin' | 'tidewhelp' | 'mossling'

export type CheckinResult = 'clean' | 'relapse' | 'freeze'

export type TriggerTag =
  | 'boredom'
  | 'stress'
  | 'loneliness'
  | 'celebration'
  | 'sleeplessness'
  | 'peer_pressure'
  | 'the_bell'
  | 'payday'
  | 'other'

export type ChatChannel = 'global' | 'friends' | 'raid'

export type GritReason =
  | 'checkin_clean'
  | 'checkin_streak_bonus'
  | 'milestone'
  | 'quest'
  | 'minigame'
  | 'raid'
  | 'duel'
  | 'daily_login'
  | 'trial'
  | 'shop_purchase'
  | 'duel_wager'
  | 'admin_adjust'

export interface AvatarConfig {
  /** Index into the palette sets in app/data/avatar.ts */
  skin: number
  hair: number
  outfit: number
  accessory: number
  /** Hex accent used for the avatar's aura + their marker in the square. */
  accent: string
}

export interface PlayerSettings {
  audioEnabled: boolean
  /** Player override; when null we follow the OS `prefers-reduced-motion`. */
  reducedMotion: boolean | null
  /** Hides the player from the global leaderboard and town square. */
  privateProfile: boolean
  pushEnabled: boolean
  emailReminders: boolean
  /** Suppresses the Dealer's roasts, keeping only Vale. Some people need this. */
  gentleMode: boolean
}

export interface Profile {
  id: string
  handle: string
  avatar: AvatarConfig
  starter: StarterId
  createdAt: string
  timezone: string
  friendCode: string
  settings: PlayerSettings
  isGuest: boolean
}

export interface Streaks {
  currentStreak: number
  bestStreak: number
  totalCleanDays: number
  lastCheckinDate: LocalDate | null
  relapseCount: number
  freezeTokens: number
  /** Local date the last freeze token was granted, so we grant ~1/week. */
  lastFreezeGrant: LocalDate | null
}

export interface Checkin {
  id: string
  date: LocalDate
  result: CheckinResult
  triggerTag: TriggerTag | null
  note: string | null
  createdAt: string
}

export interface KindredSpecies {
  id: string
  dexNo: number
  /** Names for stages 1..3. */
  stageNames: [string, string, string]
  /** Streak days required to reach stages 2 and 3. */
  evolveAt: [number, number]
  /** Coping strength this Kindred embodies — willpower / calm / discipline. */
  strength: string
  /** Base hue driving the generated sprite, 0-360. */
  hue: number
  dexEntry: string
  /** Starters are pickable at onboarding; others are caught in the wild. */
  isStarter: boolean
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic'
}

export interface UserKindred {
  id: string
  speciesId: string
  nickname: string | null
  stage: 1 | 2 | 3
  xp: number
  /** True after a relapse: the Kindred is asleep until the next clean day. */
  dimmed: boolean
  isCompanion: boolean
  caughtAt: string
}

export interface Badge {
  id: string
  order: number
  name: string
  trigger: TriggerTag | 'endgame'
  requiredStreak: number
  /** Minigame that must be cleared to claim the badge. */
  trialGame: MinigameId
  trialTarget: number
  blurb: string
  kind: 'trial' | 'council' | 'champion'
}

export interface UserBadge {
  badgeId: string
  earnedAt: string
}

export type MinigameId = 'breath' | 'crusher' | 'delve' | 'memory'

export interface GritEntry {
  id: string
  amount: number
  reason: GritReason
  detail: string | null
  createdAt: string
}

export interface Quest {
  id: string
  title: string
  description: string
  kind: 'checkin' | 'minigame' | 'social' | 'raid'
  target: number
  gritReward: number
  /** `daily` rotates each local day, `weekly` each Monday. */
  cadence: 'daily' | 'weekly'
}

export interface UserQuest {
  questId: string
  progress: number
  claimed: boolean
  /** The local date (daily) or ISO week key (weekly) this instance belongs to. */
  periodKey: string
}

export interface Item {
  id: string
  name: string
  description: string
  category: 'cosmetic' | 'utility' | 'sticker' | 'decoration'
  price: number
  /** Cosmetic payload — avatar accent hex, kindred skin id, sticker glyph… */
  payload: Record<string, string | number>
}

export interface InventoryEntry {
  itemId: string
  quantity: number
  equipped: boolean
  acquiredAt: string
}

export interface PublicPlayer {
  id: string
  handle: string
  avatar: AvatarConfig
  currentStreak: number
  bestStreak: number
  companionSpeciesId: string
  companionStage: 1 | 2 | 3
  /** Set by a majority Ranger Report vote — cosmetic ribbing only. */
  contested: boolean
  lastSeen: string | null
}

export interface ChatMessage {
  id: string
  channel: ChatChannel
  authorId: string
  authorHandle: string
  authorAvatar: AvatarConfig | null
  body: string
  createdAt: string
  /** Locally-resolved: true when the author is muted/blocked by this player. */
  hidden?: boolean
}

export interface PresenceEntry {
  id: string
  handle: string
  avatar: AvatarConfig
  currentStreak: number
  emote: string | null
  /** Position in the town square, 0-1 normalised. */
  x: number
  y: number
}

export interface Raid {
  id: string
  weekKey: string
  bossName: string
  totalHp: number
  currentHp: number
  endsAt: string
  defeatedAt: string | null
}

export interface RaidParticipant {
  userId: string
  handle: string
  avatar: AvatarConfig
  damage: number
  lootClaimed: boolean
}

export interface Duel {
  id: string
  weekKey: string
  challengerId: string
  challengerHandle: string
  opponentId: string
  opponentHandle: string
  wager: number
  status: 'pending' | 'active' | 'settled' | 'declined'
  challengerScore: number
  opponentScore: number
  winnerId: string | null
  roast: string | null
  endsAt: string
}

export interface Trade {
  id: string
  fromId: string
  fromHandle: string
  toId: string
  toHandle: string
  offerKindredId: string | null
  offerItemId: string | null
  wantKindredId: string | null
  wantItemId: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  createdAt: string
}

export interface Friendship {
  friendId: string
  handle: string
  since: string
  status: 'pending' | 'accepted'
  /** True when this player sent the request and is waiting on the other side. */
  outgoing: boolean
}

export interface RangerReport {
  targetId: string
  votes: number
  threshold: number
  contested: boolean
  /** Whether this player has already voted on the open report. */
  votedByMe: boolean
}

/** One day's AI-generated (or fallback) flavour, cached per user per date. */
export interface DailyContent {
  date: LocalDate
  dealer: string
  vale: string
  /** Present when the player's trigger history warrants a heads-up. */
  nudge: string | null
  source: 'grok' | 'fallback'
}

export interface HighScore {
  game: MinigameId
  userId: string
  handle: string
  score: number
  date: LocalDate
}

/** Everything the single-player loop needs, loaded in one shot on boot. */
export interface GameSnapshot {
  profile: Profile
  streaks: Streaks
  kindred: UserKindred[]
  badges: UserBadge[]
  checkins: Checkin[]
  inventory: InventoryEntry[]
  quests: UserQuest[]
  grit: number
  highScores: Record<MinigameId, number>
}

/** Result of a check-in — everything the celebration screen needs to play. */
export interface CheckinOutcome {
  checkin: Checkin
  streaks: Streaks
  gritEarned: number
  gritBreakdown: { label: string; amount: number }[]
  xpEarned: number
  /** Set when the companion changed stage in either direction. */
  evolution: { from: 1 | 2 | 3; to: 1 | 2 | 3; direction: 'evolve' | 'dim' } | null
  milestone: number | null
  badgeUnlocked: string | null
  caught: string | null
  freezeTokenGranted: boolean
}
