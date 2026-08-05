/**
 * `public/sw.js` — the offline write queue and the app badge (OPT-65).
 *
 * The service worker is the one file in this repo that outlives a deploy on a
 * user's device, and its queue holds writes a user has already made. Two
 * decisions in it are worth a test each, because getting either backwards is
 * silent and destructive:
 *
 *  - **which failures are permanent.** A 4xx is the server's answer and must be
 *    dropped; a 5xx or a dead connection must be kept. Backwards, this either
 *    retries a rejected post forever or eats a post the server would have taken.
 *  - **401 is not a rejection.** It means the session expired while the write
 *    sat in the queue. The entry has to survive it, or the queue that exists to
 *    protect a post is what deletes it.
 *
 * There is no DOM here (the suite runs in node), so the worker is executed in a
 * `vm` context with the handful of browser globals it touches faked below —
 * including a small in-memory IndexedDB, since the queue is only real when it
 * survives the worker being torn down.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/* ── A minimal IndexedDB ──────────────────────────────────────────────────── */

interface FakeRequest<T> {
  result?: T;
  error?: unknown;
  onsuccess?: () => void;
  onerror?: () => void;
  onupgradeneeded?: () => void;
}

interface StoreOptions {
  keyPath?: string;
  autoIncrement?: boolean;
}

type Key = number | string;

function immediate<T>(result: T): { result: T } {
  return { result };
}

class FakeStore {
  rows = new Map<Key, unknown>();
  private seq = 0;

  constructor(private readonly options: StoreOptions = {}) {}

  private nextKey(value: unknown, explicit?: Key): Key {
    const { keyPath, autoIncrement } = this.options;
    if (keyPath) {
      const existing = (value as Record<string, unknown>)[keyPath];
      if (typeof existing === 'number' || typeof existing === 'string') return existing;
      if (autoIncrement) return ++this.seq;
      throw new Error('missing in-line key');
    }
    if (explicit === undefined) throw new Error('missing out-of-line key');
    return explicit;
  }

  get(key: Key) {
    return immediate(this.rows.get(key));
  }

  getAll() {
    return immediate([...this.rows.values()]);
  }

  count() {
    return immediate(this.rows.size);
  }

  put(value: unknown, key?: Key) {
    const resolved = this.nextKey(value, key);
    const stored = structuredClone(value);
    // Real IndexedDB writes the generated key into the stored record, which is
    // how `replayOutbox` gets the `id` it deletes by.
    if (this.options.keyPath && stored && typeof stored === 'object') {
      (stored as Record<string, unknown>)[this.options.keyPath] = resolved;
    }
    this.rows.set(resolved, stored);
    return immediate(resolved);
  }

  delete(key: Key) {
    this.rows.delete(key);
    return immediate(undefined);
  }
}

class FakeDb {
  stores = new Map<string, FakeStore>();
  objectStoreNames = { contains: (name: string) => this.stores.has(name) };

  createObjectStore(name: string, options?: StoreOptions): FakeStore {
    const store = new FakeStore(options ?? {});
    this.stores.set(name, store);
    return store;
  }

  transaction(name: string) {
    const store = this.stores.get(name);
    const tx: { objectStore: () => FakeStore | undefined; oncomplete?: () => void } = {
      objectStore: () => store,
    };
    // The worker assigns `oncomplete` *after* running its operations, so
    // completion must land on a later turn — as it does in a real browser.
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  }

  close() {}
}

class FakeIndexedDB {
  databases = new Map<string, FakeDb>();

  open(name: string): FakeRequest<FakeDb> {
    const request: FakeRequest<FakeDb> = {};
    setTimeout(() => {
      let db = this.databases.get(name);
      const fresh = !db;
      if (!db) {
        db = new FakeDb();
        this.databases.set(name, db);
      }
      request.result = db;
      if (fresh) request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request;
  }
}

/* ── The worker under test ────────────────────────────────────────────────── */

interface OutboxEntry {
  id: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  idempotencyKey: string | null;
  createdAt: number;
  attempts?: number;
  needsAuth?: boolean;
}

interface ClientMessage {
  type: string;
  key?: string | null;
  reason?: string;
  status?: number;
  pending?: number;
}

type Listener = (event: unknown) => void;

const SW_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../public/sw.js'),
  'utf8',
);

interface Harness {
  idb: FakeIndexedDB;
  fetchMock: ReturnType<typeof vi.fn>;
  messages: ClientMessage[];
  setAppBadge: ReturnType<typeof vi.fn>;
  clearAppBadge: ReturnType<typeof vi.fn>;
  showNotification: ReturnType<typeof vi.fn>;
  dispatch: (type: string, event: Record<string, unknown>) => Promise<PromiseSettledResult<unknown>[]>;
  entries: () => Promise<OutboxEntry[]>;
  seed: (entry: Partial<OutboxEntry>) => Promise<void>;
}

function loadWorker(options: { badging?: boolean } = {}): Harness {
  const badging = options.badging ?? true;
  const idb = new FakeIndexedDB();
  const listeners = new Map<string, Listener[]>();
  const messages: ClientMessage[] = [];
  const fetchMock = vi.fn();
  const setAppBadge = vi.fn(() => Promise.resolve());
  const clearAppBadge = vi.fn(() => Promise.resolve());
  const showNotification = vi.fn(() => Promise.resolve());

  const self = {
    addEventListener(type: string, listener: Listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    skipWaiting: () => Promise.resolve(),
    registration: {
      showNotification,
      unregister: () => Promise.resolve(true),
      sync: { register: () => Promise.resolve() },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () =>
        Promise.resolve([
          { postMessage: (message: ClientMessage) => void messages.push(message) },
        ]),
      openWindow: () => Promise.resolve(null),
    },
    location: { origin: 'https://rmhstudios.com' },
  };

  const sandbox: Record<string, unknown> = {
    self,
    indexedDB: idb,
    fetch: fetchMock,
    // Firefox, and every non-installed context, simply has neither method.
    navigator: badging ? { setAppBadge, clearAppBadge } : {},
    caches: { open: () => Promise.resolve({}), keys: () => Promise.resolve([]), match: () => Promise.resolve(undefined) },
    Response,
    Request,
    Headers,
    URL,
    setTimeout,
    clearTimeout,
    console,
    structuredClone,
  };
  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);

  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const waits: unknown[] = [];
    const enriched = { ...event, waitUntil: (p: unknown) => void waits.push(p) };
    for (const listener of listeners.get(type) ?? []) listener(enriched);
    return Promise.allSettled(waits);
  };

  const store = async (): Promise<FakeStore> => {
    // The worker creates the database lazily; wait a turn if it has not yet.
    for (let i = 0; i < 10 && !idb.databases.get('rmh-outbox'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const db = idb.databases.get('rmh-outbox');
    if (!db) throw new Error('outbox database was never opened');
    return db.stores.get('requests') as FakeStore;
  };

  return {
    idb,
    fetchMock,
    messages,
    setAppBadge,
    clearAppBadge,
    showNotification,
    dispatch,
    entries: async () => [...(await store()).rows.values()] as OutboxEntry[],
    seed: async (entry) => {
      // Go through the worker's own `fetch` path so the stored shape is the one
      // the worker writes, not one this test invented.
      const request = new Request(entry.url ?? 'https://rmhstudios.com/api/rmharks', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': entry.idempotencyKey ?? 'key-1',
        },
        body: entry.body ?? '{"content":"hello"}',
      });
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      let responded: Promise<Response> | undefined;
      await dispatch('fetch', {
        request,
        respondWith: (p: Promise<Response>) => {
          responded = p;
        },
      });
      await responded;
    },
  };
}

const REPLAY_SYNC = { tag: 'rmh-outbox' };

describe('sw.js — offline outbox', () => {
  let sw: Harness;

  beforeEach(() => {
    sw = loadWorker();
  });

  it('queues a keyed write when the network is unreachable, and answers 202', async () => {
    const request = new Request('https://rmhstudios.com/api/rmharks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'key-1' },
      body: '{"content":"on a train"}',
    });
    sw.fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    let responded: Promise<Response> | undefined;
    await sw.dispatch('fetch', {
      request,
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    const response = await responded;

    expect(response?.status).toBe(202);
    await expect(response?.json()).resolves.toMatchObject({ queued: true, key: 'key-1' });

    const queued = await sw.entries();
    expect(queued).toHaveLength(1);
    expect(queued[0].headers['idempotency-key']).toBe('key-1');
    expect(queued[0].body).toBe('{"content":"on a train"}');
  });

  it('refuses to queue a write with no idempotency key', async () => {
    const request = new Request('https://rmhstudios.com/api/rmharks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"content":"unkeyed"}',
    });
    let responded: Promise<Response> | undefined;
    await sw.dispatch('fetch', {
      request,
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    // Not intercepted at all — the request is allowed to fail, because a replay
    // of an unkeyed create is what double-posts.
    expect(responded).toBeUndefined();
  });

  it('does not touch a write outside the allowlist', async () => {
    const request = new Request('https://rmhstudios.com/api/rmharks/abc/like', {
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
      body: '{}',
    });
    let responded: Promise<Response> | undefined;
    await sw.dispatch('fetch', {
      request,
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    expect(responded).toBeUndefined();
  });

  it('replays with the same idempotency key it queued', async () => {
    await sw.seed({ idempotencyKey: 'key-42' });
    sw.fetchMock.mockResolvedValueOnce(new Response('{"id":"1"}', { status: 201 }));

    await sw.dispatch('sync', REPLAY_SYNC);

    const [, init] = sw.fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('key-42');
    expect(init.credentials).toBe('include');
    expect(await sw.entries()).toHaveLength(0);
    expect(sw.messages.map((m) => m.type)).toContain('RMH_OUTBOX_SENT');
  });

  it('drops a 4xx — the server answered, and retrying forever is the bug', async () => {
    await sw.seed({});
    sw.fetchMock.mockResolvedValueOnce(new Response('{"error":"too long"}', { status: 400 }));

    await sw.dispatch('sync', REPLAY_SYNC);

    expect(await sw.entries()).toHaveLength(0);
    const failed = sw.messages.find((m) => m.type === 'RMH_OUTBOX_FAILED');
    expect(failed).toMatchObject({ reason: 'rejected', status: 400 });
  });

  it('keeps a 5xx queued and asks Background Sync to try again', async () => {
    await sw.seed({});
    sw.fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));

    const settled = await sw.dispatch('sync', REPLAY_SYNC);

    // A rejected `waitUntil` is what schedules the next sync attempt.
    expect(settled[0]?.status).toBe('rejected');
    const kept = await sw.entries();
    expect(kept).toHaveLength(1);
    expect(kept[0].attempts).toBe(1);
    expect(sw.messages.some((m) => m.type === 'RMH_OUTBOX_FAILED')).toBe(false);
  });

  it('keeps a 429 queued (rate limited is not rejected)', async () => {
    await sw.seed({});
    sw.fetchMock.mockResolvedValueOnce(new Response('', { status: 429 }));

    await sw.dispatch('sync', REPLAY_SYNC);

    expect(await sw.entries()).toHaveLength(1);
  });

  it('keeps a still-offline entry queued without burning it', async () => {
    await sw.seed({});
    sw.fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const settled = await sw.dispatch('sync', REPLAY_SYNC);

    expect(settled[0]?.status).toBe('rejected');
    expect(await sw.entries()).toHaveLength(1);
  });

  it('KEEPS a 401 — an expired session is not a rejected post', async () => {
    await sw.seed({ idempotencyKey: 'key-401' });
    sw.fetchMock.mockResolvedValueOnce(new Response('{"error":"Unauthorized"}', { status: 401 }));

    const settled = await sw.dispatch('sync', REPLAY_SYNC);

    const kept = await sw.entries();
    expect(kept).toHaveLength(1);
    expect(kept[0].needsAuth).toBe(true);
    // Not counted as an attempt: no number of retries fixes a signed-out user,
    // so this must never walk the entry towards being abandoned.
    expect(kept[0].attempts ?? 0).toBe(0);

    const blocked = sw.messages.find((m) => m.type === 'RMH_OUTBOX_BLOCKED');
    expect(blocked).toMatchObject({ reason: 'auth', key: 'key-401' });
    expect(sw.messages.some((m) => m.type === 'RMH_OUTBOX_FAILED')).toBe(false);
    // And it does NOT ask Background Sync to retry — only signing in helps.
    expect(settled[0]?.status).toBe('fulfilled');
  });

  it('sends a blocked entry once the session is back', async () => {
    await sw.seed({ idempotencyKey: 'key-401' });
    sw.fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await sw.dispatch('sync', REPLAY_SYNC);
    expect(await sw.entries()).toHaveLength(1);

    sw.fetchMock.mockResolvedValueOnce(new Response('{"id":"1"}', { status: 201 }));
    await sw.dispatch('sync', REPLAY_SYNC);

    expect(await sw.entries()).toHaveLength(0);
    expect(sw.messages.map((m) => m.type)).toContain('RMH_OUTBOX_SENT');
  });

  it('replays oldest-first and stops at the first entry that cannot go', async () => {
    await sw.seed({ idempotencyKey: 'key-a', body: '{"content":"first"}' });
    await sw.seed({ idempotencyKey: 'key-b', body: '{"content":"second"}' });

    sw.fetchMock.mockResolvedValueOnce(new Response('', { status: 201 }));
    sw.fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await sw.dispatch('sync', REPLAY_SYNC);

    const kept = await sw.entries();
    expect(kept).toHaveLength(1);
    expect(kept[0].idempotencyKey).toBe('key-b');
  });

  it('ignores a sync tag it does not own', async () => {
    await sw.seed({});
    await sw.dispatch('sync', { tag: 'something-else' });
    expect(sw.fetchMock.mock.calls.filter(([, init]) => init)).toHaveLength(0);
  });
});

describe('sw.js — app badge', () => {
  let sw: Harness;

  beforeEach(() => {
    sw = loadWorker();
  });

  const push = (payload: unknown) => ({
    data: { json: () => payload, text: () => JSON.stringify(payload) },
  });

  it('uses an authoritative count from the payload when the server sends one', async () => {
    await sw.dispatch('push', push({ title: 'Hi', badgeCount: 7 }));
    expect(sw.showNotification).toHaveBeenCalled();
    expect(sw.setAppBadge).toHaveBeenCalledWith(7);
  });

  it('increments its own baseline when the payload has no count', async () => {
    await sw.dispatch('push', push({ title: 'One' }));
    await sw.dispatch('push', push({ title: 'Two' }));
    expect(sw.setAppBadge.mock.calls.map(([n]) => n)).toEqual([1, 2]);
  });

  it('lets an open tab publish the real count, and clears on zero', async () => {
    await sw.dispatch('push', push({ title: 'One' }));
    await sw.dispatch('message', { data: { type: 'RMH_BADGE_SET', count: 4 } });
    expect(sw.setAppBadge).toHaveBeenLastCalledWith(4);

    await sw.dispatch('message', { data: { type: 'RMH_BADGE_SET', count: 0 } });
    expect(sw.clearAppBadge).toHaveBeenCalled();

    // The published count is the new baseline, not an addition to the old one.
    await sw.dispatch('push', push({ title: 'Three' }));
    expect(sw.setAppBadge).toHaveBeenLastCalledWith(1);
  });

  it('still shows the notification where the Badging API does not exist', async () => {
    const harness = loadWorker({ badging: false });
    await harness.dispatch('push', push({ title: 'Hi', badgeCount: 3 }));
    expect(harness.showNotification).toHaveBeenCalled();
    expect(harness.setAppBadge).not.toHaveBeenCalled();
  });
});
