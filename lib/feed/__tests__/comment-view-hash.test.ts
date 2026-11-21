/**
 * The two anonymous view counters (a comment's and a build's) deduplicate by a stored address hash.
 * Both must store the keyed `hashIp`, cut to their column's length, and never the bare digest or the
 * address itself.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

const KEYED = 'k'.repeat(64);
const h = vi.hoisted(() => ({
  hashIp: vi.fn((_ip: string) => 'k'.repeat(64)),
  commentCreateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
  buildViewCreate: vi.fn((args: unknown) => args),
  buildViewFind: vi.fn(async (_args: unknown) => null),
}));

vi.mock('@/lib/hash-ip.server', () => ({ hashIp: h.hashIp }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/feed/audience.server', () => ({ canReadCommentThread: async () => true }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHarkCommentView: { createMany: h.commentCreateMany },
    buildView: { findUnique: h.buildViewFind, create: h.buildViewCreate },
    userBuild: {
      findUnique: async () => ({ id: 'b1', visibility: 'PUBLIC', userId: 'owner', isCurated: false, viewCount: 3 }),
      update: (args: unknown) => args,
    },
    $transaction: async (ops: unknown[]) => ops,
  },
}));

const request = () =>
  new Request('https://x.test/view', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9' } });
const bare = createHash('sha256').update('203.0.113.9').digest('hex');

describe('anonymous view hashes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the comment view stores the keyed hash, 16 characters, not the bare digest', async () => {
    const mod = await import('@/lib/feed/api/rmharks.$id.comment.$commentId.view.server');
    const res = await handlersOf<TestHandler>(mod.route).POST!({
      request: request(),
      params: { id: 'p1', commentId: 'c1' },
    });
    expect(res.status).toBe(200);
    expect(h.hashIp).toHaveBeenCalledWith('203.0.113.9');
    const args = h.commentCreateMany.mock.calls[0]![0] as { data: { ipHash: string }[] };
    expect(args.data[0]!.ipHash).toBe(KEYED.slice(0, 16));
    expect(args.data[0]!.ipHash).not.toBe(bare.slice(0, 16));
  });

  it('the build view stores the keyed hash, 32 characters, and has no local hashing left', async () => {
    const mod = await import('@/app/routes/api/user-builds/$id/view');
    const res = await handlersOf<TestHandler>(mod.Route).POST!({ request: request(), params: { id: 'b1' } });
    expect(res.status).toBe(200);
    expect(h.hashIp).toHaveBeenCalledWith('203.0.113.9');
    expect(h.buildViewFind).toHaveBeenCalledWith({
      where: { buildId_ipHash: { buildId: 'b1', ipHash: KEYED.slice(0, 32) } },
    });
    const created = h.buildViewCreate.mock.calls[0]![0] as { data: { ipHash: string } };
    expect(created.data.ipHash).toBe(KEYED.slice(0, 32));
  });
});
