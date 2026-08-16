import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase client is optional on purpose.
 *
 * Hollowmoor runs fully offline against localStorage when these env vars are
 * absent, so `npm run dev` works the second you clone the repo. Set them in
 * `.env.local` (see `.env.example`) to switch the whole app to the hosted
 * backend — friends, chat, presence, raids and the Grok edge function.
 *
 * The anon key is safe in the client; it is protected by Row Level Security.
 * `XAI_API_KEY` is NOT here and must never be — it lives only in the edge
 * function's environment.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

/**
 * Async on purpose: the supabase-js library is ~100KB and most players never
 * need it (offline mode is the default). Importing it here rather than at
 * module scope keeps it out of the initial bundle entirely.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Guests get an anonymous session; magic-link upgrades it in place.
        detectSessionInUrl: true,
        // PKCE returns the auth result as a `?code=` query param. The implicit
        // flow returns it in the URL *hash* — which this app uses for routing,
        // so the two would fight over the same fragment and the sign-in would
        // be swallowed by the router. Do not change this without moving off
        // HashRouter first.
        flowType: 'pkce',
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  }
  return client
}
