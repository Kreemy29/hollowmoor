import { useState } from 'react'
import { KindredSprite } from '@/components/Sprite'
import { Button, Chip, Panel, PanelTitle, PageTitle, ProgressBar } from '@/components/ui'
import { useCompanion, useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { speciesById, speciesName } from '@/data/kindred'
import { EVOLVE_AT, stageProgress } from '@/lib/rules'

/** Companion detail: the stage ladder, the nickname, and the party swap. */
export function KindredPage() {
  const snapshot = useGame((s) => s.snapshot)
  const companion = useCompanion()
  const setCompanion = useGame((s) => s.setCompanion)
  const renameKindred = useGame((s) => s.renameKindred)
  const toast = useUi((s) => s.toast)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  if (!snapshot || !companion) return null
  const species = speciesById(companion.speciesId)
  if (!species) return null
  const progress = stageProgress(companion)
  const streak = snapshot.streaks.currentStreak

  return (
    <div className="space-y-4">
      <PageTitle>YOUR KINDRED</PageTitle>

      <Panel className="text-center">
        <KindredSprite
          speciesId={companion.speciesId}
          stage={companion.stage}
          dimmed={companion.dimmed}
          size={144}
        />
        <div className="mt-3 flex items-center justify-center gap-2">
          <h2 className="font-display text-[12px] text-bone-100">
            {companion.nickname || speciesName(companion.speciesId, companion.stage)}
          </h2>
          <Chip tone={companion.dimmed ? 'warn' : 'clear'}>
            {companion.dimmed ? 'asleep' : `stage ${companion.stage}`}
          </Chip>
        </div>
        {companion.nickname && (
          <p className="mt-1 text-[11px] text-bone-300/50">
            {speciesName(companion.speciesId, companion.stage)}
          </p>
        )}
        <p className="mt-3 text-sm text-bone-300/75">{species.dexEntry}</p>

        <div className="mt-4">
          <ProgressBar
            value={progress.needed ? progress.current : 1}
            max={progress.needed || 1}
            tone="clear"
            label="Stage XP"
          />
          <p className="mt-1.5 text-[11px] text-bone-300/60">
            {progress.needed ? `${progress.current} / ${progress.needed} XP this stage` : 'Max stage'}
          </p>
        </div>

        {editing ? (
          <div className="mt-4 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 18))}
              placeholder={speciesName(companion.speciesId, companion.stage)}
              aria-label="Nickname"
              className="min-w-0 flex-1 border-2 border-haze-600 bg-haze-950 px-3 py-2 text-sm text-bone-100"
            />
            <Button
              onClick={async () => {
                await renameKindred(companion.id, name.trim() || null)
                setEditing(false)
                toast({ tone: 'info', title: 'Name set' })
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => {
              setName(companion.nickname ?? '')
              setEditing(true)
            }}
          >
            {companion.nickname ? 'Rename' : 'Give it a name'}
          </Button>
        )}
      </Panel>

      {/* The stage ladder — the loss-aversion engine, drawn plainly. */}
      <Panel>
        <PanelTitle>Evolution</PanelTitle>
        <ol className="space-y-2">
          {species.stageNames.map((stageName, i) => {
            const stage = (i + 1) as 1 | 2 | 3
            const gate = i === 0 ? 0 : EVOLVE_AT[i - 1]
            const reached = companion.stage >= stage
            return (
              <li
                key={stageName}
                className={`flex items-center gap-3 border-2 p-2 ${
                  companion.stage === stage ? 'border-clear-500' : 'border-haze-700'
                } ${reached ? '' : 'opacity-45'}`}
              >
                <KindredSprite
                  speciesId={companion.speciesId}
                  stage={stage}
                  size={48}
                  animate={false}
                  dimmed={!reached}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[10px] text-bone-100">{stageName}</div>
                  <div className="text-[11px] text-bone-300/60">
                    {gate === 0 ? 'from day one' : `${gate}-day streak`}
                  </div>
                </div>
                {!reached && gate > streak && (
                  <span className="font-display text-[9px] text-haze-300">
                    {gate - streak}d
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        <p className="mt-3 text-[11px] text-bone-300/60">
          A relapse dims your Kindred by exactly one stage — never back to the start. You re-earn the
          stage by rebuilding the streak.
        </p>
      </Panel>

      {snapshot.kindred.length > 1 && (
        <Panel>
          <PanelTitle>Swap companion</PanelTitle>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {snapshot.kindred.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => void setCompanion(k.id)}
                className={`flex flex-col items-center gap-1 border-2 p-2 ${
                  k.isCompanion ? 'border-clear-500' : 'border-haze-700 hover:border-haze-400'
                }`}
              >
                <KindredSprite speciesId={k.speciesId} stage={k.stage} size={44} animate={false} />
                <span className="truncate text-[9px] text-bone-300/70">
                  {k.nickname || speciesName(k.speciesId, k.stage)}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-bone-300/60">
            Only your companion evolves with your streak. Everything else in the Codex keeps the
            stage it was caught at.
          </p>
        </Panel>
      )}
    </div>
  )
}
