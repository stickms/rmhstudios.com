/**
 * Review item 6: the digest, the recommendation candidates and the AI ask-feed
 * excluded EVERY community post (`communityId: null`) when the intent was only
 * to exclude members-only ones. They now use the shared community predicate, so
 * a public community's posts qualify and a private community's qualify only for
 * its members.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  rmharkFindMany: vi.fn(),
  followFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: { findMany: h.rmharkFindMany },
    follow: { findMany: h.followFindMany },
  },
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getHiddenAuthorIdsStrict: async () => [],
}));
vi.mock('@/lib/streak.server', () => ({ getStreak: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ getActiveQuests: vi.fn() }));
vi.mock('@/lib/email/unsubscribe', () => ({ signUnsubToken: vi.fn() }));
vi.mock('@/lib/search/hybrid', () => ({ fuse: vi.fn() }));
vi.mock('@/lib/search/embeddings.server', () => ({
  isEmbeddingAvailable: () => false,
  similarTo: async () => [],
}));
vi.mock('@/lib/recommend/profile.server', () => ({ buildTasteProfile: vi.fn() }));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'viewer-1' } }) } },
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/ai/text.server', () => ({
  isAITextConfigured: () => true,
  askFeed: async () => 'ok',
}));

import { communityVisibleWhere } from '@/lib/feed/audience.server';
import { topPostsFromFollows } from '@/lib/digest/assemble.server';
import { postCandidates } from '@/lib/recommend/recommend.server';
import { Route } from '@/app/routes/api/ai/ask-feed';

function expectCommunityPredicate(where: Record<string, unknown>, viewerId: string | null) {
  // Not the blanket "no community at all" filter ...
  expect(where.communityId).toBeUndefined();
  // ... but the members-only rule, spelled out here so a regression in the shared
  // helper (e.g. dropping the membership clause) fails instead of agreeing with itself.
  const expected = viewerId
    ? { isNot: { isPrivate: true, members: { none: { userId: viewerId } } } }
    : { isNot: { isPrivate: true } };
  expect(where.community).toEqual(expected);
  expect(communityVisibleWhere(viewerId).community).toEqual(expected);
}

beforeEach(() => {
  h.rmharkFindMany.mockReset().mockResolvedValue([]);
  h.followFindMany.mockReset().mockResolvedValue([{ followingId: 'a' }]);
});

describe('public-community posts are not excluded wholesale', () => {
  it('digest: members-only rule for the recipient', async () => {
    await topPostsFromFollows('viewer-1', new Date(0));
    expectCommunityPredicate(h.rmharkFindMany.mock.calls[0][0].where, 'viewer-1');
  });

  it('recommendation candidates: members-only rule for the viewer', async () => {
    await postCandidates({}, 'viewer-1');
    expectCommunityPredicate(h.rmharkFindMany.mock.calls[0][0].where, 'viewer-1');
  });

  it('recommendation candidates: signed-out viewers are members of nothing', async () => {
    await postCandidates({}, null);
    expectCommunityPredicate(h.rmharkFindMany.mock.calls[0][0].where, null);
  });

  it('ask-feed: both the keyword query and the recent fallback use the rule', async () => {
    const handler = (Route as unknown as {
      options: {
        server: { handlers: { POST: (c: unknown) => Promise<Response> } };
      };
    }).options.server.handlers.POST;
    await handler({
      request: new Request('http://x/api/ai/ask-feed', { method: 'POST' }),
      body: { question: 'what is happening with spheres today' },
    });
    expect(h.rmharkFindMany).toHaveBeenCalledTimes(2); // keyword pass, then fallback
    for (const [args] of h.rmharkFindMany.mock.calls) {
      expectCommunityPredicate(args.where, 'viewer-1');
    }
  });
});
