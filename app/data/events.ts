/**
 * Seasonal events.
 *
 * The framework is deliberately date-driven rather than server-driven so an
 * event still runs offline. Each one can bump Grit, widen the wild pool, or
 * just change what the town says — enough to make a week feel different
 * without adding a second economy to balance.
 */

export interface SeasonalEvent {
  id: string
  name: string
  blurb: string
  /** `MM-DD` inclusive. Year-agnostic so events recur annually. */
  from: string
  to: string
  /** Multiplier on Grit earned during the window. */
  gritMultiplier: number
  /** Species that become catchable regardless of their usual streak gate. */
  featuredSpecies: string[]
  /** What the Dealer is up to this week. */
  dealerLine: string
}

export const EVENTS: SeasonalEvent[] = [
  {
    id: 'the-long-dark-week',
    name: 'The Long Dark',
    blurb:
      'The nights are at their longest and the Haze is thickest. Every clean day this week counts double.',
    from: '12-15',
    to: '12-31',
    gritMultiplier: 2,
    featuredSpecies: ['snoozle', 'lanternjack'],
    dealerLine: 'Long nights. Family. Nothing to do. This is my season, not yours.',
  },
  {
    id: 'new-year-fog',
    name: 'Resolution Fog',
    blurb:
      'Everyone starts in January. Most stop by February. Hold the line and the Codex opens up.',
    from: '01-01',
    to: '01-14',
    gritMultiplier: 1.5,
    featuredSpecies: ['clarion'],
    dealerLine: 'A resolution. Adorable. I give it eleven days.',
  },
  {
    id: 'the-bell-festival',
    name: 'The Bell Festival',
    blurb: 'Bellfield rings all week. Clear a trial while it does and the badge shines brighter.',
    from: '04-15',
    to: '04-25',
    gritMultiplier: 1.5,
    featuredSpecies: ['tickbell', 'hazelet'],
    dealerLine: 'You know what time it is. Everyone knows what time it is.',
  },
  {
    id: 'high-summer',
    name: 'Clearsummit Season',
    blurb: 'The fog line drops. Rare Kindred come down from the peak while it lasts.',
    from: '06-20',
    to: '07-05',
    gritMultiplier: 1.5,
    featuredSpecies: ['clarion', 'grithound'],
    dealerLine: 'Everyone’s outside being insufferable and clear-headed. Disgusting.',
  },
]

/** The event running on a given local date, if any. */
export function activeEvent(localDate: string): SeasonalEvent | null {
  const md = localDate.slice(5) // MM-DD
  return (
    EVENTS.find((e) =>
      // Windows never cross a year boundary in this set, so a plain compare works.
      e.from <= e.to ? md >= e.from && md <= e.to : md >= e.from || md <= e.to,
    ) ?? null
  )
}
