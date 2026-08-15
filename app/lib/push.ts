import { getBackend } from './backend'
import { getSupabase, isSupabaseConfigured } from './supabase'

/**
 * Web push registration.
 *
 * Notifications are opt-in, revocable from Settings, and the server refuses to
 * send once the day is already logged (see hm_due_reminders). This module only
 * handles the browser half: permission, service worker, subscription.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushConfigured(): boolean {
  return pushSupported() && isSupabaseConfigured && !!VAPID_PUBLIC_KEY
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

function bufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.warn('[hollowmoor] service worker registration failed', err)
    return null
  }
}

export interface PushResult {
  ok: boolean
  message: string
}

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) {
    return { ok: false, message: 'This browser doesn’t support notifications.' }
  }
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Reminders need a Supabase project. See README → “Going online”.' }
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, message: 'No VAPID key configured. See README → “Notifications”.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, message: 'Notifications are blocked. You can turn them on in browser settings.' }
  }

  const registration = await registerServiceWorker()
  if (!registration) return { ok: false, message: 'Couldn’t start the service worker.' }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })

    const sb = await getSupabase()
    const { error } = await sb.rpc('hm_register_push', {
      p_endpoint: subscription.endpoint,
      p_p256dh: bufferToBase64Url(subscription.getKey('p256dh')),
      p_auth: bufferToBase64Url(subscription.getKey('auth')),
      // Negated: getTimezoneOffset returns minutes *behind* UTC.
      p_tz_offset: -new Date().getTimezoneOffset(),
    })
    if (error) return { ok: false, message: error.message }

    const backend = await getBackend()
    await backend.game.updateSettings({ pushEnabled: true })
    return { ok: true, message: 'Reminders on. One in the morning, one in the evening, and nothing once you’ve checked in.' }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}

export async function disablePush(): Promise<PushResult> {
  const backend = await getBackend()
  await backend.game.updateSettings({ pushEnabled: false })

  if (!pushSupported()) return { ok: true, message: 'Reminders off.' }
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      if (isSupabaseConfigured) {
        const sb = await getSupabase()
        await sb.rpc('hm_unregister_push', { p_endpoint: subscription.endpoint })
      }
      await subscription.unsubscribe()
    }
  } catch (err) {
    console.warn('[hollowmoor] failed to unsubscribe cleanly', err)
  }
  return { ok: true, message: 'Reminders off.' }
}
