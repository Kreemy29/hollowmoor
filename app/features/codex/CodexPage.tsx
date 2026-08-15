import { useState } from 'react'
import { KindredSprite } from '@/components/Sprite'
import { Chip, Panel, PageTitle, ProgressBar } from '@/components/ui'
import { useGame } from '@/store/game'
import { KINDRED } from '@/data/kindred'
import type { KindredDef } from '@/data/kindred'

const RARITY_TONE = {
  common: 'haze',
  uncommon: 'clear',
  rare: 'ember',
  mythic: 'warn',
} as const

/** The Codex — every Kindred in Hollowmoor, caught or still out in the fog. */
export function CodexPage() {
  const snapshot = useGame((s) => s.snapshot)
  const [selected, setSelected] = useState<KindredDef | null>(null)

  if (!snapshot) return null
  const owned = new Map(snapshot.kindred.map((k) => [k.speciesId, k]))
  const caughtCount = KINDRED.filter((k) => owned.has(k.id)).length

  return (
    <div className="space-y-4">
      <PageTitle sub="Every creature in the region. Caught ones show their stage; the rest are silhouettes until you meet them.">
        THE CODEX
      </PageTitle>

      <Panel>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-bone-300/70">Recorded</span>
          <span className="font-display text-[11px] text-clear-400">
            {caughtCount} / {KINDRED.length}
          </span>
        </div>
        <ProgressBar value={caughtCount} max={KINDRED.length} tone="clear" label="Codex completion" />
      </Panel>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {KINDRED.map((species) => {
          const mine = owned.get(species.id)
          return (
            <button
              key={species.id}
              type="button"
              onClick={() => setSelected(species)}
              className={`flex flex-col items-center gap-1 border-2 p-2 transition-colors ${
                mine ? 'border-haze-600 bg-haze-900/50 hover:border-clear-600' : 'border-haze-800 bg-haze-950'
              }`}
              aria-label={mine ? species.stageNames[mine.stage - 1] : `Unknown, number ${species.dexNo}`}
            >
              <span className="self-start font-display text-[8px] text-bone-300/40">
                #{String(species.dexNo).padStart(3, '0')}
              </span>
              {mine ? (
                <KindredSprite
                  speciesId={species.id}
                  stage={mine.stage}
                  size={56}
                  animate={false}
                  dimmed={mine.dimmed}
                />
              ) : (
                <div className="opacity-25 grayscale">
                  <KindredSprite speciesId={species.id} stage={1} size={56} animate={false} dimmed />
                </div>
              )}
              <span className="truncate text-[9px] text-bone-300/70">
                {mine ? species.stageNames[mine.stage - 1] : '???'}
              </span>
            </button>
          )
        })}
      </div>

      {selected && (
        <CodexDetail
          species={selected}
          ownedStage={owned.get(selected.id)?.stage ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function CodexDetail({
  species,
  ownedStage,
  onClose,
}: {
  species: KindredDef
  ownedStage: 1 | 2 | 3 | null
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-haze-950/85 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Codex entry ${species.dexNo}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="hm-panel hm-rise max-h-[85vh] w-full max-w-md overflow-y-auto p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-[9px] text-bone-300/50">
              #{String(species.dexNo).padStart(3, '0')}
            </div>
            <h2 className="mt-1 font-display text-[12px] text-bone-100">
              {ownedStage ? species.stageNames[ownedStage - 1] : '???'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-display text-[11px] text-bone-300/60 hover:text-bone-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex justify-center gap-3">
          {species.stageNames.map((_, i) => {
            const stage = (i + 1) as 1 | 2 | 3
            const known = ownedStage !== null && ownedStage >= stage
            return (
              <div key={stage} className="text-center">
                <div className={known ? '' : 'opacity-20 grayscale'}>
                  <KindredSprite
                    speciesId={species.id}
                    stage={stage}
                    size={64}
                    animate={false}
                    dimmed={!known}
                  />
                </div>
                <div className="mt-1 text-[9px] text-bone-300/60">
                  {known ? species.stageNames[i] : '???'}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip tone={RARITY_TONE[species.rarity]}>{species.rarity}</Chip>
          <Chip tone="clear">{species.strength}</Chip>
          {!species.isStarter && <Chip>appears from day {species.appearsAt}</Chip>}
        </div>

        <p className="mt-4 text-sm text-bone-300/85">
          {ownedStage
            ? species.dexEntry
            : 'No record. Hollowmoor keeps its own until you meet them out on the routes.'}
        </p>
      </div>
    </div>
  )
}
