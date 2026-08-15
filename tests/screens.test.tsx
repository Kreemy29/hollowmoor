import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useGame } from '@/store/game'

import { HubPage } from '@/features/hub/HubPage'
import { CheckinPage } from '@/features/checkin/CheckinPage'
import { MapPage } from '@/features/map/MapPage'
import { KindredPage } from '@/features/kindred/KindredPage'
import { CodexPage } from '@/features/codex/CodexPage'
import { TrialsPage } from '@/features/trials/TrialsPage'
import { ArcadePage } from '@/features/arcade/ArcadePage'
import { SquarePage } from '@/features/square/SquarePage'
import { LeaderboardPage } from '@/features/social/LeaderboardPage'
import { RaidPage } from '@/features/raid/RaidPage'
import { ArenaPage } from '@/features/arena/ArenaPage'
import { ShopPage } from '@/features/shop/ShopPage'
import { MenuPage } from '@/features/menu/MenuPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { Onboarding } from '@/features/onboarding/Onboarding'

/**
 * Render smoke tests.
 *
 * These don't assert on layout — they assert that every screen mounts against
 * a real backend snapshot without throwing. That's the class of bug that a
 * typecheck cannot catch and that would otherwise only surface as a white
 * screen on somebody's phone.
 */

beforeAll(() => {
  // jsdom has neither of these and several screens touch them on mount.
  window.scrollTo = vi.fn()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  localStorage.clear()
  useGame.setState({ status: 'loading', snapshot: null, backend: null, daily: null })
  await useGame.getState().bootstrap()
  await useGame.getState().createGuest({
    handle: 'screen_test',
    avatar: { skin: 1, hair: 1, outfit: 1, accessory: 1, accent: '#14e0bd' },
    starter: 'emberkin',
    seedDays: 9, // past the first evolution, so stage-2 rendering is covered
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const SCREENS: [string, () => ReactElement][] = [
  ['Restwick hub', () => <HubPage />],
  ['check-in battle', () => <CheckinPage />],
  ['region map', () => <MapPage />],
  ['companion', () => <KindredPage />],
  ['codex', () => <CodexPage />],
  ['trigger trials', () => <TrialsPage />],
  ['arcade', () => <ArcadePage />],
  ['town square', () => <SquarePage />],
  ['leaderboard', () => <LeaderboardPage />],
  ['raid', () => <RaidPage />],
  ['arena', () => <ArenaPage />],
  ['shop', () => <ShopPage />],
  ['menu', () => <MenuPage />],
  ['settings', () => <SettingsPage />],
]

describe('every screen mounts', () => {
  for (const [name, make] of SCREENS) {
    it(name, async () => {
      const { container } = wrap(make())
      await waitFor(() => expect(container.firstChild).toBeTruthy())
    })
  }
})

describe('onboarding', () => {
  it('opens on the Dealer, not a form', () => {
    useGame.setState({ status: 'anonymous', snapshot: null })
    wrap(<Onboarding />)
    expect(screen.getByText(/THE DEALER/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /step out of the fog/i })).toBeTruthy()
  })

  it('offers the support link before anyone has committed to anything', () => {
    useGame.setState({ status: 'anonymous', snapshot: null })
    wrap(<Onboarding />)
    expect(screen.getByRole('button', { name: /need real support/i })).toBeTruthy()
  })
})

describe('the hub shows the thing that matters', () => {
  it('leads with the companion and the streak', async () => {
    wrap(<HubPage />)
    // Streak and best are both 9 on a fresh seeded save, so match on the label.
    await waitFor(() => expect(screen.getByText('Streak')).toBeTruthy())
    expect(screen.getAllByText('9d').length).toBeGreaterThan(0)
    // Seeded at 9 days, so the Kindred should already be past its first stage.
    expect(screen.getByText(/stage 2/i)).toBeTruthy()
  })

  it('puts the check-in in front of you when the day is unlogged', async () => {
    wrap(<HubPage />)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /face today’s craving/i })).toBeTruthy(),
    )
  })
})

describe('the check-in offers both answers equally', () => {
  it('shows the honest relapse button as prominently as the clean one', async () => {
    wrap(<CheckinPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /i stayed out/i })).toBeTruthy())
    expect(screen.getByRole('button', { name: /the haze got me/i })).toBeTruthy()
  })
})

describe('settings', () => {
  it('offers data export and account deletion', async () => {
    wrap(<SettingsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /export my data/i })).toBeTruthy())
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeTruthy()
  })

  it('has sound off by default', async () => {
    wrap(<SettingsPage />)
    const toggle = await screen.findByRole('switch', { name: /sound/i })
    expect((toggle as HTMLInputElement).checked).toBe(false)
  })
})
