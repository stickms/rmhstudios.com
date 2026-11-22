/**
 * `publishScheduledPost` and API uploads: the author's pending `Media` rows are attached to the new post (so the
 * orphan sweep keeps them), and a row whose upload is already attached to another post stops cleanly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  media: [] as Array<{ status: string; postId: string | null }>,
  mediaUpdate: vi.fn(),
  postCreate: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: 'sp1' }]),
    media: { findMany: vi.fn(async () => h.media), updateMany: h.mediaUpdate },
    rMHark: { create: h.postCreate },
    user: { update: vi.fn(async () => ({})) },
    community: { update: vi.fn(async () => ({})) },
    scheduledPost: { update: vi.fn(async () => ({})) },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      scheduledPost: { findUnique: vi.fn(async () => ({ publishedId: null })) },
      rMHark: { count: vi.fn(async () => 1) },
      user: { findUnique: vi.fn(async () => null) },
    },
  };
});
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn(), progressAchievement: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: vi.fn(async () => null) }));
vi.mock('@/lib/communities/settings.server', () => ({ getCommunitySettings: vi.fn(async () => null) }));
vi.mock('@/lib/communities/post-alerts.server', () => ({ enqueuePostAlert: vi.fn() }));

const { publishScheduledPost } = await import('@/lib/scheduled/publish.server');

const row = {
  id: 'sp1',
  userId: 'u1',
  content: 'hello',
  gifUrl: null,
  gifAlt: null,
  imageUrls: ['/api/media/med_a.png'],
  imageAlts: ['a'],
  audience: 'PUBLIC',
  isSensitive: false,
  contentWarning: null,
  replyControl: 'EVERYONE',
  unlockPrice: null,
  communityId: null,
  poll: null,
  publishedId: null,
  isCapsule: false,
} as never;

beforeEach(() => {
  h.media = [{ status: 'PENDING', postId: null }];
  h.mediaUpdate.mockReset();
  h.postCreate.mockReset();
  h.postCreate.mockResolvedValue({ id: 'post1' });
});

describe('publishScheduledPost media claim', () => {
  it('attaches the author’s pending uploads to the new post', async () => {
    expect(await publishScheduledPost(row)).toBe('post1');
    expect(h.mediaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', status: 'PENDING' }),
        data: expect.objectContaining({ status: 'ATTACHED', postId: 'post1' }),
      }),
    );
  });

  it('does not publish when an upload is already attached to another post', async () => {
    h.media = [{ status: 'ATTACHED', postId: 'other' }];
    expect(await publishScheduledPost(row)).toBeNull();
    expect(h.postCreate).not.toHaveBeenCalled();
  });
});
