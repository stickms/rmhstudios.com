/**
 * Importing `lib/cached.server.ts` must not open Redis connections.
 *
 * It used to subscribe at module load, which opened two ioredis connections in every process that merely
 * imported it, so short-lived scripts and jobs never exited. The bridge now installs lazily (first
 * `cached*()` / `invalidateCached*()` / `apiCache.invalidate*`) or from server start-up
 * (`startCacheBridge`, called by server/nitro/cache-bridge.ts so a read-only worker still receives
 * invalidations).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({ count: 0 }));

vi.mock('ioredis', () => {
  class FakeRedis {
    constructor() {
      created.count++;
    }
    on() {
      return this;
    }
    duplicate() {
      return new FakeRedis();
    }
    defineCommand() {}
    subscribe() {
      return Promise.resolve();
    }
    unsubscribe() {
      return Promise.resolve();
    }
    publish() {
      return Promise.resolve(1);
    }
    del() {
      return Promise.resolve(1);
    }
  }
  return { default: FakeRedis };
});

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('rmh.cache.bridgeStart')];
  created.count = 0;
  vi.resetModules();
  vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6399');
  vi.stubEnv('REDIS_STATE_URL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('cached.server import is connection-free', () => {
  it('opens no Redis connection at import', async () => {
    await import('@/lib/cached.server');
    expect(created.count).toBe(0);
  });

  it('startCacheBridge (server start-up) opens the publisher + subscriber', async () => {
    const mod = await import('@/lib/cached.server');
    mod.startCacheBridge();
    expect(created.count).toBe(2);
    mod.startCacheBridge();
    expect(created.count).toBe(2);
  });

  it('the first apiCache.invalidate installs the bridge lazily', async () => {
    const { apiCache } = await import('@/lib/cache');
    await import('@/lib/cached.server');
    expect(created.count).toBe(0);
    apiCache.set('k', 1, 60_000);
    expect(created.count).toBe(0);
    apiCache.invalidate('k');
    expect(created.count).toBe(2);
  });

  it('the first invalidateCached call installs the bridge lazily', async () => {
    const mod = await import('@/lib/cached.server');
    expect(created.count).toBe(0);
    await mod.invalidateCached('k').catch(() => {});
    expect(created.count).toBe(2);
  });
});

describe('a script that imports cached.server and does nothing exits', () => {
  it('exits on its own even with REDIS_URL set to an unreachable host', () => {
    const root = path.resolve(__dirname, '../..');
    const tsx = path.join(root, 'node_modules/.bin/tsx');
    const res = spawnSync(
      tsx,
      ['-e', "import('./lib/cached.server.ts').then(() => console.log('imported'))"],
      {
        cwd: root,
        env: { ...process.env, REDIS_URL: 'redis://127.0.0.1:1', REDIS_STATE_URL: '' },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(res.error).toBeUndefined();
    expect(res.signal).toBeNull();
    expect(res.stdout).toContain('imported');
    expect(res.status).toBe(0);
  }, 40_000);
});
