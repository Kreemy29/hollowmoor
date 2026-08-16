import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Backend, CheckinInput, CreateGuestInput, MinigameResult } from './types'
import type {
  ChatChannel,
  ChatMessage,
  Checkin,
  CheckinOutcome,
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
  Raid,
  RaidParticipant,
  RangerReport,
  Trade,
  UserBadge,
  UserKindred,
  UserQuest,
} from '../types'
import { getSupabase } from '../supabase'
import { dailyQuests, weeklyQuest } from '@/data/quests'
import { weeklyStock } from '@/data/items'
import { fallbackDealer, fallbackNudge, fallbackVale } from '@/data/ai-lines'
import { moderateMessage } from '../moderation'
import { playerTimezone, toLocalDate, weekKey } from '../time'

/**
 * The hosted backend.
 *
 * Anything that grants Grit, moves a streak or awards a badge goes through a
 * `SECURITY DEFINER` Postgres function rather than a table write, so the rules
 * live server-side and the client cannot mint currency or fake a streak by
 * editing a request. Reads go straight to the tables, which are locked down by
 * Row Level Security (see supabase/migrations).
 */

type Row = Record<string, unknown>

function mapProfile(row: Row): Profile {
  return {
    id: String(row.id),
    handle: String(row.handle),
    avatar: row.avatar as Profile['avatar'],
    starter: row.starter as Profile['starter'],
    createdAt: String(row.created_at),
    timezone: String(row.timezone ?? 'UTC'),
    friendCode: String(row.friend_code),
    settings: row.settings as PlayerSettings,
    isGuest: Boolean(row.is_guest),
  }
}

function mapStreaks(row: Row | null) {
  return {
    currentStreak: Number(row?.current_streak ?? 0),
    bestStreak: Number(row?.best_streak ?? 0),
    totalCleanDays: Number(row?.total_clean_days ?? 0),
    lastCheckinDate: (row?.last_checkin_date as string | null) ?? null,
    relapseCount: Number(row?.relapse_count ?? 0),
    freezeTokens: Number(row?.freeze_tokens ?? 0),
    lastFreezeGrant: (row?.last_freeze_grant as string | null) ?? null,
  }
}

function mapKindred(row: Row): UserKindred {
  return {
    id: String(row.id),
    speciesId: String(row.species_id),
    nickname: (row.nickname as string | null) ?? null,
    stage: Number(row.stage) as 1 | 2 | 3,
    xp: Number(row.xp ?? 0),
    dimmed: Boolean(row.dimmed),
    isCompanion: Boolean(row.is_companion),
    caughtAt: String(row.caught_at),
  }
}

function mapMessage(row: Row): ChatMessage {
  const author = (row.author ?? {}) as Row
  return {
    id: String(row.id),
    channel: row.channel as ChatChannel,
    authorId: String(row.author_id),
    authorHandle: String(author.handle ?? row.author_handle ?? 'unknown'),
    authorAvatar: (author.avatar ?? null) as ChatMessage['authorAvatar'],
    body: String(row.body),
    createdAt: String(row.created_at),
  }
}

export async function createSupabaseBackend(): Promise<Backend> {
  const sb = await getSupabase()
  let cachedUserId: string | null = null
  let presenceChannel: RealtimeChannel | null = null
  let currentEmote: string | null = null

  async function userId(): Promise<string> {
    if (cachedUserId) return cachedUserId
    const { data } = await sb.auth.getUser()
    if (!data.user) throw new Error('Not signed in.')
    cachedUserId = data.user.id
    return cachedUserId
  }

  /** Every mutating call funnels through here so errors read the same way. */
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await sb.rpc(name, args)
    if (error) throw new Error(error.message)
    return data as T
  }

  async function loadSnapshot(): Promise<GameSnapshot | null> {
    const uid = await userId().catch(() => null)
    if (!uid) return null

    const [profileRes, streakRes, kindredRes, badgeRes, checkinRes, invRes, questRes, scoreRes] =
      await Promise.all([
        sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
        sb.from('streaks').select('*').eq('user_id', uid).maybeSingle(),
        sb.from('user_kindred').select('*').eq('user_id', uid).order('caught_at'),
        sb.from('user_badges').select('*').eq('user_id', uid),
        sb.from('checkins').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(90),
        sb.from('inventory').select('*').eq('user_id', uid),
        sb.from('user_quests').select('*').eq('user_id', uid),
        sb.from('minigame_runs').select('game, score').eq('user_id', uid),
      ])

    if (!profileRes.data) return null

    const highScores: Record<MinigameId, number> = { breath: 0, crusher: 0, delve: 0, memory: 0 }
    for (const row of scoreRes.data ?? []) {
      const g = row.game as MinigameId
      highScores[g] = Math.max(highScores[g] ?? 0, Number(row.score))
    }

    return {
      profile: mapProfile(profileRes.data),
      streaks: mapStreaks(streakRes.data),
      grit: Number(streakRes.data?.grit ?? 0),
      kindred: (kindredRes.data ?? []).map(mapKindred),
      badges: (badgeRes.data ?? []).map((r) => ({
        badgeId: String(r.badge_id),
        earnedAt: String(r.earned_at),
      })) as UserBadge[],
      checkins: (checkinRes.data ?? []).map((r) => ({
        id: String(r.id),
        date: String(r.date),
        result: r.result,
        triggerTag: r.trigger_tag ?? null,
        note: r.note ?? null,
        createdAt: String(r.created_at),
      })) as Checkin[],
      inventory: (invRes.data ?? []).map((r) => ({
        itemId: String(r.item_id),
        quantity: Number(r.quantity),
        equipped: Boolean(r.equipped),
        acquiredAt: String(r.acquired_at),
      })) as InventoryEntry[],
      quests: (questRes.data ?? []).map((r) => ({
        questId: String(r.quest_id),
        periodKey: String(r.period_key),
        progress: Number(r.progress),
        claimed: Boolean(r.claimed),
      })) as UserQuest[],
      highScores,
    }
  }

  const backend: Backend = {
    mode: 'supabase',
    online: true,

    auth: {
      async currentUserId() {
        const { data } = await sb.auth.getSession()
        cachedUserId = data.session?.user.id ?? null
        return cachedUserId
      },

      async createGuest(input: CreateGuestInput) {
        // Anonymous sign-in must be enabled in Supabase Auth settings.
        const { data, error } = await sb.auth.signInAnonymously()
        if (error) throw new Error(`Guest sign-in failed: ${error.message}`)
        cachedUserId = data.user?.id ?? null

        await rpc('hm_create_profile', {
          p_handle: input.handle,
          p_avatar: input.avatar,
          p_starter: input.starter,
          p_seed_days: input.seedDays,
          p_timezone: input.timezone || playerTimezone(),
          p_invite_code: input.inviteCode ?? null,
        })

        const snapshot = await loadSnapshot()
        if (!snapshot) throw new Error('Profile did not save. Try again.')
        return snapshot
      },

      async linkEmail(email: string) {
        const { error } = await sb.auth.updateUser({ email })
        if (error) return { sent: false, message: error.message }
        return {
          sent: true,
          message: `Confirmation sent to ${email}. Open it on any device to bring your streak with you.`,
        }
      },

      async signInWithEmail(email: string) {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: {
            // Back to the app root. PKCE puts the result in a `?code=` query
            // param, which does not collide with the router's hash.
            emailRedirectTo: window.location.origin,
            shouldCreateUser: true,
          },
        })
        if (error) return { sent: false, message: error.message }
        return {
          sent: true,
          message: `Link sent to ${email}. Open it on this device and you're in — check spam if it's slow.`,
        }
      },

      async signOut() {
        cachedUserId = null
        await sb.auth.signOut()
      },

      async deleteAccount() {
        await rpc('hm_delete_account')
        cachedUserId = null
        await sb.auth.signOut()
      },

      async exportData() {
        return rpc('hm_export_data')
      },

      async importData(payload: unknown) {
        // Restoring an offline save into Postgres. The RPC is idempotent and
        // refuses to clobber an account that already has a streak, so a
        // mistaken restore can't wipe real progress.
        try {
          const res = await rpc<{ ok: boolean; message: string }>('hm_import_save', {
            p_payload: payload,
          })
          return res
        } catch (err) {
          return { ok: false, message: (err as Error).message }
        }
      },
    },

    game: {
      snapshot: loadSnapshot,

      async updateProfile(patch) {
        const uid = await userId()
        const { data, error } = await sb
          .from('profiles')
          .update({ handle: patch.handle, avatar: patch.avatar })
          .eq('id', uid)
          .select()
          .single()
        if (error) throw new Error(error.message)
        return mapProfile(data)
      },

      async updateSettings(patch) {
        const uid = await userId()
        const { data: existing } = await sb
          .from('profiles')
          .select('settings')
          .eq('id', uid)
          .single()
        const merged = { ...(existing?.settings ?? {}), ...patch }
        const { data, error } = await sb
          .from('profiles')
          .update({ settings: merged })
          .eq('id', uid)
          .select('settings')
          .single()
        if (error) throw new Error(error.message)
        return data.settings as PlayerSettings
      },

      async checkIn(input: CheckinInput): Promise<CheckinOutcome> {
        // The whole transition — streak, Grit, XP, evolution, catch roll, badge
        // eligibility — is computed and written inside one Postgres function.
        return rpc<CheckinOutcome>('hm_checkin', {
          p_result: input.result,
          p_trigger_tag: input.triggerTag ?? null,
          p_note: input.note ?? null,
          p_local_date: toLocalDate(),
        })
      },

      async history(limit = 60) {
        const uid = await userId()
        const { data, error } = await sb
          .from('checkins')
          .select('*')
          .eq('user_id', uid)
          .order('date', { ascending: false })
          .limit(limit)
        if (error) throw new Error(error.message)
        return (data ?? []).map((r) => ({
          id: String(r.id),
          date: String(r.date),
          result: r.result,
          triggerTag: r.trigger_tag ?? null,
          note: r.note ?? null,
          createdAt: String(r.created_at),
        })) as Checkin[]
      },

      async setCompanion(userKindredId) {
        await rpc('hm_set_companion', { p_kindred_id: userKindredId })
        const uid = await userId()
        const { data } = await sb.from('user_kindred').select('*').eq('user_id', uid).order('caught_at')
        return (data ?? []).map(mapKindred)
      },

      async renameKindred(userKindredId, nickname) {
        const uid = await userId()
        await sb
          .from('user_kindred')
          .update({ nickname: nickname?.slice(0, 18) || null })
          .eq('id', userKindredId)
          .eq('user_id', uid)
        const { data } = await sb.from('user_kindred').select('*').eq('user_id', uid).order('caught_at')
        return (data ?? []).map(mapKindred)
      },

      async claimBadge(badgeId) {
        return rpc('hm_claim_badge', { p_badge_id: badgeId })
      },

      async submitMinigame(result: MinigameResult) {
        return rpc('hm_submit_minigame', {
          p_game: result.game,
          p_score: Math.round(result.score),
          p_duration_sec: Math.round(result.durationSec),
          p_from_craving: !!result.fromCraving,
          p_local_date: toLocalDate(),
        })
      },

      async quests() {
        const uid = await userId()
        const date = toLocalDate()
        // The server picks the board (hm_daily_board) so nobody can reroll into
        // the highest-paying quest; the local defs are only a fallback.
        await rpc('hm_sync_quests', { p_local_date: date })
        const [{ data: boardRows }, { data }] = await Promise.all([
          sb.rpc('hm_daily_board', { p_local_date: date }),
          sb.from('user_quests').select('*').eq('user_id', uid),
        ])

        const defs =
          boardRows && boardRows.length > 0
            ? (boardRows as Row[]).map((r) => ({
                id: String(r.id),
                title: String(r.title),
                description: String(r.description),
                kind: r.kind as 'checkin' | 'minigame' | 'social' | 'raid',
                target: Number(r.target),
                gritReward: Number(r.grit_reward),
                cadence: r.cadence as 'daily' | 'weekly',
              }))
            : [...dailyQuests(date), weeklyQuest(weekKey(date))]

        return {
          defs,
          progress: (data ?? []).map((r) => ({
            questId: String(r.quest_id),
            periodKey: String(r.period_key),
            progress: Number(r.progress),
            claimed: Boolean(r.claimed),
          })),
        }
      },

      async claimQuest(questId) {
        return rpc('hm_claim_quest', { p_quest_id: questId, p_local_date: toLocalDate() })
      },

      async shop() {
        const uid = await userId()
        const [{ data: inv }, { data: streak }] = await Promise.all([
          sb.from('inventory').select('*').eq('user_id', uid),
          sb.from('streaks').select('grit').eq('user_id', uid).maybeSingle(),
        ])
        return {
          stock: weeklyStock(weekKey(toLocalDate())),
          inventory: (inv ?? []).map((r) => ({
            itemId: String(r.item_id),
            quantity: Number(r.quantity),
            equipped: Boolean(r.equipped),
            acquiredAt: String(r.acquired_at),
          })),
          grit: Number(streak?.grit ?? 0),
        }
      },

      async buyItem(itemId) {
        return rpc('hm_buy_item', { p_item_id: itemId })
      },

      async equipItem(itemId, equipped) {
        await rpc('hm_equip_item', { p_item_id: itemId, p_equipped: equipped })
        const uid = await userId()
        const { data } = await sb.from('inventory').select('*').eq('user_id', uid)
        return (data ?? []).map((r) => ({
          itemId: String(r.item_id),
          quantity: Number(r.quantity),
          equipped: Boolean(r.equipped),
          acquiredAt: String(r.acquired_at),
        }))
      },

      async highScores(game): Promise<HighScore[]> {
        const date = toLocalDate()
        const { data, error } = await sb
          .from('daily_high_scores')
          .select('*')
          .eq('game', game)
          .eq('date', date)
          .order('score', { ascending: false })
          .limit(10)
        if (error) throw new Error(error.message)
        return (data ?? []).map((r) => ({
          game,
          userId: String(r.user_id),
          handle: String(r.handle),
          score: Number(r.score),
          date: String(r.date),
        }))
      },
    },

    social: {
      async friends(): Promise<Friendship[]> {
        const uid = await userId()
        const { data, error } = await sb
          .from('friendships')
          .select('user_id, friend_id, status, created_at, profiles!friendships_friend_id_fkey(handle)')
          .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
        if (error) throw new Error(error.message)
        return (data ?? []).map((r: Row) => {
          const outgoing = String(r.user_id) === uid
          const other = outgoing ? String(r.friend_id) : String(r.user_id)
          const prof = (r.profiles ?? {}) as Row
          return {
            friendId: other,
            handle: String(prof.handle ?? 'breaker'),
            since: String(r.created_at),
            status: r.status as Friendship['status'],
            outgoing,
          }
        })
      },

      async addFriendByCode(code) {
        try {
          const res = await rpc<{ ok: boolean; message: string }>('hm_add_friend_by_code', {
            p_code: code.trim().toUpperCase(),
          })
          return res
        } catch (err) {
          return { ok: false, message: (err as Error).message }
        }
      },

      async acceptFriend(friendId) {
        await rpc('hm_accept_friend', { p_friend_id: friendId })
      },

      async removeFriend(friendId) {
        await rpc('hm_remove_friend', { p_friend_id: friendId })
      },

      async leaderboard(scope): Promise<PublicPlayer[]> {
        const { data, error } = await sb.rpc('hm_leaderboard', { p_scope: scope })
        if (error) throw new Error(error.message)
        return (data ?? []).map((r: Row) => ({
          id: String(r.id),
          handle: String(r.handle),
          avatar: r.avatar as PublicPlayer['avatar'],
          currentStreak: Number(r.current_streak),
          bestStreak: Number(r.best_streak),
          companionSpeciesId: String(r.companion_species_id ?? 'emberkin'),
          companionStage: Number(r.companion_stage ?? 1) as 1 | 2 | 3,
          contested: Boolean(r.contested),
          lastSeen: (r.last_seen as string | null) ?? null,
        }))
      },

      subscribePresence(self, onChange) {
        presenceChannel = sb.channel('restwick-square', {
          config: { presence: { key: self.id } },
        })

        const emit = () => {
          const state = presenceChannel?.presenceState() ?? {}
          const entries: PresenceEntry[] = Object.values(state)
            .flat()
            .map((raw) => raw as unknown as PresenceEntry)
          onChange(entries)
        }

        presenceChannel
          .on('presence', { event: 'sync' }, emit)
          .on('presence', { event: 'join' }, emit)
          .on('presence', { event: 'leave' }, emit)
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await presenceChannel?.track({ ...self, emote: currentEmote })
            }
          })

        return () => {
          void presenceChannel?.unsubscribe()
          presenceChannel = null
        }
      },

      setEmote(emote) {
        currentEmote = emote
        void presenceChannel?.track({ emote })
      },

      async reportPlayer(targetId): Promise<RangerReport> {
        return rpc('hm_ranger_report', { p_target_id: targetId })
      },

      async reportStatus(targetId): Promise<RangerReport> {
        return rpc('hm_ranger_status', { p_target_id: targetId })
      },
    },

    chat: {
      async history(channel, limit = 80) {
        const { data, error } = await sb
          .from('messages')
          .select('id, channel, author_id, body, created_at, author:profiles!messages_author_id_fkey(handle, avatar)')
          .eq('channel', channel)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw new Error(error.message)
        const muted = new Set(await backend.chat.mutedIds())
        return (data ?? [])
          .reverse()
          .map(mapMessage)
          .map((m) => ({ ...m, hidden: muted.has(m.authorId) }))
      },

      async send(channel: ChatChannel, body: string) {
        const uid = await userId()
        const { data: profile } = await sb
          .from('profiles')
          .select('created_at')
          .eq('id', uid)
          .single()
        const { data: recent } = await sb
          .from('messages')
          .select('created_at')
          .eq('author_id', uid)
          .order('created_at', { ascending: false })
          .limit(12)

        // Client-side moderation for instant feedback; the same rules are
        // re-applied by a Postgres trigger so a crafted request can't skip them.
        const verdict = moderateMessage(body, {
          recentTimestamps: (recent ?? []).map((r) => String(r.created_at)),
          accountCreatedAt: String(profile?.created_at ?? new Date().toISOString()),
        })
        if (!verdict.ok) return { ok: false, message: verdict.reason }

        const { error } = await sb
          .from('messages')
          .insert({ channel, author_id: uid, body: body.trim() })
        if (error) return { ok: false, message: error.message }
        return { ok: true }
      },

      subscribe(channel, onMessage) {
        const ch = sb
          .channel(`chat:${channel}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel=eq.${channel}` },
            async (payload) => {
              const row = payload.new as Row
              const { data: author } = await sb
                .from('profiles')
                .select('handle, avatar')
                .eq('id', String(row.author_id))
                .maybeSingle()
              onMessage(mapMessage({ ...row, author: author ?? {} }))
            },
          )
          .subscribe()
        return () => {
          void ch.unsubscribe()
        }
      },

      async mute(id) {
        const uid = await userId()
        await sb.from('mutes').upsert({ user_id: uid, muted_id: id })
      },

      async unmute(id) {
        const uid = await userId()
        await sb.from('mutes').delete().eq('user_id', uid).eq('muted_id', id)
      },

      async mutedIds() {
        const uid = await userId().catch(() => null)
        if (!uid) return []
        const { data } = await sb.from('mutes').select('muted_id').eq('user_id', uid)
        return (data ?? []).map((r) => String(r.muted_id))
      },

      async reportMessage(messageId, reason) {
        const uid = await userId()
        await sb.from('message_reports').insert({
          message_id: messageId,
          reporter_id: uid,
          reason: reason.slice(0, 280),
        })
      },
    },

    arena: {
      async currentRaid() {
        const { data, error } = await sb.rpc('hm_current_raid')
        if (error) throw new Error(error.message)
        if (!data) return null
        const raidRow = data.raid as Row
        const raid: Raid = {
          id: String(raidRow.id),
          weekKey: String(raidRow.week_key),
          bossName: String(raidRow.boss_name),
          totalHp: Number(raidRow.total_hp),
          currentHp: Number(raidRow.current_hp),
          endsAt: String(raidRow.ends_at),
          defeatedAt: (raidRow.defeated_at as string | null) ?? null,
        }
        const participants: RaidParticipant[] = (data.participants ?? []).map((r: Row) => ({
          userId: String(r.user_id),
          handle: String(r.handle),
          avatar: r.avatar as RaidParticipant['avatar'],
          damage: Number(r.damage),
          lootClaimed: Boolean(r.loot_claimed),
        }))
        return { raid, participants, myDamage: Number(data.my_damage ?? 0) }
      },

      subscribeRaid(onChange) {
        const ch = sb
          .channel('raid')
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'raids' },
            (payload) => onChange(Number((payload.new as Row).current_hp)),
          )
          .subscribe()
        return () => {
          void ch.unsubscribe()
        }
      },

      async claimRaidLoot() {
        return rpc('hm_claim_raid_loot')
      },

      async duels(): Promise<Duel[]> {
        const uid = await userId()
        const { data, error } = await sb
          .from('duels_view')
          .select('*')
          .or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`)
          .eq('week_key', weekKey(toLocalDate()))
        if (error) throw new Error(error.message)
        return (data ?? []).map((r: Row) => ({
          id: String(r.id),
          weekKey: String(r.week_key),
          challengerId: String(r.challenger_id),
          challengerHandle: String(r.challenger_handle),
          opponentId: String(r.opponent_id),
          opponentHandle: String(r.opponent_handle),
          wager: Number(r.wager),
          status: r.status as Duel['status'],
          challengerScore: Number(r.challenger_score),
          opponentScore: Number(r.opponent_score),
          winnerId: (r.winner_id as string | null) ?? null,
          roast: (r.roast as string | null) ?? null,
          endsAt: String(r.ends_at),
        }))
      },

      async challenge(friendId, wager) {
        return rpc('hm_create_duel', { p_opponent: friendId, p_wager: wager })
      },

      async respondToDuel(duelId, accept) {
        return rpc('hm_respond_duel', { p_duel_id: duelId, p_accept: accept })
      },

      async trades(): Promise<Trade[]> {
        const uid = await userId()
        const { data, error } = await sb
          .from('trades_view')
          .select('*')
          .or(`from_id.eq.${uid},to_id.eq.${uid}`)
          .order('created_at', { ascending: false })
        if (error) throw new Error(error.message)
        return (data ?? []).map((r: Row) => ({
          id: String(r.id),
          fromId: String(r.from_id),
          fromHandle: String(r.from_handle),
          toId: String(r.to_id),
          toHandle: String(r.to_handle),
          offerKindredId: (r.offer_kindred_id as string | null) ?? null,
          offerItemId: (r.offer_item_id as string | null) ?? null,
          wantKindredId: (r.want_kindred_id as string | null) ?? null,
          wantItemId: (r.want_item_id as string | null) ?? null,
          status: r.status as Trade['status'],
          createdAt: String(r.created_at),
        }))
      },

      async offerTrade(input) {
        return rpc('hm_offer_trade', {
          p_to: input.toId,
          p_offer_kindred: input.offerKindredId ?? null,
          p_offer_item: input.offerItemId ?? null,
          p_want_kindred: input.wantKindredId ?? null,
          p_want_item: input.wantItemId ?? null,
        })
      },

      async respondToTrade(tradeId, accept) {
        return rpc('hm_respond_trade', { p_trade_id: tradeId, p_accept: accept })
      },
    },

    ai: {
      async daily(): Promise<DailyContent> {
        const date = toLocalDate()
        const uid = await userId()

        // The edge function owns the cache: it returns today's row if one
        // exists and only calls Grok on a miss, so we never spam the API.
        try {
          const { data, error } = await sb.functions.invoke('grok-generate', {
            body: { date, timezone: playerTimezone() },
          })
          if (error) throw error
          if (data?.dealer && data?.vale) {
            return {
              date,
              dealer: String(data.dealer),
              vale: String(data.vale),
              nudge: data.nudge ? String(data.nudge) : null,
              source: data.source === 'grok' ? 'grok' : 'fallback',
            }
          }
        } catch (err) {
          console.warn('[hollowmoor] grok-generate unavailable, using local voice.', err)
        }

        // No key, no function, no network — the game still has a voice.
        const { data: last } = await sb
          .from('checkins')
          .select('result, trigger_tag')
          .eq('user_id', uid)
          .order('date', { ascending: false })
          .limit(10)
        const relapsed = last?.[0]?.result === 'relapse'
        const tag = last?.find((r) => r.result === 'relapse')?.trigger_tag ?? null
        return {
          date,
          dealer: fallbackDealer(date, uid, relapsed),
          vale: fallbackVale(date, uid, !relapsed),
          nudge: fallbackNudge(tag, date, uid),
          source: 'fallback',
        }
      },

      async moment(kind, context) {
        const uid = await userId()
        const date = toLocalDate()
        try {
          const { data } = await sb.functions.invoke('grok-generate', {
            body: { date, moment: kind, context },
          })
          if (data?.line) return String(data.line)
        } catch {
          // fall through
        }
        if (kind === 'relapse') return fallbackDealer(date, `${uid}:m`, true)
        if (kind === 'milestone') return fallbackVale(date, `${uid}:m`, false)
        return fallbackDealer(date, `${uid}:m`, false)
      },
    },
  }

  return backend
}
