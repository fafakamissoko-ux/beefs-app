// Service Worker for PWA — Network First strategy
const CACHE_VERSION = 'beefs-v3';
const STATIC_CACHE = `beefs-static-${CACHE_VERSION}`;

// Install — skip waiting immediately, no pre-caching
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate — delete ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE)
            .map((name) => caches.delete(name)),
        ),
      ),
      self.clients.claim().catch(() => console.warn('Clients claim bypassed')),
    ]),
  );
});

// Fetch — Network First for everything dynamic
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from our origin
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // Never cache: API routes, auth, Next.js internals, HTML pages
  const neverCache = [
    '/api/',
    '/auth/',
    '/_next/webpack',
    '/_next/static/chunks',
  ];
  if (neverCache.some((p) => url.pathname.startsWith(p))) return;

  // For Next.js static files (_next/static/media, images) → Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // For ALL pages (/, /profile, /feed, etc.) → Network First, NO cache
  // This ensures fresh data is always loaded
  event.respondWith(
    fetch(request).catch(() => caches.match('/offline'))
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Beefs';
  const options = {
    body: data.body || 'Nouveau beef en live!',
    icon: '/icon-192.png',
    tag: data.tag || 'default',
    data: data.data || {},
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const urlToOpen = event.notification.data?.url || '/feed';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
