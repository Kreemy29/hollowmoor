import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KindredSprite } from '@/components/Sprite'
import { Button, Chip, EmptyState, Panel, PanelTitle, PageTitle } from '@/components/ui'
import { useGame, useGrit } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { speciesName } from '@/data/kindred'
import { itemById } from '@/data/items'
import { formatRelative } from '@/lib/time'
import { sfx } from '@/lib/audio'

/** Streak Duels and Trades — the two friend-to-friend systems. */
export function ArenaPage() {
  return (
    <div className="space-y-4">
      <PageTitle sub="Week-long duels and creature trades. Both friends-only, both harmless.">
        THE ARENA
      </PageTitle>
      <Duels />
      <Trades />
    </div>
  )
}

function Duels() {
  const grit = useGrit()
  const toast = useUi((s) => s.toast)
  const refresh = useGame((s) => s.refresh)
  const me = useGame((s) => s.snapshot?.profile.id)
  const qc = useQueryClient()
  const [wager, setWager] = useState(50)
  const [opponent, setOpponent] = useState<string>('')

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await getBackend()).social.friends(),
  })

  const { data: duels } = useQuery({
    queryKey: ['duels'],
    queryFn: async () => (await getBackend()).arena.duels(),
  })

  const challenge = useMutation({
    mutationFn: async () => (await getBackend()).arena.challenge(opponent, wager),
    onSuccess: async () => {
      sfx.select()
      toast({ tone: 'info', title: 'Challenge sent', body: 'A week of clean days decides it.' })
      await refresh()
      void qc.invalidateQueries({ queryKey: ['duels'] })
    },
    onError: (err: Error) => toast({ tone: 'warn', title: 'Can’t duel', body: err.message }),
  })

  const accepted = (friends ?? []).filter((f) => f.status === 'accepted')

  return (
    <Panel>
      <PanelTitle>Streak duels</PanelTitle>
      <p className="mb-3 text-[12px] text-bone-300/70">
        Whoever logs more clean days this week takes the pot. The loser gets a custom roast from the
        Dealer and absolutely nothing else happens.
      </p>

      {accepted.length === 0 ? (
        <EmptyState title="No friends to duel" body="Add someone with their friend code first." />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              aria-label="Opponent"
              className="min-w-0 flex-1 border-2 border-haze-600 bg-haze-950 px-2 py-2 text-sm text-bone-100"
            >
              <option value="">pick a Breaker…</option>
              {accepted.map((f) => (
                <option key={f.friendId} value={f.friendId}>
                  {f.handle}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={grit}
              step={25}
              value={wager}
              onChange={(e) => setWager(Math.max(0, Math.min(grit, Number(e.target.value) || 0)))}
              aria-label="Grit wager"
              className="w-24 border-2 border-haze-600 bg-haze-950 px-2 py-2 font-display text-[11px] text-ember-400"
            />
          </div>
          <Button
            className="w-full"
            disabled={!opponent || challenge.isPending || wager > grit}
            onClick={() => challenge.mutate()}
          >
            Challenge · ✦{wager}
          </Button>
        </div>
      )}

      {(duels ?? []).length > 0 && (
        <ul className="mt-4 space-y-2">
          {(duels ?? []).map((d) => {
            const iAmChallenger = d.challengerId === me
            const myScore = iAmChallenger ? d.challengerScore : d.opponentScore
            const theirScore = iAmChallenger ? d.opponentScore : d.challengerScore
            const them = iAmChallenger ? d.opponentHandle : d.challengerHandle
            return (
              <li key={d.id} className="border-2 border-haze-700 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-bone-100">vs {them}</span>
                  <Chip tone={d.status === 'settled' ? 'clear' : 'ember'}>{d.status}</Chip>
                </div>
                <div className="mt-2 flex items-baseline gap-3 font-display text-[12px]">
                  <span className="text-clear-400">{myScore}</span>
                  <span className="text-bone-300/40">—</span>
                  <span className="text-bone-300/70">{theirScore}</span>
                  <span className="ml-auto text-[9px] text-ember-400">✦{d.wager}</span>
                </div>
                {d.roast && <p className="mt-2 text-[12px] text-haze-300">“{d.roast}”</p>}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function Trades() {
  const snapshot = useGame((s) => s.snapshot)
  const toast = useUi((s) => s.toast)
  const qc = useQueryClient()
  const [offer, setOffer] = useState('')
  const [to, setTo] = useState('')

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await getBackend()).social.friends(),
  })

  const { data: trades } = useQuery({
    queryKey: ['trades'],
    queryFn: async () => (await getBackend()).arena.trades(),
  })

  const send = useMutation({
    mutationFn: async () =>
      (await getBackend()).arena.offerTrade({ toId: to, offerKindredId: offer }),
    onSuccess: () => {
      sfx.select()
      toast({ tone: 'info', title: 'Offer sent' })
      setOffer('')
      void qc.invalidateQueries({ queryKey: ['trades'] })
    },
    onError: (err: Error) => toast({ tone: 'warn', title: 'Trade failed', body: err.message }),
  })

  // Your companion is never tradeable — losing it mid-streak would be cruel.
  const tradeable = (snapshot?.kindred ?? []).filter((k) => !k.isCompanion)
  const accepted = (friends ?? []).filter((f) => f.status === 'accepted')

  return (
    <Panel>
      <PanelTitle>Trades</PanelTitle>
      {tradeable.length === 0 ? (
        <EmptyState
          title="Nothing spare to trade"
          body="Catch a few more Kindred first. Your companion stays with you."
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Trade with"
              className="border-2 border-haze-600 bg-haze-950 px-2 py-2 text-sm text-bone-100"
            >
              <option value="">to…</option>
              {accepted.map((f) => (
                <option key={f.friendId} value={f.friendId}>
                  {f.handle}
                </option>
              ))}
            </select>
            <select
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              aria-label="Offer"
              className="border-2 border-haze-600 bg-haze-950 px-2 py-2 text-sm text-bone-100"
            >
              <option value="">offer…</option>
              {tradeable.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nickname || speciesName(k.speciesId, k.stage)}
                </option>
              ))}
            </select>
          </div>
          <Button className="w-full" disabled={!to || !offer || send.isPending} onClick={() => send.mutate()}>
            Send offer
          </Button>
        </div>
      )}

      {(trades ?? []).length > 0 && (
        <ul className="mt-4 space-y-2">
          {(trades ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-3 border-2 border-haze-700 p-2">
              {t.offerKindredId && (
                <KindredSprite
                  speciesId={
                    snapshot?.kindred.find((k) => k.id === t.offerKindredId)?.speciesId ?? 'emberkin'
                  }
                  stage={1}
                  size={28}
                  animate={false}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-bone-100">
                  {t.fromHandle} → {t.toHandle}
                </div>
                <div className="text-[10px] text-bone-300/50">
                  {t.offerItemId ? itemById(t.offerItemId)?.name : 'Kindred'} ·{' '}
                  {formatRelative(t.createdAt)}
                </div>
              </div>
              <Chip tone={t.status === 'accepted' ? 'clear' : 'haze'}>{t.status}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
