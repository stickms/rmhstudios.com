import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The production build bundles lib/prisma.server.ts twice (Nitro + _ssr). Each
 * copy must reuse the one client and pool rather than open a second pool.
 */
describe('prisma.server is a per-process singleton across bundled copies', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    const g = globalThis as { prisma?: unknown; prismaRead?: unknown };
    delete g.prisma;
    delete g.prismaRead;
  });

  it('a second evaluation of the module in production reuses the client', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@127.0.0.1:1/none');
    vi.stubEnv('DATABASE_REPLICA_URL', '');
    vi.resetModules();
    const first = await import('@/lib/prisma.server');
    vi.resetModules(); // a second bundled copy of the same module
    const second = await import('@/lib/prisma.server');
    expect(second).not.toBe(first);
    expect(second.prisma).toBe(first.prisma);
    expect(second.prismaRead).toBe(first.prismaRead);
  });
});
