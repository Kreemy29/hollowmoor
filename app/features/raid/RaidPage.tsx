import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AvatarSprite, KindredSprite } from '@/components/Sprite'
import { Button, Chip, EmptyState, Panel, PanelTitle, PageTitle } from '@/components/ui'
import { useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { speciesName } from '@/data/kindred'
import { isEcho } from '@/data/echo'
import { sfx } from '@/lib/audio'

/**
 * The weekly Haze Titan raid.
 *
 * Damage comes from the things we already want people doing — clean check-ins,
 * minigame runs, finished quests — so the raid never asks anyone to grind. It
 * just makes a good week visible to the whole group, and it resets on Monday,
 * which is the comeback hook for anyone who had a bad one.
 */
export function RaidPage() {
  const toast = useUi((s) => s.toast)
  const refresh = useGame((s) => s.refresh)
  const me = useGame((s) => s.snapshot?.profile.id)
  const qc = useQueryClient()
  const [liveHp, setLiveHp] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['raid'],
    queryFn: async () => (await getBackend()).arena.currentRaid(),
  })

  // The bar dropping in real time is one of the three signature moments (§7).
  useEffect(() => {
    let unsub: (() => void) | undefined
    void (async () => {
      const backend = await getBackend()
      unsub = backend.arena.subscribeRaid((hp) => setLiveHp(hp))
    })()
    return () => unsub?.()
  }, [])

  if (isLoading) return null
  if (!data) {
    return (
      <div className="space-y-4">
        <PageTitle>THE HAZE TITAN</PageTitle>
        <EmptyState title="No raid running" body="The Titan reforms on Monday. Rest up." />
      </div>
    )
  }

  const { raid, participants, myDamage } = data
  const hp = liveHp ?? raid.currentHp
  const pct = Math.max(0, Math.min(100, (hp / raid.totalHp) * 100))
  const down = hp <= 0

  return (
    <div className="space-y-4">
      <PageTitle sub="One boss, one week, everyone's damage in the same bar. Resets Monday.">
        THE HAZE TITAN
      </PageTitle>

      <Panel className={down ? 'border-clear-500' : ''}>
        <div className="flex flex-col items-center">
          <div className={down ? 'opacity-40 grayscale' : ''}>
            <KindredSprite
              speciesId="hazelet"
              stage={3}
              size={140}
              animate={!down}
              title="The Haze Titan"
            />
          </div>
          <h2 className="mt-2 font-display text-[12px] text-bone-100">{raid.bossName}</h2>
          {down && <Chip tone="clear">defeated</Chip>}
        </div>

        {/* Deliberately not the shared ProgressBar: the raid bar is the one
            element in the app that gets its own weight and colour treatment. */}
        <div className="mt-4">
          <div className="h-6 w-full border-2 border-haze-600 bg-haze-950">
            <div
              className="h-full transition-[width] duration-1000 ease-out"
              style={{
                width: `${pct}%`,
                background:
                  pct > 50
                    ? 'linear-gradient(90deg,#6d4aff,#9a80ff)'
                    : pct > 20
                      ? 'linear-gradient(90deg,#d4531a,#ff7a2f)'
                      : 'linear-gradient(90deg,#0f9f8b,#14e0bd)',
              }}
              role="progressbar"
              aria-valuenow={Math.round(hp)}
              aria-valuemin={0}
              aria-valuemax={raid.totalHp}
              aria-label="Titan health"
            />
          </div>
          <div className="mt-1 flex justify-between font-display text-[9px] text-bone-300/60">
            <span>
              {Math.max(0, Math.round(hp)).toLocaleString()} /{' '}
              {raid.totalHp.toLocaleString()} HP
            </span>
            <span>{Math.round(pct)}%</span>
          </div>
        </div>

        {down && (
          <Button
            className="mt-4 w-full"
            onClick={async () => {
              try {
                const backend = await getBackend()
                const res = await backend.arena.claimRaidLoot()
                sfx.badge()
                toast({
                  tone: 'win',
                  title: `+${res.gritEarned} Grit`,
                  body: res.caught
                    ? `The Titan dropped a ${speciesName(res.caught, 1)}.`
                    : 'Titan down. Split the loot.',
                })
                await refresh()
                void qc.invalidateQueries({ queryKey: ['raid'] })
              } catch (err) {
                toast({ tone: 'warn', title: 'No loot', body: (err as Error).message })
              }
            }}
          >
            Claim your share
          </Button>
        )}
      </Panel>

      <Panel>
        <PanelTitle right={<Chip tone="ember">you: {myDamage.toLocaleString()}</Chip>}>
          How damage works
        </PanelTitle>
        <ul className="space-y-1 text-[12px] text-bone-300/75">
          <li>· A clean check-in hits for 120.</li>
          <li>· Every finished minigame run hits for its score, capped per run.</li>
          <li>· A claimed quest hits for its Grit value.</li>
          <li>· A relapse deals nothing — but it doesn’t heal the Titan either.</li>
        </ul>
      </Panel>

      <Panel>
        <PanelTitle>Raid party</PanelTitle>
        <ol className="space-y-2">
          {participants.map((p, i) => (
            <li
              key={p.userId}
              className={`flex items-center gap-3 border-2 p-2 ${
                p.userId === me ? 'border-clear-600 bg-clear-600/5' : 'border-haze-700'
              }`}
            >
              <span className="w-5 text-center font-display text-[10px] text-bone-300/50">
                {i + 1}
              </span>
              <AvatarSprite avatar={p.avatar} size={28} showAura={false} />
              <span className="min-w-0 flex-1 truncate text-sm text-bone-100">
                {p.handle} {isEcho(p.userId) && <Chip>echo</Chip>}
              </span>
              <span className="font-display text-[10px] text-ember-400">
                {p.damage.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
