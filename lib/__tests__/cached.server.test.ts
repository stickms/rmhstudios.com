import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    redisEnabled: vi.fn(() => false),
    redisGetJSON: vi.fn(async () => null as unknown),
    redisSetJSON: vi.fn(async () => {}),
    redisDel: vi.fn(async () => {}),
    redisPublish: vi.fn(() => true),
    redisSubscribe: vi.fn(() => () => {}),
  };
});

vi.mock('@/lib/redis.server', () => ({
  redisEnabled: mocks.redisEnabled,
  redisGetJSON: mocks.redisGetJSON,
  redisSetJSON: mocks.redisSetJSON,
  redisDel: mocks.redisDel,
  redisPublish: mocks.redisPublish,
  redisSubscribe: mocks.redisSubscribe,
}));

import {
  cached,
  invalidateCached,
  invalidateCachedPrefix,
  invalidateTag,
  lruL1,
  peekL1,
  putL1,
} from '@/lib/cached.server';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
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
    expect(peekL1(key)).toBeUndefined();
    expect(mocks.redisSetJSON).not.toHaveBeenCalledWith(key, 'stale', 60_000);

    const freshLoader = vi.fn(async () => 'fresh');
    await expect(cached(key, 60_000, freshLoader)).resolves.toBe('fresh');
    expect(freshLoader).toHaveBeenCalledTimes(1);
    expect(peekL1(key)).toBe('fresh');
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
    expect(peekL1(key)).toBe('new');
  });
});

describe('cached single-flight, tags and lruL1', () => {
  it('collapses concurrent misses onto one loader run', async () => {
    const gate = deferred<string>();
    const loader = vi.fn(() => gate.promise);
    const a = cached('test:sf', 60_000, loader, { l2: false });
    const b = cached('test:sf', 60_000, loader, { l2: false });
    gate.resolve('v');
    await expect(Promise.all([a, b])).resolves.toEqual(['v', 'v']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('invalidateTag drops only keys filed under the tag', async () => {
    await cached('test:tag:1', 60_000, async () => 1, { tags: ['t1'] });
    await cached('test:tag:2', 60_000, async () => 2, { tags: ['t1', 't2'] });
    await cached('test:tag:3', 60_000, async () => 3, { tags: ['t2'] });
    await invalidateTag('t1');
    expect(peekL1('test:tag:1')).toBeUndefined();
    expect(peekL1('test:tag:2')).toBeUndefined();
    expect(peekL1('test:tag:3')).toBe(3);
  });

  it('does not store a load that an invalidateTag overtook', async () => {
    const gate = deferred<string>();
    const result = cached('test:tag:race', 60_000, () => gate.promise, { tags: ['race'] });
    await invalidateTag('race');
    gate.resolve('stale');
    await expect(result).resolves.toBe('stale');
    expect(peekL1('test:tag:race')).toBeUndefined();
  });

  it('tagged entries never touch Redis (so an invalidation is exact)', async () => {
    mocks.redisEnabled.mockReturnValue(true);
    await cached('test:tag:l2', 60_000, async () => 'x', { tags: ['l2'] });
    expect(mocks.redisGetJSON).not.toHaveBeenCalled();
    expect(mocks.redisSetJSON).not.toHaveBeenCalled();
  });

  it('shouldCache keeps a rejected result out of the cache', async () => {
    const loader = vi.fn(async () => null);
    await cached('test:nocache', 60_000, loader, { l2: false, shouldCache: (v) => v != null });
    await cached('test:nocache', 60_000, loader, { l2: false, shouldCache: (v) => v != null });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('prefix invalidation drops the family', async () => {
    putL1('test:fam:a', 1, 60_000);
    putL1('test:fam:b', 2, 60_000);
    putL1('test:other', 3, 60_000);
    await invalidateCachedPrefix('test:fam:');
    expect(peekL1('test:fam:a')).toBeUndefined();
    expect(peekL1('test:other')).toBe(3);
  });

  it('lruL1 is private to its instance, never reaches Redis and is not touched by invalidation', async () => {
    mocks.redisEnabled.mockReturnValue(true);
    const mine = lruL1('test');
    mine.set('test:private', 1, 60_000);
    expect(peekL1('test:private')).toBeUndefined();
    await invalidateCached('test:private');
    await invalidateCachedPrefix('test:');
    expect(mine.get('test:private')).toBe(1);
    expect(mocks.redisSetJSON).not.toHaveBeenCalled();
  });
});
