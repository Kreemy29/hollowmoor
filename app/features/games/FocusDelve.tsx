import { useEffect, useRef, useState } from 'react'
import { KindredSprite } from '@/components/Sprite'
import { Button, ProgressBar } from '@/components/ui'
import { useCompanion } from '@/store/game'
import { formatDuration } from '@/lib/time'
import { sfx } from '@/lib/audio'
import type { GameProps } from './types'

/**
 * Focus Delve — a real 25-minute focus block wearing a dungeon.
 *
 * This is the only minigame you win by *not* looking at your phone, which is
 * the point: it ties Hollowmoor to something happening in your actual life.
 * The timer runs off wall-clock timestamps, not interval ticks, so backgrounding
 * the tab (which is exactly what a good delve looks like) doesn't cheat it in
 * either direction.
 */

const DELVE_MINUTES = 25
const DELVE_MS = DELVE_MINUTES * 60_000

const DEPTHS = [
  { at: 0, name: 'The Threshold', line: 'Cold air. The stairs go down further than they should.' },
  { at: 0.2, name: 'Lantern Row', line: 'Someone left lights burning. Recently.' },
  { at: 0.4, name: 'The Cistern', line: 'Water somewhere below, moving slowly.' },
  { at: 0.6, name: 'Old Workings', line: 'Tools left mid-job. Whatever interrupted them was quick.' },
  { at: 0.8, name: 'The Quiet Floor', line: 'No echo down here at all. Keep going.' },
  { at: 0.95, name: 'The Vault Door', line: 'Something on the other side has been waiting.' },
]

export function FocusDelve({ onFinish, onQuit }: GameProps) {
  const companion = useCompanion()
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [done, setDone] = useState(false)
  const [abandoned, setAbandoned] = useState(false)
  const finished = useRef(false)

  useEffect(() => {
    if (!startedAt || done) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [startedAt, done])

  const elapsed = startedAt ? now - startedAt : 0
  const progress = Math.min(1, elapsed / DELVE_MS)
  const remaining = Math.max(0, DELVE_MS - elapsed)

  useEffect(() => {
    if (progress >= 1 && !finished.current) {
      finished.current = true
      setDone(true)
      sfx.badge()
    }
  }, [progress])

  const depth = [...DEPTHS].reverse().find((d) => progress >= d.at) ?? DEPTHS[0]

  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="font-display text-sm text-clear-400">THE VAULT OPENS</div>
        {companion && (
          <KindredSprite
            speciesId={companion.speciesId}
            stage={companion.stage}
            size={96}
            className="hm-flash"
          />
        )}
        <div className="font-display text-2xl text-bone-100">{DELVE_MINUTES} minutes</div>
        <p className="max-w-xs text-sm text-bone-300/70">
          You stayed down the whole way. Whatever you were actually doing up there for those
          twenty-five minutes — that’s the loot.
        </p>
        <Button onClick={() => onFinish({ score: 1, durationSec: DELVE_MINUTES * 60 })}>
          Surface with the loot
        </Button>
      </div>
    )
  }

  if (abandoned) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="font-display text-sm text-amber-warn">TURNED BACK</div>
        <p className="max-w-xs text-sm text-bone-300/70">
          {Math.floor(elapsed / 60_000)} minutes down is still {Math.floor(elapsed / 60_000)}{' '}
          minutes you were somewhere else. No loot, no lecture.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onQuit}>
            Leave
          </Button>
          <Button
            onClick={() => {
              setAbandoned(false)
              setStartedAt(Date.now())
              finished.current = false
            }}
          >
            Go back down
          </Button>
        </div>
      </div>
    )
  }

  if (!startedAt) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="font-display text-sm text-bone-100">FOCUS DELVE</div>
        <p className="max-w-sm text-sm text-bone-300/80">
          Twenty-five minutes. Put the phone down and do the thing you’ve been avoiding — the delve
          runs whether you watch it or not. Come back up when the vault opens.
        </p>
        <p className="max-w-sm text-[12px] text-bone-300/60">
          Leaving early is allowed and costs you nothing but the loot.
        </p>
        <Button
          onClick={() => {
            setStartedAt(Date.now())
            setNow(Date.now())
          }}
        >
          Descend
        </Button>
        <button
          type="button"
          onClick={onQuit}
          className="font-display text-[9px] text-bone-300/60 hover:text-bone-100"
        >
          not now
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-between p-5">
      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] text-clear-400">{depth.name}</span>
        <button
          type="button"
          onClick={() => setAbandoned(true)}
          className="font-display text-[9px] text-bone-300/60 hover:text-bone-100"
        >
          turn back
        </button>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div
          className="grid place-items-center"
          style={{ transform: `translateY(${progress * 30}px)`, transition: 'transform 1s linear' }}
        >
          {companion && (
            <KindredSprite
              speciesId={companion.speciesId}
              stage={companion.stage}
              size={80}
              dimmed={companion.dimmed}
            />
          )}
        </div>
        <div className="font-display text-4xl text-bone-100" aria-live="off">
          {formatDuration(remaining / 1000)}
        </div>
        <p className="max-w-xs text-center text-sm text-bone-300/70">{depth.line}</p>
      </div>

      <div className="space-y-2">
        <ProgressBar value={progress * 100} max={100} tone="haze" label="Delve progress" />
        <p className="text-center text-[11px] text-bone-300/50">
          Depth {Math.round(progress * 100)}% · leave the app, that’s the idea
        </p>
      </div>
    </div>
  )
}
