import { useEffect, useMemo, useRef, useState } from 'react'
import { KindredSprite } from '@/components/Sprite'
import { Button } from '@/components/ui'
import { KINDRED } from '@/data/kindred'
import { sfx } from '@/lib/audio'
import type { GameProps } from './types'

/**
 * Memory of Restwick — card match.
 *
 * Six pairs of Kindred face down on the notice board. Its job is occupying
 * working memory: it is very hard to negotiate with yourself while holding a
 * grid of positions in your head, which is the whole point.
 *
 * Score is pairs matched, so a partial run still pays — quitting a card game
 * you're losing should never feel like another failure.
 */

const PAIRS = 6

interface Card {
  key: string
  speciesId: string
  flipped: boolean
  matched: boolean
}

function deal(): Card[] {
  const pool = [...KINDRED].sort(() => Math.random() - 0.5).slice(0, PAIRS)
  const cards = pool.flatMap((s, i) => [
    { key: `${s.id}-a-${i}`, speciesId: s.id, flipped: false, matched: false },
    { key: `${s.id}-b-${i}`, speciesId: s.id, flipped: false, matched: false },
  ])
  return cards.sort(() => Math.random() - 0.5)
}

export function MemoryOfRestwick({ onFinish, onQuit }: GameProps) {
  const [cards, setCards] = useState<Card[]>(() => deal())
  const [picked, setPicked] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const startedAt = useRef(Date.now())
  const locked = picked.length === 2

  const matchedPairs = useMemo(
    () => cards.filter((c) => c.matched).length / 2,
    [cards],
  )
  const complete = matchedPairs === PAIRS

  // Read the board through a ref so resolving a pair depends only on the two
  // picks — otherwise the effect re-fires on its own setCards and double-counts.
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  useEffect(() => {
    if (picked.length !== 2) return
    const [a, b] = picked
    const isMatch = cardsRef.current[a].speciesId === cardsRef.current[b].speciesId
    if (isMatch) sfx.catchKindred()
    else sfx.back()
    const timer = window.setTimeout(
      () => {
        setCards((prev) =>
          prev.map((c, i) => (i === a || i === b ? { ...c, matched: isMatch, flipped: isMatch } : c)),
        )
        setPicked([])
      },
      isMatch ? 320 : 720,
    )
    return () => window.clearTimeout(timer)
  }, [picked])

  useEffect(() => {
    if (complete) sfx.win()
  }, [complete])

  function flip(i: number) {
    if (locked || cards[i].flipped || cards[i].matched) return
    sfx.select()
    if (picked.length === 1) setMoves((m) => m + 1)
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, flipped: true } : c)))
    setPicked((p) => [...p, i])
  }

  if (complete) {
    const seconds = Math.round((Date.now() - startedAt.current) / 1000)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="font-display text-sm text-clear-400">BOARD CLEARED</div>
        <div className="font-display text-3xl text-bone-100">{PAIRS} pairs</div>
        <p className="max-w-xs text-sm text-bone-300/70">
          {moves} flips, {seconds} seconds. The lamps stay on in Restwick tonight.
        </p>
        <Button onClick={() => onFinish({ score: PAIRS * 2, durationSec: seconds })}>
          Collect Grit
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-display text-[10px] text-clear-400">
          {matchedPairs}/{PAIRS} pairs
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onFinish({
                score: matchedPairs * 2,
                durationSec: Math.round((Date.now() - startedAt.current) / 1000),
              })
            }
            className="font-display text-[9px] text-clear-400 hover:text-clear-500"
          >
            cash out
          </button>
          <button
            type="button"
            onClick={onQuit}
            className="font-display text-[9px] text-bone-300/60 hover:text-bone-100"
          >
            quit
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 content-center gap-2 p-3 sm:grid-cols-4">
        {cards.map((card, i) => {
          const face = card.flipped || card.matched
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => flip(i)}
              aria-label={face ? `Card showing ${card.speciesId}` : 'Face-down card'}
              aria-pressed={face}
              className={`grid aspect-square place-items-center border-2 transition-colors ${
                card.matched
                  ? 'border-clear-500 bg-clear-600/15'
                  : face
                    ? 'border-haze-400 bg-haze-800'
                    : 'border-haze-600 bg-haze-900 hover:border-haze-400'
              }`}
            >
              {face ? (
                <KindredSprite
                  speciesId={card.speciesId}
                  stage={1}
                  size={52}
                  animate={false}
                />
              ) : (
                <span className="font-display text-[14px] text-haze-400" aria-hidden="true">
                  ?
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
