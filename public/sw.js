/* Hollowmoor service worker — push notifications only.
 *
 * Deliberately minimal: no offline caching of app shell, because a stale
 * bundle on a daily-check-in app causes more confusion than it saves.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Hollowmoor', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Hollowmoor'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'hollowmoor',
    renotify: false,
    data: { url: payload.url || '/hub' },
    actions: payload.actions || [{ action: 'checkin', title: 'Check in' }],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.action === 'checkin' ? '/checkin' : event.notification.data?.url || '/hub'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab if there is one — never stack duplicates.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
