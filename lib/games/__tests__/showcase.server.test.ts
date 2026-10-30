import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  unlocked: new Map<string, string[]>(),
  badges: new Map<string, { gameId: string; foil: boolean }[]>(),
  showcase: new Map<string, { achievementIds: string[]; badges: string[]; background?: string | null; frame?: string | null }>(),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userAchievement: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        (db.unlocked.get(where.userId) ?? []).map((achievementId) => ({ achievementId })),
    },
    gameBadge: { findMany: async ({ where }: { where: { userId: string } }) => (db.badges.get(where.userId) ?? []).map((b) => ({ ...b, level: (b as { level?: number }).level ?? 1 })) },
    gameProfileShowcase: {
      upsert: async ({ where, create, update }: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const cur = db.showcase.get(where.userId);
        const base = cur ?? { achievementIds: [], badges: [], background: null, frame: null };
        db.showcase.set(where.userId, { ...base, ...(cur ? update : create) } as never);
      },
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const r = db.showcase.get(where.userId);
        return r ? { achievementIds: r.achievementIds, badges: r.badges, background: r.background ?? null, frame: r.frame ?? null } : null;
      },
    },
  },
}));

import { getLook, getShowcase, saveLook, saveShowcase } from '@/lib/games/showcase.server';

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

describe('saveLook', () => {
  beforeEach(() => {
    db.badges.set('u1', [
      { gameId: 'altair', foil: false, level: 5 } as never,
      { gameId: 'laundry-sort', foil: true, level: 1 } as never,
    ]);
  });

  it('saves an unlocked background and frame', async () => {
    const r = await saveLook('u1', { background: 'bg:laundry-sort:foil', frame: 'frame:altair:5' });
    expect(r).toEqual({ background: 'bg:laundry-sort:foil', frame: 'frame:altair:5' });
    expect(await getLook('u1')).toEqual(r);
  });

  it('turns anything not unlocked into none, per field', async () => {
    const r = await saveLook('u1', { background: 'bg:cookgame', frame: 'frame:altair:3' });
    expect(r).toEqual({ background: null, frame: 'frame:altair:3' });
  });

  it('keeps the chosen showcase when the look is saved, and the look when the showcase is saved', async () => {
    db.unlocked.set('u1', ['a1']);
    await saveShowcase('u1', { achievements: ['a1'], badges: [] });
    await saveLook('u1', { background: 'bg:altair', frame: null });
    expect((await getShowcase('u1')).achievements).toEqual(['a1']);
    await saveShowcase('u1', { achievements: [], badges: [] });
    expect((await getLook('u1')).background).toBe('bg:altair');
  });

  it('reads no look for a member who never set one', async () => {
    expect(await getLook('nobody')).toEqual({ background: null, frame: null });
  });
});
