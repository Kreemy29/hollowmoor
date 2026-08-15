import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Chip, Panel, PanelTitle, PageTitle } from '@/components/ui'
import { useGame, useGrit } from '@/store/game'
import { useUi } from '@/store/ui'
import { getBackend } from '@/lib/backend'
import { itemById } from '@/data/items'
import { sfx } from '@/lib/audio'

const CATEGORY_LABEL: Record<string, string> = {
  utility: 'Rest Stop supplies',
  cosmetic: 'Look',
  sticker: 'Stickers',
  decoration: 'Town square',
}

/**
 * The Restwick shop. Utilities are always stocked; everything else rotates
 * weekly so there's a reason to look on a Monday.
 *
 * Nothing sold here buys a streak, shortens a trial, or fakes progress (§6.7).
 */
export function ShopPage() {
  const grit = useGrit()
  const refresh = useGame((s) => s.refresh)
  const toast = useUi((s) => s.toast)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['shop'],
    queryFn: async () => (await getBackend()).game.shop(),
  })

  const buy = useMutation({
    mutationFn: async (itemId: string) => (await getBackend()).game.buyItem(itemId),
    onSuccess: async () => {
      sfx.grit()
      toast({ tone: 'win', title: 'Bought' })
      await refresh()
      void qc.invalidateQueries({ queryKey: ['shop'] })
    },
    onError: (err: Error) => toast({ tone: 'warn', title: 'No sale', body: err.message }),
  })

  const equip = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) =>
      (await getBackend()).game.equipItem(id, on),
    onSuccess: async () => {
      sfx.select()
      await refresh()
      void qc.invalidateQueries({ queryKey: ['shop'] })
    },
  })

  if (!data) return null

  const owned = new Map(data.inventory.map((i) => [i.itemId, i]))
  const grouped = data.stock
    .map((id) => itemById(id))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .reduce<Record<string, NonNullable<ReturnType<typeof itemById>>[]>>((acc, item) => {
      ;(acc[item.category] ??= []).push(item)
      return acc
    }, {})

  return (
    <div className="space-y-4">
      <PageTitle sub="Grit buys look, noise and one honest utility. It does not buy days.">
        THE SHOP
      </PageTitle>

      <Panel>
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-bone-300/70">Your Grit</span>
          <span className="font-display text-lg text-ember-400">✦{grit}</span>
        </div>
      </Panel>

      {Object.entries(grouped).map(([category, items]) => (
        <Panel key={category}>
          <PanelTitle
            right={
              category !== 'utility' ? (
                <span className="text-[9px] text-bone-300/40">rotates weekly</span>
              ) : undefined
            }
          >
            {CATEGORY_LABEL[category] ?? category}
          </PanelTitle>

          <ul className="space-y-3">
            {items.map((item) => {
              const mine = owned.get(item.id)
              const isConsumable = item.category === 'utility'
              return (
                <li key={item.id} className="border-l-4 border-haze-600 pl-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-bone-100">{item.name}</span>
                    <span className="shrink-0 font-display text-[10px] text-ember-400">
                      ✦{item.price}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-bone-300/65">{item.description}</p>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      className="py-2"
                      variant={mine && !isConsumable ? 'ghost' : 'ember'}
                      disabled={grit < item.price || buy.isPending || (!!mine && !isConsumable)}
                      onClick={() => buy.mutate(item.id)}
                    >
                      {mine && !isConsumable ? 'Owned' : 'Buy'}
                    </Button>

                    {mine && !isConsumable && (
                      <Button
                        className="py-2"
                        variant={mine.equipped ? 'primary' : 'ghost'}
                        onClick={() => equip.mutate({ id: item.id, on: !mine.equipped })}
                      >
                        {mine.equipped ? 'Equipped' : 'Equip'}
                      </Button>
                    )}
                    {mine && isConsumable && <Chip tone="clear">x{mine.quantity}</Chip>}
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      ))}
    </div>
  )
}
