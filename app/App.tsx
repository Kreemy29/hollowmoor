import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useGame } from './store/game'
import { AuthPage } from './features/auth/AuthPage'
import { Onboarding } from './features/onboarding/Onboarding'
import { HubPage } from './features/hub/HubPage'
import { CheckinPage } from './features/checkin/CheckinPage'
import { Button, Panel } from './components/ui'

/**
 * Restwick and the check-in are loaded eagerly — they're the daily path and
 * must be instant. Everything else is code-split, so opening the app on a
 * phone downloads the loop and nothing else.
 */
const MapPage = lazy(() => import('./features/map/MapPage').then((m) => ({ default: m.MapPage })))
const KindredPage = lazy(() =>
  import('./features/kindred/KindredPage').then((m) => ({ default: m.KindredPage })),
)
const CodexPage = lazy(() =>
  import('./features/codex/CodexPage').then((m) => ({ default: m.CodexPage })),
)
const TrialsPage = lazy(() =>
  import('./features/trials/TrialsPage').then((m) => ({ default: m.TrialsPage })),
)
const ArcadePage = lazy(() =>
  import('./features/arcade/ArcadePage').then((m) => ({ default: m.ArcadePage })),
)
const SquarePage = lazy(() =>
  import('./features/square/SquarePage').then((m) => ({ default: m.SquarePage })),
)
const LeaderboardPage = lazy(() =>
  import('./features/social/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })),
)
const RaidPage = lazy(() =>
  import('./features/raid/RaidPage').then((m) => ({ default: m.RaidPage })),
)
const ArenaPage = lazy(() =>
  import('./features/arena/ArenaPage').then((m) => ({ default: m.ArenaPage })),
)
const ShopPage = lazy(() =>
  import('./features/shop/ShopPage').then((m) => ({ default: m.ShopPage })),
)
const MenuPage = lazy(() =>
  import('./features/menu/MenuPage').then((m) => ({ default: m.MenuPage })),
)
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

export function App() {
  const status = useGame((s) => s.status)
  const error = useGame((s) => s.error)
  const bootstrap = useGame((s) => s.bootstrap)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (status === 'loading') return <BootScreen />

  if (status === 'error') {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <Panel className="max-w-sm text-center">
          <h1 className="font-display text-[11px] text-amber-warn">The fog got thick</h1>
          <p className="mt-3 text-sm text-bone-300/80">{error}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Panel>
      </div>
    )
  }

  if (status === 'anonymous') {
    // The account screen comes first so someone returning to an evicted save
    // has a way back in, rather than being funnelled straight into creating a
    // second Breaker and losing the first one silently.
    if (location.pathname === '/start') return <Onboarding />
    if (location.pathname === '/welcome') {
      return <AuthPage onNewGame={() => navigate('/start')} />
    }
    return <Navigate to="/welcome" replace />
  }

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/hub" replace />} />
          <Route path="/start" element={<Navigate to="/hub" replace />} />
          <Route path="/welcome" element={<Navigate to="/hub" replace />} />
          <Route path="/hub" element={<HubPage />} />
          <Route path="/checkin" element={<CheckinPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/kindred" element={<KindredPage />} />
          <Route path="/codex" element={<CodexPage />} />
          <Route path="/trials" element={<TrialsPage />} />
          <Route path="/arcade" element={<ArcadePage />} />
          <Route path="/square" element={<SquarePage />} />
          <Route path="/board" element={<LeaderboardPage />} />
          <Route path="/raid" element={<RaidPage />} />
          <Route path="/arena" element={<ArenaPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

function BootScreen() {
  return (
    <div className="grid min-h-full place-items-center bg-haze-950 p-6">
      <div className="text-center">
        <div className="font-display text-sm text-bone-100">HOLLOWMOOR</div>
        <div className="mt-3 font-display text-[10px] text-haze-300 [animation:hm-pulse-glow_1.6s_ease-in-out_infinite]">
          parting the haze…
        </div>
      </div>
    </div>
  )
}

function RouteFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <span className="font-display text-[10px] text-bone-300/50">walking…</span>
    </div>
  )
}

function NotFound() {
  return (
    <Panel className="text-center">
      <h1 className="font-display text-[11px] text-bone-100">Nothing on this road</h1>
      <p className="mt-3 text-sm text-bone-300/70">
        The Haze swallowed whatever used to be here. Head back to Restwick.
      </p>
      <div className="mt-4">
        <Button onClick={() => window.history.back()}>Go back</Button>
      </div>
    </Panel>
  )
}
