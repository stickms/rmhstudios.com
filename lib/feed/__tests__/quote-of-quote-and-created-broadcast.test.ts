/**
 * POST /api/rmharks, quoting:
 *  - a quote-of-quote republishes the ROOT, so the root must be readable by the
 *    quoter (before, only the named quote was checked: the root's counter moved,
 *    its author was notified, and the 201 carried the root's raw text);
 *  - the 201 and the live broadcast build the quote card through the one quote
 *    rule, and a non-public / community post is never broadcast globally.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  posts: {} as Record<string, Record<string, unknown>>,
  readable: new Set<string>(),
  repostBumps: [] as string[],
  notified: [] as unknown[],
  published: [] as { event: { payload: { original: { content: string } } }; post: unknown }[],
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'viewer' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
  checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }),
}));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: {
    publish: vi.fn(),
    publishCreatedPost: (event: unknown, post: unknown) =>
      h.published.push({ event: event as (typeof h.published)[number]['event'], post }),
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: unknown) => void h.notified.push(n)),
  removeNotification: vi.fn(async () => {}),
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getBlockedAuthorIds: async () => [],
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadThread: async (p: { id?: string } | null) => !!p && h.readable.has(p.id as string),
}));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: async () => null }));
vi.mock('@/lib/feed/alt-text.server', () => ({ altTextViolation: async () => null }));
vi.mock('@/lib/posts-plus/compose.server', () => ({
  planPostsPlus: async () => ({ plan: { expiresAt: null, seriesId: null, qotdDay: null } }),
  recordPostsPlusTx: async () => {},
  afterPostsPlus: () => {},
}));
vi.mock('@/lib/tags-extract.server', () => ({
  linkPostHashtags: async () => {},
  linkPostHashtagsIfPublic: async () => {},
}));
vi.mock('@/lib/safety/link-risk.server', () => ({ recordLinkDomains: async () => {} }));
vi.mock('@/lib/moderation/auto-moderate.server', () => ({ screenNewContent: async () => {} }));
vi.mock('@/lib/feed/notify-mentions.server', () => ({ notifyMentions: async () => {} }));
vi.mock('@/lib/discovery/jobs.server', () => ({ enqueuePostDiscovery: async () => {} }));
vi.mock('@/lib/achievements/engine.server', () => ({
  grantAchievement: async () => {},
  progressAchievement: async () => {},
}));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: async () => {} }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: async () => {} }));
vi.mock('@/lib/scheduled/publish.server', () => ({ publishDueForUser: async () => {} }));
vi.mock('@/lib/feed/timeline', () => ({ getTimeline: async () => ({}) }));
vi.mock('@/lib/communities/gate.server', () => ({
  gateCommunityContent: async () => ({ kind: 'allow' }),
  logRemoved: async () => {},
}));
vi.mock('@/lib/communities/automod.server', () => ({ HELD_BY: 'automod', recordModItem: async () => {} }));
vi.mock('@/lib/communities/flairs.server', () => ({ listFlairs: async () => [] }));
vi.mock('@/lib/communities/challenge.server', () => ({ challengeEntryError: async () => null }));
vi.mock('@/lib/prisma.server', () => {
  const tx = {
    rMHark: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new',
        createdAt: new Date(),
        imageUrls: [],
        imageAlts: [],
        gifUrl: null,
        isSensitive: false,
        replyControl: 'EVERYONE',
        isTake: false,
        hasEmbed: false,
        seriesId: null,
        expiresAt: null,
        ...data,
        user: { id: 'viewer', name: 'V', image: null, handle: 'v' },
      }),
      update: async ({ where }: { where: { id: string } }) => void h.repostBumps.push(where.id),
    },
    user: { update: async () => ({ postCount: 1 }) },
    community: { update: async () => ({}) },
  };
  return {
    prisma: {
      communityMember: { findUnique: async () => ({ id: 'm' }) },
      rMHark: {
        findUnique: async ({ where }: { where: { id: string } }) => h.posts[where.id] ?? null,
      },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { Route } from '../../../app/routes/api/rmharks';

const POST = (
  Route as unknown as {
    options: {
      server: { handlers: { POST: (a: { request: Request }) => Promise<Response> } };
    };
  }
).options.server.handlers.POST;

const author = { id: 'a', name: 'Secret Author', image: null, handle: 'secret' };
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  content: `TEXT-OF-${id}`,
  createdAt: new Date('2026-01-01'),
  likeCount: 3,
  commentCount: 2,
  repostCount: 1,
  viewCount: 9,
  gifUrl: null,
  imageUrls: [],
  imageAlts: [],
  unlockPrice: null,
  audience: 'PUBLIC',
  isSensitive: false,
  deletedAt: null,
  deletedByAdmin: false,
  userId: 'a',
  communityId: null,
  community: null,
  originalId: null,
  user: author,
  ...over,
});

async function post(body: Record<string, unknown>) {
  const request = new Request('https://x.test/api/rmharks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': String(Math.random()),
      cookie: 'better-auth.session_token=t',
    },
    body: JSON.stringify({ content: 'my take', ...body }),
  });
  return POST({ request });
}

beforeEach(() => {
  h.repostBumps.length = 0;
  h.notified.length = 0;
  h.published.length = 0;
  // R: followers-only root by A. Q: public quote of R by C (viewer can read Q, not R).
  h.posts = {
    R: row('R', { audience: 'FOLLOWERS', content: 'FOLLOWERS-ONLY ROOT' }),
    Q: row('Q', { userId: 'c', originalId: 'R', content: 'public quote' }),
    P: row('P', { content: 'public root' }),
  };
  h.readable = new Set(['Q', 'P']);
});

describe('quote of a quote', () => {
  it('refuses when the root is unreadable, with no counter bump or notification', async () => {
    const res = await post({ originalId: 'Q' });
    expect(res.status).toBe(400);
    expect(h.repostBumps).toEqual([]);
    expect(h.notified).toEqual([]);
    expect(h.published).toEqual([]);
  });

  it('succeeds when the root is readable too', async () => {
    h.readable.add('R');
    const res = await post({ originalId: 'Q' });
    expect(res.status).toBe(201);
    expect(h.repostBumps).toEqual(['R']);
  });
});

describe('the quote card on the 201 and the broadcast', () => {
  it('shows the quoter a public original and the broadcast the same anonymous card', async () => {
    const res = await post({ originalId: 'P' });
    const item = await res.json();
    expect(item.original.content).toBe('public root');
    expect(item.original.user.handle).toBe('secret');
    expect(h.published[0].event.payload.original.content).toBe('public root');
  });

  it('never carries a followers-only original raw: unavailable card, no author', async () => {
    h.readable.add('R'); // the quoter may read it; a quote card still does not republish it
    const res = await post({ originalId: 'R' });
    const item = await res.json();
    expect(JSON.stringify(item.original)).not.toContain('FOLLOWERS-ONLY ROOT');
    expect(item.original.user).toBeUndefined();
    const sent = JSON.stringify(h.published[0].event.payload.original);
    expect(sent).not.toContain('FOLLOWERS-ONLY ROOT');
    expect(sent).not.toContain('secret');
  });
});

describe('created-post broadcast audience', () => {
  it('hands the bus the post audience and community so it can route', async () => {
    await post({ audience: 'FOLLOWERS' });
    expect(h.published[0].post).toEqual({ audience: 'FOLLOWERS', communityId: null });
  });
});
