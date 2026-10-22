/**
 * `apiCache.invalidate*` reaches every process.
 *
 * Production runs two Nitro workers (and a second container during a blue/green
 * swap). `apiCache` is per-process, and ~25 call sites invalidate it directly
 * after a write, so before the bridge the other worker kept serving the old value
 * (moderation rules, mutes, tiers) until its TTL. Two simulated processes share
 * a fake Redis bus here: each gets its own module registry, therefore its own
 * `apiCache` and process id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bus = vi.hoisted(() => {
  const handlers = new Set<(data: unknown) => void>();
  return {
    enabled: true,
    handlers,
    published: [] as unknown[],
  };
});

vi.mock('@/lib/redis.server', () => ({
  redisEnabled: () => bus.enabled,
  redisGetJSON: async () => null,
  redisSetJSON: async () => {},
  redisDel: async () => {},
  redisPublish: (_channel: string, data: unknown) => {
    bus.published.push(data);
    // Redis delivers to every subscriber, the publisher included.
    for (const h of [...bus.handlers]) h(JSON.parse(JSON.stringify(data)));
    return true;
  },
  redisSubscribe: (_channel: string, handler: (data: unknown) => void) => {
    bus.handlers.add(handler);
    return () => bus.handlers.delete(handler);
  },
  redisCacheMGet: async () => [],
}));

async function boot() {
  vi.resetModules();
  const cache = await import('@/lib/cache');
  await import('@/lib/cached.server');
  return cache;
}

beforeEach(() => {
  bus.enabled = true;
  bus.handlers.clear();
  bus.published.length = 0;
});
afterEach(() => vi.resetModules());

describe('apiCache invalidation bridge', () => {
  it('a key invalidated in process A disappears from process B, with no echo loop', async () => {
    const a = await boot();
    const b = await boot();
    expect(a.CACHE_PROCESS_ID).not.toBe(b.CACHE_PROCESS_ID);

    a.apiCache.set('rules:c1', { v: 1 }, 60_000);
    b.apiCache.set('rules:c1', { v: 1 }, 60_000);
    b.apiCache.set('rules:c2', { v: 2 }, 60_000);

    a.apiCache.invalidate('rules:c1');

    expect(a.apiCache.get('rules:c1')).toBeUndefined();
    expect(b.apiCache.get('rules:c1')).toBeUndefined();
    expect(b.apiCache.get('rules:c2')).toEqual({ v: 2 });
    // One publish: B applying it must not publish again, A must not re-apply its own.
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]).toMatchObject({
      type: 'key',
      key: 'rules:c1',
      origin: a.CACHE_PROCESS_ID,
    });
  });

  it('a prefix invalidation clears the family in both processes', async () => {
    const a = await boot();
    const b = await boot();
    for (const c of [a, b]) {
      c.apiCache.set('doctrine:incidents:10', 1, 60_000);
      c.apiCache.set('doctrine:incidents:20', 1, 60_000);
      c.apiCache.set('doctrine:other', 1, 60_000);
    }
    b.apiCache.invalidatePrefix('doctrine:incidents');
    expect(a.apiCache.get('doctrine:incidents:10')).toBeUndefined();
    expect(a.apiCache.get('doctrine:incidents:20')).toBeUndefined();
    expect(a.apiCache.get('doctrine:other')).toBe(1);
    expect(bus.published).toHaveLength(1);
  });

  it('a process ignores its own echo: a value reloaded after invalidating survives', async () => {
    const a = await boot();
    await boot(); // a second subscriber exists, so the bus delivers to everyone
    a.apiCache.set('k', 'old', 60_000);
    a.apiCache.invalidate('k');
    a.apiCache.set('k', 'fresh', 60_000);
    // Redis delivery is synchronous in the fake; replay A's own message late, as a real bus could.
    for (const h of bus.handlers) h(bus.published[0]);
    expect(a.apiCache.get('k')).toBe('fresh');
  });

  it('degrades to local-only without Redis', async () => {
    bus.enabled = false;
    const a = await boot();
    const b = await boot();
    a.apiCache.set('k', 1, 60_000);
    b.apiCache.set('k', 1, 60_000);
    a.apiCache.invalidate('k');
    expect(a.apiCache.get('k')).toBeUndefined();
    expect(b.apiCache.get('k')).toBe(1);
    expect(bus.published).toHaveLength(0);
  });
});

describe('apiCache invalidation covers the per-viewer feed cache too', () => {
  it('a remote prefix invalidation clears feed:v2: keys held in the viewer-feed cache', async () => {
    const a = await boot();
    const b = await boot();
    for (const c of [a, b]) {
      c.apiCache.set('feed:v2:u1:home', 1, 60_000);
      c.apiCache.set('feed:v2:u2:home', 1, 60_000);
      c.apiCache.set('feed-other', 1, 60_000);
    }
    a.apiCache.invalidatePrefix('feed:v2:');
    expect(b.apiCache.get('feed:v2:u1:home')).toBeUndefined();
    expect(b.apiCache.get('feed:v2:u2:home')).toBeUndefined();
    expect(b.apiCache.get('feed-other')).toBe(1);
    expect(bus.published).toHaveLength(1);
  });

  it('a remote key invalidation reaches a viewer-feed key', async () => {
    const a = await boot();
    const b = await boot();
    b.apiCache.set('feed:v2:u1:home', 1, 60_000);
    a.apiCache.invalidate('feed:v2:u1:home');
    expect(b.apiCache.get('feed:v2:u1:home')).toBeUndefined();
  });
});

// LRU order, overwrite, byte budget and heap sizing are covered by lib/__tests__/cache.test.ts.
describe('hot shared keys survive a flood of per-user keys (the FIFO failure)', () => {
  it('keeps a key that is read on every request', async () => {
    const { ApiCache } = await boot();
    const c = new ApiCache({ maxEntries: 100 });
    c.set('config', 'x', 60_000);
    for (let i = 0; i < 1000; i++) {
      c.set(`user:${i}`, i, 60_000);
      c.get('config');
    }
    expect(c.get('config')).toBe('x');
    expect(c.size).toBe(100);
  });
});
