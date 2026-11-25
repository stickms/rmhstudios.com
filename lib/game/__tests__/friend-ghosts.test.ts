/**
 * s12-03: racing a friend's ghost. Who may be raced (mutual follows only, never across a block or a ban, never a member
 * hidden from boards, never an account waiting to be deleted), which ghost is served (never one above the owner's
 * validated board score), and how the list is sorted and capped. In-memory stand-ins for the follow graph, the boards'
 * hidden set, blocks and the tables; no database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Replay {
  id: string;
  userId: string;
  level: number;
  score: number | null;
  durationMs: number;
  createdAt: number;
}

const h = vi.hoisted(() => ({
  /** `followerId -> followingId` edges. */
  follows: [] as Array<[string, string]>,
  hidden: new Set<string>(),
  blocked: new Set<string>(),
  /** userId -> board score. */
  board: new Map<string, number>(),
  users: new Map<
    string,
    { name: string | null; handle: string | null; image: string | null; banned: boolean; deletion: boolean }
  >(),
  replays: [] as Array<{
    id: string;
    userId: string;
    level: number;
    score: number | null;
    durationMs: number;
    createdAt: number;
  }>,
  calls: { board: 0, replays: 0 },
  lastWhere: null as unknown,
}));

vi.mock('@/lib/social/follow-graph.server', () => ({
  getFollowingIds: async (id: string) => h.follows.filter(([a]) => a === id).map(([, b]) => b),
}));
vi.mock('@/lib/communities/access.server', () => ({ getRole: vi.fn() }));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({ leaderboardHiddenUserIds: async () => h.hidden }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [...h.blocked] }));
vi.mock('@/lib/prisma.server', () => {
  const owned = (userId: string) => {
    const u = h.users.get(userId);
    return !!u && !u.banned && !u.deletion;
  };
  const chip = (userId: string) => {
    const u = h.users.get(userId)!;
    return { id: userId, name: u.name, handle: u.handle, image: u.image };
  };
  return {
    prisma: {
      follow: {
        findMany: async ({ where }: { where: { followerId: { in: string[] }; followingId: string } }) =>
          h.follows
            .filter(([a, b]) => where.followerId.in.includes(a) && b === where.followingId)
            .map(([a]) => ({ followerId: a })),
      },
      neonDriftwayPlayer: {
        findMany: async ({ where }: { where: { userId: { in: string[] } } }) => {
          h.calls.board++;
          return where.userId.in
            .filter((id) => h.board.has(id))
            .map((userId) => ({ userId, highScore: h.board.get(userId)! }));
        },
      },
      gameReplay: {
        findMany: async ({
          where,
        }: {
          where: { userId: { in: string[] }; data: { equals: number }; user: unknown };
        }) => {
          h.calls.replays++;
          h.lastWhere = where;
          return h.replays
            .filter((r) => where.userId.in.includes(r.userId) && r.level === where.data.equals && owned(r.userId))
            .sort((a, b) => a.durationMs - b.durationMs)
            .map((r) => ({ userId: r.userId, score: r.score, durationMs: r.durationMs, user: chip(r.userId) }));
        },
        findFirst: async ({
          where,
        }: {
          where: { userId: string; score: { lte: number }; data: { equals: number } };
        }) => {
          h.calls.replays++;
          const r = h.replays
            .filter(
              (x) =>
                x.userId === where.userId &&
                x.level === where.data.equals &&
                x.score !== null &&
                x.score <= where.score.lte &&
                owned(x.userId),
            )
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.createdAt - a.createdAt)[0];
          return r ? { id: r.id, data: { level: r.level, samples: [] }, user: chip(r.userId) } : null;
        },
      },
    },
  };
});

import { FRIEND_GHOST_CAP, friendGhost, friendGhostList } from '@/lib/game/friend-ghosts.server';
import { BOARD_PRIVACY_READ_PATHS } from '@/lib/game/leaderboard-privacy';

const ME = 'me';
const mutual = (id: string) => {
  h.follows.push([ME, id], [id, ME]);
};
const member = (
  id: string,
  opts: { score?: number | null; board?: number | null; durationMs?: number; level?: number } = {},
) => {
  h.users.set(id, { name: `Name ${id}`, handle: id, image: null, banned: false, deletion: false });
  if (opts.board !== null) h.board.set(id, opts.board ?? 1000);
  if (opts.score !== null || opts.durationMs !== undefined || opts.level !== undefined) {
    h.replays.push({
      id: `replay-${id}`,
      userId: id,
      level: opts.level ?? 1,
      score: opts.score === undefined ? 900 : opts.score,
      durationMs: opts.durationMs ?? 60_000,
      createdAt: 1,
    } as Replay);
  }
};
const ids = async (level = 1) => (await friendGhostList(ME, 'neon-driftway', level)).map((f) => f.userId);

beforeEach(() => {
  h.follows = [];
  h.hidden = new Set();
  h.blocked = new Set();
  h.board = new Map();
  h.users = new Map();
  h.replays = [];
  h.calls = { board: 0, replays: 0 };
});

describe('friend ghost list', () => {
  it('lists a mutual follow with a ghost, with the name and the time and no trace', async () => {
    member('ada', { durationMs: 41_000 });
    mutual('ada');
    const list = await friendGhostList(ME, 'neon-driftway', 1);
    expect(list).toEqual([{ userId: 'ada', name: 'Name ada', handle: 'ada', image: null, timeMs: 41_000 }]);
    expect(JSON.stringify(list)).not.toContain('samples');
  });

  it('never lists a one-way follow, in either direction', async () => {
    member('iFollow');
    member('followsMe');
    h.follows.push([ME, 'iFollow'], ['followsMe', ME]);
    expect(await ids()).toEqual([]);
  });

  it('never lists a member blocked by the viewer or blocking the viewer', async () => {
    member('blockedByMe');
    member('blocksMe');
    member('ok');
    for (const id of ['blockedByMe', 'blocksMe', 'ok']) mutual(id);
    // getBlockedAuthorIds answers both directions as one set.
    h.blocked = new Set(['blockedByMe', 'blocksMe']);
    expect(await ids()).toEqual(['ok']);
  });

  it('never lists a member who hides from leaderboards (a banned member is in that set)', async () => {
    member('hider');
    member('banned');
    member('ok');
    for (const id of ['hider', 'banned', 'ok']) mutual(id);
    h.hidden = new Set(['hider', 'banned']);
    expect(await ids()).toEqual(['ok']);
  });

  it('asks the database to leave out banned and deletion-pending accounts', async () => {
    member('ada');
    mutual('ada');
    await ids();
    const where = h.lastWhere as { user: Record<string, unknown> };
    expect(where.user.deletionScheduledAt).toBeNull();
    expect(where.user.OR).toEqual([{ bannedUntil: null }, { bannedUntil: { lte: expect.any(Date) } }]);
    // The stand-in drops them the way the query would.
    h.users.get('ada')!.banned = true;
    expect(await ids()).toEqual([]);
    h.users.get('ada')!.banned = false;
    h.users.get('ada')!.deletion = true;
    expect(await ids()).toEqual([]);
  });

  it('never lists a friend with no validated board entry', async () => {
    member('noBoard', { board: null });
    mutual('noBoard');
    expect(await ids()).toEqual([]);
  });

  it('never lists a ghost above the owner board score', async () => {
    member('forger', { board: 500, score: 501 });
    member('honest', { board: 500, score: 500 });
    member('unscored', { board: 500, score: null });
    for (const id of ['forger', 'honest', 'unscored']) mutual(id);
    expect(await ids()).toEqual(['honest']);
  });

  it('lists only ghosts of the asked level', async () => {
    member('ada', { level: 2 });
    mutual('ada');
    expect(await ids(1)).toEqual([]);
    expect(await ids(2)).toEqual(['ada']);
  });

  it('never lists the viewer', async () => {
    member(ME);
    mutual('x');
    h.follows.push([ME, ME]);
    expect(await ids()).toEqual([]);
  });

  it('sorts fastest first and caps at 20', async () => {
    for (let i = 0; i < 25; i++) {
      member(`f${i}`, { durationMs: 100_000 - i * 1000 });
      mutual(`f${i}`);
    }
    const list = await friendGhostList(ME, 'neon-driftway', 1);
    expect(list).toHaveLength(FRIEND_GHOST_CAP);
    expect(list.map((f) => f.timeMs)).toEqual([...list.map((f) => f.timeMs)].sort((a, b) => a - b));
    expect(list[0]?.userId).toBe('f24');
  });

  it('reads the board once and the replays once', async () => {
    for (const id of ['a', 'b', 'c']) {
      member(id);
      mutual(id);
    }
    await ids();
    expect(h.calls).toEqual({ board: 1, replays: 1 });
  });

  it('answers nothing for a game that records no ghosts', async () => {
    member('ada');
    mutual('ada');
    expect(await friendGhostList(ME, 'void-breaker', 1)).toEqual([]);
    expect(await friendGhost(ME, 'void-breaker', 1, 'ada')).toBeNull();
  });
});

describe('one friend ghost', () => {
  it('serves a qualifying friend ghost with its owner', async () => {
    member('ada');
    mutual('ada');
    const ghost = await friendGhost(ME, 'neon-driftway', 1, 'ada');
    expect(ghost?.replayId).toBe('replay-ada');
    expect(ghost?.owner).toMatchObject({ id: 'ada', name: 'Name ada' });
  });

  it('refuses a stranger, a one-way follow, yourself and an unknown id the same way', async () => {
    member('stranger');
    member('oneWay');
    h.follows.push([ME, 'oneWay']);
    member(ME);
    for (const id of ['stranger', 'oneWay', ME, 'nobody']) {
      expect(await friendGhost(ME, 'neon-driftway', 1, id)).toBeNull();
    }
  });

  it('refuses a blocked or hidden friend even when they were chosen earlier', async () => {
    member('ada');
    mutual('ada');
    expect(await friendGhost(ME, 'neon-driftway', 1, 'ada')).not.toBeNull();
    h.blocked = new Set(['ada']);
    expect(await friendGhost(ME, 'neon-driftway', 1, 'ada')).toBeNull();
    h.blocked = new Set();
    h.hidden = new Set(['ada']);
    expect(await friendGhost(ME, 'neon-driftway', 1, 'ada')).toBeNull();
  });

  it('never serves a ghost above the friend board score, or any ghost without a board entry', async () => {
    member('forger', { board: 500, score: 5_000 });
    member('noBoard', { board: null });
    mutual('forger');
    mutual('noBoard');
    expect(await friendGhost(ME, 'neon-driftway', 1, 'forger')).toBeNull();
    expect(await friendGhost(ME, 'neon-driftway', 1, 'noBoard')).toBeNull();
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  it('is a listed board-privacy read path that calls the hidden-set helper', () => {
    expect(BOARD_PRIVACY_READ_PATHS).toContain('lib/game/friend-ghosts.server.ts');
    expect(read('lib/game/friend-ghosts.server.ts')).toMatch(/leaderboardHiddenUserIds\(\)/);
  });

  it('a friend trace and the list are cached privately for a minute, and an anonymous friend request is 401', () => {
    const route = read('app/routes/api/replays/ghost.ts');
    expect(route).toContain("'Cache-Control': 'private, max-age=60'");
    expect(route).toMatch(/query\.vs === 'friend'[\s\S]*?if \(!userId\)[\s\S]*?status: 401/);
    expect(read('lib/game/api/replays.ghost.friends.server.ts')).toContain('private, max-age=60');
    // The list endpoint takes the default `auth: 'required'`, so a signed-out caller is refused by the wrapper.
    expect(read('lib/game/api/replays.ghost.friends.server.ts')).not.toMatch(/auth:\s*'(optional|none)'/);
  });
});
