import { useQuery } from '@tanstack/react-query'
import { Panel, PageTitle, PanelTitle } from '@/components/ui'
import { useGame } from '@/store/game'
import { useUi } from '@/store/ui'
import { GAME_META } from '@/features/games'
import { getBackend } from '@/lib/backend'
import { sfx } from '@/lib/audio'
import type { MinigameId } from '@/lib/types'

/**
 * The arcade. Every game here is also a craving tool — the cards say plainly
 * what each one is actually good for, because "pick a distraction" is a much
 * easier decision when you're already white-knuckling.
 */
export function ArcadePage() {
  const openCraving = useUi((s) => s.openCraving)
  const snapshot = useGame((s) => s.snapshot)

  return (
    <div className="space-y-4">
      <PageTitle sub="Four ways to get through the next fifteen minutes. All of them pay Grit.">
        THE ARCADE
      </PageTitle>

      <div className="grid gap-3">
        {GAME_META.map((meta) => (
          <button
            key={meta.id}
            type="button"
            onClick={() => {
              sfx.select()
              openCraving(meta.id)
            }}
            className="hm-panel flex items-start gap-4 p-4 text-left hover:border-clear-600"
          >
            <span className="text-3xl leading-none" aria-hidden="true">
              {meta.glyph}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[11px] text-bone-100">{meta.name}</span>
                <span className="font-display text-[9px] text-clear-400">{meta.minutes}</span>
              </span>
              <span className="mt-1.5 block text-[12px] text-bone-300/75">{meta.tagline}</span>
              <span className="mt-1 block text-[11px] text-bone-300/55">{meta.purpose}</span>
              <span className="mt-2 block font-display text-[9px] text-ember-400">
                best today: {snapshot?.highScores[meta.id] ?? 0}
              </span>
            </span>
          </button>
        ))}
      </div>

      <HighScores />
    </div>
  )
}

function HighScores() {
  const today = useGame((s) => s.today)
  const me = useGame((s) => s.snapshot?.profile.id)
  const games: MinigameId[] = ['crusher', 'breath', 'memory', 'delve']

  const { data } = useQuery({
    queryKey: ['high-scores', today],
    queryFn: async () => {
      const backend = await getBackend()
      const rows = await Promise.all(
        games.map(async (g) => [g, await backend.game.highScores(g)] as const),
      )
      return Object.fromEntries(rows)
    },
  })

  if (!data) return null

  return (
    <Panel>
      <PanelTitle right={<span className="text-[9px] text-bone-300/40">resets daily</span>}>
        Today’s boards
      </PanelTitle>
      <div className="space-y-4">
        {games.map((g) => {
          const rows = (data[g] ?? []).filter((r) => r.score > 0).slice(0, 5)
          if (rows.length === 0) return null
          return (
            <div key={g}>
              <div className="mb-1 font-display text-[9px] text-clear-400 uppercase">{g}</div>
              <ol className="space-y-0.5">
                {rows.map((row, i) => (
                  <li
                    key={row.userId}
                    className={`flex justify-between text-[12px] ${
                      row.userId === me ? 'text-clear-400' : 'text-bone-300/70'
                    }`}
                  >
                    <span className="truncate">
                      {i + 1}. {row.handle}
                    </span>
                    <span className="font-display text-[10px]">{row.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
