/**
 * GET /api/comments/:id/translate - a removed, edited or no-longer-visible
 * comment must never be served from a memo or a shared cache.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  comment: null as null | Record<string, any>,
  translate: vi.fn(async (text: string, to: string) => `[${to}] ${text}`),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/ai/text.server', () => ({
  isAITextConfigured: () => true,
  translateText: (...a: [string, string]) => h.translate(...a),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { rMHarkComment: { findUnique: async () => h.comment } },
}));

import { Route } from '../../../app/routes/api/comments/$commentId/translate';

const GET = (
  Route as unknown as {
    options: {
      server: {
        handlers: {
          GET: (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
        };
      };
    };
  }
).options.server.handlers.GET;

const get = () =>
  GET({
    request: new Request('https://x.test/api/comments/c1/translate?to=French'),
    params: { commentId: 'c1' },
  });

const live = (over: Record<string, any> = {}) => ({
  content: 'hello',
  deletedAt: null,
  rmhark: { userId: 'author', audience: 'PUBLIC', deletedAt: null },
  ...over,
});

beforeEach(() => {
  h.translate.mockClear();
  h.comment = live();
});

describe('comment translate', () => {
  it('translates, then serves the memo while the comment is unchanged', async () => {
    expect((await get()).status).toBe(200);
    const second = await (await get()).json();
    expect(second.cached).toBe(true);
    expect(h.translate).toHaveBeenCalledTimes(1);
  });

  it('stops serving a memoized translation once the comment is deleted', async () => {
    await get();
    h.comment = live({ deletedAt: new Date() });
    expect((await get()).status).toBe(404);
  });

  it('stops serving it when the parent post is deleted or becomes private', async () => {
    await get();
    h.comment = live({ rmhark: { userId: 'author', audience: 'PRIVATE', deletedAt: null } });
    expect((await get()).status).toBe(404);
    h.comment = live({ rmhark: { userId: 'author', audience: 'PUBLIC', deletedAt: new Date() } });
    expect((await get()).status).toBe(404);
  });

  it('re-translates an edited comment instead of serving the old text', async () => {
    await get();
    h.comment = live({ content: 'hello again' });
    const body = await (await get()).json();
    expect(body.text).toBe('[French] hello again');
  });

  it('declares no shared or browser cache', async () => {
    const res = await get();
    expect(res.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage|max-age=[1-9]/);
  });
});
