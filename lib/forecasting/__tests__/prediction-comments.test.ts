import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

/**
 * s15-05: a market's discussion. Blocked (either way), muted and banned authors are left out of a member's read
 * (banned ones out of everyone's); the list pages on (createdAt, id) so rows that share a time are neither repeated nor
 * skipped; an author or an admin deletes a comment and anyone else, and an unknown id, get the same `not_found`; the
 * member's own comments are exported. The fake client runs every query through the schema checker.
 */

type Row = {
  id: string;
  predictionId: string;
  userId: string;
  body: string;
  side: string | null;
  shares: number;
  createdAt: Date;
  bannedUntil: Date | null;
};

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  hidden: [] as string[],
  audit: [] as Record<string, unknown>[],
  market: { id: 'm1', title: 'Rain on Friday', description: null, status: 'OPEN', creatorId: 'owner' },
}));

const ms = (d: unknown) => (d instanceof Date ? d.getTime() : Number.NaN);

vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: vi.fn(async () => h.hidden),
  getBlockedAuthorIds: vi.fn(async () => h.hidden),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const all = () => h.rows as Row[];
  type Cursor = { createdAt: Date | { lt: Date }; id?: { lt: string } };
  type Where = {
    predictionId?: string;
    userId?: string | { notIn: string[] };
    user?: { OR: unknown[] };
    OR?: Cursor[];
  };
  const matchCursor = (r: Row, cond: Cursor[]) =>
    cond.some((c) => {
      if (c.createdAt instanceof Date) return ms(r.createdAt) === ms(c.createdAt) && r.id < (c.id?.lt ?? '');
      return ms(r.createdAt) < ms(c.createdAt.lt);
    });
  const findMany = vi.fn(async (args: { where: Where; take: number }) => {
    const w = args.where;
    let rows = all().filter((r) => w.predictionId === undefined || r.predictionId === w.predictionId);
    if (w.userId && typeof w.userId === 'object') {
      const out = w.userId.notIn;
      rows = rows.filter((r) => !out.includes(r.userId));
    }
    if (typeof w.userId === 'string') rows = rows.filter((r) => r.userId === w.userId);
    if (w.user?.OR) rows = rows.filter((r) => r.bannedUntil === null || ms(r.bannedUntil) <= Date.now());
    if (w.OR) {
      const cond = w.OR;
      rows = rows.filter((r) => matchCursor(r, cond));
    }
    rows = [...rows].sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || (a.id < b.id ? 1 : -1));
    return rows.slice(0, args.take).map((r) => ({
      id: r.id,
      body: r.body,
      side: r.side,
      shares: r.shares,
      createdAt: r.createdAt,
      user: { id: r.userId, handle: `h-${r.userId}`, name: `Name ${r.userId}`, image: null },
      prediction: { title: h.market.title },
    }));
  });
  const client = {
    prediction: { findUnique: vi.fn(async () => h.market) },
    predictionComment: {
      findMany,
      findUnique: vi.fn(async (args: { where: { id: string } }) => all().find((r) => r.id === args.where.id) ?? null),
      deleteMany: vi.fn(async (args: { where: { id: string } }) => {
        const before = h.rows.length;
        h.rows = all().filter((r) => r.id !== args.where.id);
        return { count: before - h.rows.length };
      }),
    },
    adminAuditLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        h.audit.push(args.data);
        return args.data;
      }),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: shapeChecked(client) };
});

import { deleteComment, exportPredictionComments, listComments } from '@/lib/forecasting/forecasting.server';
import { COMMENT_PAGE_SIZE, decodeCommentCursor, encodeCommentCursor } from '@/lib/predictions/comment-cursor';

const T0 = Date.parse('2026-12-01T10:00:00.000Z');
function row(id: string, userId: string, at: number, extra: Partial<Row> = {}): Row {
  return {
    id,
    predictionId: 'm1',
    userId,
    body: `body ${id}`,
    side: null,
    shares: 0,
    createdAt: new Date(at),
    bannedUntil: null,
    ...extra,
  };
}

beforeEach(() => {
  h.rows = [];
  h.hidden = [];
  h.audit = [];
});

describe('who a viewer sees', () => {
  beforeEach(() => {
    h.rows = [
      row('c1', 'plain', T0 + 1000),
      row('c2', 'blocked', T0 + 2000),
      row('c3', 'blocker', T0 + 3000),
      row('c4', 'muted', T0 + 4000),
      row('c5', 'banned', T0 + 5000, { bannedUntil: new Date(Date.now() + 86_400_000) }),
      row('c6', 'was-banned', T0 + 6000, { bannedUntil: new Date(Date.now() - 86_400_000) }),
    ];
  });

  it('leaves out blocked, blocking and muted authors (the hidden set) and banned ones', async () => {
    h.hidden = ['blocked', 'blocker', 'muted'];
    const page = await listComments('m1', 'viewer');
    expect(page?.comments.map((c) => c.id)).toEqual(['c6', 'c1']);
    assertJsonSafe(page);
  });

  it('leaves out banned authors for a signed-out reader too, and shows everyone else', async () => {
    const page = await listComments('m1', undefined);
    expect(page?.comments.map((c) => c.id)).toEqual(['c6', 'c4', 'c3', 'c2', 'c1']);
  });

  it('asks the hidden-set helper once and never per comment', async () => {
    const { getHiddenAuthorIds } = await import('@/lib/moderation.server');
    vi.mocked(getHiddenAuthorIds).mockClear();
    await listComments('m1', 'viewer');
    expect(getHiddenAuthorIds).toHaveBeenCalledTimes(1);
    expect(getHiddenAuthorIds).toHaveBeenCalledWith('viewer');
  });

  it('answers null for a market the viewer cannot see', async () => {
    const original = h.market;
    h.market = { ...original, status: 'PENDING' };
    expect(await listComments('m1', 'viewer')).toBeNull();
    expect(await listComments('m1', 'owner')).not.toBeNull();
    h.market = original;
  });
});

describe('paging on (createdAt, id)', () => {
  it('pages across rows that share a time with no repeats and no gaps', async () => {
    // 45 comments; every group of 5 shares one timestamp, so a page boundary can land inside a group.
    h.rows = Array.from({ length: 45 }, (_, i) =>
      row(`c${String(i).padStart(3, '0')}`, 'u', T0 + Math.floor(i / 5) * 1000),
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listComments('m1', 'viewer', cursor);
      expect(page).not.toBeNull();
      expect(page!.comments.length).toBeLessThanOrEqual(COMMENT_PAGE_SIZE);
      seen.push(...page!.comments.map((c) => c.id));
      cursor = page!.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(45);
    expect(seen).toHaveLength(45);
  });

  it('puts a boundary inside an equal-time group exactly where the cursor says', async () => {
    h.rows = Array.from({ length: COMMENT_PAGE_SIZE + 3 }, (_, i) => row(`d${String(i).padStart(2, '0')}`, 'u', T0));
    const first = await listComments('m1', 'viewer');
    expect(first!.comments).toHaveLength(COMMENT_PAGE_SIZE);
    expect(first!.nextCursor).not.toBeNull();
    const second = await listComments('m1', 'viewer', first!.nextCursor ?? undefined);
    expect(second!.comments).toHaveLength(3);
    expect(second!.nextCursor).toBeNull();
    const ids = [...first!.comments, ...second!.comments].map((c) => c.id);
    expect(new Set(ids).size).toBe(COMMENT_PAGE_SIZE + 3);
  });

  it('has no next cursor when everything fits on one page', async () => {
    h.rows = [row('a', 'u', T0)];
    expect((await listComments('m1', 'viewer'))!.nextCursor).toBeNull();
  });

  it('round-trips a cursor and reads anything else as the first page', () => {
    const at = new Date(T0);
    expect(decodeCommentCursor(encodeCommentCursor({ createdAt: at, id: 'abc' }))).toEqual({
      createdAt: at,
      id: 'abc',
    });
    for (const bad of ['', 'nodot', '.id', '123.', 'x.y', '-5.id', undefined, null]) {
      expect(decodeCommentCursor(bad)).toBeNull();
    }
  });
});

describe('deleting a comment', () => {
  beforeEach(() => {
    h.rows = [row('mine', 'author', T0), row('theirs', 'other', T0 + 1)];
  });

  it('lets the author delete their own, and it is gone for everyone', async () => {
    expect(await deleteComment('mine', 'author', false)).toBe('deleted');
    expect((await listComments('m1', undefined))!.comments.map((c) => c.id)).toEqual(['theirs']);
    expect(h.audit).toHaveLength(0);
  });

  it('refuses another member with the same answer as an unknown id', async () => {
    expect(await deleteComment('theirs', 'author', false)).toBe('not_found');
    expect(await deleteComment('nope', 'author', false)).toBe('not_found');
    expect(h.rows).toHaveLength(2);
  });

  it('lets an admin delete any comment, and records it', async () => {
    expect(await deleteComment('theirs', 'admin1', true)).toBe('deleted');
    expect(h.rows.map((r) => (r as Row).id)).toEqual(['mine']);
    expect(h.audit).toEqual([
      expect.objectContaining({ adminId: 'admin1', action: 'prediction-comment.delete', targetId: 'theirs' }),
    ]);
  });

  it('does not audit an admin deleting their own comment', async () => {
    h.rows = [row('adm', 'admin1', T0)];
    expect(await deleteComment('adm', 'admin1', true)).toBe('deleted');
    expect(h.audit).toHaveLength(0);
  });

  it('answers not_found for an unknown id even to an admin', async () => {
    expect(await deleteComment('nope', 'admin1', true)).toBe('not_found');
  });
});

describe('the data export', () => {
  it("lists the member's own comments with the market title, side and shares", async () => {
    h.rows = [row('a', 'me', T0, { side: 'YES', shares: 12 }), row('b', 'someone', T0 + 1), row('c', 'me', T0 + 2)];
    const rows = await exportPredictionComments('me');
    assertJsonSafe(rows);
    expect(rows.map((r) => r.id)).toEqual(['c', 'a']);
    expect(rows[1]).toMatchObject({
      market: 'Rain on Friday',
      body: 'body a',
      side: 'YES',
      shares: 12,
      createdAt: new Date(T0).toISOString(),
    });
  });
});

describe('the routes', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  it('the list stays private and uncached, and takes the cursor through its zod query', () => {
    const src = read('lib/predictions/api/predictions.$id.comments.server.ts');
    expect(src).toContain('private, no-store');
    expect(src).toContain('query: commentListQuery');
    expect(src).toContain('listComments(params.id, session?.user?.id, query.cursor)');
  });

  it('the delete route answers an unknown or not-yours comment with a 404 and nothing else', () => {
    const src = read('lib/predictions/api/predictions.comments.$id.server.ts');
    expect(src).toContain("'/api/predictions/comments/$id'");
    expect(src).toContain('deleteComment(params.id, userId, isAdmin)');
    expect(src).toContain("refusalBody('NOT_FOUND'), { status: 404 }");
  });

  it('listComments reads the hidden set from the shared helper (whose module is the mute registry entry)', () => {
    const src = read('lib/forecasting/forecasting.server.ts');
    expect(src).toMatch(/await getHiddenAuthorIds\(viewerId \?\? null\)/);
  });
});
