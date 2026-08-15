import { Panel, PageTitle, Chip, ProgressBar } from '@/components/ui'
import { useGame } from '@/store/game'
import { ROUTES } from '@/lib/rules'
import { BADGES } from '@/data/badges'

/**
 * The region. A vertical road from Fogmouth up to Clearsummit, where your
 * position is literally your best streak — the map is the progress bar.
 */
export function MapPage() {
  const streaks = useGame((s) => s.snapshot?.streaks)
  if (!streaks) return null

  const best = streaks.bestStreak
  const current = streaks.currentStreak

  return (
    <div className="space-y-4">
      <PageTitle sub="Routes open as your best streak climbs. They stay open — the region remembers what you did even after a slip.">
        HOLLOWMOOR
      </PageTitle>

      <Panel>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-bone-300/70">
            Fogmouth → Clearsummit
          </span>
          <span className="font-display text-[10px] text-clear-400">{best} / 365</span>
        </div>
        <ProgressBar value={best} max={365} tone="clear" label="Journey progress" />
      </Panel>

      <ol className="relative space-y-3 border-l-2 border-haze-700 pl-5">
        {[...ROUTES].reverse().map((route) => {
          const unlocked = best >= route.unlockAt
          const here =
            unlocked &&
            !ROUTES.some((r) => r.unlockAt > route.unlockAt && best >= r.unlockAt)
          const trial = BADGES.find((b) => b.requiredStreak === route.unlockAt)

          return (
            <li key={route.id} className="relative">
              <span
                className={`absolute -left-[27px] top-2 h-3 w-3 border-2 ${
                  here
                    ? 'border-clear-400 bg-clear-500'
                    : unlocked
                      ? 'border-clear-600 bg-haze-800'
                      : 'border-haze-600 bg-haze-950'
                }`}
                aria-hidden="true"
              />
              <div
                className={`hm-panel p-3 ${unlocked ? '' : 'opacity-45'} ${here ? 'border-clear-500' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[11px] text-bone-100">{route.name}</span>
                  {here && <Chip tone="clear">you are here</Chip>}
                  {!unlocked && <Chip>day {route.unlockAt}</Chip>}
                </div>
                <p className="mt-1.5 text-[12px] text-bone-300/70">{route.blurb}</p>
                {trial && (
                  <p className="mt-2 text-[11px] text-ember-400">
                    Trigger Trial: {trial.name}
                    {current < trial.requiredStreak && unlocked
                      ? ` · needs a ${trial.requiredStreak}-day current streak`
                      : ''}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {current < best && (
        <Panel>
          <p className="text-[12px] text-bone-300/70">
            Routes unlock on your <span className="text-bone-100">best</span> streak, so nothing you
            reached is ever taken back. Trials need a live <span className="text-bone-100">current</span>{' '}
            streak — those you re-earn.
          </p>
        </Panel>
      )}
    </div>
  )
}
