/**
 * s15-06: the announcement discussion leaves out comments by authors the viewer blocked, was blocked by or muted, and
 * by banned authors for everyone; `total` counts what the viewer can see; the answer is never publicly cached. The
 * list route runs against a small in-memory database wrapped in `shapeChecked` (a `null` filter on a required column,
 * a missing field or a bad nested select throws), with the real `getHiddenAuthorIds` reading its block and mute rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  session: vi.fn(),
  comments: [] as Row[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  mutes: [] as { muterId: string; mutedId: string; expiresAt: Date | null }[],
  now: new Date('2027-01-05T10:00:00Z'),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.session } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/cached.server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cached: async (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async () => {},
}));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: vi.fn(async () => null) }));
vi.mock('@/lib/moderation/restrictions.server', () => ({ restrictionResponse: vi.fn(async () => null) }));
vi.mock('@/lib/moderation/auto-moderate.server', () => ({ screenNewContent: vi.fn() }));

const visible = (r: Row, where: Row): boolean => {
  if (where.postId !== r.postId || where.deletedAt !== null || r.deletedAt !== null) return false;
  const notIn = (where.userId as { notIn?: string[] } | undefined)?.notIn;
  if (notIn?.includes(String(r.userId))) return false;
  // The account filter: not banned now (`bannedUntil` empty or already past).
  const banned = r.bannedUntil instanceof Date && r.bannedUntil.getTime() > h.now.getTime();
  return !banned;
};

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      blogPost: { findFirst: vi.fn(async () => ({ id: 'bp1' })) },
      blogComment: {
        findMany: vi.fn(async ({ where }: { where: Row }) =>
          h.comments
            .filter((r) => visible(r, where))
            .map((r) => ({
              id: r.id,
              content: r.content,
              createdAt: new Date('2027-01-01T00:00:00Z'),
              userId: r.userId,
              user: {
                id: r.userId,
                name: `Name ${String(r.userId)}`,
                image: null,
                username: null,
                handle: r.userId,
                isVerified: false,
                isAdmin: false,
                isBot: false,
                profile: null,
                inventory: [],
              },
            })),
        ),
        count: vi.fn(async ({ where }: { where: Row }) => h.comments.filter((r) => visible(r, where)).length),
      },
      userBlock: {
        findMany: vi.fn(async ({ where }: { where: Row }) =>
          h.blocks.filter((b) => (where.blockerId ? b.blockerId === where.blockerId : b.blockedId === where.blockedId)),
        ),
      },
      userMute: {
        // `activeMuteWhere`: no end, or an end still ahead.
        findMany: vi.fn(async ({ where }: { where: { muterId: string; OR: { expiresAt: null | { gt: Date } }[] } }) =>
          h.mutes
            .filter((m) => m.muterId === where.muterId)
            .filter((m) =>
              where.OR.some((c) =>
                c.expiresAt === null ? m.expiresAt === null : !!m.expiresAt && m.expiresAt > c.expiresAt.gt,
              ),
            )
            .map((m) => ({ mutedId: m.mutedId, expiresAt: m.expiresAt })),
        ),
      },
    }),
  };
});

import { route } from '@/lib/blog/api/blog.$slug.comments.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const get = handlersOf<Handler>(route).GET as Handler;

async function list(viewer: string | null) {
  h.session.mockResolvedValue(viewer ? { user: { id: viewer, isAdmin: false }, session: { id: 's' } } : null);
  const res = await get({
    request: new Request('https://rmhstudios.com/api/blog/news/comments', {
      headers: { cookie: 'better-auth.session_token=abc' },
    }),
    params: { slug: 'news' },
  });
  const body = (await res.json()) as { comments: { id: string }[]; total: number };
  assertJsonSafe(body);
  return { res, ids: body.comments.map((c) => c.id), total: body.total };
}

beforeEach(() => {
  h.comments = [
    { id: 'c-friend', postId: 'bp1', userId: 'friend', content: 'fine', deletedAt: null },
    { id: 'c-blocked', postId: 'bp1', userId: 'blocked-by-me', content: 'hmm', deletedAt: null },
    { id: 'c-blocker', postId: 'bp1', userId: 'blocks-me', content: 'hmm', deletedAt: null },
    { id: 'c-muted', postId: 'bp1', userId: 'muted-by-me', content: 'hmm', deletedAt: null },
    {
      id: 'c-banned',
      postId: 'bp1',
      userId: 'banned',
      content: 'hmm',
      deletedAt: null,
      bannedUntil: new Date('2027-02-01T00:00:00Z'),
    },
    {
      id: 'c-unbanned',
      postId: 'bp1',
      userId: 'was-banned',
      content: 'ok',
      deletedAt: null,
      bannedUntil: new Date('2026-12-01T00:00:00Z'),
    },
    { id: 'c-deleted', postId: 'bp1', userId: 'friend', content: 'gone', deletedAt: new Date('2027-01-02T00:00:00Z') },
  ];
  h.blocks = [
    { blockerId: 'me', blockedId: 'blocked-by-me' },
    { blockerId: 'blocks-me', blockedId: 'me' },
  ];
  h.mutes = [{ muterId: 'me', mutedId: 'muted-by-me', expiresAt: null }];
});

describe('GET /api/blog/$slug/comments', () => {
  it("leaves out the viewer's blocked, blocking and muted authors, banned authors and deleted comments", async () => {
    const { ids, total } = await list('me');
    expect(ids).toEqual(['c-friend', 'c-unbanned']);
    expect(total).toBe(2);
  });

  it('keeps a muted author whose timed mute has ended', async () => {
    h.mutes = [{ muterId: 'me', mutedId: 'muted-by-me', expiresAt: new Date(Date.now() - 60_000) }];
    const { ids, total } = await list('me');
    expect(ids).toContain('c-muted');
    expect(total).toBe(3);
  });

  it("shows another viewer their own view: the blocker's comment is only hidden from the blocked member", async () => {
    const { ids, total } = await list('someone-else');
    expect(ids).toEqual(['c-friend', 'c-blocked', 'c-blocker', 'c-muted', 'c-unbanned']);
    expect(total).toBe(5);
  });

  it('leaves out banned authors for an anonymous reader, with no block or mute filter', async () => {
    const { ids, total } = await list(null);
    expect(ids).not.toContain('c-banned');
    expect(ids).toContain('c-blocked');
    expect(total).toBe(ids.length);
  });

  it('never lets a shared cache hold the per-viewer answer', async () => {
    const { res } = await list('me');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('the shared where-builder', () => {
  it('filters a required column with `notIn` (never a null comparison) and the account ban', async () => {
    const { visibleCommentsWhere } = await import('@/lib/blog/blog-comments.server');
    const now = new Date('2027-01-05T10:00:00Z');
    expect(visibleCommentsWhere('bp1', ['a', 'b'], now)).toEqual({
      postId: 'bp1',
      deletedAt: null,
      userId: { notIn: ['a', 'b'] },
      user: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] },
    });
    expect(visibleCommentsWhere('bp1', [], now)).not.toHaveProperty('userId');
  });
});
