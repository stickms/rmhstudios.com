import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    cacheGet: vi.fn((key: string) => values.get(key)),
    cacheSet: vi.fn((key: string, value: unknown) => {
      values.set(key, value);
    }),
    cacheInvalidate: vi.fn((key: string) => {
      values.delete(key);
    }),
    cacheInvalidatePrefix: vi.fn((prefix: string) => {
      for (const key of values.keys()) {
        if (key.startsWith(prefix)) values.delete(key);
      }
    }),
    redisEnabled: vi.fn(() => false),
    redisGetJSON: vi.fn(async () => null as unknown),
    redisSetJSON: vi.fn(async () => {}),
    redisDel: vi.fn(async () => {}),
    redisPublish: vi.fn(() => true),
    redisSubscribe: vi.fn(() => () => {}),
  };
});

vi.mock('@/lib/cache', () => ({
  apiCache: {
    get: mocks.cacheGet,
    set: mocks.cacheSet,
    invalidate: mocks.cacheInvalidate,
    invalidatePrefix: mocks.cacheInvalidatePrefix,
  },
}));

vi.mock('@/lib/redis.server', () => ({
  redisEnabled: mocks.redisEnabled,
  redisGetJSON: mocks.redisGetJSON,
  redisSetJSON: mocks.redisSetJSON,
  redisDel: mocks.redisDel,
  redisPublish: mocks.redisPublish,
  redisSubscribe: mocks.redisSubscribe,
}));

import { cached, invalidateCached } from '@/lib/cached.server';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.values.clear();
  vi.clearAllMocks();
  mocks.redisEnabled.mockReturnValue(false);
  mocks.redisGetJSON.mockResolvedValue(null);
});

describe('cached invalidation races', () => {
  it('does not repopulate L1 or L2 when invalidated during a cold load', async () => {
    const key = 'test:cold-invalidation';
    const oldValue = deferred<string>();
    const oldLoader = vi.fn(() => oldValue.promise);
    mocks.redisEnabled.mockReturnValue(true);

    const oldResult = cached(key, 60_000, oldLoader);
    await vi.waitFor(() => expect(oldLoader).toHaveBeenCalledTimes(1));

    await invalidateCached(key);
    oldValue.resolve('stale');

    await expect(oldResult).resolves.toBe('stale');
    expect(mocks.cacheSet).not.toHaveBeenCalledWith(key, 'stale', 60_000);
    expect(mocks.redisSetJSON).not.toHaveBeenCalledWith(key, 'stale', 60_000);

    const freshLoader = vi.fn(async () => 'fresh');
    await expect(cached(key, 60_000, freshLoader)).resolves.toBe('fresh');
    expect(freshLoader).toHaveBeenCalledTimes(1);
    expect(mocks.values.get(key)).toBe('fresh');
    expect(mocks.redisSetJSON).toHaveBeenCalledWith(key, 'fresh', 60_000);
  });

  it('does not let an older finally remove the newer flight', async () => {
    const key = 'test:flight-identity';
    const oldValue = deferred<string>();
    const newValue = deferred<string>();
    const oldLoader = vi.fn(() => oldValue.promise);
    const newLoader = vi.fn(() => newValue.promise);

    const oldResult = cached(key, 60_000, oldLoader, { l2: false });
    await invalidateCached(key);

    const newResult = cached(key, 60_000, newLoader, { l2: false });
    oldValue.resolve('old');
    await expect(oldResult).resolves.toBe('old');

    const shouldNotRun = vi.fn(async () => 'unexpected');
    const joinedResult = cached(key, 60_000, shouldNotRun, { l2: false });
    expect(shouldNotRun).not.toHaveBeenCalled();

    newValue.resolve('new');
    await expect(Promise.all([newResult, joinedResult])).resolves.toEqual(['new', 'new']);
    expect(newLoader).toHaveBeenCalledTimes(1);
    expect(shouldNotRun).not.toHaveBeenCalled();
    expect(mocks.values.get(key)).toBe('new');
  });
});
