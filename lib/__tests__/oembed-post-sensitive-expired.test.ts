/** /api/embed/oembed answers only for posts `postCardShowsContent` allows: not sensitive, not expired. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ post: null as Record<string, unknown> | null }));

vi.mock('@/lib/prisma.server', () => ({ prisma: { rMHark: { findUnique: async () => h.post } } }));
vi.mock('@/lib/rate-limit.server', () => ({
  rateLimit: () => ({ allowed: true }),
  withRateLimitAsync: async () => null,
  getClientIp: () => '1.1.1.1',
}));

import { Route } from '../../app/routes/api/embed/oembed';

type Handler = (a: { request: Request }) => Promise<Response>;
const get = () =>
  (Route as unknown as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET({
    request: new Request('https://rmhstudios.com/api/embed/oembed?url=https://rmhstudios.com/u/a/post/p1', {
      headers: { 'cf-connecting-ip': '1.1.1.1' },
    }),
  });

const base = {
  id: 'p1',
  content: 'hi',
  deletedAt: null,
  audience: 'PUBLIC',
  unlockPrice: 0,
  isSensitive: false,
  expiresAt: null,
  community: null,
  user: { id: 'u', name: 'A', handle: 'a', image: null },
};

beforeEach(() => {
  h.post = { ...base };
});

describe('/api/embed/oembed', () => {
  it('answers for a live public post', async () => {
    expect((await get()).status).toBe(200);
  });
  it('404s a sensitive post', async () => {
    h.post = { ...base, isSensitive: true };
    expect((await get()).status).toBe(404);
  });
  it('404s an expired post', async () => {
    h.post = { ...base, expiresAt: new Date(Date.now() - 1000) };
    expect((await get()).status).toBe(404);
  });
});
