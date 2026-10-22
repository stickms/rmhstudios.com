/** /similar and giveAward must be gated by the same read rule as the post itself. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  readable: true,
  source: null as Record<string, unknown> | null,
  transfers: 0,
  awards: 0,
  dispatched: 0,
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'viewer' }, session: {} }) } },
}));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [], getBlockedAuthorIds: async () => [] }));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadThread: async () => h.readable,
  canReadPostThread: async () => h.readable,
  canReadCommentThread: async () => h.readable,
}));
vi.mock('@/lib/economy/ledger.server', () => ({
  transferCoins: async () => void h.transfers++,
  InsufficientFundsError: class extends Error {},
}));
vi.mock('@/lib/notify/dispatch.server', () => ({ dispatch: async () => void h.dispatched++ }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: {
      findUnique: async () => h.source,
      findMany: async () => [],
    },
    userProfile: { findUnique: async () => ({ coins: 1 }) },
    contentAward: { create: async () => void h.awards++ },
    $transaction: async (fn: (t: unknown) => unknown) =>
      fn({
        userProfile: { findUnique: async () => ({ coins: 1 }) },
        contentAward: { create: async () => void h.awards++ },
      }),
  },
}));

import { Route } from '../../../app/routes/api/rmharks/$id/similar';
import { giveAward, AwardError } from '@/lib/awards/awards.server';

const similar = () =>
  (Route as unknown as { options: { server: { handlers: { GET: (a: unknown) => Promise<Response> } } } })
    .options.server.handlers.GET({ params: { id: 'p' }, request: new Request('https://x.test/s') });

beforeEach(() => {
  h.readable = true;
  h.transfers = h.awards = h.dispatched = 0;
  h.source = { userId: 'author', audience: 'PUBLIC', communityId: null, deletedAt: null, content: 'topic words here', unlockPrice: null, unlocks: [] };
});

describe('GET /api/rmharks/:id/similar', () => {
  it('404s when the viewer cannot read the source post (private / blocked)', async () => {
    h.readable = false;
    expect((await similar()).status).toBe(404);
  });
  it('404s for a priced post the viewer has not unlocked', async () => {
    h.source = { ...h.source!, unlockPrice: 10, unlocks: [] };
    expect((await similar()).status).toBe(404);
  });
  it('answers for a readable free post', async () => {
    expect((await similar()).status).toBe(200);
  });
});

describe('giveAward', () => {
  const input = { awardId: 'bronze', entityType: 'rmhark' as const, entityId: 'p' };
  it('refuses a giver who cannot read the post: no charge, no award, no notification', async () => {
    h.readable = false;
    await expect(giveAward('viewer', input)).rejects.toThrow(AwardError);
    expect([h.transfers, h.awards, h.dispatched]).toEqual([0, 0, 0]);
  });
  it('still awards a readable post', async () => {
    await giveAward('viewer', input);
    expect([h.transfers, h.awards, h.dispatched]).toEqual([1, 1, 1]);
  });
});
