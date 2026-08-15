import type { Item } from '@/lib/types'

/**
 * Shop stock. Hard rule from §6.7: nothing here buys a streak, shortens a
 * trial, or fakes progress. Grit buys look, noise and one honest utility.
 */
export const ITEMS: Item[] = [
  // --- Utility -------------------------------------------------------------
  {
    id: 'freeze-token',
    name: 'Stillglass Token',
    description:
      'Holds your chain for one day you genuinely could not check in. Cannot cover a relapse — the app would stop working if it could.',
    category: 'utility',
    price: 260,
    payload: { grants: 'freeze' },
  },
  {
    id: 'codex-lens',
    name: 'Codex Lens',
    description: 'Doubles your odds of a wild Kindred showing up after a minigame, for one day.',
    category: 'utility',
    price: 180,
    payload: { effect: 'catch_boost', hours: 24 },
  },

  // --- Avatar cosmetics ----------------------------------------------------
  { id: 'accent-ember', name: 'Ember Aura', description: 'Burnt-orange glow around your marker in the square.', category: 'cosmetic', price: 120, payload: { accent: '#ff7a2f' } },
  { id: 'accent-clear', name: 'Clearwater Aura', description: 'The toxic-teal of a clear head.', category: 'cosmetic', price: 120, payload: { accent: '#14e0bd' } },
  { id: 'accent-violet', name: 'Violet Aura', description: 'Haze purple, worn on purpose. Know your enemy.', category: 'cosmetic', price: 120, payload: { accent: '#9a80ff' } },
  { id: 'accent-bone', name: 'Bone Aura', description: 'Plain white. Extremely smug.', category: 'cosmetic', price: 200, payload: { accent: '#f6f2ea' } },
  { id: 'accent-gold', name: 'Coinfall Gold', description: 'For Breakers who made it past Payday.', category: 'cosmetic', price: 400, payload: { accent: '#ffb020' } },

  // --- Kindred skins -------------------------------------------------------
  { id: 'skin-frost', name: 'Frostmark Coat', description: 'Cools your companion’s palette to winter blue.', category: 'cosmetic', price: 300, payload: { hueShift: 200 } },
  { id: 'skin-ash', name: 'Ashfall Coat', description: 'Grey and orange, like something that walked out of a fire.', category: 'cosmetic', price: 300, payload: { hueShift: 20 } },
  { id: 'skin-void', name: 'Hollow Coat', description: 'Deep violet. Slightly unsettling. Very popular.', category: 'cosmetic', price: 450, payload: { hueShift: 280 } },

  // --- Chat stickers -------------------------------------------------------
  { id: 'sticker-nope', name: 'Sticker: FLAT NO', description: 'For when someone offers and you do not feel like typing.', category: 'sticker', price: 90, payload: { glyph: '🚫' } },
  { id: 'sticker-fog', name: 'Sticker: FOG OFF', description: 'Aimed squarely at the Dealer.', category: 'sticker', price: 90, payload: { glyph: '🌫️' } },
  { id: 'sticker-streak', name: 'Sticker: NUMBERS', description: 'Post it when your streak speaks for itself.', category: 'sticker', price: 90, payload: { glyph: '📈' } },
  { id: 'sticker-ember', name: 'Sticker: EMBER', description: 'Hype a friend without saying anything embarrassing.', category: 'sticker', price: 90, payload: { glyph: '🔥' } },
  { id: 'sticker-titan', name: 'Sticker: TITAN DOWN', description: 'Unlocked bragging rights, in sticker form.', category: 'sticker', price: 150, payload: { glyph: '💥' } },

  // --- Town decorations ----------------------------------------------------
  { id: 'deco-lantern', name: 'Restwick Lantern', description: 'Hangs by your marker in the town square.', category: 'decoration', price: 220, payload: { glyph: '🏮' } },
  { id: 'deco-bench', name: 'The Good Bench', description: 'A bench you sit on for entirely different reasons now.', category: 'decoration', price: 260, payload: { glyph: '🪑' } },
  { id: 'deco-banner', name: 'Breaker Banner', description: 'Flies your streak over the square.', category: 'decoration', price: 380, payload: { glyph: '🚩' } },
]

export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id)
}

/**
 * Weekly rotating stock: utilities are always available, cosmetics rotate so
 * there's a reason to look at the shop on a Monday.
 */
export function weeklyStock(weekKeyValue: string): string[] {
  const always = ITEMS.filter((i) => i.category === 'utility').map((i) => i.id)
  const rotating = ITEMS.filter((i) => i.category !== 'utility')
  let seed = 0
  for (let i = 0; i < weekKeyValue.length; i += 1) seed = (seed * 31 + weekKeyValue.charCodeAt(i)) | 0
  const shuffled = [...rotating].sort((a, b) => {
    const ha = Math.abs((seed ^ a.id.charCodeAt(0) * 7919) % 1000)
    const hb = Math.abs((seed ^ b.id.charCodeAt(0) * 7919) % 1000)
    return ha - hb || a.id.localeCompare(b.id)
  })
  return [...always, ...shuffled.slice(0, 6).map((i) => i.id)]
}
