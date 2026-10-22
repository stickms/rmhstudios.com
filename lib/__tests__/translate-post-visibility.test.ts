/**
 * /api/rmharks/:id/translate must apply the post's visibility rule: a deleted or
 * admin-removed public post used to be translatable by anyone (the route never
 * read deletedAt), and a viewer blocked by the author still got the text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  post: null as Record<string, unknown> | null,
  viewer: null as string | null,
  blocked: [] as string[],
  translated: 0,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: async () => (h.viewer ? { user: { id: h.viewer }, session: {} } : null) },
  },
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => '1.1.1.1' }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/ai/text.server', () => ({
  isAITextConfigured: () => true,
  translateText: async () => {
    h.translated += 1;
    return 'translated';
  },
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => h.blocked,
  getBlockedAuthorIds: async () => h.blocked,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { rMHark: { findUnique: async () => h.post }, community: { findUnique: async () => null } },
}));

import { Route } from '../../app/routes/api/rmharks/$id/translate';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
// Distinct post ids: the route keeps a per-(post, language) translation cache.
let n = 0;
const get = () =>
  (Route as unknown as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET({
    request: new Request('https://x.test/api/rmharks/p/translate?to=English', {
      headers: { 'cf-connecting-ip': '1.1.1.1' },
    }),
    params: { id: `p${++n}` },
  });

const base = {
  content: 'secret words',
  userId: 'author',
  audience: 'PUBLIC',
  communityId: null,
  deletedAt: null,
  expiresAt: null,
  unlockPrice: null,
  unlocks: [],
};

beforeEach(() => {
  h.post = { ...base };
  h.viewer = null;
  h.blocked = [];
  h.translated = 0;
});

describe('translate', () => {
  it('translates a live public post for a signed-out viewer', async () => {
    expect((await get()).status).toBe(200);
  });

  it('404s a deleted / admin-removed public post, and never calls the model', async () => {
    h.post = { ...base, deletedAt: new Date() };
    expect((await get()).status).toBe(404);
    expect(h.translated).toBe(0);
  });

  it('404s a post past its TTL', async () => {
    h.post = { ...base, expiresAt: new Date(Date.now() - 1000) };
    expect((await get()).status).toBe(404);
  });

  it('404s a viewer who is blocked by (or blocked) the author', async () => {
    h.viewer = 'viewer';
    h.blocked = ['author'];
    expect((await get()).status).toBe(404);
    expect(h.translated).toBe(0);
  });
});
