import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tracking is a member's own data with a hard cap enforced in the write, and its milestone check runs inside
// progressAchievement, which must never fail a game action. A small in-memory Prisma stands in for the database; its
// advisory lock is a real mutex held until the transaction callback settles, so the concurrency test means something.

const db = vi.hoisted(() => {
  const state = {
    tracks: new Map<
      string,
      {
        userId: string;
        achievementId: string;
        notifiedPct: number;
        createdAt: Date;
      }
    >(),
    rows: new Map<
      string,
      {
        progress: number;
        unlockedAt: Date | null;
      }
    >(),
    failTrackLookup: false,
  };
  let locked: Promise<void> = Promise.resolve();
  const key = (w: {
    userId_achievementId: {
      userId: string;
      achievementId: string;
    };
  }) => `${w.userId_achievementId.userId}:${w.userId_achievementId.achievementId}`;
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  const model = {
    achievementTrack: {
      findUnique: async ({ where }: { where: Parameters<typeof key>[0] }) => {
        if (state.failTrackLookup) throw new Error('db down');
        await tick();
        return state.tracks.get(key(where)) ?? null;
      },
      count: async ({
        where,
      }: {
        where: {
          userId: string;
        };
      }) => {
        await tick();
        return [...state.tracks.values()].filter((t) => t.userId === where.userId).length;
      },
      findMany: async ({
        where,
      }: {
        where: {
          userId: string;
        };
      }) =>
        [...state.tracks.values()].filter((t) => t.userId === where.userId).sort((a, b) => +a.createdAt - +b.createdAt),
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          achievementId: string;
        };
      }) => {
        await tick();
        state.tracks.set(`${data.userId}:${data.achievementId}`, {
          ...data,
          notifiedPct: 0,
          createdAt: new Date(),
        });
      },
      deleteMany: async ({
        where,
      }: {
        where: {
          userId: string;
          achievementId: string;
        };
      }) => {
        state.tracks.delete(`${where.userId}:${where.achievementId}`);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          userId: string;
          achievementId: string;
          notifiedPct: {
            lt: number;
          };
        };
        data: {
          notifiedPct: number;
        };
      }) => {
        await tick();
        const t = state.tracks.get(`${where.userId}:${where.achievementId}`);
        if (!t || !(t.notifiedPct < where.notifiedPct.lt))
          return {
            count: 0,
          };
        t.notifiedPct = data.notifiedPct;
        return {
          count: 1,
        };
      },
    },
    userAchievement: {
      findUnique: async ({ where }: { where: Parameters<typeof key>[0] }) => state.rows.get(key(where)) ?? null,
      upsert: async ({ where }: { where: Parameters<typeof key>[0] }) => {
        const k = key(where);
        if (!state.rows.has(k))
          state.rows.set(k, {
            progress: 0,
            unlockedAt: null,
          });
        return {
          ...state.rows.get(k)!,
        };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          userId: string;
          achievementId: string;
          unlockedAt: null;
        };
        data: {
          progress?:
            | number
            | {
                increment: number;
              };
          unlockedAt?: Date;
        };
      }) => {
        const r = state.rows.get(`${where.userId}:${where.achievementId}`);
        if (!r || r.unlockedAt)
          return {
            count: 0,
          };
        if (typeof data.progress === 'number') r.progress = data.progress;
        else if (data.progress) r.progress += data.progress.increment;
        if (data.unlockedAt) r.unlockedAt = data.unlockedAt;
        return {
          count: 1,
        };
      },
    },
    achievementRarity: {
      findMany: async () => [
        {
          achievementId: 'social.posts_10',
          pct: 0.3,
        },
      ],
    },
  };

  const prisma = {
    ...model,
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const previous = locked;
      let release!: () => void;
      locked = new Promise<void>((r) => (release = r));
      let held = false;
      const tx = {
        ...model,
        $executeRaw: async () => {
          await previous;
          held = true;
        },
      };
      try {
        return await cb(tx);
      } finally {
        if (!held) await previous;
        release();
      }
    },
  };
  return {
    state,
    prisma,
  };
});

const createNotification = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: db.prisma,
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification,
}));
vi.mock('@/lib/economy/ledger.server', () => ({
  creditCoins: vi.fn(async () => {}),
}));
vi.mock('@/lib/referrals.server', () => ({
  maybeRewardReferral: vi.fn(async () => {}),
}));

const { track, untrack, listTracked, onProgress } = await import('@/lib/achievements/tracking.server');
const { progressAchievement } = await import('@/lib/achievements/engine.server');

const USER = 'u1';
// Incremental (target 10) and a one-shot, both non-secret; `special.night_owl` is secret.
const POSTS = 'social.posts_10';
const OTHERS = ['social.posts_100', 'social.followers_50', 'creator.builds_10', 'game.rmhbox.wins_25'];

beforeEach(() => {
  db.state.tracks.clear();
  db.state.rows.clear();
  db.state.failTrackLookup = false;
  createNotification.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('track', () => {
  it('tracks a locked, non-secret achievement and is idempotent', async () => {
    expect(await track(USER, POSTS)).toBe('ok');
    expect(await track(USER, POSTS)).toBe('ok');
    expect((await listTracked(USER)).tracked).toEqual([POSTS]);
  });

  it('refuses a secret achievement and an unknown id without leaving a row', async () => {
    expect(await track(USER, 'special.night_owl')).toBe('unknown');
    expect(await track(USER, 'nope.nothing')).toBe('unknown');
    expect(db.state.tracks.size).toBe(0);
  });

  it('refuses an unlocked achievement', async () => {
    db.state.rows.set(`${USER}:${POSTS}`, {
      progress: 10,
      unlockedAt: new Date(),
    });
    expect(await track(USER, POSTS)).toBe('unlocked');
    expect(db.state.tracks.size).toBe(0);
  });

  it('refuses a sixth, and the cap holds when two requests race for the fifth slot', async () => {
    for (const id of OTHERS.slice(0, 4)) expect(await track(USER, id)).toBe('ok');
    const raced = await Promise.all([track(USER, POSTS), track(USER, 'social.first_post')]);
    expect([...raced].sort()).toEqual(['limit', 'ok']);
    expect(db.state.tracks.size).toBe(5);
    expect(await track(USER, 'social.followers_500')).toBe('limit');
    expect(db.state.tracks.size).toBe(5);
  });

  it('counts each member separately', async () => {
    for (const id of [POSTS, ...OTHERS]) await track(USER, id);
    expect(await track('u2', POSTS)).toBe('ok');
  });
});

describe('untrack and listTracked', () => {
  it("removes only the caller's row and returns the rarity table", async () => {
    await track(USER, POSTS);
    await track('u2', POSTS);
    await untrack(USER, POSTS);
    expect(await listTracked(USER)).toEqual({
      max: 5,
      tracked: [],
      rarity: {
        [POSTS]: 0.3,
      },
    });
    expect((await listTracked('u2')).tracked).toEqual([POSTS]);
  });
});

describe('onProgress', () => {
  it('notifies a tracked achievement crossing 50 % exactly once', async () => {
    await track(USER, POSTS);
    await onProgress(USER, POSTS, 4, 5);
    await onProgress(USER, POSTS, 5, 6);
    await onProgress(USER, POSTS, 4, 5); // a replay of the same crossing
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        type: 'SYSTEM',
        entityType: 'achievement',
        entityId: POSTS,
        preview: 'Halfway to Getting Chatty',
        link: '/progress?tab=achievements',
      }),
    );
  });

  it('announces once when two simultaneous moves cross the same threshold', async () => {
    await track(USER, POSTS);
    await Promise.all([onProgress(USER, POSTS, 4, 5), onProgress(USER, POSTS, 4, 5)]);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('announces 90 % after 50 %, and a jump over both says only "almost there"', async () => {
    await track(USER, POSTS);
    await onProgress(USER, POSTS, 4, 5);
    await onProgress(USER, POSTS, 8, 9);
    expect(
      createNotification.mock.calls.map(
        (c) =>
          (
            c as unknown as [
              {
                preview: string;
              },
            ]
          )[0].preview,
      ),
    ).toEqual(['Halfway to Getting Chatty', 'Almost there: Getting Chatty']);

    createNotification.mockClear();
    await track(USER, OTHERS[0]!);
    await onProgress(USER, OTHERS[0]!, 10, 95);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: 'Almost there: Prolific',
      }),
    );
  });

  it('says nothing for an achievement that is not tracked', async () => {
    await onProgress(USER, POSTS, 4, 5);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('removes the track on reaching the target, without a milestone notice', async () => {
    await track(USER, POSTS);
    await onProgress(USER, POSTS, 9, 10);
    expect(db.state.tracks.size).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    await track(USER, POSTS);
    db.state.failTrackLookup = true;
    await expect(onProgress(USER, POSTS, 4, 5)).resolves.toBeUndefined();
  });
});

describe('progressAchievement', () => {
  it('notifies a tracked achievement at half way and unlocks and untracks at the target', async () => {
    await track(USER, POSTS);
    expect(
      await progressAchievement(USER, POSTS, {
        by: 5,
      }),
    ).toBe(false);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(db.state.tracks.size).toBe(1);

    createNotification.mockClear();
    expect(
      await progressAchievement(USER, POSTS, {
        by: 5,
      }),
    ).toBe(true);
    expect(db.state.tracks.size).toBe(0);
    // The only notice is the unlock itself.
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: expect.stringContaining('Achievement unlocked'),
      }),
    );
  });

  it('is not failed by a broken milestone check: progress still lands and the unlock still pays out', async () => {
    await track(USER, POSTS);
    db.state.failTrackLookup = true;
    expect(
      await progressAchievement(USER, POSTS, {
        by: 5,
      }),
    ).toBe(false);
    expect(db.state.rows.get(`${USER}:${POSTS}`)?.progress).toBe(5);
    expect(
      await progressAchievement(USER, POSTS, {
        by: 5,
      }),
    ).toBe(true);
    expect(db.state.rows.get(`${USER}:${POSTS}`)?.unlockedAt).toBeInstanceOf(Date);
  });
});
