const CACHE_NAME = 'kala-static-v10'
// Only immutable static files are cached. Pages and API responses (which carry private
// data) always go to the network and are never stored on the device.
const APP_SHELL = ['/manifest.webmanifest', '/brand/icon-192.png', '/brand/icon-512.png']
const CACHEABLE = /^\/(_next\/static|brand|excalidraw)\//

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !CACHEABLE.test(url.pathname)) return
  // Cache first: these files are content-hashed and never change.
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          }
          return response
        }),
    ),
  )
})

// Reminders from the server (meetings, deadlines, morning digest). See src/lib/push.ts.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'ಸKala²', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'ಸKala²', {
      body: payload.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin)
  event.waitUntil(
    (async () => {
      // Meeting links open in a new window; app pages reuse an open ಸKala² window.
      if (target.origin !== self.location.origin) return self.clients.openWindow(target.href)
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => 'focus' in client)
      if (existing) {
        await existing.focus()
        return existing.navigate(target.href).catch(() => undefined)
      }
      return self.clients.openWindow(target.href)
    })(),
  )
})
