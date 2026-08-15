import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUi } from '@/store/ui'
import { useGame } from '@/store/game'
import { GAME_META, GameHost } from '@/features/games'
import { speciesName } from '@/data/kindred'
import { sfx } from '@/lib/audio'
import { SupportLink } from '@/components/SupportSheet'
import type { MinigameId } from '@/lib/types'

/**
 * The panic overlay behind the "Craving now" button.
 *
 * Two design rules, both deliberate: it opens straight into a game rather than
 * a menu (a menu is a place to change your mind), and it never asks whether you
 * are about to use — no interrogation, no shame gate, just something to do with
 * your hands for the ninety seconds that matter.
 */
export function CravingOverlay() {
  const game = useUi((s) => s.cravingGame)
  const close = useUi((s) => s.closeCraving)
  const toast = useUi((s) => s.toast)
  const submitMinigame = useGame((s) => s.submitMinigame)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!game) {
      setPicking(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [game, close])

  async function finish(id: MinigameId, result: { score: number; durationSec: number }) {
    try {
      const res = await submitMinigame({ ...result, game: id, fromCraving: true })
      sfx.grit()
      toast({
        tone: 'win',
        title: `+${res.gritEarned} Grit`,
        body: res.caught
          ? `A wild ${speciesName(res.caught, 1)} followed you out of the fog.`
          : 'Craving handled. That one’s behind you.',
      })
      if (res.caught) sfx.catchKindred()
    } catch (err) {
      toast({ tone: 'warn', title: 'Couldn’t save that run', body: (err as Error).message })
    }
    close()
  }

  return (
    <AnimatePresence>
      {game && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex flex-col bg-haze-950"
          role="dialog"
          aria-modal="true"
          aria-label="Craving tools"
        >
          <div className="flex items-center justify-between border-b-2 border-haze-700 px-3 py-2">
            <span className="font-display text-[10px] text-ember-400">RIDE IT OUT</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPicking((p) => !p)}
                className="font-display text-[9px] text-bone-300/70 hover:text-bone-100"
              >
                {picking ? 'back' : 'switch game'}
              </button>
              <button
                type="button"
                onClick={close}
                className="font-display text-[10px] text-bone-300/70 hover:text-bone-100"
                aria-label="Close craving tools"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {picking ? (
              <div className="mx-auto grid max-w-md gap-3 p-4">
                {GAME_META.map((meta) => (
                  <button
                    key={meta.id}
                    type="button"
                    onClick={() => {
                      sfx.select()
                      useUi.getState().openCraving(meta.id)
                      setPicking(false)
                    }}
                    className="hm-panel flex items-start gap-3 p-3 text-left hover:border-clear-600"
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {meta.glyph}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-[10px] text-bone-100">
                        {meta.name}
                      </span>
                      <span className="mt-1 block text-[12px] text-bone-300/70">{meta.purpose}</span>
                      <span className="mt-1 block text-[10px] text-clear-400">{meta.minutes}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <GameHost
                id={game}
                fromCraving
                onQuit={close}
                onFinish={(result) => void finish(game, result)}
              />
            )}
          </div>

          <div className="flex items-center justify-center border-t-2 border-haze-700 px-3 py-2">
            <SupportLink />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
