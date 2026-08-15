import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useGame, useGrit, useStreak } from '@/store/game'
import { useUi } from '@/store/ui'
import { setAudioEnabled, sfx } from '@/lib/audio'
import { HazeBackdrop } from './HazeBackdrop'
import { SupportSheet } from './SupportSheet'
import { CravingOverlay } from '@/features/craving/CravingOverlay'
import { Toasts } from './Toasts'

const NAV = [
  { to: '/hub', label: 'Restwick', glyph: '🏚' },
  { to: '/map', label: 'Region', glyph: '🗺' },
  { to: '/arcade', label: 'Arcade', glyph: '🕹' },
  { to: '/square', label: 'Square', glyph: '💬' },
  { to: '/menu', label: 'More', glyph: '☰' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const streak = useStreak()
  const grit = useGrit()
  const profile = useGame((s) => s.snapshot?.profile)
  const openCraving = useUi((s) => s.openCraving)
  const location = useLocation()

  // Keep the audio engine in sync with the player's setting.
  useEffect(() => {
    setAudioEnabled(!!profile?.settings.audioEnabled)
  }, [profile?.settings.audioEnabled])

  // The OS `prefers-reduced-motion` is honoured by CSS on its own; this is the
  // in-app override for people whose system setting doesn't match what they
  // want here.
  useEffect(() => {
    document.documentElement.classList.toggle(
      'hm-reduce-motion',
      profile?.settings.reducedMotion === true,
    )
  }, [profile?.settings.reducedMotion])

  // Scroll to top on navigation — long pages otherwise strand you mid-scroll.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="relative flex min-h-full flex-col">
      <HazeBackdrop streak={streak} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-clear-600 focus:px-3 focus:py-2 focus:font-display focus:text-[10px] focus:text-haze-950"
      >
        Skip to content
      </a>

      <TopBar streak={streak} grit={grit} />

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-3 pb-40 pt-3 sm:px-4">
        {children}
      </main>

      {/* The panic button. Present on every screen, always the same place. */}
      <button
        type="button"
        onClick={() => {
          sfx.hit()
          openCraving()
        }}
        className="fixed bottom-[calc(72px+var(--hm-safe-bottom))] right-3 z-30 border-2 border-ember-400 bg-ember-600 px-4 py-3 font-display text-[10px] text-bone-100 shadow-[0_4px_0_0_rgba(0,0,0,0.4)] active:translate-y-[2px] sm:right-4"
      >
        ⚡ Craving now
      </button>

      <BottomNav />
      <CravingOverlay />
      <SupportSheet />
      <Toasts />
    </div>
  )
}

function TopBar({ streak, grit }: { streak: number; grit: number }) {
  const online = useGame((s) => s.backend?.online ?? false)
  return (
    <header className="sticky top-0 z-20 border-b-2 border-haze-700 bg-haze-950/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[11px] text-bone-100">HOLLOWMOOR</span>
          {!online && (
            <span
              className="border border-haze-500 px-1 text-[9px] uppercase tracking-wider text-bone-300/60"
              title="No Supabase project configured — playing solo against Echo Breakers."
            >
              offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-[11px] text-clear-400" title="Clean-day streak">
            {streak}d
          </span>
          <span className="font-display text-[11px] text-ember-400" title="Grit">
            ✦{grit}
          </span>
        </div>
      </div>
    </header>
  )
}

function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-haze-700 bg-haze-950/95 backdrop-blur"
      style={{ paddingBottom: 'var(--hm-safe-bottom)' }}
      aria-label="Main"
    >
      <ul className="mx-auto flex w-full max-w-2xl">
        {NAV.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              onClick={() => sfx.select()}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[9px] uppercase tracking-wider transition-colors ${
                  isActive ? 'text-clear-400' : 'text-bone-300/60 hover:text-bone-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden="true" className="text-base leading-none">
                    {item.glyph}
                  </span>
                  <span className="font-display text-[8px]">{item.label}</span>
                  <span
                    className={`h-[2px] w-6 ${isActive ? 'bg-clear-500' : 'bg-transparent'}`}
                    aria-hidden="true"
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
