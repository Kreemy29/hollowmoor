import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/*
        HashRouter, not BrowserRouter, on purpose.

        Clean paths need the host to rewrite every unknown URL to index.html.
        Miss that one setting and /checkin, /hub, shared invite links, home
        screen shortcuts and every hard refresh return 404 — which is a silent
        trap that costs a real player their session. Hash routing moves routing
        entirely into the client: it works on any static host with zero
        configuration, and it cannot be broken by a dashboard setting nobody
        remembered to tick.

        Trade-off accepted: URLs carry a `#`. If you later add the rewrite
        (see README → Deploying to Render), switching back is this one import.
      */}
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
