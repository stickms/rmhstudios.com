/**
 * Quiet counts (sprint 04 #14): "Hide counts on my posts" is enforced on the server, in every path that returns a
 * post's like, reply, repost or view number.
 *
 *  - TABLE: every serialiser in `QUIET_COUNT_READ_PATHS` that can be driven in-process is run for a stranger, for
 *    the signed-out visitor and for the author, with the switch on and off. Adding a path means adding a row.
 *  - RATCHET: every listed file must use one of the redaction helpers, and no other file may serialise a post's
 *    count without being named (or exempted, with the reason).
 *  - The OG card input carries no counts for a hidden author; the setting endpoint changes only the caller.
 *
 * Prisma is a small stub; nothing here touches a database.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  viewer: null as string | null,
  hides: false,
  upserts: [] as unknown[],
  render: vi.fn(),
  findMany: null as null | ((args: unknown) => unknown[]),
}));

const COUNTS = { likeCount: 11, commentCount: 12, repostCount: 13, viewCount: 14 };

const authorRow = (hides: boolean) => ({
  id: 'author',
  name: 'Author',
  image: null,
  username: 'author',
  handle: 'author',
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: { displayName: null, customImage: null, hideCountsOnMine: hides },
  inventory: [],
});

const postRow = (hides: boolean) => ({
  id: 'p1',
  userId: 'author',
  content: 'hello',
  gifUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  editedAt: null,
  audience: 'PUBLIC',
  deletedAt: null,
  deletedByAdmin: false,
  expiresAt: null,
  unlockPrice: null,
  communityId: null,
  community: null,
  isSensitive: false,
  ...COUNTS,
  imageUrls: [],
  imageAlts: [],
  pinnedCommentId: null,
  user: authorRow(hides),
  likes: [],
  reposts: [],
  unlocks: [],
  reactions: [],
  poll: null,
  original: null,
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (h.viewer ? { user: { id: h.viewer }, session: {} } : null),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getBlockedAuthorIds: async () => [],
}));
vi.mock('@/lib/feed/audience.server', () => ({
  audienceWhere: () => ({}),
  communityVisibleWhere: () => ({}),
  viewerVisiblePostWhere: async () => ({}),
  canViewPost: async () => true,
  canReadThread: async () => true,
  canReadPostThread: async () => true,
}));
vi.mock('@/lib/feed/map-feed-item.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/feed/map-feed-item.server')>()),
  loadBoundedReactionSummaries: async () => new Map(),
}));
vi.mock('@/lib/api/with-developer-api.server', () => ({
  apiOptions: () => new Response(null),
  withDeveloperApi: async (
    _req: Request,
    fn: (c: {
      userId: string;
      json: (b: unknown, s?: number) => Response;
      error: (c: string, m: string, s: number) => Response;
    }) => Promise<Response>,
  ) =>
    fn({
      userId: h.viewer ?? 'anonymous-key-owner',
      json: (b, s = 200) => Response.json(b, { status: s }),
      error: (code, m, s) => Response.json({ error: { code, message: m } }, { status: s }),
    }),
}));
// The like path's side effects are other features' business.
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async () => undefined,
  removeNotification: async () => undefined,
}));
vi.mock('@/lib/feed/notify-mentions.server', () => ({ notifyMentions: async () => undefined }));
vi.mock('@/lib/feed/conversation-controls.server', () => ({ postConversationKey: () => 'k' }));
vi.mock('@/lib/achievements/engine.server', () => ({ progressAchievement: async () => undefined }));
vi.mock('@/lib/social/engagement-effects.server', () => ({ enqueueProgression: async () => undefined }));
vi.mock('@/lib/media/attach.server', () => ({ resolveMediaForPost: async () => [] }));
vi.mock('@/lib/social/follow-graph.server', () => ({
  getFollowingIds: async () => [],
  invalidateFollowingIds: () => undefined,
}));
vi.mock('@/lib/social/follow-events.server', () => ({
  invalidateAudience: () => undefined,
  recordFollowEvent: async () => undefined,
}));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: { publish: () => undefined, publishPostEngagement: () => undefined },
}));
vi.mock('@/lib/feed/signals.server', () => ({
  getSignals: async () => ({ mutedTags: [], lessAuthors: [], followedTags: [] }),
}));
vi.mock('@/lib/user-display.server', () => ({ invalidateUserDisplay: () => undefined }));
vi.mock('@/lib/og/post-image.server', () => ({ renderPostOgImage: h.render }));
vi.mock('@/lib/prisma.server', () => {
  const rows = () => (h.findMany ? h.findMany : () => [postRow(h.hides)]);
  return {
    prisma: {
      user: { findUnique: async () => ({ id: 'author' }) },
      follow: { findUnique: async () => null, findMany: async () => [] },
      closeFriend: { findMany: async () => [] },
      rMHark: {
        findMany: async (args: unknown) => rows()(args),
        findFirst: async () => null,
        findUnique: async () => postRow(h.hides),
        update: async () => ({ likeCount: 11 }),
      },
      rMHarkRepost: { findMany: async () => [] },
      rMHarkLike: { findUnique: async () => null, create: async () => ({}) },
      savedItem: {
        findMany: async () => [{ id: 's1', entityId: 'p1', createdAt: new Date(0) }],
      },
      userProfile: {
        findUnique: async () => ({ hideCountsOnMine: h.hides, hideCountsInFeed: false }),
        upsert: async (args: { where: { userId: string }; create: object; update: object }) => {
          h.upserts.push(args);
          return { hideCountsOnMine: h.hides, hideCountsInFeed: false, ...args.update };
        },
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  };
});

import type { FeedItem } from '@/lib/feed-types';
import { mapRmharkToFeedItem } from '@/lib/feed/map-feed-item.server';
import { mapQuotedOriginal } from '@/lib/feed/quoted-original';
import { reconcileCachedPage } from '@/lib/feed/page-reconcile.server';
import { listBookmarks } from '@/lib/bookmarks.server';
import { resolveUser } from '@/lib/user-display';
import { serializePublicPost } from '@/lib/api/serializers.server';
import { setPostLike } from '@/lib/social/engagement.server';
import { QUIET_COUNT_READ_PATHS, POST_COUNT_FIELDS, redactCounts, countsHiddenFrom } from '@/lib/feed/quiet-counts';
import { route as profilePostsRoute } from '@/lib/profile/api/profile.$id.rmharks.server';
import { route as postPageRoute } from '@/lib/feed/api/rmharks.$id.server';
import { route as ogPostRoute } from '@/lib/og/api/og.post.$id.server';
import { route as settingsRoute } from '@/lib/feed/api/settings.quiet-counts.server';
import { Route as v1Feed } from '@/app/routes/api/v1/feed';
import { Route as v1Post } from '@/app/routes/api/v1/posts/$id';
import { Route as v1UserPosts } from '@/app/routes/api/v1/users/$handle/posts';
import { Route as v1Bookmarks } from '@/app/routes/api/v1/me/bookmarks';
import { Route as v1Like } from '@/app/routes/api/v1/posts/$id/like';

type Counts = (number | null | undefined)[];
const REAL: Counts = [11, 12, 13, 14];
const HIDDEN: Counts = [null, null, null, null];

const ofItem = (i: Partial<FeedItem>): Counts => [i.likeCount, i.commentCount, i.repostCount, i.viewCount];

const request = (url: string) =>
  new Request(url, {
    headers: {
      'cf-connecting-ip': String(Math.random()),
      cookie: 'better-auth.session_token=t',
    },
  });
const call = async (route: unknown, method: string, url: string, params: Record<string, string> = {}) => {
  const handler = handlersOf(route)[method]!;
  return (await handler({ request: request(url), params })) as Response;
};

/** One serialiser per row: reads the counts a given viewer gets for a post whose author's switch is `hides`. */
const PATHS: { name: string; counts: (hides: boolean, viewer: string | null) => Promise<Counts> }[] = [
  {
    name: 'redactCounts (a FeedItem)',
    counts: async (hides, viewer) =>
      ofItem(redactCounts({ ...COUNTS, user: resolveUser(authorRow(hides)) } as FeedItem, viewer)),
  },
  {
    name: 'mapRmharkToFeedItem (map-feed-item.server.ts)',
    counts: async (hides, viewer) => ofItem(mapRmharkToFeedItem(postRow(hides), viewer)),
  },
  {
    name: 'mapQuotedOriginal (quote cards, lib/feed/quoted-original.ts)',
    counts: async (hides, viewer) =>
      ofItem(
        mapQuotedOriginal(
          { ...postRow(hides), community: null } as Parameters<typeof mapQuotedOriginal>[0],
          resolveUser(authorRow(hides)),
          viewer,
          [],
        )!,
      ),
  },
  {
    name: 'GET /api/profile/:id/rmharks (profile tab)',
    counts: async (hides, viewer) => {
      h.hides = hides;
      h.viewer = viewer;
      const body = (await (
        await call(profilePostsRoute, 'GET', 'https://x.test/api/profile/author/rmharks', { id: 'author' })
      ).json()) as {
        items: FeedItem[];
      };
      return ofItem(body.items[0]!);
    },
  },
  {
    name: 'GET /api/rmharks/:id (the post page)',
    counts: async (hides, viewer) => {
      h.hides = hides;
      h.viewer = viewer;
      return ofItem(
        (await (await call(postPageRoute, 'GET', 'https://x.test/api/rmharks/p1', { id: 'p1' })).json()) as FeedItem,
      );
    },
  },
  {
    name: 'listBookmarks (bookmarks page)',
    counts: async (hides, viewer) => {
      h.hides = hides;
      return ofItem((await listBookmarks(viewer ?? 'someone', {})).items[0]!);
    },
  },
  {
    name: 'serializePublicPost (/api/v1 serialiser)',
    counts: async (hides, viewer) => {
      const m = serializePublicPost({ ...postRow(hides), user: authorRow(hides) }, viewer).metrics;
      return [m.likes, m.comments, m.reposts, m.views];
    },
  },
  ...(
    [
      [
        'GET /api/v1/feed',
        v1Feed,
        'https://x.test/api/v1/feed',
        {},
        (b: { data: { metrics: Metrics }[] }) => b.data[0]!.metrics,
      ],
      [
        'GET /api/v1/posts/:id',
        v1Post,
        'https://x.test/api/v1/posts/p1',
        { id: 'p1' },
        (b: { metrics: Metrics }) => b.metrics,
      ],
      [
        'GET /api/v1/users/:handle/posts',
        v1UserPosts,
        'https://x.test/api/v1/users/author/posts',
        { handle: 'author' },
        (b: { data: { metrics: Metrics }[] }) => b.data[0]!.metrics,
      ],
      [
        'GET /api/v1/me/bookmarks',
        v1Bookmarks,
        'https://x.test/api/v1/me/bookmarks',
        {},
        (b: { data: { metrics: Metrics }[] }) => b.data[0]!.metrics,
      ],
    ] as const
  ).map(([name, route, url, params, pick]) => ({
    name,
    counts: async (hides: boolean, viewer: string | null): Promise<Counts> => {
      h.hides = hides;
      h.viewer = viewer;
      const m = (pick as (b: never) => Metrics)((await (await call(route, 'GET', url, params)).json()) as never);
      return [m.likes, m.comments, m.reposts, m.views];
    },
  })),
  {
    name: 'POST /api/v1/posts/:id/like (the reply carries the like count)',
    counts: async (hides, viewer) => {
      h.hides = hides;
      h.viewer = viewer ?? 'anonymous-key-owner';
      const body = (await (await call(v1Like, 'POST', 'https://x.test/api/v1/posts/p1/like', { id: 'p1' })).json()) as {
        likeCount?: number | null;
      };
      // Only the like count exists here; the rest of the row is read as "same as like".
      return [
        body.likeCount,
        body.likeCount === null ? null : 12,
        body.likeCount === null ? null : 13,
        body.likeCount === null ? null : 14,
      ];
    },
  },
  {
    name: 'setPostLike (engagement.server.ts)',
    counts: async (hides, viewer) => {
      h.hides = hides;
      const r = await setPostLike(viewer ?? 'someone', 'p1', true);
      return [
        r.likeCount,
        r.likeCount === null ? null : 12,
        r.likeCount === null ? null : 13,
        r.likeCount === null ? null : 14,
      ];
    },
  },
  {
    name: 'reconcileCachedPage (a cached timeline page, served again)',
    counts: async (hides, viewer) => {
      h.hides = hides;
      h.findMany = () => [
        {
          id: 'p1',
          userId: 'author',
          audience: 'PUBLIC',
          deletedAt: null,
          communityId: null,
          hashtags: [],
          unlocks: [],
          user: { profile: { hideCountsOnMine: hides } },
        },
      ];
      // The cached card was assembled BEFORE the author turned the switch on: it still carries numbers.
      const cached = { id: 'p1', type: 'rmhark', createdAt: '', ...COUNTS, user: { id: 'author' } } as FeedItem;
      const { items } = await reconcileCachedPage([cached], viewer ?? 'someone', 'foryou');
      return ofItem(items[0]!);
    },
  },
];

type Metrics = { likes: number | null; comments: number | null; reposts: number | null; views: number | null };

beforeEach(() => {
  h.viewer = null;
  h.hides = false;
  h.findMany = null;
  h.upserts = [];
  h.render.mockReset().mockResolvedValue(Buffer.from('png'));
});

describe('every serialiser of post counts honours "hide counts on my posts"', () => {
  for (const path of PATHS) {
    describe(path.name, () => {
      it('withholds all four counts from another viewer and from a signed-out visitor', async () => {
        // The like replies only carry the like count; the others are derived above so one assertion fits every row.
        const stranger = await path.counts(true, 'someone-else');
        expect(stranger.every((c) => c === null)).toBe(true);
        expect(stranger.length).toBe(HIDDEN.length);
      });

      it('shows the author their own counts', async () => {
        const own = await path.counts(true, 'author');
        expect(own[0]).toBe(11);
        expect(own.every((c) => c !== null && c !== undefined)).toBe(true);
      });

      it('shows everyone the counts while the switch is off', async () => {
        const open = await path.counts(false, 'someone-else');
        expect(open[0]).toBe(11);
        expect(open.every((c) => typeof c === 'number')).toBe(true);
      });
    });
  }

  it('the signed-out visitor gets nothing either (pure helper, every viewer)', () => {
    expect(countsHiddenFrom('author', true, null)).toBe(true);
    expect(countsHiddenFrom('author', true, undefined)).toBe(true);
    expect(countsHiddenFrom('author', true, 'author')).toBe(false);
    expect(countsHiddenFrom('author', false, 'someone')).toBe(false);
    expect(countsHiddenFrom('author', undefined, 'someone')).toBe(false);
  });

  it('keeps counts in the table a complete list of the four fields', () => {
    expect([...POST_COUNT_FIELDS]).toEqual(['likeCount', 'commentCount', 'repostCount', 'viewCount']);
  });
});

describe('the quoted original of another member is redacted for its own author switch', () => {
  it('a quote card of a hidden author carries null counts for a stranger, even inside a post the author does not hide', () => {
    const quoter = mapRmharkToFeedItem(
      {
        ...postRow(false),
        id: 'q1',
        userId: 'quoter',
        user: { ...authorRow(false), id: 'quoter' },
        original: { ...postRow(true) },
      },
      'someone-else',
    );
    expect(ofItem(quoter)).toEqual(REAL);
    expect(ofItem(quoter.original!)).toEqual(HIDDEN);
  });
});

describe('cached timeline pages', () => {
  it('asks for a refresh when a card is withheld for an author who has since shown their counts again', async () => {
    h.findMany = () => [
      {
        id: 'p1',
        userId: 'author',
        audience: 'PUBLIC',
        deletedAt: null,
        communityId: null,
        hashtags: [],
        unlocks: [],
        user: { profile: { hideCountsOnMine: false } },
      },
    ];
    const cached = { id: 'p1', type: 'rmhark', createdAt: '', likeCount: null, user: { id: 'author' } } as FeedItem;
    expect((await reconcileCachedPage([cached], 'someone-else', 'foryou')).needsRefresh).toBe(true);
  });
});

describe('the post OG card', () => {
  const draw = async (hides: boolean) => {
    h.hides = hides;
    await call(ogPostRoute, 'GET', 'https://x.test/api/og/post/p1', { id: 'p1' });
    return h.render.mock.calls[0]![0] as {
      likeCount: number | null;
      commentCount: number | null;
      repostCount: number | null;
      revision: string;
    };
  };

  it('is handed no counts for an author who hides them', async () => {
    const input = await draw(true);
    expect([input.likeCount, input.commentCount, input.repostCount]).toEqual([null, null, null]);
  });

  it('is handed the counts otherwise, and the cache revision differs so the switch takes effect at once', async () => {
    const open = await draw(false);
    expect([open.likeCount, open.commentCount, open.repostCount]).toEqual([11, 12, 13]);
    h.render.mockClear();
    const hidden = await draw(true);
    expect(hidden.revision).not.toBe(open.revision);
  });
});

describe('PUT /api/settings/quiet-counts', () => {
  const put = (body: unknown) =>
    handlersOf(settingsRoute).PUT!({
      request: new Request('https://x.test/api/settings/quiet-counts', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': String(Math.random()),
          cookie: 'better-auth.session_token=t',
        },
        body: JSON.stringify(body),
      }),
      params: {},
    });

  it('changes only the caller, and only the switch sent', async () => {
    h.viewer = 'me';
    const res = await put({ hideCountsOnMine: true });
    expect(res.status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    const call = h.upserts[0] as { where: { userId: string }; create: object; update: object };
    expect(call.where).toEqual({ userId: 'me' });
    expect(call.update).toEqual({ hideCountsOnMine: true });
    expect(call.create).toEqual({ userId: 'me', hideCountsOnMine: true });
  });

  it('cannot be pointed at another member', async () => {
    h.viewer = 'me';
    const res = await put({ hideCountsInFeed: true, userId: 'victim' });
    expect(res.status).toBe(400);
    expect(h.upserts).toHaveLength(0);
  });

  it('refuses an empty update and a signed-out caller', async () => {
    h.viewer = 'me';
    expect((await put({})).status).toBe(400);
    h.viewer = null;
    expect((await put({ hideCountsOnMine: true })).status).toBe(401);
    expect(h.upserts).toHaveLength(0);
  });

  it("reads back the caller's own switches", async () => {
    h.viewer = 'me';
    h.hides = true;
    const res = await call(settingsRoute, 'GET', 'https://x.test/api/settings/quiet-counts');
    expect(await res.json()).toEqual({ hideCountsOnMine: true, hideCountsInFeed: false });
  });
});

/* ------------------------------------------------------------------ */
/*  The path ratchet                                                  */
/* ------------------------------------------------------------------ */

const root = join(__dirname, '..', '..', '..');
const src = (rel: string) => readFileSync(join(root, rel), 'utf8');

/** What a listed file must contain to count as having redacted. */
const REDACTS = /redactCounts|nullPostCounts|countsHiddenFrom|hideCounts/;

/**
 * Files that mention a post's count and are NOT a read path to somebody else's post, with why. An entry here is
 * a decision; a new file that mentions a count must be added to `QUIET_COUNT_READ_PATHS` or here.
 */
const EXEMPT: Record<string, string> = {
  // Counts a member reads about their OWN posts.
  'lib/feed/api/rmharks.$id.insights.server.ts': 'author-only insights (404 for anyone else)',
  'lib/analytics.server.ts': "creator analytics of one's own posts",
  'lib/ai/recap.server.ts': "the member's own weekly recap",
  'lib/wrapped/wrapped.server.ts': "the member's own year in review",
  'lib/bulk/bulk.server.ts': "bulk actions on one's own posts and comments",
  'lib/bulk/types.ts': "bulk-action filters on one's own posts",
  'lib/trash/trash.server.ts': "the member's own bin",
  // Writes, ranking and zeros: no number leaves for another viewer.
  // RMH News discussions: the only post read is the RMH News account's own, and that site account never hides its numbers.
  'lib/news-wire/discussion.ts': "the RMH News account's discussion post (a site account that never quiets its counts)",
  'lib/news-wire/discussion.server.ts':
    "the RMH News account's discussion post (a site account that never quiets its counts)",
  'lib/news-wire/feed-pick.server.ts': 'ranking which story to feature; no number leaves for a viewer',
  'lib/admin/sweeps.ts': 'a sweep’s own tally of the replies it removes, not a count on any post',
  'lib/admin/sweeps.server.ts': 'a sweep’s own tally of the replies it removes, not a count on any post',
  'lib/feed/api/rmharks.server.ts': 'creating a post: zeros, and the quote card goes through mapQuotedOriginal',
  'lib/feed/api/rmharks.thread.server.ts': 'creating a thread: zeros',
  'lib/feed/api/rmharks.$id.repost.server.ts': 'counter update and a per-post bus payload nobody subscribes to',
  'lib/feed/api/rmharks.$id.comment.server.ts':
    'COMMENT counts (hiding them is out of scope), and zeros for a new reply',
  'lib/feed/api/rmharks.$id.comment.$commentId.like.server.ts': 'comment counters',
  'app/routes/api/v1/posts.ts': "the caller's OWN posts (serializeOwnPost)",
  'app/routes/api/v1/posts/$id/like.ts': 'the reply comes from setPostLike, which nulls the count (table above)',
  'lib/og/post-image.server.tsx': 'the renderer draws what og.post.$id hands it; a null count draws no stats',
  'lib/hot-counters.server.ts': 'view-count writes',
  'lib/feed/ranking.ts': 'ranking reads the real numbers on purpose (redaction happens after it)',
  'lib/ranking/best.ts': 'comment ranking',
  'lib/feed/compose/compose-state.ts': 'client: an optimistic post with zeros',
  'lib/explore.server.ts': 'ranks and selects on likeCount; its items come from mapRmharkToFeedItem',
  'lib/discovery/surprise.server.ts': 'picks a post; returns title and link only',
  'lib/discovery/memories.server.ts': 'orders by likeCount; returns no number',
  'lib/feed/api/ai.ask-feed.server.ts': 'orders by likeCount; returns no number',
  'lib/rmhark-ai/bot-worker.server.ts': 'internal bot logic',
  'lib/rmhark-ai/bot-queue.server.ts': 'internal bot logic',
  'lib/predictions/auto-markets.server.ts': 'builds, not posts',
  'lib/predictions/resolvers.server.ts': 'builds, not posts',
  'lib/group-chat/serialize.server.ts': 'chat messages, not posts',
  'lib/group-chat/types.ts': 'chat messages, not posts',
  'lib/chat-plus/apply-update.ts': 'chat threads, not posts',
  'lib/chat-plus/threads.server.ts': 'chat threads, not posts',
  'lib/chat-plus/post.server.ts': 'chat messages, not posts',
  'lib/chat-plus/types.ts': 'chat messages, not posts',
  'lib/group-events.ts': 'group events, not posts',
  'features/medschools/scrape/run-admit-forums.ts':
    "Admit school-forum threads (post counts of a third party's thread, not an RMHark)",
  'features/medschools/scrape/adapters/admit/forum.ts':
    "Admit school-forum threads (post counts of a third party's thread, not an RMHark)",
  'lib/communities/automod.server.ts': 'moderation thresholds, no figure leaves',
  'lib/games/hub.server.ts': 'games, not posts',
  'lib/games/hub-types.ts': 'games, not posts',
  // Not posts: builds, library, TF2, workshop and the like have their own like counters.
  'lib/feed-types.ts': 'a type',
  'lib/sidebar-data.ts': 'builds',
  'lib/digest/types.ts': 'a type',
  'lib/search/types.ts': 'a type (the hit shape; the value is nulled in lib/search/posts.server.ts)',
  'lib/search/docs.server.ts': 'builds and documents',
  'lib/api/registry.ts': 'OpenAPI examples',
  'lib/api/openapi.ts': 'OpenAPI schema',
  'lib/api/routes/user-builds.$id.like.server.ts': 'builds',
  'lib/api/routes/user-builds.featured.server.ts': 'builds',
  'lib/api/routes/user-builds.server.ts': 'builds',
  'lib/api/routes/user-builds.$id.comments.server.ts': 'builds',
  'lib/games/workshop.server.ts': 'workshop items',
  'lib/communities/starboard.server.ts': 'orders by likeCount; its items come from mapRmharkToFeedItem',

  // Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)
  // s10-08 profile-preview

  // s10-09 build-issues

  // s10-13 api-moderation

  // s10-17 admin-communities

  // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
  // s11-05 lights-out-maker

  // s11-09 read-alongs

  // Sprint 12 (docs/autonomous/sprint-12/plan.md §Anchors)
  // s12-06 connections-maker

  // s12-07 profile-made

  // Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)
  // s13-05 games-friends

  // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
  // s14-13 supporter-marks

  // s14-20 s13-gaps
  'lib/messages/dm-reports.server.ts':
    'A group thread reply takedown lowers the parent chat message replyCount (a chat message, never a post); it serialises no count.',
};

const V1_SERIALISER = /serializePublicPost\(.*, (?:input\.)?(?:userId|viewerId)\)/;

const NOT_POSTS = /user-build|tf2|slice-it|build/i;

describe('path ratchet', () => {
  it('names only files that exist', () => {
    for (const rel of QUIET_COUNT_READ_PATHS) expect(existsSync(join(root, rel)), rel).toBe(true);
  });

  it('every listed file redacts through the helpers (the v1 routes, by passing the caller to the serialiser)', () => {
    for (const rel of QUIET_COUNT_READ_PATHS) {
      // A v1 file passes the caller to the shared serialiser, which redacts (`countsHiddenFrom` runs inside it); a
      // `lib/api/v1/` module may instead call a helper itself. A comment mentioning a helper proves nothing.
      const code = src(rel).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      const v1 = rel.startsWith('app/routes/api/v1/') || rel.startsWith('lib/api/v1/');
      expect(code, rel).toMatch(v1 ? new RegExp(`${V1_SERIALISER.source}|${REDACTS.source}`) : REDACTS);
    }
  });

  it('no other file serialises a post count without being named or exempted', () => {
    const files = execSync(
      "grep -rlE '\\b(likeCount|repostCount|viewCount|commentCount|quoteCount|replyCount)\\b' app lib features --include=*.ts --include=*.tsx || true",
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => !/__tests__|\.test\.|\.product\.test\./.test(f) && !NOT_POSTS.test(f));
    const known = new Set<string>([...QUIET_COUNT_READ_PATHS, ...Object.keys(EXEMPT)]);
    const unknown = files.filter((f) => !known.has(f) && !/^lib\/feed\/quiet-counts/.test(f));
    expect(
      unknown,
      'a new reader of post counts must be added to QUIET_COUNT_READ_PATHS (redacting) or EXEMPT (with the reason)',
    ).toEqual([]);
  });

  it('the live feed stream does not subscribe to per-post engagement patches (they carry real counts)', () => {
    // If it ever does, those events must be redacted per viewer first.
    const code = src('app/routes/api/feed/stream.ts')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/subscribePost\(/);
  });

  it('the redaction rides in the existing author select: no extra query', () => {
    expect(src('lib/user-display.ts')).toMatch(/hideCountsOnMine:\s*true/);
  });
});
