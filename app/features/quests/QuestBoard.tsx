import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Panel, PanelTitle, ProgressBar } from '@/components/ui'
import { useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { sfx } from '@/lib/audio'

/** The Restwick notice board: three dailies and one weekly, claimable when full. */
export function QuestBoard() {
  const today = useGame((s) => s.today)
  const refresh = useGame((s) => s.refresh)
  const toast = useUi((s) => s.toast)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['quests', today],
    queryFn: async () => (await getBackend()).game.quests(),
  })

  const claim = useMutation({
    mutationFn: async (questId: string) => (await getBackend()).game.claimQuest(questId),
    onSuccess: async (res) => {
      sfx.grit()
      toast({ tone: 'win', title: `+${res.gritEarned} Grit`, body: 'Notice board cleared.' })
      await qc.invalidateQueries({ queryKey: ['quests'] })
      await refresh()
    },
    onError: (err: Error) => toast({ tone: 'warn', title: 'Can’t claim that', body: err.message }),
  })

  if (isLoading || !data) return null

  return (
    <Panel>
      <PanelTitle>Notice board</PanelTitle>
      <ul className="space-y-3">
        {data.defs.map((def) => {
          const progress = data.progress.find((p) => p.questId === def.id)
          const value = progress?.progress ?? 0
          const complete = value >= def.target
          const claimed = progress?.claimed ?? false

          return (
            <li key={def.id} className="border-l-4 border-haze-600 pl-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm ${claimed ? 'text-bone-300/40 line-through' : 'text-bone-100'}`}>
                  {def.title}
                </span>
                <span className="shrink-0 font-display text-[9px] text-ember-400">
                  ✦{def.gritReward}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-bone-300/65">{def.description}</p>

              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1">
                  <ProgressBar
                    value={value}
                    max={def.target}
                    tone={complete ? 'clear' : 'haze'}
                    height={8}
                    label={def.title}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-[10px] text-bone-300/60">
                  {Math.min(value, def.target)}/{def.target}
                </span>
              </div>

              {complete && !claimed && (
                <Button
                  className="mt-2 w-full py-2"
                  disabled={claim.isPending}
                  onClick={() => claim.mutate(def.id)}
                >
                  Claim ✦{def.gritReward}
                </Button>
              )}
              {def.cadence === 'weekly' && (
                <span className="mt-1 inline-block text-[9px] uppercase tracking-widest text-haze-300">
                  weekly
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
