import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

/**
 * s14-08: the games library's member text in the site's report queue. A fake database (wrapped in `shapeChecked`, so a
 * query shape Postgres would reject fails here) holds reviews, guides, tips, threads and replies. What it proves:
 *
 *  - eligibility per type: a missing item, an unpublished guide and an item a moderator already removed give no owner
 *    (the report route answers 404), the reporter's own item is refused (403), anything else is reportable;
 *  - the takedown per type: a review, guide or tip is stamped `moderatedAt` once, a thread or reply is deleted and the
 *    thread's reply count falls by one (never below zero);
 *  - a removed review, guide or tip cannot be edited, deleted, published or voted on by its author, so deleting and
 *    writing again cannot bring it back; other members see none of them, the author sees their own marked removed;
 *  - the rating leaves removed reviews out, including the cached aggregate.
 */

type Row = Record<string, unknown>;
/** The arguments the fakes read. */
type Args = Record<'where' | 'data' | 'create' | 'update', Row>;

const h = vi.hoisted(() => ({
  reviews: [] as Row[],
  guides: [] as Row[],
  tips: [] as Row[],
  threads: [] as Row[],
  posts: [] as Row[],
  reports: [] as Row[],
  filed: [] as Row[],
  revisions: [] as Row[],
  invalidated: [] as string[],
  fanout: [] as unknown[],
}));

/** Enough of Prisma's `where` for these queries: equality (null included), `in`, `gte`, `OR`, `AND`, `gt`. */
function ok(row: Row, where: Row | undefined): boolean {
  return Object.entries(where ?? {}).every(([key, want]) => {
    if (key === 'OR') return (want as Row[]).some((w) => ok(row, w));
    if (key === 'AND') return (want as Row[]).every((w) => ok(row, w));
    if (key === 'userId_gameId') {
      const k = want as Row;
      return row.userId === k.userId && row.gameId === k.gameId;
    }
    if (want && typeof want === 'object' && !(want instanceof Date)) {
      const op = want as { in?: unknown[]; gte?: number; gt?: number };
      if (op.in) return op.in.includes(row[key]);
      if (op.gte !== undefined) return (row[key] as number) >= op.gte;
      if (op.gt !== undefined) return (row[key] as number) > op.gt;
      return true;
    }
    return row[key] === want;
  });
}

const user = (id: string) => ({
  id,
  name: id.toUpperCase(),
  username: null,
  handle: id,
  image: null,
  profile: null,
  inventory: [],
});

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const client: Row = {
    gameReview: {
      findUnique: async ({ where }: Args) => h.reviews.find((r) => ok(r, where)) ?? null,
      findMany: async ({ where }: Args) =>
        h.reviews.filter((r) => ok(r, where)).map((r) => ({ ...r, user: user(r.userId as string), votes: [] })),
      aggregate: async ({ where }: Args) => {
        const rows = h.reviews.filter((r) => ok(r, where));
        return { _avg: { stars: mean(rows.map((r) => r.stars as number)) }, _count: { _all: rows.length } };
      },
      groupBy: async ({ where }: Args) => {
        const rows = h.reviews.filter((r) => ok(r, where));
        return [...new Set(rows.map((r) => r.stars))].map((stars) => ({
          stars,
          gameId: rows[0]?.gameId,
          _avg: { stars },
          _count: { _all: rows.filter((r) => r.stars === stars).length },
        }));
      },
      upsert: async ({ where, create, update }: Args) => {
        const hit = h.reviews.find((r) => ok(r, where));
        if (hit) Object.assign(hit, update);
        else h.reviews.push({ id: `r${h.reviews.length + 1}`, moderatedAt: null, ...create });
        return {};
      },
      deleteMany: async ({ where }: Args) => {
        const hit = h.reviews.filter((r) => ok(r, where));
        h.reviews = h.reviews.filter((r) => !hit.includes(r));
        return { count: hit.length };
      },
      updateMany: async ({ where, data }: Args) => {
        const hit = h.reviews.filter((r) => ok(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    },
    gameReviewVote: { upsert: async () => ({}), deleteMany: async () => ({ count: 0 }) },
    gameGuide: {
      findUnique: async ({ where }: Args) => {
        const hit = h.guides.find((g) => ok(g, where));
        return hit ? { ...hit, author: user(hit.authorId as string) } : null;
      },
      findFirst: async ({ where }: Args) => h.guides.find((g) => ok(g, where)) ?? null,
      findMany: async ({ where }: Args) =>
        h.guides.filter((g) => ok(g, where)).map((g) => ({ ...g, author: user(g.authorId as string) })),
      count: async ({ where }: Args) => h.guides.filter((g) => ok(g, where)).length,
      deleteMany: async ({ where }: Args) => {
        const hit = h.guides.filter((g) => ok(g, where));
        h.guides = h.guides.filter((g) => !hit.includes(g));
        return { count: hit.length };
      },
      updateMany: async ({ where, data }: Args) => {
        const hit = h.guides.filter((g) => ok(g, where));
        for (const g of hit) Object.assign(g, data);
        return { count: hit.length };
      },
      update: async ({ where, data }: Args) => {
        const hit = h.guides.find((g) => ok(g, where));
        if (hit) Object.assign(hit, data);
        return hit;
      },
    },
    gameGuideRevision: {
      create: async ({ data }: Args) => h.revisions.push(data),
      count: async () => h.revisions.length,
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    achievementTip: {
      findUnique: async ({ where }: Args) => h.tips.find((t) => ok(t, where)) ?? null,
      findMany: async ({ where }: Args) =>
        h.tips.filter((t) => ok(t, where)).map((t) => ({ ...t, user: user(t.userId as string), vote: false })),
      updateMany: async ({ where, data }: Args) => {
        const hit = h.tips.filter((t) => ok(t, where));
        for (const t of hit) Object.assign(t, data);
        return { count: hit.length };
      },
      update: async () => ({}),
    },
    achievementTipVote: { findUnique: async () => null, create: async () => ({}), delete: async () => ({}) },
    notification: { deleteMany: async () => ({ count: 0 }) },
    gameThread: {
      findMany: async ({ where }: Args) => h.threads.filter((t) => ok(t, where)),
      findUnique: async ({ where }: Args) => h.threads.find((t) => ok(t, where)) ?? null,
      delete: async ({ where }: Args) => {
        h.threads = h.threads.filter((t) => t.id !== where.id);
        h.posts = h.posts.filter((p) => p.threadId !== where.id);
        return {};
      },
      updateMany: async ({ where, data }: Args) => {
        const hit = h.threads.filter((t) => ok(t, where));
        for (const t of hit) {
          const dec = (data.replyCount as { decrement?: number } | undefined)?.decrement;
          if (dec) t.replyCount = (t.replyCount as number) - dec;
        }
        return { count: hit.length };
      },
    },
    gameThreadPost: {
      findMany: async ({ where }: Args) =>
        h.posts.filter((p) => ok(p, where)).map((p) => ({ ...p, thread: h.threads.find((t) => t.id === p.threadId) })),
      findUnique: async ({ where }: Args) => h.posts.find((p) => ok(p, where)) ?? null,
      delete: async ({ where }: Args) => {
        h.posts = h.posts.filter((p) => p.id !== where.id);
        return {};
      },
    },
    gamePlaytime: { findMany: async () => [] },
    follow: { findMany: async () => [] },
    contentAward: { groupBy: async () => [] },
    contentReport: {
      findMany: async () => h.reports,
      findFirst: async () => null,
      create: async ({ data }: Args) => {
        h.filed.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: shapeChecked(client) };
});
vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _t: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async (key: string) => {
    h.invalidated.push(key);
  },
}));
vi.mock('@/lib/arcade/updates-jobs.server', () => ({
  enqueueGameUpdateFanout: async (job: unknown) => {
    h.fanout.push(job);
  },
}));
vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin-review.server', () => ({ notifyAdminsOfReview: vi.fn(async () => {}) }));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({ musicReportOwner: vi.fn(), hideMusicContent: vi.fn() }));
vi.mock('@/lib/games/thread-notices.server', () => ({ notifyThreadReply: vi.fn(async () => 0) }));

import {
  GameMetaError,
  deleteGuide,
  deleteReview,
  getGuide,
  getRatingAgg,
  getRatingAggs,
  listGuides,
  listReviews,
  publishGuide,
  updateGuide,
  upsertReview,
  voteReview,
} from '@/lib/games/meta.server';
import {
  gameContentOwner,
  gameContentPreviews,
  gameContentTargets,
  takeDownGameContent,
} from '@/lib/games/moderation.server';
import { GAME_CONTENT_REMOVED, GAME_REPORT_TYPES } from '@/lib/games/moderation';
import {
  MEMBER_ITEM_REPORT_TYPES,
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
} from '@/lib/moderation/report-constants';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const GAME = 'hearthworks';
const review = (over: Row = {}) => ({
  id: 'rev1',
  userId: 'author',
  gameId: GAME,
  stars: 5,
  body: 'a review',
  createdAt: new Date('2026-12-01T00:00:00Z'),
  updatedAt: new Date('2026-12-01T00:00:00Z'),
  moderatedAt: null,
  ...over,
});
const guide = (over: Row = {}) => ({
  id: 'g1',
  authorId: 'author',
  gameId: GAME,
  title: 'A guide',
  body: 'First paragraph.\n\nSecond paragraph.',
  published: true,
  updatedAt: new Date('2026-12-01T00:00:00Z'),
  moderatedAt: null,
  ...over,
});
const tip = (over: Row = {}) => ({
  id: 't1',
  userId: 'author',
  achievementId: 'first-win',
  body: 'Use the left door.',
  votes: 0,
  moderatedAt: null,
  ...over,
});
const thread = (over: Row = {}) => ({
  id: 'th1',
  authorId: 'author',
  gameId: GAME,
  title: 'A thread',
  body: 'thread body',
  replyCount: 2,
  ...over,
});
const post = (over: Row = {}) => ({ id: 'p1', threadId: 'th1', authorId: 'author', body: 'a reply', ...over });
const NOW = new Date('2026-12-28T00:00:00Z');

beforeEach(() => {
  h.reviews = [review()];
  h.guides = [guide()];
  h.tips = [tip()];
  h.threads = [thread()];
  h.posts = [post(), post({ id: 'p2' })];
  h.reports = [];
  h.filed = [];
  h.revisions = [];
  h.invalidated = [];
  h.fanout = [];
});

describe('the report types', () => {
  it('all five are reportable, member items and removable, each with a takedown branch', () => {
    for (const type of GAME_REPORT_TYPES) {
      expect(REPORT_ENTITY_TYPES).toContain(type);
      expect(MEMBER_ITEM_REPORT_TYPES.has(type)).toBe(true);
      expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain(type);
    }
    const triage = read('lib/moderation/triage.server.ts');
    const body = triage.slice(triage.indexOf('async function takedownReportedContent'));
    for (const type of GAME_REPORT_TYPES) expect(body, `${type} has no takedown branch`).toContain(`'${type}'`);
    expect(body).toContain('takeDownGameContent');
    // The report route resolves the owner of each type, and the queue previews each.
    expect(read('lib/moderation/api/moderation.report.server.ts')).toContain('gameContentOwner');
    expect(read('lib/moderation/triage.server.ts')).toContain('gameContentPreviews');
  });
});

describe('eligibility: who owns an item a member may report', () => {
  it('gives the author of a live item of each type', async () => {
    expect(await gameContentOwner('game-review', 'rev1')).toBe('author');
    expect(await gameContentOwner('game-guide', 'g1')).toBe('author');
    expect(await gameContentOwner('game-thread', 'th1')).toBe('author');
    expect(await gameContentOwner('game-thread-post', 'p1')).toBe('author');
    expect(await gameContentOwner('achievement-tip', 't1')).toBe('author');
  });

  it('gives nobody for a missing item, whatever its type', async () => {
    for (const type of GAME_REPORT_TYPES) expect(await gameContentOwner(type, 'nope')).toBeNull();
  });

  it('gives nobody for an unpublished guide (a draft is private to its author)', async () => {
    h.guides = [guide({ published: false })];
    expect(await gameContentOwner('game-guide', 'g1')).toBeNull();
  });

  it('gives nobody for a review, guide or tip a moderator already removed', async () => {
    h.reviews = [review({ moderatedAt: NOW })];
    h.guides = [guide({ moderatedAt: NOW })];
    h.tips = [tip({ moderatedAt: NOW })];
    expect(await gameContentOwner('game-review', 'rev1')).toBeNull();
    expect(await gameContentOwner('game-guide', 'g1')).toBeNull();
    expect(await gameContentOwner('achievement-tip', 't1')).toBeNull();
  });
});

type PostHandler = (a: { session: { user: { id: string } }; body: Row }) => Promise<Response>;

async function report(reporter: string, entityType: string, entityId: string) {
  const mod = await import('@/lib/moderation/api/moderation.report.server');
  const post = handlersOfModule<PostHandler>(mod).POST!;
  return post({ session: { user: { id: reporter } }, body: { entityType, entityId, reason: 'SPAM' } });
}

const CASES = [
  ['game-review', 'rev1'],
  ['game-guide', 'g1'],
  ['game-thread', 'th1'],
  ['game-thread-post', 'p1'],
  ['achievement-tip', 't1'],
] as const;

describe('filing a report through the route', () => {
  it.each(CASES)('%s: files a report aimed at its author', async (type, id) => {
    const res = await report('reporter', type, id);
    expect(res.status).toBe(200);
    expect(h.filed).toEqual([expect.objectContaining({ entityType: type, entityId: id, targetUserId: 'author' })]);
  });

  it.each(CASES)('%s: its author cannot report it (403)', async (type, id) => {
    expect((await report('author', type, id)).status).toBe(403);
    expect(h.filed).toHaveLength(0);
  });

  it.each(CASES)('%s: a missing item is a 404', async (type) => {
    expect((await report('reporter', type, 'nope')).status).toBe(404);
    expect(h.filed).toHaveLength(0);
  });

  it('an unpublished guide is a 404, the same as a missing one', async () => {
    h.guides = [guide({ published: false })];
    expect((await report('reporter', 'game-guide', 'g1')).status).toBe(404);
    expect(h.filed).toHaveLength(0);
  });

  it('a review, guide or tip a moderator already removed is a 404', async () => {
    h.reviews = [review({ moderatedAt: NOW })];
    h.guides = [guide({ moderatedAt: NOW })];
    h.tips = [tip({ moderatedAt: NOW })];
    for (const [type, id] of [
      ['game-review', 'rev1'],
      ['game-guide', 'g1'],
      ['achievement-tip', 't1'],
    ] as const) {
      expect((await report('reporter', type, id)).status).toBe(404);
    }
    expect(h.filed).toHaveLength(0);
  });
});

describe('the takedown', () => {
  it('stamps a review, guide or tip once; a repeated decision keeps the first stamp', async () => {
    expect(await takeDownGameContent('game-review', 'rev1', NOW)).toBe(true);
    expect(await takeDownGameContent('game-guide', 'g1', NOW)).toBe(true);
    expect(await takeDownGameContent('achievement-tip', 't1', NOW)).toBe(true);
    expect(h.reviews[0]!.moderatedAt).toBe(NOW);
    expect(h.guides[0]!.moderatedAt).toBe(NOW);
    expect(h.tips[0]!.moderatedAt).toBe(NOW);
    const later = new Date(NOW.getTime() + 1000);
    expect(await takeDownGameContent('game-review', 'rev1', later)).toBe(false);
    expect(h.reviews[0]!.moderatedAt).toBe(NOW);
  });

  it('a removed review drops out of the cached rating at once', async () => {
    await takeDownGameContent('game-review', 'rev1', NOW);
    expect(h.invalidated).toContain(`game-rating:${GAME}`);
  });

  it('deletes a reply and counts the thread down by one', async () => {
    expect(await takeDownGameContent('game-thread-post', 'p1', NOW)).toBe(true);
    expect(h.posts.map((p) => p.id)).toEqual(['p2']);
    expect(h.threads[0]!.replyCount).toBe(1);
    // Already gone: nothing happens, and the count is not moved again.
    expect(await takeDownGameContent('game-thread-post', 'p1', NOW)).toBe(false);
    expect(h.threads[0]!.replyCount).toBe(1);
  });

  it('never counts a thread below zero', async () => {
    h.threads = [thread({ replyCount: 0 })];
    await takeDownGameContent('game-thread-post', 'p1', NOW);
    expect(h.threads[0]!.replyCount).toBe(0);
  });

  it('deletes a thread with its replies, and leaves a missing one alone', async () => {
    expect(await takeDownGameContent('game-thread', 'th1', NOW)).toBe(true);
    expect(h.threads).toEqual([]);
    expect(h.posts).toEqual([]);
    expect(await takeDownGameContent('game-thread', 'th1', NOW)).toBe(false);
  });
});

describe('a removed item cannot be brought back by its author', () => {
  beforeEach(() => {
    h.reviews = [review({ moderatedAt: NOW })];
    h.guides = [guide({ moderatedAt: NOW })];
  });

  it('refuses to edit or delete a removed review, and deleting and writing again does not happen', async () => {
    await expect(upsertReview('author', GAME, { stars: 1, body: 'again' })).rejects.toMatchObject({
      message: GAME_CONTENT_REMOVED,
    });
    await expect(deleteReview('author', GAME)).rejects.toMatchObject({ message: GAME_CONTENT_REMOVED });
    expect(h.reviews).toHaveLength(1);
    expect(h.reviews[0]).toMatchObject({ stars: 5, body: 'a review', moderatedAt: NOW });
  });

  it('still lets the author write and delete a review that was never removed', async () => {
    h.reviews = [];
    await upsertReview('author', GAME, { stars: 4, body: 'fresh' });
    expect(h.reviews).toHaveLength(1);
    await deleteReview('author', GAME);
    expect(h.reviews).toHaveLength(0);
  });

  it('refuses to edit, delete or publish a removed guide', async () => {
    await expect(updateGuide('author', 'g1', { title: 'New title' })).rejects.toMatchObject({
      message: GAME_CONTENT_REMOVED,
    });
    await expect(deleteGuide('author', 'g1')).rejects.toMatchObject({ message: GAME_CONTENT_REMOVED });
    await expect(publishGuide('author', 'g1', false)).rejects.toMatchObject({ message: GAME_CONTENT_REMOVED });
    expect(h.guides[0]).toMatchObject({ title: 'A guide', published: true, moderatedAt: NOW });
    expect(h.fanout).toEqual([]);
  });

  it('answers a stranger who tries to edit it with FORBIDDEN, not with the removal', async () => {
    await expect(updateGuide('stranger', 'g1', { title: 'x' })).rejects.toMatchObject({ message: 'FORBIDDEN' });
  });

  it('refuses a helpful vote on a removed review as if it did not exist', async () => {
    await expect(voteReview('someone', 'rev1', true)).rejects.toBeInstanceOf(GameMetaError);
    await expect(voteReview('someone', 'rev1', true)).rejects.toMatchObject({ message: 'NOT_FOUND' });
  });

  it('the API routes answer GAME_CONTENT_REMOVED_BY_MODERATOR (409) for each refusal', () => {
    for (const file of [
      'lib/games/api/games.$id.review.server.ts',
      'lib/games/api/guides.$id.server.ts',
      'lib/games/api/guides.$id.publish.server.ts',
      'lib/games/api/guides.$id.revisions.$revisionId.restore.server.ts',
    ]) {
      const source = read(file);
      expect(source, file).toContain("refusalBody('GAME_CONTENT_REMOVED_BY_MODERATOR')");
      expect(source, file).toContain('status: 409');
    }
  });
});

describe('what each reader shows', () => {
  beforeEach(() => {
    h.reviews = [
      review({ id: 'ok', userId: 'a', stars: 5 }),
      review({ id: 'gone', userId: 'b', stars: 1, moderatedAt: NOW }),
    ];
    h.guides = [
      guide({ id: 'g-ok', authorId: 'a' }),
      guide({ id: 'g-gone', authorId: 'b', moderatedAt: NOW }),
      guide({ id: 'g-draft', authorId: 'b', published: false }),
    ];
  });

  it('reviews: another member sees only the live one, the author also sees their own marked removed', async () => {
    expect((await listReviews(GAME, null)).map((r) => r.id)).toEqual(['ok']);
    expect((await listReviews(GAME, 'c')).map((r) => r.id)).toEqual(['ok']);
    const mine = await listReviews(GAME, 'b');
    expect(mine.map((r) => [r.id, r.removed])).toEqual([
      ['ok', false],
      ['gone', true],
    ]);
  });

  it('guides: the list and the page hide a removed guide from everyone but its author', async () => {
    expect((await listGuides(GAME, null)).map((g) => g.id)).toEqual(['g-ok']);
    expect((await listGuides(GAME, 'c')).map((g) => g.id)).toEqual(['g-ok']);
    const mine = await listGuides(GAME, 'b');
    expect(mine.map((g) => [g.id, g.removed, g.isMine]).sort()).toEqual([
      ['g-draft', false, true],
      ['g-gone', true, true],
      ['g-ok', false, false],
    ]);
    expect(await getGuide('g-gone', null)).toBeNull();
    expect(await getGuide('g-gone', 'c')).toBeNull();
    expect(await getGuide('g-gone', 'b')).toMatchObject({ id: 'g-gone', removed: true, isAuthor: true });
    expect(await getGuide('g-ok', null)).toMatchObject({ id: 'g-ok', removed: false });
  });

  it('the rating leaves a removed review out: one game and the directory batch', async () => {
    const one = await getRatingAgg(GAME);
    expect(one).toEqual({ average: 5, count: 1, positive: 1 });
    const many = await getRatingAggs([GAME]);
    expect(many[GAME]).toEqual({ average: 5, count: 1 });
    // Without the removed review the average would have been 3.
    h.reviews[1]!.moderatedAt = null;
    expect((await getRatingAgg(GAME)).average).toBe(3);
  });
});

describe('the queue and Your reports', () => {
  it('previews carry the game, the kind and the text cut to 280 characters', async () => {
    h.reviews = [review({ body: 'x'.repeat(600) })];
    const text = (await gameContentPreviews('game-review', ['rev1'])).get('rev1')!;
    expect(text).toContain('Review');
    expect(text.length).toBeLessThan(330);
    expect(text.endsWith('…')).toBe(true);

    const guideText = (await gameContentPreviews('game-guide', ['g1'])).get('g1')!;
    expect(guideText).toContain('A guide. First paragraph.');
    expect(guideText).not.toContain('Second paragraph');
    expect((await gameContentPreviews('game-thread-post', ['p1'])).get('p1')).toContain('a reply');
    expect((await gameContentPreviews('achievement-tip', ['t1'])).get('t1')).toContain('Use the left door.');
    expect((await gameContentPreviews('game-thread', ['th1'])).get('th1')).toContain('A thread. thread body');
    expect((await gameContentPreviews('game-review', [])).size).toBe(0);
  });

  it('a reporter sees what is still up and not what was removed', async () => {
    h.reviews = [review({ id: 'a' }), review({ id: 'b', moderatedAt: NOW })];
    const targets = await gameContentTargets('game-review', ['a', 'b']);
    expect(targets.map((t) => t.id)).toEqual(['a']);
    h.guides = [guide({ id: 'a' }), guide({ id: 'draft', published: false })];
    expect((await gameContentTargets('game-guide', ['a', 'draft'])).map((t) => t.id)).toEqual(['a']);
  });
});
