import { useEffect, useMemo, useRef, useState } from 'react'
import { KindredSprite } from '@/components/Sprite'
import { Button } from '@/components/ui'
import { useCompanion } from '@/store/game'
import { sfx } from '@/lib/audio'
import type { GameProps } from './types'

/**
 * Breath of the Deep — a 4-7-8 paced-breathing dive.
 *
 * This is the one minigame that is a real technique first and a game second.
 * 4-7-8 (inhale 4, hold 7, exhale 8) reliably drops arousal, and the long
 * exhale is the active ingredient — so the exhale phase is the one the visuals
 * give the most room to. The Kindred sinks on the inhale, hangs in the dark,
 * and rises on the exhale, which gives the count something to watch that isn't
 * a number ticking down.
 */

type Phase = 'in' | 'hold' | 'out' | 'rest'

const PHASES: { phase: Phase; seconds: number; label: string; hint: string }[] = [
  { phase: 'in', seconds: 4, label: 'Breathe in', hint: 'through your nose, filling low' },
  { phase: 'hold', seconds: 7, label: 'Hold', hint: 'loose shoulders, soft jaw' },
  { phase: 'out', seconds: 8, label: 'Breathe out', hint: 'slow, through your mouth' },
  { phase: 'rest', seconds: 2, label: 'Rest', hint: 'let the tide turn' },
]

const TARGET_ROUNDS = 4

export function BreathOfTheDeep({ onFinish, onQuit }: GameProps) {
  const companion = useCompanion()
  const [running, setRunning] = useState(false)
  const [{ index, remaining, rounds }, setClock] = useState({
    index: 0,
    remaining: PHASES[0].seconds,
    rounds: 0,
  })
  const [done, setDone] = useState(false)
  const startedAt = useRef(Date.now())

  const current = PHASES[index]

  // One tick, one atomic transition — the phase, its countdown and the round
  // counter all move together so they can never disagree.
  useEffect(() => {
    if (!running || done) return
    const timer = window.setInterval(() => {
      setClock((c) => {
        if (c.remaining > 1) return { ...c, remaining: c.remaining - 1 }
        const next = (c.index + 1) % PHASES.length
        const nextPhase = PHASES[next]
        if (nextPhase.phase === 'in') sfx.breatheIn()
        if (nextPhase.phase === 'out') sfx.breatheOut()
        return {
          index: next,
          remaining: nextPhase.seconds,
          rounds: next === 0 ? c.rounds + 1 : c.rounds,
        }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, done])

  useEffect(() => {
    if (rounds >= TARGET_ROUNDS && !done) {
      setDone(true)
      setRunning(false)
      sfx.win()
    }
  }, [rounds, done])

  // Depth: 0 at the surface, 1 at the bottom of the dive.
  const depth = useMemo(() => {
    const progress = 1 - remaining / current.seconds
    if (current.phase === 'in') return progress
    if (current.phase === 'hold') return 1
    if (current.phase === 'out') return 1 - progress
    return 0
  }, [current, remaining])

  if (done) {
    const seconds = Math.round((Date.now() - startedAt.current) / 1000)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="font-display text-sm text-clear-400">SURFACED</div>
        <div className="font-display text-3xl text-bone-100">{rounds}</div>
        <p className="max-w-xs text-sm text-bone-300/70">
          Four full rounds. Your heart rate is measurably lower than it was two minutes ago — that
          part isn’t a game mechanic.
        </p>
        <Button onClick={() => onFinish({ score: rounds, durationSec: seconds })}>
          Collect Grit
        </Button>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* The water column. Deeper is darker. */}
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          background: `linear-gradient(to bottom, #14e0bd${Math.round((1 - depth) * 40)
            .toString(16)
            .padStart(2, '0')}, #0b0716 ${40 + depth * 40}%)`,
        }}
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between px-3 py-2">
        <span className="font-display text-[10px] text-clear-400">
          round {Math.min(rounds + 1, TARGET_ROUNDS)}/{TARGET_ROUNDS}
        </span>
        <button
          type="button"
          onClick={onQuit}
          className="font-display text-[9px] text-bone-300/60 hover:text-bone-100"
        >
          quit
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6">
        {/* The breathing ring. Scale is the pace guide — watch it, follow it. */}
        <div className="relative grid place-items-center">
          <div
            className="absolute rounded-full border-2 border-clear-500/60"
            style={{
              width: 220,
              height: 220,
              transform: `scale(${0.55 + depth * 0.45})`,
              transition: `transform ${current.seconds}s linear`,
              boxShadow: '0 0 40px rgba(20,224,189,0.25)',
            }}
            aria-hidden="true"
          />
          <div
            style={{
              transform: `translateY(${depth * 42}px)`,
              transition: `transform ${current.seconds}s linear`,
            }}
          >
            {companion && (
              <KindredSprite
                speciesId={companion.speciesId}
                stage={companion.stage}
                size={88}
                dimmed={companion.dimmed}
                animate={false}
              />
            )}
          </div>
        </div>

        <div className="text-center" aria-live="polite">
          <div className="font-display text-sm text-bone-100">{current.label}</div>
          <div className="mt-2 font-display text-4xl text-clear-400">{remaining}</div>
          <p className="mt-2 text-[12px] text-bone-300/70">{current.hint}</p>
        </div>

        {!running && (
          <Button onClick={() => { setRunning(true); sfx.breatheIn() }}>Begin the dive</Button>
        )}
      </div>
    </div>
  )
}
