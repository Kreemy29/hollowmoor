import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AvatarSprite, KindredSprite } from '@/components/Sprite'
import { Button, Chip, Panel, PanelTitle, PageTitle, EmptyState } from '@/components/ui'
import { useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { isEcho } from '@/data/echo'
import { sfx } from '@/lib/audio'

/**
 * Leaderboard, friend codes and the Ranger Report.
 *
 * The Report is friends-only and cosmetic on purpose: it exists so a group can
 * rib each other about a suspicious number, and for no other reason. It cannot
 * delete data, reset a streak, or reach a stranger.
 */
export function LeaderboardPage() {
  const [scope, setScope] = useState<'friends' | 'global'>('global')
  const me = useGame((s) => s.snapshot?.profile.id)
  const friendCode = useGame((s) => s.snapshot?.profile.friendCode)
  const toast = useUi((s) => s.toast)
  const qc = useQueryClient()

  const { data: board } = useQuery({
    queryKey: ['leaderboard', scope],
    queryFn: async () => (await getBackend()).social.leaderboard(scope),
  })

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await getBackend()).social.friends(),
  })

  const report = useMutation({
    mutationFn: async (targetId: string) => (await getBackend()).social.reportPlayer(targetId),
    onSuccess: (res) => {
      sfx.select()
      toast({
        tone: 'info',
        title: res.contested ? 'Flagged as Contested 🚩' : 'Report filed',
        body: res.contested
          ? 'Their card carries a ribbon until they say otherwise. Nothing else changed.'
          : `${res.votes}/${res.threshold} votes. Purely cosmetic either way.`,
      })
      void qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })

  const friendIds = new Set((friends ?? []).map((f) => f.friendId))

  return (
    <div className="space-y-4">
      <PageTitle sub="Streaks are public to the people you play with. Notes and trigger tags never are.">
        THE BOARD
      </PageTitle>

      <FriendPanel code={friendCode ?? ''} />

      <Panel>
        <div className="mb-3 flex gap-1">
          {(['global', 'friends'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                sfx.select()
                setScope(s)
              }}
              className={`flex-1 border-2 px-2 py-2 font-display text-[9px] uppercase ${
                scope === s ? 'border-clear-500 text-clear-400' : 'border-haze-600 text-bone-300/60'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {(board ?? []).length === 0 ? (
          <EmptyState
            title="Nobody here yet"
            body="Add a friend with their code and this fills up fast."
          />
        ) : (
          <ol className="space-y-2">
            {(board ?? []).map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center gap-3 border-2 p-2 ${
                  p.id === me ? 'border-clear-600 bg-clear-600/5' : 'border-haze-700'
                }`}
              >
                <span className="w-6 shrink-0 text-center font-display text-[10px] text-bone-300/50">
                  {i + 1}
                </span>
                <AvatarSprite avatar={p.avatar} size={32} showAura={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm text-bone-100">{p.handle}</span>
                    {p.id === me && <Chip tone="clear">you</Chip>}
                    {isEcho(p.id) && <Chip>echo</Chip>}
                    {p.contested && <Chip tone="warn">contested 🚩</Chip>}
                  </div>
                  <div className="text-[10px] text-bone-300/50">best {p.bestStreak}d</div>
                </div>
                <KindredSprite
                  speciesId={p.companionSpeciesId}
                  stage={p.companionStage}
                  size={32}
                  animate={false}
                />
                <span className="w-12 shrink-0 text-right font-display text-[11px] text-clear-400">
                  {p.currentStreak}d
                </span>
                {p.id !== me && friendIds.has(p.id) && (
                  <button
                    type="button"
                    onClick={() => report.mutate(p.id)}
                    title="Ranger Report — friends only, cosmetic only"
                    className="shrink-0 text-[11px] text-bone-300/30 hover:text-amber-warn"
                    aria-label={`Report ${p.handle}'s streak as suspicious`}
                  >
                    🚩
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}

        <p className="mt-3 text-[11px] text-bone-300/50">
          🚩 Ranger Report is friends-only and purely cosmetic — a majority vote puts a ribbon on a
          card and does nothing else. It never deletes anything.
        </p>
      </Panel>
    </div>
  )
}

function FriendPanel({ code }: { code: string }) {
  const [input, setInput] = useState('')
  const toast = useUi((s) => s.toast)
  const qc = useQueryClient()

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await getBackend()).social.friends(),
  })

  const add = useMutation({
    mutationFn: async (c: string) => (await getBackend()).social.addFriendByCode(c),
    onSuccess: (res) => {
      toast({ tone: res.ok ? 'win' : 'warn', title: res.ok ? 'Friend added' : 'No luck', body: res.message })
      if (res.ok) {
        setInput('')
        void qc.invalidateQueries({ queryKey: ['friends'] })
        void qc.invalidateQueries({ queryKey: ['leaderboard'] })
      }
    },
  })

  const inviteUrl = `${window.location.origin}/start?invite=${code}`

  return (
    <Panel>
      <PanelTitle right={<Chip tone="clear">{(friends ?? []).length} friends</Chip>}>
        Bring someone with you
      </PanelTitle>

      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-bone-300/70">Your code</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 border-2 border-haze-600 bg-haze-950 px-3 py-2 font-display text-[11px] text-clear-400">
              {code}
            </code>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl)
                  toast({ tone: 'info', title: 'Invite link copied' })
                } catch {
                  toast({ tone: 'warn', title: 'Copy failed', body: inviteUrl })
                }
              }}
            >
              Copy link
            </Button>
          </div>
        </div>

        <div>
          <label
            htmlFor="friend-code"
            className="text-[10px] uppercase tracking-widest text-bone-300/70"
          >
            Add by code
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="friend-code"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="HM-XXXX-XXXX"
              autoCapitalize="characters"
              spellCheck={false}
              className="min-w-0 flex-1 border-2 border-haze-600 bg-haze-950 px-3 py-2 font-display text-[11px] text-bone-100"
            />
            <Button disabled={!input.trim() || add.isPending} onClick={() => add.mutate(input)}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}
