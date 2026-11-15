/**
 * `GET /api/user-builds` with `search` + `cursor` + `sort=popular|views` assigned
 * both filters to `where.OR`, so the cursor replaced the search filter and page 2
 * of a search returned unrelated builds. The two groups are now AND-ed.
 *
 * Also pins the order: every sort ends on `id`, and `sort=best` (lib/ranking/best.ts) ranks in two
 * reads and pages by rank offset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

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

import { route as Route } from '@/lib/api/routes/user-builds.server';

const GET = handlersOf<(c: { request: Request }) => Promise<Response>>(Route).GET;

const call = (qs: string) => GET({ request: new Request(`http://x/api/user-builds?${qs}`) });

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  findUnique.mockReset().mockResolvedValue({ createdAt: new Date(), likeCount: 5, viewCount: 9 });
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

  it('default (recent) sort pages by (createdAt, id) and keeps the search', async () => {
    await call('search=lights&cursor=b1');
    const { where, orderBy } = findMany.mock.calls[0][0];
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND[0])).toContain('lights');
    // The cursor compares the same pair the order sorts by, so a run of equal instants cannot skip a row.
    expect(where.AND[1]).toEqual({
      OR: [
        { createdAt: { lt: expect.any(Date) } },
        { createdAt: expect.any(Date), id: { lt: 'b1' } },
      ],
    });
    expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it.each([
    ['popular', 'likeCount'],
    ['views', 'viewCount'],
    ['recent', 'createdAt'],
  ])('sort=%s ends on the id tiebreak', async (sort, field) => {
    await call(`sort=${sort}`);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ [field]: 'desc' }, { id: 'desc' }]);
  });
});

describe('user-builds sort=best', () => {
  const DAY = 86_400_000;
  const slim = (id: string, likeCount: number, ageDays: number) => ({
    id,
    likeCount,
    commentCount: 0,
    viewCount: 0,
    publishedAt: new Date(Date.now() - ageDays * DAY),
    createdAt: new Date(Date.now() - ageDays * DAY),
  });
  const card = (id: string) => ({
    id,
    createdAt: new Date(),
    publishedAt: null,
    user: { id: 'u1', name: 'U', handle: 'u' },
    tags: [],
    likes: [],
  });

  it('ranks in two reads whatever the page size, and returns the cards in rank order', async () => {
    findMany
      .mockResolvedValueOnce([
        slim('new-empty', 0, 0),
        slim('old-liked', 5, 400),
        slim('liked', 9, 3),
      ])
      // The cards come back in whatever order the database likes.
      .mockResolvedValueOnce([card('new-empty'), card('liked')]);
    const res = await call('sort=best&limit=2&search=lights');
    const body = await res.json();

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findUnique).not.toHaveBeenCalled();
    // The signals read keeps the filters; the card read is by id.
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain('lights');
    expect(findMany.mock.calls[1][0].where).toEqual({ id: { in: ['liked', 'new-empty'] } });
    expect(body.items.map((b: { id: string }) => b.id)).toEqual(['liked', 'new-empty']);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toMatch(/^\d+\.2$/);
  });

  it('the next page is the rest of the same ranking', async () => {
    const rows = [slim('new-empty', 0, 0), slim('old-liked', 5, 400), slim('liked', 9, 3)];
    findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([card('old-liked')]);
    const res = await call(`sort=best&limit=2&cursor=${Date.now()}.2`);
    const body = await res.json();
    expect(body.items.map((b: { id: string }) => b.id)).toEqual(['old-liked']);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });
});
