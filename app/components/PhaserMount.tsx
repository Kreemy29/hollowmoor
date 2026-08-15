import { useEffect, useRef, useState } from 'react'
import type Phaser from 'phaser'

export interface PhaserGameHandle {
  destroy: () => void
}

/**
 * Mounts a Phaser game inside React.
 *
 * Phaser is code-split (see vite.config manualChunks) and only imported when a
 * canvas screen is actually opened, so the check-in loop — the thing people
 * open every day — never pays for a 1MB engine. React owns all the chrome;
 * Phaser owns only the canvas.
 */
export function PhaserMount({
  create,
  className = '',
  ariaLabel,
}: {
  /** Builds the Phaser config for a given parent element. */
  create: (phaser: typeof Phaser, parent: HTMLElement) => Phaser.Types.Core.GameConfig
  className?: string
  ariaLabel: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const phaser = await import('phaser')
        if (cancelled || !hostRef.current) return
        const config = create(phaser.default ?? phaser, hostRef.current)
        gameRef.current = new (phaser.default ?? phaser).Game(config)
        setStatus('ready')
      } catch (err) {
        console.error('[hollowmoor] Phaser failed to start', err)
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
    // `create` is intentionally excluded: the scene owns its own lifecycle and
    // re-creating the game on every render would restart the minigame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`relative ${className}`}>
      <div ref={hostRef} className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full" aria-label={ariaLabel} role="application" />
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center font-display text-[10px] text-bone-300/70">
          loading the fog…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center font-display text-[10px] text-amber-warn">
          Couldn’t start this one. Try another game.
        </div>
      )}
    </div>
  )
}
