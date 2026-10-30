import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  follows: [] as string[],
  seenWhere: null as unknown,
}));

const user = (id: string) => ({ id, name: id.toUpperCase(), username: null, handle: id, image: null, profile: null, inventory: [] });
const review = (id: string, userId: string, stars: number) => ({
  id,
  userId,
  stars,
  body: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: user(userId),
  votes: [],
});

vi.mock('@/lib/cache', () => ({ apiCache: { get: () => null, set: () => {}, invalidate: () => {} } }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    gameReview: {
      findMany: async () => [review('r1', 'pub', 5), review('r2', 'fol', 4), review('r3', 'priv', 1), review('r4', 'viewer', 3)],
    },
    gamePlaytime: {
      findMany: async () => [
        { userId: 'pub', totalSeconds: 3600, user: { playtimePrivacy: 'public' } },
        { userId: 'fol', totalSeconds: 7200, user: { playtimePrivacy: 'followers' } },
        { userId: 'priv', totalSeconds: 9000, user: { playtimePrivacy: 'private' } },
        { userId: 'viewer', totalSeconds: 100, user: { playtimePrivacy: 'private' } },
      ],
    },
    follow: { findMany: async () => db.follows.map((followingId) => ({ followingId })) },
    contentAward: {
      groupBy: async () => [
        { entityId: 'r1', awardId: 'silver', _count: { awardId: 2 } },
        { entityId: 'r1', awardId: 'gold', _count: { awardId: 5 } },
      ],
    },
  },
}));

import { listReviews } from '@/lib/games/meta.server';

const by = (rs: Awaited<ReturnType<typeof listReviews>>, id: string) => rs.find((r) => r.id === id);

beforeEach(() => {
  db.follows = [];
});

describe('listReviews: time on record', () => {
  it('shows it only where the author’s setting lets this viewer see it', async () => {
    const rs = await listReviews('altair', 'viewer', 'recent');
    expect(by(rs, 'r1')?.playtimeSeconds).toBe(3600); // public
    expect(by(rs, 'r2')?.playtimeSeconds).toBeNull(); // followers-only, viewer does not follow
    expect(by(rs, 'r3')?.playtimeSeconds).toBeNull(); // private
    expect(by(rs, 'r4')?.playtimeSeconds).toBe(100); // the viewer's own, whatever the setting
  });

  it('a follower sees a followers-only author’s time', async () => {
    db.follows = ['fol'];
    const rs = await listReviews('altair', 'viewer', 'recent');
    expect(by(rs, 'r2')?.playtimeSeconds).toBe(7200);
    expect(by(rs, 'r3')?.playtimeSeconds).toBeNull();
  });

  it('a signed-out viewer sees nobody’s time', async () => {
    const rs = await listReviews('altair', null, 'recent');
    expect(rs.every((r) => r.playtimeSeconds === null)).toBe(true);
  });
});

describe('listReviews: awards', () => {
  it('attaches each review’s awards, most first, and none to the rest', async () => {
    const rs = await listReviews('altair', 'viewer', 'recent');
    expect(by(rs, 'r1')?.awards).toEqual([
      { awardId: 'gold', count: 5 },
      { awardId: 'silver', count: 2 },
    ]);
    expect(by(rs, 'r2')?.awards).toEqual([]);
  });
});
