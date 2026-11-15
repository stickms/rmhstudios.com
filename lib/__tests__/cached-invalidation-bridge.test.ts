/**
 * Cache invalidation (`invalidateCached*`, `invalidateTag`) reaches every process.
 *
 * Production runs two Nitro workers (and a second container during a blue/green
 * swap). The L1 is per-process, and ~50 call sites invalidate it directly
 * after a write, so before the bridge the other worker kept serving the old value
 * (moderation rules, mutes, tiers) until its TTL. Two simulated processes share
 * a fake Redis bus here: each gets its own module registry, therefore its own
 * L1 and process id.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const bus =
  vi.hoisted(
    () => {
      const handlers =
        new Set<
          (
            data: unknown,
          ) => void
        >();
      return {
        enabled: true,
        handlers,
        published:
          [] as unknown[],
      };
    },
  );

vi.mock(
  '@/lib/redis.server',
  () => ({
    redisEnabled:
      () =>
        bus.enabled,
    redisGetJSON:
      async () =>
        null,
    redisSetJSON:
      async () => {},
    redisDel:
      async () => {},
    redisPublish:
      (
        _channel: string,
        data: unknown,
      ) => {
        bus.published.push(
          data,
        );
        // Redis delivers to every subscriber, the publisher included.
        for (const h of [
          ...bus.handlers,
        ])
          h(
            JSON.parse(
              JSON.stringify(
                data,
              ),
            ),
          );
        return true;
      },
    redisSubscribe:
      (
        _channel: string,
        handler: (
          data: unknown,
        ) => void,
      ) => {
        bus.handlers.add(
          handler,
        );
        return () =>
          bus.handlers.delete(
            handler,
          );
      },
    redisCacheMGet:
      async () => [],
  }),
);

async function boot() {
  vi.resetModules();
  const cached =
    await import('@/lib/cached.server');
  // Server start-up does this (server/nitro/cache-bridge.ts); importing alone must not.
  cached.startCacheBridge();
  return cached;
}

beforeEach(
  () => {
    delete (
      globalThis as Record<
        symbol,
        unknown
      >
    )[
      Symbol.for(
        'rmh.cache.bridgeStart',
      )
    ];
    bus.enabled = true;
    bus.handlers.clear();
    bus.published.length = 0;
  },
);
afterEach(
  () =>
    vi.resetModules(),
);

describe('cache invalidation bridge', () => {
  it('a key invalidated in process A disappears from process B, with no echo loop', async () => {
    const a =
      await boot();
    const b =
      await boot();
    expect(
      a.CACHE_PROCESS_ID,
    ).not.toBe(
      b.CACHE_PROCESS_ID,
    );

    a.putL1(
      'rules:c1',
      {
        v: 1,
      },
      60_000,
    );
    b.putL1(
      'rules:c1',
      {
        v: 1,
      },
      60_000,
    );
    b.putL1(
      'rules:c2',
      {
        v: 2,
      },
      60_000,
    );

    await a.invalidateCached(
      'rules:c1',
    );

    expect(
      a.peekL1(
        'rules:c1',
      ),
    ).toBeUndefined();
    expect(
      b.peekL1(
        'rules:c1',
      ),
    ).toBeUndefined();
    expect(
      b.peekL1(
        'rules:c2',
      ),
    ).toEqual(
      {
        v: 2,
      },
    );
    // One publish: B applying it must not publish again, A must not re-apply its own.
    expect(
      bus.published,
    ).toHaveLength(
      1,
    );
    expect(
      bus
        .published[0],
    ).toMatchObject(
      {
        type: 'key',
        key: 'rules:c1',
        origin:
          a.CACHE_PROCESS_ID,
      },
    );
  });

  it('a prefix invalidation clears the family in both processes', async () => {
    const a =
      await boot();
    const b =
      await boot();
    for (const c of [
      a,
      b,
    ]) {
      c.putL1(
        'doctrine:incidents:10',
        1,
        60_000,
      );
      c.putL1(
        'doctrine:incidents:20',
        1,
        60_000,
      );
      c.putL1(
        'doctrine:other',
        1,
        60_000,
      );
    }
    await b.invalidateCachedPrefix(
      'doctrine:incidents',
    );
    expect(
      a.peekL1(
        'doctrine:incidents:10',
      ),
    ).toBeUndefined();
    expect(
      a.peekL1(
        'doctrine:incidents:20',
      ),
    ).toBeUndefined();
    expect(
      a.peekL1(
        'doctrine:other',
      ),
    ).toBe(
      1,
    );
    expect(
      bus.published,
    ).toHaveLength(
      1,
    );
  });

  it('a process ignores its own echo: a value reloaded after invalidating survives', async () => {
    const a =
      await boot();
    await boot(); // a second subscriber exists, so the bus delivers to everyone
    a.putL1(
      'k',
      'old',
      60_000,
    );
    await a.invalidateCached(
      'k',
    );
    a.putL1(
      'k',
      'fresh',
      60_000,
    );
    // Redis delivery is synchronous in the fake; replay A's own message late, as a real bus could.
    for (const h of bus.handlers)
      h(
        bus
          .published[0],
      );
    expect(
      a.peekL1(
        'k',
      ),
    ).toBe(
      'fresh',
    );
  });

  it('degrades to local-only without Redis', async () => {
    bus.enabled = false;
    const a =
      await boot();
    const b =
      await boot();
    a.putL1(
      'k',
      1,
      60_000,
    );
    b.putL1(
      'k',
      1,
      60_000,
    );
    await a.invalidateCached(
      'k',
    );
    expect(
      a.peekL1(
        'k',
      ),
    ).toBeUndefined();
    expect(
      b.peekL1(
        'k',
      ),
    ).toBe(
      1,
    );
    expect(
      bus.published,
    ).toHaveLength(
      0,
    );
  });
});

describe('start-up reaches the bundled copy the requests use', () => {
  it('the Nitro plugin starts a cached.server copy that loads after it', async () => {
    // Production holds cached.server twice: the plugin runs in the Nitro bundle at
    // boot, before the app bundle's copy (which holds the L1 requests read) loads.
    vi.resetModules();
    const plugin =
      (
        await import('../../server/nitro/cache-bridge')
      )
        .default;
    plugin();
    expect(
      bus
        .handlers
        .size,
    ).toBe(
      0,
    ); // nothing loaded yet to subscribe

    vi.resetModules();
    const app =
      await import('@/lib/cached.server'); // the app copy: imported, never started by hand
    expect(
      bus
        .handlers
        .size,
    ).toBe(
      1,
    );

    const other =
      await boot();
    app.putL1(
      'rules:c1',
      1,
      60_000,
    );
    await other.invalidateCached(
      'rules:c1',
    );
    expect(
      app.peekL1(
        'rules:c1',
      ),
    ).toBeUndefined();
  });
});

describe('cache invalidation covers the per-viewer feed cache too', () => {
  it('a remote prefix invalidation clears feed:v3: keys held in the viewer-feed cache', async () => {
    const a =
      await boot();
    const b =
      await boot();
    for (const c of [
      a,
      b,
    ]) {
      c.putL1(
        'feed:v3:u1:home',
        1,
        60_000,
      );
      c.putL1(
        'feed:v3:u2:home',
        1,
        60_000,
      );
      c.putL1(
        'feed-other',
        1,
        60_000,
      );
    }
    await a.invalidateCachedPrefix(
      'feed:v3:',
    );
    expect(
      b.peekL1(
        'feed:v3:u1:home',
      ),
    ).toBeUndefined();
    expect(
      b.peekL1(
        'feed:v3:u2:home',
      ),
    ).toBeUndefined();
    expect(
      b.peekL1(
        'feed-other',
      ),
    ).toBe(
      1,
    );
    expect(
      bus.published,
    ).toHaveLength(
      1,
    );
  });

  it('a remote key invalidation reaches a viewer-feed key', async () => {
    const a =
      await boot();
    const b =
      await boot();
    b.putL1(
      'feed:v3:u1:home',
      1,
      60_000,
    );
    await a.invalidateCached(
      'feed:v3:u1:home',
    );
    expect(
      b.peekL1(
        'feed:v3:u1:home',
      ),
    ).toBeUndefined();
  });
});

// LRU order, overwrite, byte budget and heap sizing are covered by lib/__tests__/cached-l1.test.ts.
describe('hot shared keys survive a flood of per-user keys (the FIFO failure)', () => {
  it('keeps a key that is read on every request', async () => {
    const {
      lruL1,
    } =
      await boot();
    const c =
      lruL1(
        'test',
        {
          maxEntries: 100,
        },
      );
    c.set(
      'config',
      'x',
      60_000,
    );
    for (
      let i = 0;
      i <
      1000;
      i++
    ) {
      c.set(
        `user:${i}`,
        i,
        60_000,
      );
      c.get(
        'config',
      );
    }
    expect(
      c.get(
        'config',
      ),
    ).toBe(
      'x',
    );
    expect(
      c.size,
    ).toBe(
      100,
    );
  });
});

describe('tag invalidation reaches every process', () => {
  it('drops every key filed under the tag in both processes, with one publish', async () => {
    const a =
      await boot();
    const b =
      await boot();
    for (const c of [
      a,
      b,
    ]) {
      await c.cached(
        'lb:ALIBI:d1:10',
        60_000,
        async () =>
          'x',
        {
          tags: [
            'lb:ALIBI:d1',
          ],
        },
      );
      await c.cached(
        'lb:ALIBI:d1:50',
        60_000,
        async () =>
          'y',
        {
          tags: [
            'lb:ALIBI:d1',
          ],
        },
      );
      await c.cached(
        'lb:SPECTRUM:d1:10',
        60_000,
        async () =>
          'z',
        {
          tags: [
            'lb:SPECTRUM:d1',
          ],
        },
      );
    }
    await a.invalidateTag(
      'lb:ALIBI:d1',
    );
    for (const c of [
      a,
      b,
    ]) {
      expect(
        c.peekL1(
          'lb:ALIBI:d1:10',
        ),
      ).toBeUndefined();
      expect(
        c.peekL1(
          'lb:ALIBI:d1:50',
        ),
      ).toBeUndefined();
      expect(
        c.peekL1(
          'lb:SPECTRUM:d1:10',
        ),
      ).toBe(
        'z',
      );
    }
    expect(
      bus.published,
    ).toHaveLength(
      1,
    );
    expect(
      bus
        .published[0],
    ).toMatchObject(
      {
        type: 'tag',
        tag: 'lb:ALIBI:d1',
        origin:
          a.CACHE_PROCESS_ID,
      },
    );
  });
});
