import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, Panel, PageTitle, ProgressBar } from '@/components/ui'
import { useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { BADGES } from '@/data/badges'
import { gameMeta } from '@/features/games'
import { getBackend } from '@/lib/backend'
import { sfx } from '@/lib/audio'

/**
 * The eight Trigger Trials and the endgame.
 *
 * A trial needs two things: the streak (showing up) and a cleared run of its
 * themed minigame (doing the thing). Neither alone is enough, which is what
 * stops the badges feeling like a calendar reward.
 */
export function TrialsPage() {
  const snapshot = useGame((s) => s.snapshot)
  const claimBadge = useGame((s) => s.claimBadge)
  const openCraving = useUi((s) => s.openCraving)
  const toast = useUi((s) => s.toast)
  const navigate = useNavigate()

  const { data: bests } = useQuery({
    queryKey: ['trial-bests'],
    queryFn: async () => {
      const backend = await getBackend()
      const games = ['breath', 'crusher', 'delve', 'memory'] as const
      const entries = await Promise.all(
        games.map(async (g) => {
          const rows = await backend.game.highScores(g)
          const mine = rows.find((r) => r.userId === snapshot?.profile.id)
          return [g, Math.max(mine?.score ?? 0, snapshot?.highScores[g] ?? 0)] as const
        }),
      )
      return Object.fromEntries(entries) as Record<string, number>
    },
    enabled: !!snapshot,
  })

  if (!snapshot) return null
  const earned = new Set(snapshot.badges.map((b) => b.badgeId))
  const streak = snapshot.streaks.currentStreak

  return (
    <div className="space-y-4">
      <PageTitle sub="Eight triggers, eight badges. Reach the streak, then clear the trial to claim it.">
        TRIGGER TRIALS
      </PageTitle>

      <Panel>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-bone-300/70">Badges</span>
          <span className="font-display text-[11px] text-clear-400">
            {earned.size} / {BADGES.length}
          </span>
        </div>
        <ProgressBar value={earned.size} max={BADGES.length} tone="ember" label="Badges earned" />
      </Panel>

      <ul className="space-y-3">
        {BADGES.map((badge) => {
          const has = earned.has(badge.id)
          const streakMet = streak >= badge.requiredStreak
          const best = bests?.[badge.trialGame] ?? snapshot.highScores[badge.trialGame] ?? 0
          const trialMet = best >= badge.trialTarget
          const meta = gameMeta(badge.trialGame)

          return (
            <li
              key={badge.id}
              className={`hm-panel p-4 ${has ? 'border-ember-500' : streakMet ? 'border-clear-600' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-[11px] text-bone-100">{badge.name}</h2>
                    {has && <Chip tone="ember">earned</Chip>}
                    {badge.kind !== 'trial' && <Chip tone="warn">{badge.kind}</Chip>}
                  </div>
                  <p className="mt-1.5 text-[12px] text-bone-300/70">{badge.blurb}</p>
                </div>
                <BadgeMedal earned={has} order={badge.order} />
              </div>

              {!has && (
                <div className="mt-3 space-y-2 border-t-2 border-haze-700 pt-3">
                  <Requirement
                    met={streakMet}
                    label={`${badge.requiredStreak}-day current streak`}
                    detail={streakMet ? 'met' : `${badge.requiredStreak - streak} to go`}
                  />
                  <Requirement
                    met={trialMet}
                    label={`${meta.name} · reach ${badge.trialTarget}`}
                    detail={`best ${best}`}
                  />

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="ghost"
                      className="flex-1 py-2"
                      onClick={() => openCraving(badge.trialGame)}
                    >
                      Attempt the trial
                    </Button>
                    <Button
                      className="flex-1 py-2"
                      disabled={!streakMet || !trialMet}
                      onClick={async () => {
                        try {
                          await claimBadge(badge.id)
                          sfx.badge()
                          toast({ tone: 'win', title: 'Badge earned', body: badge.name })
                        } catch (err) {
                          toast({ tone: 'warn', title: 'Not yet', body: (err as Error).message })
                        }
                      }}
                    >
                      Claim badge
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Button variant="ghost" className="w-full" onClick={() => navigate('/hub')}>
        Back to Restwick
      </Button>
    </div>
  )
}

function Requirement({ met, label, detail }: { met: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className={met ? 'text-clear-400' : 'text-bone-300/70'}>
        <span aria-hidden="true">{met ? '✔' : '○'}</span> {label}
      </span>
      <span className="shrink-0 text-bone-300/50">{detail}</span>
    </div>
  )
}

/** An original badge medal, generated from the trial's index. */
function BadgeMedal({ earned, order }: { earned: boolean; order: number }) {
  const rotation = (order * 37) % 360
  return (
    <svg width={44} height={44} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <g transform={`rotate(${rotation} 12 12)`}>
        <polygon
          points="12,2 20,7 20,17 12,22 4,17 4,7"
          fill={earned ? '#ff7a2f' : '#1e1440'}
          stroke={earned ? '#ffb020' : '#3a2676'}
          strokeWidth="1.5"
        />
        <polygon
          points="12,6 16.5,8.8 16.5,15.2 12,18 7.5,15.2 7.5,8.8"
          fill={earned ? '#150e2b' : '#0b0716'}
        />
        <text
          x="12"
          y="15"
          textAnchor="middle"
          fontSize="7"
          fill={earned ? '#14e0bd' : '#3a2676'}
          fontFamily="monospace"
          transform={`rotate(${-rotation} 12 12)`}
        >
          {order}
        </text>
      </g>
    </svg>
  )
}
