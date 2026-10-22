/**
 * POST /api/rmharks/ai-generate (mode: 'reply') sends a post's text to the model and
 * returns a draft built from it, so it must only read what the viewer may read:
 * the thread's audience rule, a priced post's body only once unlocked, the quoted
 * original under the same two rules, and ancestor comments only from that thread.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  userId: string;
  audience: string;
  deletedAt: Date | null;
  communityId: string | null;
  content: string;
  unlockPrice: number | null;
  unlocks: { id: string }[];
  original?: Row | null;
};

const h = vi.hoisted(() => ({
  viewer: 'me' as string | null,
  posts: {} as Record<string, unknown>,
  comments: {} as Record<string, { content: string; parentId: string | null; rmheetId: string }>,
  readable: new Set<string>(),
  generateReply: vi.fn(async () => 'draft'),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (h.viewer ? { user: { id: h.viewer }, session: {} } : null),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<object>()),
  rateLimit: () => ({ allowed: true, retryAfter: 0 }),
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadThread: async (post: { content?: string } | null) =>
    !!post && h.readable.has(post.content ?? ''),
}));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({
  isRmharkAIConfigured: () => true,
  generateReply: h.generateReply,
  generatePost: vi.fn(),
  generateAnnouncementTitle: vi.fn(),
  generateAnnouncementBody: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: { findUnique: async ({ where }: { where: { id: string } }) => h.posts[where.id] ?? null },
    rMHarkComment: {
      findUnique: async ({ where }: { where: { id: string } }) => h.comments[where.id] ?? null,
    },
  },
}));

import { Route } from '../../../app/routes/api/rmharks/ai-generate';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const post = (body: unknown) =>
  (Route as unknown as { options: { server: { handlers: { POST: Handler } } } }).options.server.handlers.POST({
    params: {},
    request: new Request('https://x.test/api/rmharks/ai-generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '1.1.1.1',
        cookie: 'better-auth.session_token=t',
      },
      body: JSON.stringify(body),
    }),
  });

const row = (content: string, over: Partial<Row> = {}): Row => ({
  userId: 'author',
  audience: 'PUBLIC',
  deletedAt: null,
  communityId: null,
  content,
  unlockPrice: null,
  unlocks: [],
  original: null,
  ...over,
});
const lastArgs = () =>
  (h.generateReply.mock.calls.at(-1) as unknown as [
    { postContent: string; quotedPostContent?: string; thread: string[] },
  ])[0];

beforeEach(() => {
  h.viewer = 'me';
  h.posts = {};
  h.comments = {};
  h.readable = new Set();
  h.generateReply.mockClear();
});

describe('ai-generate reply only reads what the viewer may read', () => {
  it('404s on a post the viewer cannot read, and never calls the model', async () => {
    h.posts.p1 = row('followers-only secret', { audience: 'FOLLOWERS' });
    const res = await post({ mode: 'reply', rmharkId: 'p1' });
    expect(res.status).toBe(404);
    expect(h.generateReply).not.toHaveBeenCalled();
  });

  it('403s on a priced post the viewer has not unlocked', async () => {
    h.posts.p1 = row('paid body', { unlockPrice: 50 });
    h.readable.add('paid body');
    const res = await post({ mode: 'reply', rmharkId: 'p1' });
    expect(res.status).toBe(403);
    expect(h.generateReply).not.toHaveBeenCalled();
  });

  it('uses a priced body once unlocked, or for its author', async () => {
    h.posts.p1 = row('paid body', { unlockPrice: 50, unlocks: [{ id: 'u' }] });
    h.readable.add('paid body');
    expect((await post({ mode: 'reply', rmharkId: 'p1' })).status).toBe(200);
    h.posts.p2 = row('my paid body', { unlockPrice: 50, userId: 'me' });
    h.readable.add('my paid body');
    expect((await post({ mode: 'reply', rmharkId: 'p2' })).status).toBe(200);
    expect(lastArgs().postContent).toBe('my paid body');
  });

  it('drops a quoted original the viewer cannot read, or has not unlocked', async () => {
    h.readable.add('public quote');
    h.posts.p1 = row('public quote', { original: row('private original', { audience: 'PRIVATE' }) });
    await post({ mode: 'reply', rmharkId: 'p1' });
    expect(lastArgs().quotedPostContent).toBeUndefined();

    h.readable.add('paid original');
    h.posts.p2 = row('public quote', { original: row('paid original', { unlockPrice: 10 }) });
    await post({ mode: 'reply', rmharkId: 'p2' });
    expect(lastArgs().quotedPostContent).toBeUndefined();

    h.readable.add('readable original');
    h.posts.p3 = row('public quote', { original: row('readable original') });
    await post({ mode: 'reply', rmharkId: 'p3' });
    expect(lastArgs().quotedPostContent).toBe('readable original');
  });

  it('ignores a parent comment from another thread', async () => {
    h.readable.add('public post');
    h.posts.p1 = row('public post');
    h.comments.cOther = { content: 'comment on a private thread', parentId: null, rmheetId: 'pPrivate' };
    h.comments.cMine = { content: 'comment here', parentId: null, rmheetId: 'p1' };
    await post({ mode: 'reply', rmharkId: 'p1', parentId: 'cOther' });
    expect(lastArgs().thread).toEqual([]);
    await post({ mode: 'reply', rmharkId: 'p1', parentId: 'cMine' });
    expect(lastArgs().thread).toEqual(['comment here']);
  });
});
