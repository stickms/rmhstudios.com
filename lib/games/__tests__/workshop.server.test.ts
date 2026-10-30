import { beforeEach, describe, expect, it, vi } from 'vitest';

type Build = {
  slug: string; title: string; description: string; thumbnailUrl: string | null; likeCount: number; viewCount: number;
  publishedAt: Date | null; gameId: string | null; visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE'; user: { id: string; handle: string; name: string; image: null };
};
const db = vi.hoisted(() => ({ builds: [] as Build[], lastWhere: null as unknown }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userBuild: {
      findMany: async ({ where, take }: { where: { gameId: string; visibility: string; publishedAt: { not: null } }; take: number }) => {
        db.lastWhere = where;
        return db.builds
          .filter((b) => b.gameId === where.gameId && b.visibility === where.visibility && b.publishedAt !== null)
          .sort((a, b) => b.likeCount - a.likeCount)
          .slice(0, take);
      },
    },
  },
}));

import { listWorkshop } from '@/lib/games/workshop.server';
import { createBuildSchema, updateBuildSchema } from '@/lib/user-builds-schema';

const build = (slug: string, over: Partial<Build> = {}): Build => ({
  slug,
  title: slug,
  description: 'd',
  thumbnailUrl: null,
  likeCount: 0,
  viewCount: 0,
  publishedAt: new Date(),
  gameId: 'altair',
  visibility: 'PUBLIC',
  user: { id: 'u1', handle: 'ana', name: 'Ana', image: null },
  ...over,
});

beforeEach(() => {
  db.builds = [];
  db.lastWhere = null;
});

describe('listWorkshop', () => {
  it('lists only public, published builds made for that title, most liked first', async () => {
    db.builds = [
      build('low', { likeCount: 1 }),
      build('top', { likeCount: 9 }),
      build('hidden', { visibility: 'PRIVATE', likeCount: 99 }),
      build('unlisted', { visibility: 'UNLISTED', likeCount: 99 }),
      build('draft', { publishedAt: null, likeCount: 99 }),
      build('other-game', { gameId: 'laundry-sort', likeCount: 99 }),
      build('no-game', { gameId: null, likeCount: 99 }),
    ];
    const items = await listWorkshop('altair');
    expect(items.map((i) => i.slug)).toEqual(['top', 'low']);
    expect(db.lastWhere).toEqual({ gameId: 'altair', visibility: 'PUBLIC', publishedAt: { not: null } });
  });

  it('shapes the author for the page and respects the limit', async () => {
    db.builds = [build('a'), build('b'), build('c')];
    const items = await listWorkshop('altair', 2);
    expect(items).toHaveLength(2);
    expect(items[0].author).toEqual({ userId: 'u1', handle: 'ana', name: 'Ana', image: null });
  });

  it('is empty for a title with nothing made for it', async () => {
    expect(await listWorkshop('altair')).toEqual([]);
  });
});

describe('build schema gameId', () => {
  const base = { title: 'A fine build', description: 'A long enough description.' };

  it('accepts a title id, and an empty string (which clears it)', () => {
    expect(createBuildSchema.safeParse({ ...base, gameId: 'altair' }).success).toBe(true);
    expect(createBuildSchema.safeParse({ ...base, gameId: '' }).success).toBe(true);
    expect(createBuildSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an oversize id and non-strings, on update too', () => {
    expect(createBuildSchema.safeParse({ ...base, gameId: 'x'.repeat(65) }).success).toBe(false);
    expect(createBuildSchema.safeParse({ ...base, gameId: 5 }).success).toBe(false);
    expect(updateBuildSchema.safeParse({ gameId: '' }).success).toBe(true);
    expect(updateBuildSchema.safeParse({ gameId: 'x'.repeat(65) }).success).toBe(false);
  });
});
