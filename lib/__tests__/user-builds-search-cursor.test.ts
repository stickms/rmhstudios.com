/**
 * `GET /api/user-builds` with `search` + `cursor` + `sort=popular|views` assigned
 * both filters to `where.OR`, so the cursor replaced the search filter and page 2
 * of a search returned unrelated builds. The two groups are now AND-ed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany, findUnique } = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));

vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock('@/lib/rmhcode-auth', () => ({ getAuthenticatedUser: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), getClientIp: vi.fn() }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { userBuild: { findMany, findUnique } } }));

import { Route } from '@/app/routes/api/user-builds';

const GET = (
  Route as unknown as {
    options: { server: { handlers: { GET: (c: { request: Request }) => Promise<Response> } } };
  }
).options.server.handlers.GET;

const call = (qs: string) => GET({ request: new Request(`http://x/api/user-builds?${qs}`) });

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  findUnique.mockReset().mockResolvedValue({ publishedAt: new Date(), likeCount: 5, viewCount: 9 });
});

describe('user-builds search + cursor', () => {
  it.each([
    ['popular', 'likeCount'],
    ['views', 'viewCount'],
  ])('sort=%s: page 2 keeps the search filter AND the cursor', async (sort, field) => {
    await call(`search=lights&cursor=b1&sort=${sort}`);
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.AND).toHaveLength(2);
    const [searchGroup, cursorGroup] = where.AND;
    expect(JSON.stringify(searchGroup)).toContain('"title"');
    expect(JSON.stringify(searchGroup)).toContain('lights');
    expect(JSON.stringify(cursorGroup)).toContain(field);
  });

  it('search alone and cursor alone still filter', async () => {
    await call('search=lights');
    expect(findMany.mock.calls[0][0].where.AND).toHaveLength(1);
    await call('cursor=b1&sort=popular');
    const where = findMany.mock.calls[1][0].where;
    expect(where.AND).toHaveLength(1);
    expect(JSON.stringify(where.AND[0])).toContain('likeCount');
  });

  it('default (recent) sort still pages by publishedAt and keeps the search', async () => {
    await call('search=lights&cursor=b1');
    const where = findMany.mock.calls[0][0].where;
    expect(where.publishedAt).toEqual({ lt: expect.any(Date) });
    expect(where.AND).toHaveLength(1);
  });
});
