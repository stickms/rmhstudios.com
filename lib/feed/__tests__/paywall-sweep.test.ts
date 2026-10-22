/**
 * Paywall sweep: every route/helper that serializes a post's text for a viewer
 * must keep a PRICED post's body out unless the viewer is the author or has
 * unlocked it. One fixture, many surfaces; the fake prisma evaluates the real
 * `where` objects, so a missing paywall predicate in a query fails here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'PAID-SECRET-BODY';
const FREE = 'FREE-PUBLIC-BODY';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake Prisma rows take arbitrary model shapes
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  viewer: null as string | null,
  posts: [] as Row[],
  edits: [] as Row[],
  notifications: [] as Row[],
  sse: [] as Row[],
  blocks: [] as Row[],
}));

/** Minimal Prisma `where` evaluator: just the operators the swept queries use. */
function match(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return (Array.isArray(v) ? v : [v]).every((w: Row) => match(row, w));
    if (k === 'OR') return (v as Row[]).some((w) => match(row, w));
    if (k === 'NOT') return !(Array.isArray(v) ? v : [v]).some((w: Row) => match(row, w));
    if (k === 'unlocks' && v && typeof v === 'object' && 'some' in v) {
      return (row.unlocks ?? []).some((u: Row) => match(u, v.some));
    }
    if (!(k in row)) return true; // field not modelled by the fixture
    const x = row[k];
    if (v === null) return x === null || x === undefined;
    if (v instanceof Date || typeof v !== 'object') return x === v;
    return Object.entries(v as Row).every(([op, y]) => {
      switch (op) {
        case 'in': return (y as unknown[]).includes(x);
        case 'notIn': return !(y as unknown[]).includes(x);
        case 'not': return y === null ? x != null : x !== y;
        case 'lte': return x != null && x <= (y as number);
        case 'gt': return x != null && x > (y as number);
        case 'gte': return x >= (y as Date | number);
        case 'lt': return x < (y as Date | number);
        default: return true;
      }
    });
  });
}

vi.mock('@/lib/prisma.server', () => {
  const posts = () => h.posts;
  const rMHark = {
    findMany: async (a: { where?: Row; select?: Row; take?: number }) =>
      posts().filter((p) => match(p, a.where)).slice(0, a.take ?? 1000).map((p) => ({
        ...p,
        // `unlocks` as scoped by the query's own select/include
        unlocks: (p.unlocks ?? []).filter((u: Row) => {
          const w = (a.select?.unlocks as { where?: Row } | undefined)?.where;
          return match(u, w);
        }),
      })),
    findUnique: async (a: { where: { id: string } }) => posts().find((p) => p.id === a.where.id) ?? null,
    count: async (a: { where?: Row }) => posts().filter((p) => match(p, a.where)).length,
  };
  const model = (rows: () => Row[]) => ({
    findMany: async (a: { where?: Row }) => rows().filter((r) => match(r, a?.where)),
  });
  return {
    prisma: {
      rMHark,
      rMHarkEdit: model(() => h.edits),
      userBlock: model(() => h.blocks),
      user: {
        findUnique: async () => ({ id: 'author' }),
        findFirst: async () => null,
        findMany: async () => [],
      },
      follow: { findMany: async () => [{ followingId: 'author' }] },
      userListMember: { findMany: async () => [{ userId: 'author' }] },
      // buildDigest's other sections
      userBuild: { findMany: async () => [] },
      libraryDocument: { findMany: async () => [] },
      newsArticle: { findMany: async () => [] },
      hashtag: { findMany: async () => [], findUnique: async () => null },
      postHashtag: { findMany: async () => [], count: async () => 0 },
      $queryRaw: async () => [],
    },
  };
});
vi.mock('@/lib/cached.server', () => ({ cached: async (_k: string, _t: number, fn: () => unknown) => fn() }));
vi.mock('@/lib/moderation.server', () => ({
  getBlockedAuthorIds: async () => [],
  getHiddenAuthorIds: async () => [],
  getHiddenAuthorIdsStrict: async () => [],
  getMutedWords: async () => [],
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canViewPost: async () => true,
  canReadThread: async () => true,
  canReadPostThread: async () => true,
  canReadCommentThread: async () => true,
  viewerVisiblePostWhere: async () => ({}),
  communityVisibleWhere: () => ({}),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => (h.viewer ? { user: { id: h.viewer }, session: {} } : null) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<object>()),
  rateLimit: () => ({ allowed: true, retryAfter: 0 }),
}));
vi.mock('@/lib/api/with-developer-api.server', () => ({
  apiOptions: () => new Response(null),
  withDeveloperApi: async (_req: Request, fn: (c: unknown) => Promise<Response>) =>
    fn({
      userId: h.viewer,
      json: (b: unknown, s = 200) => Response.json(b, { status: s }),
      error: (_c: string, m: string, s: number) => Response.json({ error: m }, { status: s }),
    }),
}));
vi.mock('@/lib/api/handler.server', () => ({
  // run the route body with { params, userId } — the real wrapper's gates are tested elsewhere
  defineHandler: (_o: unknown, fn: (c: unknown) => Promise<Response>) => (a: { params: unknown }) =>
    fn({ params: a.params, userId: h.viewer }),
}));
vi.mock('@/lib/handles/lookup.server', () => ({
  findUsersByHandles: async () => [{ id: 'reader', handle: 'reader' }],
}));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publish: (e: Row) => h.sse.push(e) } }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: Row) => void h.notifications.push(n),
}));
vi.mock('@/lib/notify/dispatch.server', () => ({ dispatch: async () => {} }));

import { Route as UserPosts } from '../../../app/routes/api/v1/users/$handle/posts';
import { Route as History } from '../../../app/routes/api/rmharks/$id/history';
import { Route as Similar } from '../../../app/routes/api/rmharks/$id/similar';
import { listTimeline } from '@/lib/lists/lists.server';
import { getPostEmbed } from '@/lib/code-embed/embed.server';
import { topPostsFromFollows } from '@/lib/digest/assemble.server';
import { buildDigest } from '@/lib/discovery/today.server';
import { notifyMentions } from '../notify-mentions.server';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (r: unknown, params: Record<string, string>, url = 'https://x.test/api') =>
  (r as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET({
    params,
    request: new Request(url),
  });

const base = (id: string, over: Row = {}): Row => ({
  id,
  userId: 'author',
  content: FREE,
  audience: 'PUBLIC',
  communityId: null,
  deletedAt: null,
  threadRootId: null,
  originalId: null,
  unlockPrice: null,
  unlocks: [],
  createdAt: new Date('2026-01-02'),
  editedAt: null,
  likeCount: 1, commentCount: 0, repostCount: 0, viewCount: 0,
  imageUrls: [], imageAlts: [],
  codeEmbed: { html: '<p>x</p>', css: '', js: '' },
  user: { id: 'author', name: 'A', handle: 'author', username: 'author', image: null },
  ...over,
});

beforeEach(() => {
  h.viewer = null;
  h.edits = [{ rmheetId: 'paid', content: SECRET + ' v1', createdAt: new Date('2026-01-01') }];
  h.notifications = [];
  h.sse = [];
  h.blocks = [];
  h.posts = [
    base('paid', { content: SECRET, unlockPrice: 50, codeEmbed: { html: SECRET, css: '', js: '' } }),
    base('free', { content: FREE, codeEmbed: { html: FREE, css: '', js: '' } }),
  ];
});

const withUnlock = (viewer: string) => {
  h.posts.find((p) => p.id === 'paid')!.unlocks = [{ userId: viewer, id: 'u1' }];
};

describe('paywall sweep: a priced post body never reaches a locked viewer', () => {
  it('GET /api/v1/users/:handle/posts excludes priced posts (free/own/unlocked stay)', async () => {
    const text = async () => await (await call(UserPosts, { handle: 'author' })).text();
    h.viewer = 'stranger';
    const out = await text();
    expect(out).not.toContain(SECRET);
    expect(out).toContain(FREE);
    h.viewer = 'author';
    expect(await text()).toContain(SECRET);
    h.viewer = 'buyer';
    withUnlock('buyer');
    expect(await text()).toContain(SECRET);
  });

  it('listTimeline blanks a priced post and flags it locked', async () => {
    const r = await listTimeline('stranger', 'l1');
    expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(r.items.find((i) => i.id === 'paid')).toMatchObject({ content: '', locked: true });
    expect(r.items.find((i) => i.id === 'free')?.content).toBe(FREE);
    expect(JSON.stringify(await listTimeline(null, 'l1'))).not.toContain(SECRET);
    expect(JSON.stringify(await listTimeline('author', 'l1'))).toContain(SECRET);
    withUnlock('buyer');
    expect(JSON.stringify(await listTimeline('buyer', 'l1'))).toContain(SECRET);
  });

  it('getPostEmbed withholds a locked snippet', async () => {
    expect(await getPostEmbed('paid', null)).toBeNull();
    expect(await getPostEmbed('paid', 'stranger')).toBeNull();
    expect((await getPostEmbed('free', null))?.html).toBe(FREE);
    expect((await getPostEmbed('paid', 'author'))?.html).toBe(SECRET);
    withUnlock('buyer');
    expect((await getPostEmbed('paid', 'buyer'))?.html).toBe(SECRET);
  });

  it('GET /api/rmharks/:id/history 404s a locked priced post (body and every prior version)', async () => {
    h.viewer = null;
    const locked = await call(History, { id: 'paid' });
    expect(locked.status).toBe(404);
    expect(await locked.text()).not.toContain(SECRET);
    expect((await call(History, { id: 'free' })).status).toBe(200);
    h.viewer = 'author';
    expect(await (await call(History, { id: 'paid' })).text()).toContain(SECRET);
    h.viewer = 'buyer';
    withUnlock('buyer');
    expect((await call(History, { id: 'paid' })).status).toBe(200);
  });

  it('weekly digest preview omits priced posts from followed authors', async () => {
    const out = await topPostsFromFollows('reader', new Date('2020-01-01'));
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(JSON.stringify(out)).toContain(FREE);
  });

  it('discovery today snapshot omits priced posts', async () => {
    const out = await buildDigest(new Date('2026-01-03'));
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(JSON.stringify(out)).toContain(FREE);
  });

  it('similar 404s with a locked priced source and never ranks priced candidates', async () => {
    h.posts.push(base('cand', { content: `${FREE} similar words` }));
    const r = await call(Similar, { id: 'paid' });
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain(SECRET);
    h.viewer = 'author';
    expect((await call(Similar, { id: 'paid' })).status).toBe(200);
  });

  it('mention notification: neutral preview for a recipient who has not unlocked', async () => {
    h.posts.find((p) => p.id === 'paid')!.content = `${SECRET} @reader`;
    const input = {
      content: `${SECRET} @reader`,
      author: { id: 'author', name: 'A', image: null, handle: 'author' },
      postId: 'paid',
      entityType: 'rmhark' as const,
      entityId: 'paid',
      link: '/p',
      timestamp: 'now',
    };
    await notifyMentions(input);
    expect(JSON.stringify(h.notifications)).not.toContain(SECRET);
    expect(JSON.stringify(h.sse)).not.toContain(SECRET);
    expect(h.notifications).toHaveLength(1);

    // free post and an unlocker still get the text
    h.notifications = [];
    withUnlock('reader');
    await notifyMentions(input);
    expect(h.notifications[0].preview).toContain(SECRET);
    h.notifications = [];
    await notifyMentions({ ...input, postId: 'free', entityId: 'free' });
    expect(h.notifications[0].preview).toContain(SECRET); // free post: the text is the caller's
  });
});
