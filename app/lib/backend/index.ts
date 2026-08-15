import type { Backend } from './types'
import { createLocalBackend } from './local'
import { isSupabaseConfigured } from '../supabase'

export * from './types'

let instance: Backend | null = null
let loading: Promise<Backend> | null = null

/**
 * Resolves the active backend.
 *
 * With Supabase env vars present we load the hosted backend (code-split, so
 * offline players never download it). Without them we fall back to the local
 * one — every screen still works, multiplayer is populated by Echo Breakers,
 * and the UI labels itself as offline.
 */
export async function getBackend(): Promise<Backend> {
  if (instance) return instance
  if (loading) return loading

  loading = (async () => {
    let resolved: Backend | null = null
    if (isSupabaseConfigured) {
      try {
        const mod = await import('./supabase')
        resolved = await mod.createSupabaseBackend()
      } catch (err) {
        console.error('[hollowmoor] Supabase backend failed to load, falling back to local.', err)
      }
    }
    instance = resolved ?? createLocalBackend()
    return instance
  })()

  return loading
}

/** Synchronous peek — null until `getBackend()` has resolved once. */
export function peekBackend(): Backend | null {
  return instance
}

export function backendModeHint(): 'local' | 'supabase' {
  return isSupabaseConfigured ? 'supabase' : 'local'
}
