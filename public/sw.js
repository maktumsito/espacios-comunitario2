// Service Worker for Community Spaces & Workshops (PWA + Push Notifications)
// Handles offline caching, asset fallbacks, background push notifications, and vibration

const CACHE_NAME = 'espacios-comunitarios-sw-v3';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching partial notice:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler for offline support
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  // Bypass API, build-info and Firestore network calls
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/build-info.json' ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('identitytoolkit')
  ) {
    return;
  }

  // Network-First for HTML navigations so deployments never serve stale index.html pointing to removed chunks
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('/') || caches.match('/index.html')))
    );
    return;
  }

  const isValidAssetResponse = (requestUrl, response) => {
    if (!response || response.status !== 200 || response.type !== 'basic') return false;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    // Never cache an HTML SPA fallback under a JS/CSS/image asset URL
    if (/\.(js|mjs|css|png|ico|svg|woff2|json)$/i.test(requestUrl.pathname) && contentType.includes('text/html')) {
      return false;
    }
    return true;
  };

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate for cached static resources
        fetch(event.request)
          .then((networkResponse) => {
            if (isValidAssetResponse(url, networkResponse)) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // If not in cache, request from network and cache only valid responses
      return fetch(event.request)
        .then((networkResponse) => {
          if (!isValidAssetResponse(url, networkResponse)) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  let data = {
    title: 'Notificación de Espacios Comunitarios',
    body: 'Tienes una nueva actualización en la gestión de talleres y salas.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'espacios-default',
    data: { url: '/' },
    vibrate: [250, 100, 250, 100, 250],
    actions: [
      { action: 'open', title: 'Ver en App' }
    ]
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'general-notification',
    data: data.data || { url: '/' },
    vibrate: data.vibrate || [250, 100, 250, 100, 250],
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event (handles taps on Android phones and desktop)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (event.notification.data?.view) {
            client.postMessage({
              type: 'NAVIGATE_VIEW',
              view: event.notification.data.view,
              reservationId: event.notification.data.reservationId
            });
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
