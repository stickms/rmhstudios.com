/**
 * s15-05, at the handler: `GET /api/predictions/$id/comments` answers `private, no-store` (the viewer's blocks and
 * mutes shape it), pages with `nextCursor`, and reads a garbled cursor as the first page; `DELETE
 * /api/predictions/comments/$id` is 401 signed out, 404 for someone else's comment (the same as an unknown id), and
 * deletes the author's own. The handlers run through `implement()` with the real session, rate-limit and zod steps;
 * Prisma is a schema-checked fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

type Row = { id: string; predictionId: string; userId: string; body: string; createdAt: Date };

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  rows: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => h.getSession(...a) } },
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: vi.fn(async () => []),
  getBlockedAuthorIds: vi.fn(async () => []),
}));
vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const all = () => h.rows as Row[];
  type Where = { predictionId: string; OR?: Array<{ createdAt: Date | { lt: Date }; id?: { lt: string } }> };
  const client = {
    prediction: {
      findUnique: vi.fn(async () => ({
        id: 'm1',
        title: 'Rain on Friday',
        description: null,
        status: 'OPEN',
        creatorId: 'maker',
      })),
    },
    predictionComment: {
      findMany: vi.fn(async (a: { where: Where; take: number }) =>
        all()
          .filter((r) => r.predictionId === a.where.predictionId)
          .filter(
            (r) =>
              !a.where.OR ||
              a.where.OR.some((c) =>
                c.createdAt instanceof Date
                  ? r.createdAt.getTime() === c.createdAt.getTime() && r.id < (c.id?.lt ?? '')
                  : r.createdAt.getTime() < c.createdAt.lt.getTime(),
              ),
          )
          .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? 1 : -1))
          .slice(0, a.take)
          .map((r) => ({
            id: r.id,
            body: r.body,
            side: null,
            shares: 0,
            createdAt: r.createdAt,
            user: { id: r.userId, handle: r.userId, name: r.userId, image: null },
          })),
      ),
      findUnique: vi.fn(async (a: { where: { id: string } }) => all().find((r) => r.id === a.where.id) ?? null),
      deleteMany: vi.fn(async (a: { where: { id: string } }) => {
        const before = h.rows.length;
        h.rows = all().filter((r) => r.id !== a.where.id);
        return { count: before - h.rows.length };
      }),
    },
    adminAuditLog: { create: vi.fn(async (a: { data: unknown }) => a.data) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: shapeChecked(client) };
});

import { route as listRoute } from '@/lib/predictions/api/predictions.$id.comments.server';
import { route as deleteRoute } from '@/lib/predictions/api/predictions.comments.$id.server';
import { COMMENT_PAGE_SIZE } from '@/lib/predictions/comment-cursor';

let n = 0;
const headers = () => ({ 'cf-connecting-ip': `10.9.0.${++n}`, cookie: 'better-auth.session_token=abc' });

const list = (query = '') =>
  listRoute.handlers.GET!({
    request: new Request(`https://rmhstudios.com/api/predictions/m1/comments${query}`, { headers: headers() }),
    params: { id: 'm1' },
  });

const remove = (id: string) =>
  deleteRoute.handlers.DELETE!({
    request: new Request(`https://rmhstudios.com/api/predictions/comments/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }),
    params: { id },
  });

const T0 = Date.parse('2026-12-01T10:00:00.000Z');

beforeEach(() => {
  h.getSession.mockReset();
  h.getSession.mockResolvedValue({ user: { id: 'viewer' } });
  h.rows = Array.from({ length: COMMENT_PAGE_SIZE + 2 }, (_, i) => ({
    id: `c${String(i).padStart(2, '0')}`,
    predictionId: 'm1',
    userId: i === 0 ? 'author' : 'someone',
    body: `body ${i}`,
    createdAt: new Date(T0),
  }));
});

describe('GET /api/predictions/$id/comments', () => {
  it('is private and never stored, and hands back the cursor of the next page', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const first = (await res.json()) as { comments: { id: string }[]; nextCursor: string | null };
    assertJsonSafe(first);
    expect(first.comments).toHaveLength(COMMENT_PAGE_SIZE);
    expect(first.nextCursor).toEqual(expect.any(String));

    const next = await list(`?cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(next.headers.get('cache-control')).toBe('private, no-store');
    const second = (await next.json()) as { comments: { id: string }[]; nextCursor: string | null };
    expect(second.comments).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.comments, ...second.comments].map((c) => c.id);
    expect(new Set(ids).size).toBe(COMMENT_PAGE_SIZE + 2);
  });

  it('reads a garbled cursor as the first page, and refuses an oversized one', async () => {
    const res = await list('?cursor=not-a-cursor');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { comments: unknown[] }).comments).toHaveLength(COMMENT_PAGE_SIZE);
    expect((await list(`?cursor=${'9'.repeat(81)}`)).status).toBe(400);
  });

  it('serves a signed-out reader too', async () => {
    h.getSession.mockResolvedValue(null);
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('DELETE /api/predictions/comments/$id', () => {
  it('is 401 signed out and deletes nothing', async () => {
    h.getSession.mockResolvedValue(null);
    expect((await remove('c00')).status).toBe(401);
    expect(h.rows).toHaveLength(COMMENT_PAGE_SIZE + 2);
  });

  it("answers someone else's comment and an unknown id with the same 404", async () => {
    const theirs = await remove('c00');
    const unknown = await remove('nope');
    expect(theirs.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await theirs.json()).toEqual(await unknown.json());
    expect(h.rows).toHaveLength(COMMENT_PAGE_SIZE + 2);
  });

  it("deletes the author's own comment", async () => {
    h.getSession.mockResolvedValue({ user: { id: 'author' } });
    const res = await remove('c00');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect((h.rows as Row[]).some((r) => r.id === 'c00')).toBe(false);
  });
});
