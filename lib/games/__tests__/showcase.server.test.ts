import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  unlocked: new Map<string, string[]>(),
  badges: new Map<string, { gameId: string; foil: boolean }[]>(),
  showcase: new Map<string, { achievementIds: string[]; badges: string[] }>(),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userAchievement: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        (db.unlocked.get(where.userId) ?? []).map((achievementId) => ({ achievementId })),
    },
    gameBadge: { findMany: async ({ where }: { where: { userId: string } }) => db.badges.get(where.userId) ?? [] },
    gameProfileShowcase: {
      upsert: async ({ where, create }: { where: { userId: string }; create: { achievementIds: string[]; badges: string[] } }) => {
        db.showcase.set(where.userId, { achievementIds: create.achievementIds, badges: create.badges });
      },
      findUnique: async ({ where }: { where: { userId: string } }) => db.showcase.get(where.userId) ?? null,
    },
  },
}));

import { getShowcase, saveShowcase } from '@/lib/games/showcase.server';

beforeEach(() => {
  db.unlocked.clear();
  db.badges.clear();
  db.showcase.clear();
  db.unlocked.set('u1', ['a1', 'a2']);
  db.badges.set('u1', [{ gameId: 'altair', foil: false }]);
});

describe('saveShowcase', () => {
  it('keeps what the member owns, in order, and stores it', async () => {
    const r = await saveShowcase('u1', { achievements: ['a2', 'a1'], badges: ['altair:normal'] });
    expect(r).toEqual({ achievements: ['a2', 'a1'], badges: ['altair:normal'] });
    expect(await getShowcase('u1')).toEqual(r);
  });

  it('refuses to feature an achievement or badge someone else holds', async () => {
    db.unlocked.set('u2', ['secret']);
    db.badges.set('u2', [{ gameId: 'laundry-sort', foil: true }]);
    const r = await saveShowcase('u1', { achievements: ['secret', 'a1'], badges: ['laundry-sort:foil', 'altair:foil'] });
    expect(r).toEqual({ achievements: ['a1'], badges: [] });
  });

  it('an empty save clears the showcase', async () => {
    await saveShowcase('u1', { achievements: ['a1'], badges: [] });
    await saveShowcase('u1', { achievements: [], badges: [] });
    expect(await getShowcase('u1')).toEqual({ achievements: [], badges: [] });
  });

  it('reads an empty showcase for a member who never set one', async () => {
    expect(await getShowcase('nobody')).toEqual({ achievements: [], badges: [] });
  });
});
