import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KindredSprite } from '@/components/Sprite'
import { Button, Chip, Panel, Speech } from '@/components/ui'
import { SupportLink } from '@/components/SupportSheet'
import { useCanCheckIn, useCompanion, useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { speciesName } from '@/data/kindred'
import { badgeFor } from '@/data/badges'
import { noteSuggestsDistress, relapseClusterConcern } from '@/lib/moderation'
import { sfx } from '@/lib/audio'
import type { CheckinOutcome, TriggerTag } from '@/lib/types'

/**
 * The daily check-in, staged as a battle against a wild Craving.
 *
 * The two answers are deliberately unequal in *tone* but equal in *ease* — the
 * honest-relapse button is exactly as easy to press as the clean one, and it
 * pays Grit. If telling the truth is even slightly more expensive than lying,
 * the data rots and the app stops working.
 */

const TRIGGERS: { id: TriggerTag; label: string }[] = [
  { id: 'boredom', label: 'Bored' },
  { id: 'stress', label: 'Stressed' },
  { id: 'loneliness', label: 'Lonely' },
  { id: 'celebration', label: 'Celebrating' },
  { id: 'sleeplessness', label: 'Couldn’t sleep' },
  { id: 'peer_pressure', label: 'People' },
  { id: 'the_bell', label: 'Habit / the hour' },
  { id: 'payday', label: 'Money in hand' },
  { id: 'other', label: 'Something else' },
]

type Stage = 'battle' | 'relapse-form' | 'result'

export function CheckinPage() {
  const navigate = useNavigate()
  const canCheckIn = useCanCheckIn()
  const companion = useCompanion()
  const snapshot = useGame((s) => s.snapshot)
  const checkIn = useGame((s) => s.checkIn)
  const openCraving = useUi((s) => s.openCraving)
  const openSupport = useUi((s) => s.openSupport)

  const [stage, setStage] = useState<Stage>('battle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<CheckinOutcome | null>(null)
  const [dealerLine, setDealerLine] = useState<string | null>(null)
  const [trigger, setTrigger] = useState<TriggerTag | null>(null)
  const [note, setNote] = useState('')

  // The Craving grows with the streak — it has more to take from you now.
  const cravingStage = useMemo<1 | 2 | 3>(() => {
    const s = snapshot?.streaks.currentStreak ?? 0
    return s >= 30 ? 3 : s >= 7 ? 2 : 1
  }, [snapshot?.streaks.currentStreak])

  useEffect(() => {
    if (!canCheckIn && stage === 'battle') navigate('/hub', { replace: true })
  }, [canCheckIn, stage, navigate])

  if (!snapshot || !companion) return null
  const gentle = snapshot.profile.settings.gentleMode

  async function submit(result: 'clean' | 'relapse' | 'freeze') {
    setBusy(true)
    setError(null)
    try {
      const res = await checkIn({
        result,
        triggerTag: result === 'relapse' ? trigger : null,
        note: result === 'relapse' ? note.trim() || null : null,
      })
      setOutcome(res)
      setStage('result')

      if (result === 'clean') {
        sfx.win()
        if (res.evolution?.direction === 'evolve') window.setTimeout(() => sfx.evolve(), 500)
        if (res.caught) window.setTimeout(() => sfx.catchKindred(), 900)
      } else if (result === 'relapse') {
        sfx.slip()
        const backend = await getBackend()
        setDealerLine(await backend.ai.moment('relapse'))

        // §9.4 — surface the support link once, quietly, when the pattern or
        // the note suggests this is bigger than a game.
        const relapseDates = [
          ...snapshot!.checkins.filter((c) => c.result === 'relapse').map((c) => c.date),
          res.checkin.date,
        ]
        if (noteSuggestsDistress(res.checkin.note) || relapseClusterConcern(relapseDates, res.checkin.date)) {
          window.setTimeout(openSupport, 1400)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- result --
  if (stage === 'result' && outcome) {
    return outcome.checkin.result === 'relapse' ? (
      <RelapseResult
        outcome={outcome}
        dealerLine={gentle ? null : dealerLine}
        companionSpecies={companion.speciesId}
        onCraving={() => openCraving()}
        onDone={() => navigate('/hub')}
      />
    ) : (
      <CleanResult
        outcome={outcome}
        companionSpecies={companion.speciesId}
        onDone={() => navigate('/hub')}
      />
    )
  }

  // ----------------------------------------------------------- relapse form --
  if (stage === 'relapse-form') {
    return (
      <div className="space-y-4">
        <Panel>
          <h1 className="font-display text-[12px] text-amber-warn">Log it straight</h1>
          <p className="mt-3 text-sm text-bone-300/80">
            You get Grit for this either way. The only thing an honest log costs you is the number —
            and the number was never the point.
          </p>

          <fieldset className="mt-5">
            <legend className="text-[10px] uppercase tracking-widest text-bone-300/70">
              What set it off? (optional)
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TRIGGERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={trigger === t.id}
                  onClick={() => {
                    sfx.select()
                    setTrigger(trigger === t.id ? null : t.id)
                  }}
                  className={`border-2 px-3 py-2 text-[11px] ${
                    trigger === t.id
                      ? 'border-amber-warn text-amber-warn'
                      : 'border-haze-600 text-bone-300/80 hover:border-haze-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-bone-300/50">
              Tagging it is how the app learns your pattern and warns you before the next one.
            </p>
          </fieldset>

          <label className="mt-5 block">
            <span className="text-[10px] uppercase tracking-widest text-bone-300/70">
              Anything you want to remember about it? (optional, private)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 280))}
              rows={3}
              className="mt-2 w-full border-2 border-haze-600 bg-haze-950 px-3 py-2 text-sm text-bone-100"
              placeholder="where I was, who I was with, what I told myself…"
            />
          </label>

          {error && <p className="mt-3 text-sm text-amber-warn">{error}</p>}

          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => setStage('battle')}>
              Back
            </Button>
            <Button variant="danger" className="flex-1" disabled={busy} onClick={() => submit('relapse')}>
              {busy ? 'logging…' : 'Log the slip'}
            </Button>
          </div>
        </Panel>

        <div className="flex justify-center">
          <SupportLink />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- battle --
  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden">
        <div className="flex items-start justify-between">
          <Chip tone="warn">wild craving</Chip>
          <span className="font-display text-[9px] text-bone-300/50">
            day {snapshot.streaks.currentStreak + 1} attempt
          </span>
        </div>

        {/* The Craving, top-right; your Kindred, bottom-left. Classic staging. */}
        <div className="relative mt-4 h-56">
          <motion.div
            className="absolute right-2 top-0"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <KindredSprite
              speciesId="hazelet"
              stage={cravingStage}
              size={104}
              title="A wild Craving"
            />
          </motion.div>

          <motion.div
            className="absolute bottom-0 left-2"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <KindredSprite
              speciesId={companion.speciesId}
              stage={companion.stage}
              dimmed={companion.dimmed}
              size={112}
            />
          </motion.div>
        </div>

        <div className="mt-2 border-t-2 border-haze-700 pt-3">
          <p className="text-sm text-bone-300/85">
            A Craving blocks the road out of Restwick. It knows your name, your schedule, and
            exactly which excuse worked last time.
          </p>
        </div>
      </Panel>

      <div className="space-y-3">
        <Button
          className="w-full py-4"
          disabled={busy}
          onClick={() => submit('clean')}
        >
          I stayed out
        </Button>

        <Button
          variant="danger"
          className="w-full py-4"
          disabled={busy}
          onClick={() => {
            sfx.back()
            setStage('relapse-form')
          }}
        >
          The Haze got me
        </Button>

        {snapshot.streaks.freezeTokens > 0 && (
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => submit('freeze')}
          >
            Use a Stillglass Token ({snapshot.streaks.freezeTokens} left)
          </Button>
        )}
        <p className="text-center text-[11px] text-bone-300/50">
          A token covers a day you couldn’t check in. It cannot cover a relapse.
        </p>
      </div>

      {error && <p className="text-center text-sm text-amber-warn">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function CleanResult({
  outcome,
  companionSpecies,
  onDone,
}: {
  outcome: CheckinOutcome
  companionSpecies: string
  onDone: () => void
}) {
  const evolved = outcome.evolution?.direction === 'evolve'
  const badge = outcome.badgeUnlocked ? badgeFor(outcome.badgeUnlocked) : null

  return (
    <div className="space-y-4">
      <Panel className="text-center">
        <div className="font-display text-[11px] text-clear-400">CRAVING DRIVEN OFF</div>
        <div className="mt-4 flex justify-center">
          <KindredSprite
            speciesId={companionSpecies}
            stage={outcome.evolution?.to ?? 1}
            size={128}
            className={evolved ? 'hm-flash' : undefined}
          />
        </div>

        <div className="mt-4 font-display text-3xl text-clear-400">
          {outcome.streaks.currentStreak} days
        </div>
        {outcome.milestone && (
          <div className="mt-2 font-display text-[11px] text-ember-400">
            ★ DAY {outcome.milestone} MILESTONE ★
          </div>
        )}

        {evolved && (
          <p className="mt-4 text-sm text-bone-100">
            Your Kindred evolved into{' '}
            <span className="text-clear-400">
              {speciesName(companionSpecies, outcome.evolution!.to)}
            </span>
            .
          </p>
        )}
      </Panel>

      <Panel>
        <ul className="space-y-2">
          {outcome.gritBreakdown.map((row) => (
            <li key={row.label} className="flex justify-between text-sm">
              <span className="text-bone-300/80">{row.label}</span>
              <span className="font-display text-[10px] text-ember-400">+{row.amount}</span>
            </li>
          ))}
          <li className="flex justify-between border-t-2 border-haze-700 pt-2 text-sm">
            <span className="text-bone-100">Grit earned</span>
            <span className="font-display text-[11px] text-ember-400">✦{outcome.gritEarned}</span>
          </li>
          <li className="flex justify-between text-sm">
            <span className="text-bone-300/80">Kindred XP</span>
            <span className="font-display text-[10px] text-clear-400">+{outcome.xpEarned}</span>
          </li>
        </ul>
      </Panel>

      {outcome.caught && (
        <Panel className="border-clear-600 text-center">
          <div className="font-display text-[10px] text-clear-400">NEW CODEX ENTRY</div>
          <div className="mt-3 flex justify-center">
            <KindredSprite speciesId={outcome.caught} stage={1} size={80} />
          </div>
          <p className="mt-2 text-sm text-bone-100">
            A wild {speciesName(outcome.caught, 1)} followed you home.
          </p>
        </Panel>
      )}

      {outcome.freezeTokenGranted && (
        <Panel className="text-center">
          <p className="text-sm text-bone-300/85">
            The Rest Stop handed you a <span className="text-clear-400">Stillglass Token</span> —
            for a day you genuinely can’t check in. Not for a slip.
          </p>
        </Panel>
      )}

      {badge && (
        <Panel className="border-ember-500">
          <div className="font-display text-[10px] text-ember-400">TRIGGER TRIAL UNLOCKED</div>
          <p className="mt-2 text-sm text-bone-100">{badge.name}</p>
          <p className="mt-1 text-[12px] text-bone-300/70">{badge.blurb}</p>
        </Panel>
      )}

      <Button className="w-full" onClick={onDone}>
        Back to Restwick
      </Button>
    </div>
  )
}

function RelapseResult({
  outcome,
  dealerLine,
  companionSpecies,
  onCraving,
  onDone,
}: {
  outcome: CheckinOutcome
  dealerLine: string | null
  companionSpecies: string
  onCraving: () => void
  onDone: () => void
}) {
  const dimmed = outcome.evolution?.direction === 'dim'

  return (
    <div className="space-y-4">
      <Panel className="text-center">
        <div className="font-display text-[11px] text-amber-warn">STREAK BROKEN</div>
        <div className="mt-4 flex justify-center">
          <KindredSprite
            speciesId={companionSpecies}
            stage={outcome.evolution?.to ?? 1}
            size={120}
            dimmed
            className="hm-shake"
          />
        </div>
        <p className="mt-3 text-sm text-bone-300/80">
          {dimmed
            ? 'Your Kindred dimmed one stage and went to sleep. It is not gone. It wakes up the moment you check in clean.'
            : 'Your Kindred is asleep. One clean day wakes it up.'}
        </p>
      </Panel>

      {/* The Dealer gets exactly one line. Then Vale takes the screen. (§9.1) */}
      {dealerLine && (
        <Speech who="dealer">{dealerLine}</Speech>
      )}

      <Panel className="border-clear-600">
        <Speech who="vale">
          Zero today. So what. Day one starts the second you decide, and that decision is available
          right now — not Monday, not next month. Battle again tomorrow, or take a craving apart
          this minute.
        </Speech>

        <div className="mt-4 space-y-2">
          <Button className="w-full" onClick={onCraving}>
            ⚡ Crush a craving right now
          </Button>
          <Button variant="ghost" className="w-full" onClick={onDone}>
            Back to Restwick
          </Button>
        </div>

        {outcome.gritEarned > 0 && (
          <p className="mt-3 text-center text-[12px] text-ember-400">
            +{outcome.gritEarned} Grit for telling the truth.
          </p>
        )}
      </Panel>

      <div className="flex justify-center">
        <SupportLink />
      </div>
    </div>
  )
}
