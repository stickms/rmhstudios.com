/**
 * Three small leaks of a post the caller cannot (or no longer can) read:
 *  - the like undo / no-op returned the post's like count;
 *  - the poll un-vote returned the poll's tallies;
 *  - the OG card's cache key ignored the quoted post's state.
 * Plus the quote placeholder, which named the author of a members-only post.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapQuotedOriginal, withholdQuotedOriginal } from '../quoted-original';

const h = vi.hoisted(() => ({
  readable: true,
  existingLike: false,
  existingVote: false,
  ogRevisions: [] as string[],
  ogPost: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'viewer' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: { publish: () => {}, publishPostEngagement: () => {} },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async () => {},
  removeNotification: async () => {},
}));
vi.mock('@/lib/social/engagement-effects.server', () => ({ enqueueProgression: async () => {} }));
vi.mock('@/lib/feed/notify-mentions.server', () => ({ notifyMentions: async () => {} }));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: async () => {} }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: async () => {} }));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadThread: async () => h.readable,
  canReadPostThread: async () => h.readable,
}));
vi.mock('@/lib/og/post-image.server', () => ({
  renderPostOgImage: async (a: { revision: string }) => {
    h.ogRevisions.push(a.revision);
    return Buffer.from('png');
  },
}));
vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    rMHark: {
      findUnique: async () =>
        h.ogPost ?? {
          userId: 'author',
          content: 'x',
          likeCount: 42,
          audience: 'FOLLOWERS',
          communityId: null,
          deletedAt: null,
          user: { handle: 'a' },
        },
      update: async () => ({ likeCount: 41 }),
    },
    rMHarkLike: {
      findUnique: async () => (h.existingLike ? { id: 'l1' } : null),
      delete: async () => ({}),
    },
    rMHarkPollOption: {
      findUnique: async () => ({ id: 'o1', poll: { rmheetId: 'p1', id: 'poll1', multiSelect: false, closesAt: null } }),
      findMany: async () => [{ id: 'o1', voteCount: 7 }],
      updateMany: async () => ({}),
    },
    rMHarkPollVote: {
      findUnique: async () => (h.existingVote ? { id: 'v1' } : null),
      findMany: async () => [],
      delete: async () => ({}),
    },
    $transaction: async (ops: unknown[]) => (Array.isArray(ops) ? [null, { likeCount: 41 }] : null),
  };
  return { prisma };
});

import { setPostLike } from '@/lib/social/engagement.server';
import { Route as VoteRoute } from '../../../app/routes/api/rmharks/$id/vote';
import { Route as OgRoute } from '../../../app/routes/api/og/post/$id';

type H = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handler = (r: unknown, m: 'GET' | 'POST') =>
  (r as { options: { server: { handlers: Record<string, H> } } }).options.server.handlers[m];

beforeEach(() => {
  h.readable = true;
  h.existingLike = false;
  h.existingVote = false;
  h.ogRevisions.length = 0;
  h.ogPost = null;
});

describe('like undo / no-op on an unreadable post', () => {
  it('returns the count while the post is readable', async () => {
    const r = await setPostLike('viewer', 'p1', false);
    expect(r.likeCount).toBe(42);
  });
  it('no-op unlike returns no count when unreadable', async () => {
    h.readable = false;
    const r = await setPostLike('viewer', 'p1', false);
    expect(r).toMatchObject({ ok: true, found: true, liked: false });
    expect(r.likeCount).toBeUndefined();
  });
  it('already-liked no-op returns no count when unreadable', async () => {
    h.readable = false;
    h.existingLike = true;
    const r = await setPostLike('viewer', 'p1', true);
    expect(r.liked).toBe(true);
    expect(r.likeCount).toBeUndefined();
  });
  it('a real unlike still works but carries no count when unreadable', async () => {
    h.readable = false;
    h.existingLike = true;
    const r = await setPostLike('viewer', 'p1', false);
    expect(r).toMatchObject({ ok: true, liked: false });
    expect(r.likeCount).toBeUndefined();
  });
});

describe('poll un-vote on an unreadable post', () => {
  const vote = async () =>
    handler(VoteRoute, 'POST')({
      request: new Request('https://x.test/api/rmharks/p1/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=t', 'cf-connecting-ip': String(Math.random()) },
        body: JSON.stringify({ optionId: 'o1' }),
      }),
      params: { id: 'p1' },
    });

  it('returns tallies for a readable post', async () => {
    h.existingVote = true;
    const body = await (await vote()).json();
    expect(body.options).toEqual([{ id: 'o1', voteCount: 7 }]);
  });
  it('removes the vote but returns no tallies when unreadable', async () => {
    h.existingVote = true;
    h.readable = false;
    const res = await vote();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.options).toBeUndefined();
    expect(body.totalVotes).toBeUndefined();
  });
});

describe('OG card cache key covers the quote', () => {
  const og = async () =>
    handler(OgRoute, 'GET')({
      request: new Request('https://x.test/api/og/post/p1', { headers: { 'cf-connecting-ip': String(Math.random()) } }),
      params: { id: 'p1' },
    });
  const post = (originalOver: Record<string, unknown>) => ({
    id: 'p1',
    content: 'hi',
    gifUrl: null,
    imageUrls: [],
    isSensitive: false,
    deletedAt: null,
    audience: 'PUBLIC',
    unlockPrice: null,
    createdAt: new Date(0),
    updatedAt: new Date(1000),
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    user: { id: 'u', name: 'U', image: null, handle: 'u' },
    poll: null,
    community: null,
    original: {
      content: 'quoted',
      isSensitive: false,
      deletedAt: null,
      audience: 'PUBLIC',
      unlockPrice: null,
      updatedAt: new Date(5000),
      community: null,
      user: { id: 'q', name: 'Q', image: null, handle: 'q' },
      ...originalOver,
    },
  });

  it('changes the revision when the quoted post goes private or is edited', async () => {
    h.ogPost = post({});
    await og();
    h.ogPost = post({ audience: 'FOLLOWERS' });
    await og();
    h.ogPost = post({ updatedAt: new Date(9000) });
    await og();
    expect(new Set(h.ogRevisions).size).toBe(3);
  });
});

describe('quote placeholder', () => {
  const user = { id: 'a', name: 'Secret', handle: 'secret' } as never;
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: 'o',
      userId: 'a',
      createdAt: new Date('2026-01-01'),
      content: 'SECRET',
      likeCount: 1,
      commentCount: 1,
      repostCount: 1,
      viewCount: 1,
      audience: 'FOLLOWERS',
      community: null,
      ...over,
    }) as never;

  it('unavailable card names no author and no date', () => {
    const c = mapQuotedOriginal(row(), user, 'viewer', [])!;
    expect(c.user).toBeUndefined();
    expect(c.createdAt).not.toContain('2026');
    expect(JSON.stringify(c)).not.toContain('secret');
  });
  it('deleted public post keeps its author; deleted members-only post does not', () => {
    const pub = mapQuotedOriginal(row({ audience: 'PUBLIC', deletedAt: new Date() }), user, 'viewer', [])!;
    expect(pub.user).toBe(user);
    const priv = mapQuotedOriginal(row({ deletedAt: new Date() }), user, 'viewer', [])!;
    expect(priv.user).toBeUndefined();
  });
  it('withholdQuotedOriginal strips the author too', () => {
    const w = withholdQuotedOriginal(
      { id: 'o', type: 'rmhark', createdAt: '2026-01-01T00:00:00.000Z', content: 'x', user } as never,
      false,
    );
    expect(w.user).toBeUndefined();
  });
});
