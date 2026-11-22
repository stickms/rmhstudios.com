/**
 * "Post now" on a draft (`POST /api/scheduled/$id/publish`) relies on the row lock: the second of two quick requests
 * finds the draft already published and gets 409 "Already published".
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ publishedId: null as string | null, publishes: 0 }));

vi.mock('@/lib/api/implement.server', () => ({ implement: (_c: unknown, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/api/route.server', () => ({ apiRoute: (_p: string, handlers: unknown) => handlers }));
vi.mock('@/lib/moderation/restrictions.server', () => ({ restrictionResponse: async () => null }));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => '1.1.1.1' }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    scheduledPost: {
      findUnique: async () => ({ id: 'sp1', userId: 'u1', publishedId: h.publishedId, isCapsule: false }),
    },
  },
}));
vi.mock('@/lib/scheduled/publish.server', () => ({
  publishScheduledPost: async () => {
    h.publishes += 1;
    h.publishedId = 'post1';
    return 'post1';
  },
}));

const { route } = (await import('@/lib/scheduled/api/scheduled.$id.publish.server')) as unknown as {
  route: { POST: (a: unknown) => Promise<Response | { success: true; postId: string | null }> };
};

const call = () =>
  route.POST({
    request: new Request('http://x/api/scheduled/sp1/publish'),
    params: { id: 'sp1' },
    session: { user: { id: 'u1' } },
  });

describe('POST /api/scheduled/$id/publish', () => {
  it('publishes once; a second request gets 409 Already published', async () => {
    expect(await call()).toEqual({ success: true, postId: 'post1' });
    const second = (await call()) as Response;
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'Already published' });
    expect(h.publishes).toBe(1);
  });
});
