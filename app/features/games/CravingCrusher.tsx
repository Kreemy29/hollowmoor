import { useCallback, useRef, useState } from 'react'
import { PhaserMount } from '@/components/PhaserMount'
import { CRUSHER_DURATION_MS, makeCrusherScene } from '@/scenes/CrusherScene'
import { sfx } from '@/lib/audio'
import { Button, ProgressBar } from '@/components/ui'
import type { GameProps } from './types'

export function CravingCrusher({ onFinish, onQuit }: GameProps) {
  const [score, setScore] = useState(0)
  const [msLeft, setMsLeft] = useState(CRUSHER_DURATION_MS)
  const [done, setDone] = useState<number | null>(null)
  const finished = useRef(false)

  const create = useCallback(
    (phaser: Parameters<Parameters<typeof PhaserMount>[0]['create']>[0], parent: HTMLElement) => {
      const Scene = makeCrusherScene(phaser, {
        onScore: setScore,
        onTime: setMsLeft,
        onPop: () => sfx.pop(),
        onEnd: (final) => {
          if (finished.current) return
          finished.current = true
          sfx.win()
          setDone(final)
        },
      })
      return {
        type: phaser.AUTO,
        parent,
        backgroundColor: '#150e2b',
        scale: {
          mode: phaser.Scale.RESIZE,
          autoCenter: phaser.Scale.CENTER_BOTH,
        },
        scene: [Scene],
        audio: { noAudio: true },
      }
    },
    [],
  )

  if (done !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="font-display text-sm text-clear-400">FOGBANK CLEARED</div>
        <div className="font-display text-3xl text-bone-100">{done}</div>
        <p className="max-w-xs text-sm text-bone-300/70">
          That’s {done} bubbles and about 45 seconds you didn’t spend deciding. The peak has usually
          passed by now — check.
        </p>
        <Button onClick={() => onFinish({ score: done, durationSec: CRUSHER_DURATION_MS / 1000 })}>
          Collect Grit
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="font-display text-[10px] text-clear-400">{score} popped</span>
        <div className="flex-1">
          <ProgressBar
            value={msLeft}
            max={CRUSHER_DURATION_MS}
            tone="ember"
            height={8}
            label="Time left"
          />
        </div>
        <button
          type="button"
          onClick={onQuit}
          className="font-display text-[9px] text-bone-300/60 hover:text-bone-100"
        >
          quit
        </button>
      </div>
      <PhaserMount create={create} className="min-h-0 flex-1" ariaLabel="Craving Crusher" />
    </div>
  )
}
