/** setCircle must drop the cached feed pages of everyone whose membership changed. */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ invalidated: [] as string[], before: ['old', 'kept'] }));

vi.mock('@/lib/feed/timeline', () => ({
  invalidateViewerFeedPages: async (id: string) => {
    h.invalidated.push(id);
  },
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    follow: {
      findMany: async () => [
        { followerId: 'owner', followingId: 'kept' },
        { followerId: 'owner', followingId: 'added' },
      ],
    },
    closeFriend: {
      findMany: async () => h.before.map((memberId) => ({ memberId })),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: async () => [],
  },
}));

import { setCircle } from '../../circle.server';

describe('setCircle', () => {
  it('invalidates removed, kept and added members', async () => {
    await setCircle('owner', ['kept', 'added']);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.invalidated.sort()).toEqual(['added', 'kept', 'old']);
  });
});
