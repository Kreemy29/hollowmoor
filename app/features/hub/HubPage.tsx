import { Link } from 'react-router-dom'
import { KindredSprite } from '@/components/Sprite'
import { Button, Chip, LinkButton, Panel, PanelTitle, ProgressBar, Speech, Stat } from '@/components/ui'
import { useCanCheckIn, useCompanion, useGame } from '@/store/game'
import { speciesById, speciesName } from '@/data/kindred'
import {
  breakerLevel,
  daysToNextStage,
  nextMilestone,
  nextRoute,
  stageProgress,
} from '@/lib/rules'
import { QuestBoard } from '@/features/quests/QuestBoard'
import { activeEvent } from '@/data/events'

/**
 * Restwick — the hub, and the screen the loop revolves around.
 *
 * Ordering is deliberate: the companion is first because it is the retention
 * engine, the check-in is second because it is the only thing that must happen
 * today, and everything else is below the fold.
 */
export function HubPage() {
  const snapshot = useGame((s) => s.snapshot)
  const daily = useGame((s) => s.daily)
  const companion = useCompanion()
  const canCheckIn = useCanCheckIn()

  if (!snapshot || !companion) return null

  const { streaks, profile, grit } = snapshot
  const species = speciesById(companion.speciesId)
  const progress = stageProgress(companion)
  const toEvolve = daysToNextStage(streaks.currentStreak)
  const milestone = nextMilestone(streaks.currentStreak)
  const upcoming = nextRoute(streaks.bestStreak)
  const gentle = profile.settings.gentleMode

  return (
    <div className="space-y-4">
      {/* --- Companion ----------------------------------------------------- */}
      <Panel className="hm-rise">
        <div className="flex items-start gap-4">
          <Link to="/kindred" className="shrink-0" aria-label="Open companion details">
            <KindredSprite
              speciesId={companion.speciesId}
              stage={companion.stage}
              dimmed={companion.dimmed}
              size={104}
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[12px] text-bone-100">
                {companion.nickname || speciesName(companion.speciesId, companion.stage)}
              </h1>
              <Chip tone={companion.dimmed ? 'warn' : 'clear'}>
                {companion.dimmed ? 'asleep' : `stage ${companion.stage}`}
              </Chip>
            </div>

            {species && (
              <p className="mt-1 text-[11px] text-bone-300/60">
                {species.strength} · Breaker Lv.{breakerLevel(streaks.totalCleanDays, streaks.bestStreak)}
              </p>
            )}

            <div className="mt-3">
              <ProgressBar
                value={progress.needed ? progress.current : 1}
                max={progress.needed || 1}
                tone="clear"
                label="Evolution progress"
                height={10}
              />
              <p className="mt-1.5 text-[11px] text-bone-300/70">
                {companion.dimmed
                  ? 'Dimmed after a slip. One clean check-in wakes it up.'
                  : toEvolve === null
                    ? 'Fully grown. Nothing left to prove.'
                    : `${toEvolve} clean ${toEvolve === 1 ? 'day' : 'days'} to the next stage.`}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t-2 border-haze-700 pt-3">
          <Stat label="Streak" value={`${streaks.currentStreak}d`} tone="clear" />
          <Stat label="Best" value={`${streaks.bestStreak}d`} tone="bone" />
          <Stat label="Grit" value={`✦${grit}`} tone="ember" />
        </div>
      </Panel>

      {/* --- Today's one required action ------------------------------------ */}
      {canCheckIn ? (
        <Panel className="border-clear-600">
          <PanelTitle>The Rest Stop</PanelTitle>
          <p className="text-sm text-bone-300/85">
            A Craving is waiting outside. One question, once a day — and it only works if you answer
            it straight.
          </p>
          <LinkButton to="/checkin" variant="primary" className="mt-4 w-full">
            Face today’s Craving
          </LinkButton>
        </Panel>
      ) : (
        <Panel>
          <PanelTitle right={<Chip tone="clear">done</Chip>}>The Rest Stop</PanelTitle>
          <p className="text-sm text-bone-300/85">
            {streaks.currentStreak > 0
              ? `Day ${streaks.currentStreak} is logged. Nothing else is required of you today.`
              : 'Today is logged. Day one starts at the next check-in — and that’s tomorrow, not Monday.'}
          </p>
          {milestone && (
            <p className="mt-2 text-[12px] text-bone-300/60">
              Next milestone: day {milestone} ({milestone - streaks.currentStreak} to go).
            </p>
          )}
        </Panel>
      )}

      {/* --- The daily voices ----------------------------------------------- */}
      {daily && (
        <Panel>
          <PanelTitle
            right={
              daily.source === 'grok' ? undefined : (
                <span className="text-[9px] uppercase tracking-wider text-bone-300/40">
                  local voice
                </span>
              )
            }
          >
            Word around town
          </PanelTitle>
          <div className="space-y-3">
            {!gentle && <Speech who="dealer">{daily.dealer}</Speech>}
            <Speech who="vale">{daily.vale}</Speech>
            {daily.nudge && (
              <div className="border-l-4 border-amber-warn/60 bg-haze-900/60 py-2 pl-3 pr-2">
                <div className="font-display text-[9px] text-amber-warn">HEADS UP</div>
                <p className="mt-1 text-sm text-bone-100/90">{daily.nudge}</p>
              </div>
            )}
          </div>
        </Panel>
      )}

      <EventBanner />

      <QuestBoard />

      {/* --- Where you are -------------------------------------------------- */}
      <Panel>
        <PanelTitle right={<Link to="/map" className="text-[10px] text-clear-400 underline">map</Link>}>
          The road ahead
        </PanelTitle>
        {upcoming ? (
          <p className="text-sm text-bone-300/80">
            <span className="text-bone-100">{upcoming.name}</span> opens at day {upcoming.unlockAt}.{' '}
            {upcoming.blurb}
          </p>
        ) : (
          <p className="text-sm text-bone-300/80">
            Every road in Hollowmoor is open to you. There is nothing above Clearsummit.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <LinkButton to="/trials">Trigger Trials</LinkButton>
          <LinkButton to="/codex">The Codex</LinkButton>
        </div>
      </Panel>

      <div className="flex justify-center pt-2">
        <Button
          variant="ghost"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="text-[9px]"
        >
          ↑ Back to your Kindred
        </Button>
      </div>
    </div>
  )
}

/**
 * Seasonal event banner. Date-driven rather than server-driven so events still
 * run with no backend — see app/data/events.ts.
 */
function EventBanner() {
  const today = useGame((s) => s.today)
  const gentle = useGame((s) => s.snapshot?.profile.settings.gentleMode ?? false)
  const event = activeEvent(today)
  if (!event) return null

  return (
    <Panel className="border-ember-500">
      <PanelTitle right={<Chip tone="ember">x{event.gritMultiplier} grit</Chip>}>
        {event.name}
      </PanelTitle>
      <p className="text-sm text-bone-300/85">{event.blurb}</p>
      {!gentle && (
        <div className="mt-3">
          <Speech who="dealer">{event.dealerLine}</Speech>
        </div>
      )}
      {event.featuredSpecies.length > 0 && (
        <p className="mt-3 text-[11px] text-clear-400">
          Showing up on the routes this week:{' '}
          {event.featuredSpecies.map((id) => speciesName(id, 1)).join(', ')}.
        </p>
      )}
    </Panel>
  )
}
