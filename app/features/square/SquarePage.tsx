import { useEffect, useMemo, useRef, useState } from 'react'
import { AvatarSprite } from '@/components/Sprite'
import { Button, Chip, Panel, PanelTitle, PageTitle } from '@/components/ui'
import { useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { formatRelative } from '@/lib/time'
import { isEcho } from '@/data/echo'
import { sfx } from '@/lib/audio'
import type { ChatChannel, ChatMessage, PresenceEntry } from '@/lib/types'

const EMOTES = ['👋', '🔥', '🫡', '😤', '🌫️', '🚫', '💪', '😴']

/**
 * Restwick town square — live presence plus the chat room.
 *
 * Presence is deliberately spatial rather than a list: seeing other Breakers
 * standing around is a much stronger "other people are doing this too" signal
 * than a row of names, and it costs nothing to render.
 */
export function SquarePage() {
  const [channel, setChannel] = useState<ChatChannel>('global')
  const online = useGame((s) => s.backend?.online ?? false)

  return (
    <div className="space-y-4">
      <PageTitle sub="Everyone currently out of the fog. Say something — the room is quieter than it looks.">
        THE TOWN SQUARE
      </PageTitle>

      {!online && (
        <Panel className="border-haze-500">
          <p className="text-[12px] text-bone-300/75">
            You’re offline, so the Breakers below are{' '}
            <span className="text-haze-300">Echoes</span> — stand-ins that keep the square from
            being an empty room. Connect a Supabase project (README → “Going online”) and these
            become your actual friends.
          </p>
        </Panel>
      )}

      <SquareGround />

      <Panel>
        <div className="mb-3 flex gap-1">
          {(['global', 'friends', 'raid'] as ChatChannel[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                sfx.select()
                setChannel(c)
              }}
              className={`flex-1 border-2 px-2 py-2 font-display text-[9px] uppercase ${
                channel === c
                  ? 'border-clear-500 text-clear-400'
                  : 'border-haze-600 text-bone-300/60'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <ChatRoom channel={channel} />
      </Panel>
    </div>
  )
}

function SquareGround() {
  const snapshot = useGame((s) => s.snapshot)
  const [entries, setEntries] = useState<PresenceEntry[]>([])
  const [emote, setEmoteState] = useState<string | null>(null)

  useEffect(() => {
    if (!snapshot) return
    let unsub: (() => void) | undefined
    void (async () => {
      const backend = await getBackend()
      unsub = backend.social.subscribePresence(
        {
          id: snapshot.profile.id,
          handle: snapshot.profile.handle,
          avatar: snapshot.profile.avatar,
          currentStreak: snapshot.streaks.currentStreak,
          x: 0.5,
          y: 0.62,
        },
        setEntries,
      )
    })()
    return () => unsub?.()
  }, [snapshot])

  async function sendEmote(glyph: string) {
    const backend = await getBackend()
    const next = emote === glyph ? null : glyph
    setEmoteState(next)
    backend.social.setEmote(next)
    sfx.pop()
  }

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.y - b.y),
    [entries],
  )

  return (
    <Panel>
      <PanelTitle right={<Chip tone="clear">{entries.length} here</Chip>}>Who’s about</PanelTitle>

      <div className="relative h-52 overflow-hidden border-2 border-haze-700 bg-gradient-to-b from-haze-800 to-haze-950">
        {/* Ground line + the Rest Stop lantern, so the space reads as a place. */}
        <div className="absolute inset-x-0 top-1/3 h-px bg-haze-600" aria-hidden="true" />
        <span className="absolute left-3 top-3 text-xl" aria-hidden="true">
          🏮
        </span>

        {sorted.map((p) => (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-center transition-[left,top] duration-1000"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            {p.emote && (
              <div className="mb-0.5 text-sm" aria-hidden="true">
                {p.emote}
              </div>
            )}
            <AvatarSprite avatar={p.avatar} size={34} showAura={false} />
            <div className="mt-0.5 max-w-[70px] truncate text-[8px] text-bone-300/70">
              {p.handle}
            </div>
            <div className="font-display text-[8px] text-clear-400">{p.currentStreak}d</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {EMOTES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => void sendEmote(g)}
            aria-label={`Emote ${g}`}
            aria-pressed={emote === g}
            className={`border-2 px-2 py-1 text-base ${
              emote === g ? 'border-clear-500' : 'border-haze-600 hover:border-haze-400'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
    </Panel>
  )
}

function ChatRoom({ channel }: { channel: ChatChannel }) {
  const me = useGame((s) => s.snapshot?.profile.id)
  const toast = useUi((s) => s.toast)
  const openSupport = useUi((s) => s.openSupport)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [muted, setMuted] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let unsub: (() => void) | undefined
    let alive = true
    void (async () => {
      const backend = await getBackend()
      const [history, mutedIds] = await Promise.all([
        backend.chat.history(channel),
        backend.chat.mutedIds(),
      ])
      if (!alive) return
      setMessages(history)
      setMuted(mutedIds)
      unsub = backend.chat.subscribe(channel, (m) => {
        setMessages((prev) => [...prev.slice(-120), m])
      })
    })()
    return () => {
      alive = false
      unsub?.()
    }
  }, [channel])

  useEffect(() => {
    // Assigning scrollTop rather than calling scrollTo(): it's the same jump,
    // and it doesn't depend on Element.scrollTo, which isn't universally
    // implemented on scroll containers.
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const backend = await getBackend()
    const res = await backend.chat.send(channel, body)
    if (res.ok) {
      setDraft('')
      // Optimistically render our own line; realtime echoes it back online.
      const history = await backend.chat.history(channel)
      setMessages(history)
    } else {
      toast({ tone: 'warn', title: 'Not sent', body: res.message })
      // A blocked message that looked like real distress gets the quiet door.
      if (res.message?.includes('crosses the line')) openSupport()
    }
    setSending(false)
  }

  const visible = messages.filter((m) => !muted.includes(m.authorId))

  return (
    <div>
      <div
        ref={listRef}
        className="h-64 space-y-2 overflow-y-auto border-2 border-haze-700 bg-haze-950/60 p-2"
        role="log"
        aria-live="polite"
        aria-label={`${channel} chat`}
      >
        {visible.length === 0 && (
          <p className="p-4 text-center text-[12px] text-bone-300/50">
            Nothing here yet. Someone has to go first.
          </p>
        )}
        {visible.map((m) => (
          <div key={m.id} className="group flex items-start gap-2">
            {m.authorAvatar && <AvatarSprite avatar={m.authorAvatar} size={22} showAura={false} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span
                  className={`truncate font-display text-[9px] ${
                    m.authorId === me ? 'text-clear-400' : 'text-bone-100'
                  }`}
                >
                  {m.authorHandle}
                </span>
                {isEcho(m.authorId) && <span className="text-[8px] text-haze-300">echo</span>}
                <span className="text-[9px] text-bone-300/40">{formatRelative(m.createdAt)}</span>
              </div>
              <p className="break-words text-[13px] text-bone-300/90">{m.body}</p>
            </div>
            {m.authorId !== me && (
              <div className="flex shrink-0 gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={async () => {
                    const backend = await getBackend()
                    await backend.chat.mute(m.authorId)
                    setMuted(await backend.chat.mutedIds())
                    toast({ tone: 'info', title: 'Muted', body: `You won’t see ${m.authorHandle}.` })
                  }}
                  className="text-[9px] text-bone-300/30 hover:text-amber-warn"
                  aria-label={`Mute ${m.authorHandle}`}
                >
                  mute
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const backend = await getBackend()
                    await backend.chat.reportMessage(m.id, 'flagged from chat')
                    // Muting alongside the report is the immediate remedy —
                    // the queue is for whoever runs the server, later.
                    await backend.chat.mute(m.authorId)
                    setMuted(await backend.chat.mutedIds())
                    toast({
                      tone: 'info',
                      title: 'Reported',
                      body: 'Filed, and they’re muted for you now.',
                    })
                  }}
                  className="text-[9px] text-bone-300/30 hover:text-amber-warn"
                  aria-label={`Report message from ${m.authorHandle}`}
                >
                  report
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 400))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
          placeholder="say something"
          aria-label="Message"
          className="min-w-0 flex-1 border-2 border-haze-600 bg-haze-950 px-3 py-2 text-sm text-bone-100"
        />
        <Button onClick={() => void send()} disabled={sending || !draft.trim()}>
          Send
        </Button>
      </div>

      {muted.length > 0 && (
        <button
          type="button"
          onClick={async () => {
            const backend = await getBackend()
            await Promise.all(muted.map((id) => backend.chat.unmute(id)))
            setMuted([])
          }}
          className="mt-2 text-[10px] text-bone-300/50 underline"
        >
          Unmute {muted.length} {muted.length === 1 ? 'person' : 'people'}
        </button>
      )}
    </div>
  )
}
