/** Feed mention notifications obey blocks in BOTH directions (shared `blockedPairs`). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  blocks: [] as { blockerId: string; blockedId: string }[],
  notifications: [] as { userId: string }[],
  sse: [] as { targetUserIds?: string[] }[],
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: {
      findUnique: async () => ({ userId: 'author', audience: 'PUBLIC', communityId: null }),
      count: async () => 0,
    },
    userBlock: {
      findMany: async () => h.blocks,
    },
  },
}));
vi.mock('@/lib/handles/lookup.server', () => ({
  findUsersByHandles: async () => [
    { id: 'blocked-by-author', handle: 'a' },
    { id: 'blocked-author', handle: 'b' },
    { id: 'friend', handle: 'c' },
  ],
}));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publish: (e: { targetUserIds?: string[] }) => h.sse.push(e) } }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: { userId: string }) => void h.notifications.push(n),
}));
vi.mock('@/lib/feed/audience.server', () => ({ canViewPost: async () => true }));
vi.mock('@/lib/notify/dispatch.server', () => ({ dispatch: async () => {} }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] }));

import { notifyMentions } from '../notify-mentions.server';

beforeEach(() => {
  h.notifications = [];
  h.sse = [];
  h.blocks = [
    { blockerId: 'author', blockedId: 'blocked-by-author' },
    { blockerId: 'blocked-author', blockedId: 'author' },
  ];
});

describe('feed notifyMentions', () => {
  it('skips users the author blocked and users who blocked the author', async () => {
    await notifyMentions({
      content: 'hi @a @b @c',
      author: { id: 'author', name: 'A', image: null, handle: 'author' },
      postId: 'p',
      entityType: 'rmhark',
      entityId: 'p',
      link: '/p',
      timestamp: 'now',
    });
    expect(h.notifications.map((n) => n.userId)).toEqual(['friend']);
    expect(h.sse.flatMap((e) => e.targetUserIds ?? [])).toEqual(['friend']);
  });
});
