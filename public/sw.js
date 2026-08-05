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

/* ─── Offline write queue (B10) ────────────────────────────────────
 *
 * Writes made with no signal used to fail with a toast. They are now parked in
 * IndexedDB and replayed by Background Sync (or, where that does not exist, by
 * the page on its next load — see `lib/offline/outbox.ts`).
 *
 * Three rules keep this from being worse than the failure it replaces:
 *
 * 1. **Allowlist only.** Queueing is opt-in per endpoint and limited to
 *    CREATE-shaped writes. A toggle (like, bookmark, RSVP) must never be queued:
 *    replaying "flip it" an hour later is not the same request the user made.
 * 2. **No key, no queue.** A request without an `Idempotency-Key` header is
 *    passed straight through and allowed to fail. Replaying an unkeyed create
 *    after a partial success double-posts, and `defineHandler`'s `idempotent`
 *    replay is keyed on exactly that header.
 * 3. **Only network failure queues.** A 4xx/5xx is a real answer from the
 *    server and is handed back to the caller untouched.
 */
const OUTBOX_DB = 'rmh-outbox';
const OUTBOX_STORE = 'requests';
const OUTBOX_SYNC_TAG = 'rmh-outbox';
/** Entries older than this are dropped rather than posted into a stale context. */
const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Per-entry replay attempts before it is abandoned. */
const OUTBOX_MAX_ATTEMPTS = 8;

/** Paths whose POST bodies are safe to queue and replay. */
const QUEUEABLE = [/^\/api\/rmharks$/, /^\/api\/rmharks\/[^/]+\/comment$/];

/** Request headers worth carrying across a replay (auth rides the cookie). */
const REPLAYED_HEADERS = ['content-type', 'idempotency-key'];

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

/* ─── Outbox storage ───────────────────────────────────────────────────────── */

function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function outboxTx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, mode);
    const store = tx.objectStore(OUTBOX_STORE);
    let result;
    try {
      result = run(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function outboxAll() {
  const db = await openOutbox();
  try {
    const rows = await outboxTx(db, 'readonly', (store) => ({ __req: store.getAll() }));
    return Array.isArray(rows) ? rows : [];
  } finally {
    db.close();
  }
}

async function outboxPut(entry) {
  const db = await openOutbox();
  try {
    return await outboxTx(db, 'readwrite', (store) => ({ __req: store.put(entry) }));
  } finally {
    db.close();
  }
}

async function outboxDelete(id) {
  const db = await openOutbox();
  try {
    await outboxTx(db, 'readwrite', (store) => {
      store.delete(id);
    });
  } finally {
    db.close();
  }
}

async function outboxCount() {
  const db = await openOutbox();
  try {
    const n = await outboxTx(db, 'readonly', (store) => ({ __req: store.count() }));
    return typeof n === 'number' ? n : 0;
  } finally {
    db.close();
  }
}

/** Tell every open tab what the queue is doing, so it can be shown, not guessed. */
async function notifyClients(message) {
  const pending = await outboxCount().catch(() => 0);
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ ...message, pending });
  }
}

/** Snapshot a request (body included) into the queue. */
async function enqueue(request) {
  const headers = {};
  for (const name of REPLAYED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  const entry = {
    url: request.url,
    method: request.method,
    headers,
    body: await request.clone().text(),
    idempotencyKey: headers['idempotency-key'] || null,
    createdAt: Date.now(),
    attempts: 0,
  };
  await outboxPut(entry);
  return entry;
}

/**
 * Replay the queue oldest-first.
 *
 * Stops at the first network failure (still offline — the remaining entries stay
 * queued and the sync is retried by the browser). A 4xx that is not 408/429 is
 * the server's final answer, so the entry is dropped and the tabs are told:
 * silently retrying a rejected post forever is the failure mode this feature is
 * supposed to remove, not introduce.
 */
async function replayOutbox() {
  const entries = (await outboxAll().catch(() => [])).sort((a, b) => a.createdAt - b.createdAt);
  let stalled = false;

  for (const entry of entries) {
    if (Date.now() - entry.createdAt > OUTBOX_MAX_AGE_MS) {
      await outboxDelete(entry.id);
      await notifyClients({
        type: 'RMH_OUTBOX_FAILED',
        key: entry.idempotencyKey,
        reason: 'expired',
      });
      continue;
    }

    let response;
    try {
      response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
        credentials: 'include',
      });
    } catch (_) {
      // Still no network. Leave this and everything after it queued.
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts >= OUTBOX_MAX_ATTEMPTS) {
        await outboxDelete(entry.id);
        await notifyClients({
          type: 'RMH_OUTBOX_FAILED',
          key: entry.idempotencyKey,
          reason: 'unreachable',
        });
        continue;
      }
      await outboxPut(entry);
      stalled = true;
      break;
    }

    if (response.ok) {
      const body = await response.text().catch(() => '');
      await outboxDelete(entry.id);
      await notifyClients({ type: 'RMH_OUTBOX_SENT', key: entry.idempotencyKey, body });
      continue;
    }

    // 408/429 and 5xx are transient — keep the entry and try again later.
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts < OUTBOX_MAX_ATTEMPTS) {
        await outboxPut(entry);
        stalled = true;
        break;
      }
    }

    await outboxDelete(entry.id);
    await notifyClients({
      type: 'RMH_OUTBOX_FAILED',
      key: entry.idempotencyKey,
      reason: 'rejected',
      status: response.status,
    });
  }

  await notifyClients({ type: 'RMH_OUTBOX_STATE' });
  // Rejecting tells Background Sync to schedule another attempt.
  if (stalled) throw new Error('outbox still has queued writes');
}

/** Trim a cache to at most `limit` entries (oldest first). */
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Queueable writes are handled before the GET-only gate below; everything
  // else about the caching strategy is untouched.
  if (request.method === 'POST') {
    const postUrl = new URL(request.url);
    if (postUrl.origin !== self.location.origin) return;
    if (!QUEUEABLE.some((re) => re.test(postUrl.pathname))) return;
    // No idempotency key means a replay could double-post. Let it fail instead.
    if (!request.headers.get('idempotency-key')) return;

    event.respondWith(
      (async () => {
        try {
          return await fetch(request.clone());
        } catch (_) {
          // Network-level failure only — a 4xx/5xx is returned above untouched.
          try {
            const entry = await enqueue(request);
            if (self.registration.sync) {
              await self.registration.sync.register(OUTBOX_SYNC_TAG).catch(() => {});
            }
            await notifyClients({ type: 'RMH_OUTBOX_QUEUED', key: entry.idempotencyKey });
            return new Response(JSON.stringify({ queued: true, key: entry.idempotencyKey }), {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (_err) {
            // Queueing itself failed (private mode, quota). Surface the failure
            // rather than pretending the write is safe.
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      })(),
    );
    return;
  }

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

/* ─── Outbox replay triggers ───────────────────────────────────────────────── */

self.addEventListener('sync', (event) => {
  if (event.tag !== OUTBOX_SYNC_TAG) return;
  event.waitUntil(replayOutbox());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  const type = event.data && event.data.type;
  // Safari has no Background Sync, so the page asks for a replay on load and
  // whenever it comes back online. Harmless where sync does exist.
  if (type === 'RMH_OUTBOX_REPLAY') {
    event.waitUntil(replayOutbox().catch(() => {}));
    return;
  }
  if (type === 'RMH_OUTBOX_STATUS') {
    event.waitUntil(notifyClients({ type: 'RMH_OUTBOX_STATE' }));
  }
});
