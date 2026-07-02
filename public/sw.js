/*
 * RMH Studios service worker.
 *
 * Deliberately conservative so it can never poison the app after a deploy:
 *  - Navigations are ALWAYS network-first; the cache is only a fallback for
 *    the /offline page when the network is unreachable.
 *  - Only content-addressed build assets (/assets/*, hashed filenames) are
 *    cached cache-first — they are immutable by construction.
 *  - Static images use stale-while-revalidate with a small LRU cap.
 *  - Everything else (API, auth, sockets, cross-origin) is untouched.
 *
 * Kill switch: deploy a new sw.js with KILL = true. The next activation
 * wipes every cache and unregisters this worker; pages fall back to the
 * network on their next load.
 */

const VERSION = 'v1';
const KILL = false;

const STATIC_CACHE = `rmh-static-${VERSION}`;
const IMAGE_CACHE = `rmh-images-${VERSION}`;
const OFFLINE_URL = '/offline';
const IMAGE_CACHE_LIMIT = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Precache the offline fallback (best-effort — don't fail install).
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      } catch (_) {
        /* offline page will be cached on first successful visit instead */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (KILL) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        return;
      }
      // Drop caches from previous versions.
      const keep = new Set([STATIC_CACHE, IMAGE_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('rmh-') && !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/** Trim a cache to at most `limit` entries (oldest first). */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API, auth, or streaming endpoints.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  // Navigations: network-first with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Keep the offline page itself fresh whenever it loads normally.
          if (url.pathname === OFFLINE_URL && response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(OFFLINE_URL, response.clone());
          }
          return response;
        } catch (_) {
          const cached = await caches.match(OFFLINE_URL);
          return (
            cached ||
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        }
      })()
    );
    return;
  }

  // Hashed build assets are immutable: cache-first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_build/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
    return;
  }

  // Static images/fonts: stale-while-revalidate with an LRU cap.
  if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              caches.open(IMAGE_CACHE).then((cache) => {
                cache.put(request, response.clone());
                trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT);
              });
            }
            return response.clone();
          })
          .catch(() => undefined);
        return cached || (await network) || Response.error();
      })()
    );
  }
});

/* ─── Web Push ─────────────────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: 'RMH Studios', body: event.data.text() };
  }
  const title = payload.title || 'RMH Studios';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/images/icons/icon-192.png',
    badge: payload.badge || '/images/icons/icon-192.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/notifications' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch (_) {
              /* cross-origin or detached — fall through to openWindow */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
