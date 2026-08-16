import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AvatarSprite, KindredSprite } from '@/components/Sprite'
import { Button, Chip, Panel, Speech } from '@/components/ui'
import { HazeBackdrop } from '@/components/HazeBackdrop'
import { SupportLink, SupportSheet } from '@/components/SupportSheet'
import { STARTERS } from '@/data/kindred'
import { ACCESSORIES, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '@/lib/sprite'
import { useGame } from '@/store/game'
import { storageAvailable } from '@/lib/backend/local'
import { sfx } from '@/lib/audio'
import type { AvatarConfig, StarterId } from '@/lib/types'

type Step = 'cold-open' | 'seed' | 'handle' | 'avatar' | 'starter' | 'mission'

const ACCENTS = ['#14e0bd', '#ff7a2f', '#9a80ff', '#ffb020', '#f6f2ea']

export function Onboarding() {
  const createGuest = useGame((s) => s.createGuest)
  const [step, setStep] = useState<Step>('cold-open')
  const [seedDays, setSeedDays] = useState(0)
  const [handle, setHandle] = useState('')
  const [avatar, setAvatar] = useState<AvatarConfig>({
    skin: 1,
    hair: 0,
    outfit: 0,
    accessory: 1,
    accent: ACCENTS[0],
  })
  const [starter, setStarter] = useState<StarterId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finish() {
    if (!starter) return
    setBusy(true)
    setError(null)
    try {
      await createGuest({ handle: handle.trim(), avatar, starter, seedDays })
      sfx.evolve()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-full">
      <HazeBackdrop streak={seedDays} />
      <SupportSheet />
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {step === 'cold-open' && <ColdOpen onNext={() => setStep('seed')} />}

            {step === 'seed' && (
              <SeedStep
                seedDays={seedDays}
                setSeedDays={setSeedDays}
                onNext={() => setStep('handle')}
              />
            )}

            {step === 'handle' && (
              <HandleStep
                handle={handle}
                setHandle={setHandle}
                onNext={() => setStep('avatar')}
                onBack={() => setStep('seed')}
              />
            )}

            {step === 'avatar' && (
              <AvatarStep
                avatar={avatar}
                setAvatar={setAvatar}
                onNext={() => setStep('starter')}
                onBack={() => setStep('handle')}
              />
            )}

            {step === 'starter' && (
              <StarterStep
                starter={starter}
                setStarter={setStarter}
                onNext={() => setStep('mission')}
                onBack={() => setStep('avatar')}
              />
            )}

            {step === 'mission' && (
              <MissionStep
                handle={handle}
                starter={starter!}
                seedDays={seedDays}
                busy={busy}
                error={error}
                onFinish={finish}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex justify-center">
          <SupportLink />
        </div>
      </div>
    </div>
  )
}

function ColdOpen({ onNext }: { onNext: () => void }) {
  // Warn before they build an avatar and pick a starter, not after — a phone in
  // Private Browsing can't persist a save, and finding that out on the last tap
  // is the worst possible moment.
  const canSave = storageAvailable()

  return (
    <div className="text-center">
      <h1 className="font-display text-lg text-bone-100">HOLLOWMOOR</h1>
      <p className="mt-2 font-display text-[9px] tracking-widest text-haze-300">
        A REGION UNDER THE HAZE
      </p>

      <div className="mt-8 space-y-4 text-left">
        <Speech who="dealer">
          Hey. Lost one. First day out of the Haze… or has it been a while?
        </Speech>
        <p className="text-sm text-bone-300/80">
          The fog came over Hollowmoor a long time ago and most people stopped noticing it. You
          noticed. That makes you a <span className="text-clear-400">Breaker</span> — and your rank
          here is the only number that matters: how many days you’ve stayed out of it.
        </p>
      </div>

      {!canSave && (
        <p className="mt-6 border-2 border-amber-warn/60 bg-haze-900/60 p-3 text-left text-[12px] text-amber-warn">
          This browser won’t let Hollowmoor save anything — you’re probably in Private Browsing.
          Open it in a normal tab, or your streak won’t survive closing this page.
        </p>
      )}

      <Button className="mt-8 w-full" onClick={onNext}>
        Step out of the fog
      </Button>
    </div>
  )
}

function SeedStep({
  seedDays,
  setSeedDays,
  onNext,
}: {
  seedDays: number
  setSeedDays: (n: number) => void
  onNext: () => void
}) {
  const [mode, setMode] = useState<'unset' | 'day-one' | 'already'>('unset')

  return (
    <div>
      <h2 className="font-display text-sm text-bone-100">Where are you starting?</h2>
      <p className="mt-3 text-sm text-bone-300/75">
        Answer honestly — the whole thing runs on this number being real. Nobody is checking, which
        is exactly why it only works if you don’t lie to yourself here.
      </p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => {
            sfx.select()
            setMode('day-one')
            setSeedDays(0)
          }}
          className={`hm-panel block w-full p-4 text-left ${mode === 'day-one' ? 'border-clear-500' : ''}`}
        >
          <div className="font-display text-[10px] text-bone-100">Today is day one</div>
          <p className="mt-1 text-[12px] text-bone-300/70">
            Fogmouth. Sea level. The worst part is behind you within a week.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            sfx.select()
            setMode('already')
            setSeedDays(seedDays > 0 ? seedDays : 7)
          }}
          className={`hm-panel block w-full p-4 text-left ${mode === 'already' ? 'border-clear-500' : ''}`}
        >
          <div className="font-display text-[10px] text-bone-100">I’ve already been clean a while</div>
          <p className="mt-1 text-[12px] text-bone-300/70">
            Bring the days with you. You earned them before you found this.
          </p>
        </button>

        {mode === 'already' && (
          <Panel className="hm-rise">
            <label htmlFor="seed" className="text-[10px] uppercase tracking-widest text-bone-300/70">
              Days clean so far
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="seed"
                type="number"
                min={0}
                max={3650}
                value={seedDays}
                onChange={(e) => setSeedDays(Math.max(0, Math.min(3650, Number(e.target.value) || 0)))}
                className="w-24 border-2 border-haze-600 bg-haze-950 px-3 py-2 font-display text-[12px] text-clear-400"
              />
              <div className="text-[12px] text-bone-300/70">
                {seedDays >= 30
                  ? 'Your Kindred arrives fully grown. Show-off.'
                  : seedDays >= 7
                    ? 'Your Kindred arrives already evolved once.'
                    : 'Every one of those counts.'}
              </div>
            </div>
          </Panel>
        )}
      </div>

      <Button className="mt-6 w-full" disabled={mode === 'unset'} onClick={onNext}>
        Continue
      </Button>
    </div>
  )
}

function HandleStep({
  handle,
  setHandle,
  onNext,
  onBack,
}: {
  handle: string
  setHandle: (v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const valid = handle.trim().length >= 3 && handle.trim().length <= 18

  return (
    <div>
      <h2 className="font-display text-sm text-bone-100">What do they call you?</h2>
      <p className="mt-3 text-sm text-bone-300/75">
        This is the name on the leaderboard and in the town square. Your friends will see it. Choose
        accordingly.
      </p>

      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value.slice(0, 18))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid) onNext()
        }}
        placeholder="breaker_name"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Your handle"
        className="mt-6 w-full border-2 border-haze-600 bg-haze-950 px-3 py-3 text-base text-bone-100 placeholder:text-bone-500/50"
      />
      <p className="mt-2 text-[11px] text-bone-300/50">3–18 characters.</p>

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" disabled={!valid} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}

function AvatarStep({
  avatar,
  setAvatar,
  onNext,
  onBack,
}: {
  avatar: AvatarConfig
  setAvatar: (a: AvatarConfig) => void
  onNext: () => void
  onBack: () => void
}) {
  const rows: { label: string; key: keyof AvatarConfig; count: number }[] = [
    { label: 'Skin', key: 'skin', count: SKIN_TONES.length },
    { label: 'Hair', key: 'hair', count: HAIR_COLORS.length },
    { label: 'Outfit', key: 'outfit', count: OUTFIT_COLORS.length },
    { label: 'Gear', key: 'accessory', count: ACCESSORIES.length },
  ]

  return (
    <div>
      <h2 className="font-display text-sm text-bone-100">Build your Breaker</h2>

      <div className="mt-6 flex justify-center">
        <AvatarSprite avatar={avatar} size={128} />
      </div>

      <div className="mt-6 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-widest text-bone-300/70">
              {row.label}
            </span>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: row.count }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${row.label} option ${i + 1}`}
                  aria-pressed={avatar[row.key] === i}
                  onClick={() => {
                    sfx.select()
                    setAvatar({ ...avatar, [row.key]: i })
                  }}
                  className={`h-8 w-8 border-2 ${
                    avatar[row.key] === i ? 'border-clear-500' : 'border-haze-600'
                  }`}
                  style={{
                    background:
                      row.key === 'skin'
                        ? SKIN_TONES[i]
                        : row.key === 'hair'
                          ? HAIR_COLORS[i]
                          : row.key === 'outfit'
                            ? OUTFIT_COLORS[i]
                            : '#1e1440',
                  }}
                >
                  {row.key === 'accessory' && (
                    <span className="font-display text-[8px] text-bone-300">{i + 1}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-widest text-bone-300/70">Aura</span>
          <div className="flex gap-1">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Aura ${c}`}
                aria-pressed={avatar.accent === c}
                onClick={() => {
                  sfx.select()
                  setAvatar({ ...avatar, accent: c })
                }}
                className={`h-8 w-8 rounded-full border-2 ${
                  avatar.accent === c ? 'border-bone-100' : 'border-haze-600'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}

function StarterStep({
  starter,
  setStarter,
  onNext,
  onBack,
}: {
  starter: StarterId | null
  setStarter: (s: StarterId) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div>
      <h2 className="font-display text-sm text-bone-100">Pick your Kindred</h2>
      <p className="mt-3 text-sm text-bone-300/75">
        It grows as your streak grows. If you slip, it doesn’t die — it dims one stage and sleeps
        until you come back. You will feel that. That’s the idea.
      </p>

      <div className="mt-6 space-y-3">
        {STARTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              sfx.select()
              setStarter(s.id)
            }}
            className={`hm-panel flex w-full items-center gap-4 p-3 text-left ${
              starter === s.id ? 'border-clear-500' : ''
            }`}
          >
            <KindredSprite speciesId={s.id} stage={1} size={72} animate={starter === s.id} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-display text-[11px] text-bone-100">{s.stageNames[0]}</span>
                <Chip tone="clear">{s.strength}</Chip>
              </span>
              <span className="mt-2 block text-[12px] text-bone-300/70">{s.dexEntry}</span>
              <span className="mt-1 block text-[10px] text-haze-300">
                {s.stageNames.join(' → ')}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" disabled={!starter} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}

function MissionStep({
  handle,
  starter,
  seedDays,
  busy,
  error,
  onFinish,
}: {
  handle: string
  starter: StarterId
  seedDays: number
  busy: boolean
  error: string | null
  onFinish: () => void
}) {
  const stage = seedDays >= 30 ? 3 : seedDays >= 7 ? 2 : 1

  return (
    <div className="text-center">
      <div className="flex justify-center">
        <KindredSprite speciesId={starter} stage={stage as 1 | 2 | 3} size={112} />
      </div>

      <div className="mt-6 space-y-4 text-left">
        <Speech who="vale">
          {handle ? `${handle}.` : 'Breaker.'} Good. Here’s the whole map: check in once a day,
          every day, honestly. Clean days move you up the region. A slip costs you the streak and
          dims your Kindred — it does not end anything. Restwick is that way.
        </Speech>
        <Speech who="dealer">I’ll be around. I’m always around.</Speech>
      </div>

      {error && <p className="mt-4 text-sm text-amber-warn">{error}</p>}

      <Button className="mt-8 w-full" disabled={busy} onClick={onFinish}>
        {busy ? 'walking…' : 'Enter Restwick'}
      </Button>
    </div>
  )
}
