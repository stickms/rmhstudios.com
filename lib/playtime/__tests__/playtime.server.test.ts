import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Playtime crediting and the privacy filter on every read path.
 *
 * Like coin-gift.server.test.ts, the fake models the database's *atomic*
 * conditional UPDATE: `gamePlaytime.updateMany` checks `lastHeartbeatAt` and
 * writes in one synchronous step, so two tabs that read the same row before
 * either writes exhibit the same "exactly one is credited" outcome the real
 * `UPDATE ... WHERE lastHeartbeatAt = $read` guarantees. A naive
 * read-then-write credit fails these tests.
 */

type Row = { totalSeconds: number; lastHeartbeatAt: Date; lastPlayedAt: Date };
type Cand = {
  userId: string;
  gameId: string;
  totalSeconds: number;
  user: {
    id: string;
    handle: string | null;
    name: string | null;
    image: string | null;
    playtimePrivacy: string;
  };
};

const state = vi.hoisted(() => ({
  rows: new Map<string, { totalSeconds: number; lastHeartbeatAt: Date; lastPlayedAt: Date }>(),
  days: new Map<string, number>(),
  candidates: [] as unknown[],
  follows: new Set<string>(),
  locks: new Map<string, Promise<void>>(),
}));

const prismaMock = vi.hoisted(() => {
  const key = (w: { userId: string; gameId: string }) => `${w.userId}:${w.gameId}`;
  const m = {
    gamePlaytime: {
      findUnique: vi.fn(async ({ where }: { where: { userId_gameId: { userId: string; gameId: string } } }) => {
        await Promise.resolve(); // let a concurrent beat read before either writes
        return state.rows.get(key(where.userId_gameId)) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: { userId: string; gameId: string } & Row }) => {
        const k = key(data);
        if (state.rows.has(k)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        state.rows.set(k, {
          totalSeconds: data.totalSeconds,
          lastHeartbeatAt: data.lastHeartbeatAt,
          lastPlayedAt: data.lastPlayedAt,
        });
        return {};
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId: string; gameId: string; lastHeartbeatAt: Date };
          data: { totalSeconds: { increment: number }; lastHeartbeatAt: Date; lastPlayedAt: Date };
        }) => {
          const row = state.rows.get(key(where));
          if (!row || row.lastHeartbeatAt.getTime() !== where.lastHeartbeatAt.getTime()) {
            return { count: 0 };
          }
          row.totalSeconds += data.totalSeconds.increment;
          row.lastHeartbeatAt = data.lastHeartbeatAt;
          row.lastPlayedAt = data.lastPlayedAt;
          return { count: 1 };
        },
      ),
      // The user's most recent accepted beat across every title.
      findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => {
        await Promise.resolve();
        const mine = [...state.rows.entries()].filter(([k]) => k.startsWith(`${where.userId}:`));
        if (mine.length === 0) return null;
        const latest = mine.reduce((a, b) =>
          b[1].lastHeartbeatAt.getTime() > a[1].lastHeartbeatAt.getTime() ? b : a,
        );
        return { lastHeartbeatAt: latest[1].lastHeartbeatAt };
      }),
      findMany: vi.fn(async () => state.candidates),
    },
    gamePlaytimeDay: {
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { userId_gameId_day: { userId: string; gameId: string; day: Date } };
          create: { seconds: number };
        }) => {
          const w = where.userId_gameId_day;
          const k = `${w.userId}:${w.gameId}:${w.day.toISOString().slice(0, 10)}`;
          state.days.set(k, (state.days.get(k) ?? 0) + create.seconds);
          return {};
        },
      ),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string | { in: string[] }; gameId: string; day: { gte: Date } };
        }) => {
          const ids = typeof where.userId === 'string' ? [where.userId] : where.userId.in;
          return [...state.days.entries()]
            .map(([k, seconds]) => {
              const [userId, gameId, day] = k.split(':');
              return { userId, gameId, day, seconds };
            })
            .filter(
              (r) =>
                ids.includes(r.userId) && r.gameId === where.gameId && new Date(r.day) >= where.day.gte,
            );
        },
      ),
    },
    follow: {
      findMany: vi.fn(async ({ where }: { where: { followerId: string; followingId: { in: string[] } } }) =>
        where.followingId.in
          .filter((id) => state.follows.has(`${where.followerId}>${id}`))
          .map((followingId) => ({ followingId })),
      ),
    },
    user: { update: vi.fn(), findUnique: vi.fn() },
    // `pg_advisory_xact_lock(hashtext(userId))`: a second transaction for the same
    // user waits until the holder's transaction ends, so this user's beats run
    // one at a time even across different titles.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      let release: (() => void) | undefined;
      const tx = {
        ...m,
        $executeRaw: vi.fn(async (_strings: TemplateStringsArray, userId: string) => {
          const previous = state.locks.get(userId) ?? Promise.resolve();
          let done!: () => void;
          const mine = new Promise<void>((resolve) => (done = resolve));
          state.locks.set(userId, previous.then(() => mine));
          await previous;
          release = done;
          return 0;
        }),
      };
      try {
        return await fn(tx);
      } finally {
        release?.();
      }
    }),
  };
  return m;
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import {
  getActivity,
  listFriendsWhoPlay,
  listTopPlayers,
  recordHeartbeat,
} from '@/lib/playtime/playtime.server';

const T0 = new Date('2026-10-30T12:00:00.000Z');
const after = (s: number) => new Date(T0.getTime() + s * 1000);
const rowOf = (u: string, g: string) => state.rows.get(`${u}:${g}`);

beforeEach(() => {
  state.rows.clear();
  state.days.clear();
  state.candidates = [];
  state.follows.clear();
  state.locks.clear();
  vi.clearAllMocks();
});

describe('recordHeartbeat', () => {
  it('credits one 30 s interval for the very first beat and creates the day bucket', async () => {
    expect(await recordHeartbeat('u1', 'altair', T0)).toEqual({ credited: 30 });
    expect(rowOf('u1', 'altair')?.totalSeconds).toBe(30);
    expect(state.days.get('u1:altair:2026-10-30')).toBe(30);
  });

  it('credits nothing for a second beat 10 s later', async () => {
    await recordHeartbeat('u1', 'altair', T0);
    expect(await recordHeartbeat('u1', 'altair', after(10))).toEqual({ credited: 0 });
    expect(rowOf('u1', 'altair')?.totalSeconds).toBe(30);
  });

  it('credits the real gap (45 s) and caps a 10-minute silence at 60 s', async () => {
    await recordHeartbeat('u1', 'altair', T0);
    expect(await recordHeartbeat('u1', 'altair', after(45))).toEqual({ credited: 45 });
    expect(await recordHeartbeat('u1', 'altair', after(45 + 600))).toEqual({ credited: 60 });
    expect(rowOf('u1', 'altair')?.totalSeconds).toBe(30 + 45 + 60);
  });

  it('credits once when two tabs beat at the same instant', async () => {
    await recordHeartbeat('u1', 'altair', T0);
    const [a, b] = await Promise.all([
      recordHeartbeat('u1', 'altair', after(30)),
      recordHeartbeat('u1', 'altair', after(30)),
    ]);
    expect([a.credited, b.credited].sort((x, y) => x - y)).toEqual([0, 30]);
    expect(rowOf('u1', 'altair')?.totalSeconds).toBe(60);
  });

  it('credits once when two first-ever beats race to create the row', async () => {
    const [a, b] = await Promise.all([
      recordHeartbeat('u1', 'altair', T0),
      recordHeartbeat('u1', 'altair', T0),
    ]);
    expect([a.credited, b.credited].sort((x, y) => x - y)).toEqual([0, 30]);
    expect(rowOf('u1', 'altair')?.totalSeconds).toBe(30);
  });

  describe('one clock per user, across titles', () => {
    const total = () => [...state.rows.values()].reduce((n, r) => n + r.totalSeconds, 0);

    it('credits once when two different titles beat at the same instant', async () => {
      await recordHeartbeat('u1', 'altair', T0);
      const [a, b] = await Promise.all([
        recordHeartbeat('u1', 'altair', after(30)),
        recordHeartbeat('u1', 'rmhtube', after(30)),
      ]);
      expect([a.credited, b.credited].sort((x, y) => x - y)).toEqual([0, 30]);
      expect(total()).toBe(30 + 30);
    });

    it('two windows on two titles earn one clock, not two', async () => {
      await recordHeartbeat('u1', 'altair', T0); // 30
      await recordHeartbeat('u1', 'rmhtube', after(10)); // 0: 10 s after the last beat
      await recordHeartbeat('u1', 'altair', after(30)); // 30
      await recordHeartbeat('u1', 'rmhtube', after(40)); // 0
      expect(total()).toBe(60);
    });

    it('credits the real gap when the user moves from one title to another', async () => {
      await recordHeartbeat('u1', 'altair', T0);
      expect(await recordHeartbeat('u1', 'rmhtube', after(45))).toEqual({ credited: 45 });
    });

    it('does not let one user’s beats slow another’s', async () => {
      await recordHeartbeat('u1', 'altair', T0);
      expect(await recordHeartbeat('u2', 'altair', after(5))).toEqual({ credited: 30 });
    });
  });

  it('rejects an id that is not a listed on-site title', async () => {
    await expect(recordHeartbeat('u1', 'no-such-title', T0)).rejects.toThrow('unknown title');
    await expect(recordHeartbeat('u1', 'rmhdle', T0)).rejects.toThrow('unknown title');
  });
});

describe('getActivity', () => {
  it('reports total, the last 14 days and last played', async () => {
    state.rows.set('u1:altair', { totalSeconds: 9000, lastHeartbeatAt: T0, lastPlayedAt: T0 });
    state.days.set('u1:altair:2026-10-29', 600);
    state.days.set('u1:altair:2026-10-17', 300); // 13 days before the 30th: in
    state.days.set('u1:altair:2026-10-01', 7000); // out
    expect(await getActivity('u1', 'altair', T0)).toEqual({
      totalSeconds: 9000,
      last2WeeksSeconds: 900,
      lastPlayedAt: T0.toISOString(),
    });
  });

  it('returns zeros for a title never played', async () => {
    expect(await getActivity('u1', 'altair', T0)).toEqual({
      totalSeconds: 0,
      last2WeeksSeconds: 0,
      lastPlayedAt: null,
    });
  });
});

const cand = (id: string, privacy: string, total = 100): Cand => ({
  userId: id,
  gameId: 'altair',
  totalSeconds: total,
  user: { id, handle: id, name: id, image: null, playtimePrivacy: privacy },
});

describe('listFriendsWhoPlay / listTopPlayers privacy', () => {
  beforeEach(() => {
    state.candidates = [
      cand('pub', 'public'),
      cand('fol-followed', 'followers'),
      cand('fol-stranger', 'followers'),
      cand('priv', 'private'),
    ];
    state.follows.add('viewer>pub');
    state.follows.add('viewer>fol-followed');
    state.follows.add('viewer>priv');
  });

  it('lists a followed public user and a followed follower-only user, never a private one', async () => {
    const ids = (await listFriendsWhoPlay('viewer', 'altair')).map((p) => p.userId);
    expect(ids).toEqual(['pub', 'fol-followed']);
  });

  it('top players omit private users and follower-only users the viewer does not follow', async () => {
    const ids = (await listTopPlayers('viewer', 'altair')).map((p) => p.userId);
    expect(ids).toEqual(['pub', 'fol-followed']);
  });

  it('returns nothing to a signed-out viewer', async () => {
    expect(await listFriendsWhoPlay(null, 'altair')).toEqual([]);
    expect(await listTopPlayers(null, 'altair')).toEqual([]);
  });

  it('shows the viewer their own row even when private', async () => {
    state.candidates = [cand('viewer', 'private')];
    expect((await listTopPlayers('viewer', 'altair')).map((p) => p.userId)).toEqual(['viewer']);
  });
});
