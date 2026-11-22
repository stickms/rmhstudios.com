import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const rows = new Map<
    string,
    {
      board: boolean;
      friends: boolean;
    }
  >();
  return {
    rows,
    invalidate: vi.fn(async (_key: string) => {}),
    prisma: {
      musicSocial: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: string;
            };
          }) => rows.get(where.userId) ?? null,
        ),
        upsert: vi.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: {
              userId: string;
            };
            create: {
              userId: string;
              board?: boolean;
              friends?: boolean;
            };
            update: {
              board?: boolean;
              friends?: boolean;
            };
          }) => {
            const prev = rows.get(where.userId);
            const next = prev
              ? {
                  ...prev,
                  ...update,
                }
              : {
                  board: create.board ?? false,
                  friends: create.friends ?? false,
                };
            rows.set(where.userId, next);
            return next;
          },
        ),
      },
    },
  };
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: h.prisma,
}));
vi.mock('@/lib/cached.server', () => ({
  invalidateCached: h.invalidate,
}));

import { boardCacheKey, friendsCacheKey } from './cache-keys';
import { getMusicSocial, setMusicSocial } from './prefs.server';

const NOW = Date.UTC(2026, 10, 16, 9);

beforeEach(() => {
  h.rows.clear();
  h.invalidate.mockClear();
});

describe('getMusicSocial / setMusicSocial', () => {
  it('a learner with no row has both switches off, and reading never creates a row', async () => {
    await expect(getMusicSocial('u1')).resolves.toEqual({
      board: false,
      friends: false,
    });
    expect(h.prisma.musicSocial.upsert).not.toHaveBeenCalled();
  });

  it('a PUT creates the row with only what was asked, and keeps the other switch', async () => {
    await expect(
      setMusicSocial(
        'u1',
        {
          board: true,
        },
        NOW,
      ),
    ).resolves.toEqual({
      board: true,
      friends: false,
    });
    await expect(
      setMusicSocial(
        'u1',
        {
          friends: true,
        },
        NOW,
      ),
    ).resolves.toEqual({
      board: true,
      friends: true,
    });
    await expect(
      setMusicSocial(
        'u1',
        {
          board: false,
        },
        NOW,
      ),
    ).resolves.toEqual({
      board: false,
      friends: true,
    });
  });

  it("a toggle drops the boards of today and yesterday and the learner's friends list", async () => {
    await setMusicSocial(
      'u1',
      {
        board: true,
      },
      NOW,
    );
    const keys = h.invalidate.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(
      expect.arrayContaining([boardCacheKey('2026-11-16'), boardCacheKey('2026-11-15'), friendsCacheKey('u1')]),
    );
  });
});
