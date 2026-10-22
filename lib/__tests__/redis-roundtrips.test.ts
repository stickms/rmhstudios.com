/**
 * Round-trip shape of the hot Redis helpers: scripts are registered once with
 * `defineCommand` (EVALSHA, not EVAL), and multi-step writes are a single call.
 * ioredis is mocked, so this pins what we SEND and the degrade-to-null contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const defined: Record<string, { numberOfKeys: number; lua: string }> = {};
const rmhRateLimit = vi.fn();
const rmhIncrByTtl = vi.fn();
const rmhIncrBySadd = vi.fn();
const exec = vi.fn();
const pipelineCalls: string[] = [];
const evalFn = vi.fn();

class FakeRedis {
  rmhRateLimit = rmhRateLimit;
  rmhIncrByTtl = rmhIncrByTtl;
  rmhIncrBySadd = rmhIncrBySadd;
  eval = evalFn;
  on() {
    return this;
  }
  duplicate() {
    return new FakeRedis();
  }
  defineCommand(name: string, def: { numberOfKeys: number; lua: string }) {
    defined[name] = def;
  }
  pipeline() {
    const p = {
      sadd: (...a: unknown[]) => (pipelineCalls.push(`sadd:${a.join(',')}`), p),
      pexpire: (...a: unknown[]) => (pipelineCalls.push(`pexpire:${a.join(',')}`), p),
      exec,
    };
    return p;
  }
}
vi.mock('ioredis', () => ({ default: FakeRedis }));

async function load() {
  vi.resetModules();
  process.env.REDIS_URL = 'redis://fake:6379';
  delete process.env.REDIS_STATE_URL;
  return import('@/lib/redis.server');
}

beforeEach(() => {
  for (const k of Object.keys(defined)) delete defined[k];
  pipelineCalls.length = 0;
  [rmhRateLimit, rmhIncrByTtl, rmhIncrBySadd, exec, evalFn].forEach((f) => f.mockReset());
});

describe('redis round trips', () => {
  it('registers the Lua scripts once and rate-limits via the defined command, not EVAL', async () => {
    const r = await load();
    rmhRateLimit.mockResolvedValue([3, 40_000]);
    const res = await r.redisRateLimit('k', 5, 60_000);
    expect(defined.rmhRateLimit.numberOfKeys).toBe(1);
    expect(rmhRateLimit).toHaveBeenCalledWith('rl:k', '60000');
    expect(evalFn).not.toHaveBeenCalled();
    expect(res).toMatchObject({ allowed: true, remaining: 2, limit: 5 });
  });

  it('rate limit blocks over the limit and degrades to null on error', async () => {
    const r = await load();
    rmhRateLimit.mockResolvedValueOnce([9, 5_000]);
    expect(await r.redisRateLimit('k', 5, 60_000)).toMatchObject({
      allowed: false,
      retryAfter: 5,
    });
    rmhRateLimit.mockRejectedValueOnce(new Error('down'));
    expect(await r.redisRateLimit('k', 5, 60_000)).toBeNull();
  });

  it('redisIncrBy is one command carrying the TTL', async () => {
    const r = await load();
    rmhIncrByTtl.mockResolvedValue(1);
    expect(await r.redisIncrBy('c', 1, 1000)).toBe(1);
    expect(rmhIncrByTtl).toHaveBeenCalledWith('c', '1', '1000');
    await r.redisIncrBy('c', 2);
    expect(rmhIncrByTtl).toHaveBeenLastCalledWith('c', '2', '0');
    rmhIncrByTtl.mockRejectedValue(new Error('down'));
    expect(await r.redisIncrBy('c', 1, 1000)).toBeNull();
  });

  it('the Lua only stamps the TTL on first touch', async () => {
    (await load()).redisEnabled();
    expect(defined.rmhIncrByTtl.lua).toContain('n == tonumber(ARGV[1])');
    expect(defined.rmhIncrBySadd.numberOfKeys).toBe(2);
  });

  it('redisIncrByAndSadd is one command and null on failure', async () => {
    const r = await load();
    rmhIncrBySadd.mockResolvedValue(4);
    expect(await r.redisIncrByAndSadd('buf:1', 1, 500, 'dirty', 'p1')).toBe(4);
    expect(rmhIncrBySadd).toHaveBeenCalledWith('buf:1', 'dirty', '1', '500', 'p1');
    rmhIncrBySadd.mockRejectedValue(new Error('down'));
    expect(await r.redisIncrByAndSadd('buf:1', 1, 500, 'dirty', 'p1')).toBeNull();
  });

  it('redisPresenceMark pipelines sadd+pexpire and reads per-command errors', async () => {
    const r = await load();
    exec.mockResolvedValueOnce([
      [null, 1],
      [null, 1],
    ]);
    expect(await r.redisPresenceMark('u1', 'b', 9000)).toBe(true);
    expect(pipelineCalls).toEqual(['sadd:b,u1', 'pexpire:b,9000']);
    exec.mockResolvedValueOnce([
      [null, 1],
      [new Error('READONLY'), undefined],
    ]);
    expect(await r.redisPresenceMark('u1', 'b', 9000)).toBe(false);
    exec.mockRejectedValueOnce(new Error('down'));
    expect(await r.redisPresenceMark('u1', 'b', 9000)).toBe(false);
  });
});
