/**
 * Leaderboard privacy (sprint 05 #01), the mission-critical half: a member who turned the switch off
 * and a member who is banned right now are left off every public board, ranks stay contiguous, legacy
 * anonymous rows stay, and a hidden member's own rank still resolves. An in-memory stand-in for
 * Prisma; no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface UserRow {
  id: string;
  bannedUntil: Date | null;
}
interface ProfileRow {
  userId: string;
  hideFromLeaderboards: boolean;
}
interface PlayerRow {
  userId: string | null;
  username: string;
  highScore: number;
  bestWave: number;
}
interface StatRow {
  gameId: string;
  userId: string;
  username: string | null;
  score: number;
  progress: number;
  updatedAt: Date;
}

const db = vi.hoisted(() => ({
  users: [] as UserRow[],
  profiles: [] as ProfileRow[],
  players: [] as PlayerRow[],
  stats: [] as StatRow[],
  members: [] as string[],
  following: [] as string[],
  calls: { profile: 0, user: 0 },
  lastTake: 0,
  lastStatWhere: undefined as unknown,
}));

type Where = {
  userId?: { in?: string[]; notIn?: string[] };
  OR?: Array<{ userId: null } | { userId: { notIn: string[] } }>;
  AND?: Where[];
  highScore?: { gt: number };
  score?: { gt?: number; lt?: number };
};

/** Just enough of Prisma's where to read the fragments the privacy helpers produce. */
function matches(
  where: Where | undefined,
  row: { userId: string | null; highScore?: number; score?: number },
): boolean {
  if (!where) return true;
  if (where.userId?.in && (row.userId === null || !where.userId.in.includes(row.userId))) return false;
  if (where.userId?.notIn && row.userId !== null && where.userId.notIn.includes(row.userId)) return false;
  if (where.OR) {
    const ok = where.OR.some((c) =>
      c.userId === null ? row.userId === null : row.userId !== null && !c.userId.notIn.includes(row.userId),
    );
    if (!ok) return false;
  }
  if (where.AND && !where.AND.every((w) => matches(w, row))) return false;
  if (where.highScore?.gt !== undefined && !((row.highScore ?? 0) > where.highScore.gt)) return false;
  if (where.score?.gt !== undefined && !((row.score ?? 0) > where.score.gt)) return false;
  return true;
}

vi.mock('@/lib/prisma.server', () => {
  const client = {
    userProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        db.profiles.find((p) => p.userId === where.userId) ?? null,
      upsert: async ({ where, update }: { where: { userId: string }; update: { hideFromLeaderboards: boolean } }) => {
        const existing = db.profiles.find((p) => p.userId === where.userId);
        if (existing) existing.hideFromLeaderboards = update.hideFromLeaderboards;
        else db.profiles.push({ userId: where.userId, hideFromLeaderboards: update.hideFromLeaderboards });
        return { hideFromLeaderboards: update.hideFromLeaderboards };
      },
      findMany: async ({ where }: { where: { hideFromLeaderboards: boolean } }) => {
        db.calls.profile++;
        return db.profiles
          .filter((p) => p.hideFromLeaderboards === where.hideFromLeaderboards)
          .map((p) => ({ userId: p.userId }));
      },
    },
    user: {
      findMany: async ({ where }: { where: { bannedUntil: { gt: Date } } }) => {
        db.calls.user++;
        return db.users
          .filter((u) => u.bannedUntil !== null && u.bannedUntil > where.bannedUntil.gt)
          .map((u) => ({ id: u.id }));
      },
    },
    voidBreakerPlayer: {
      findMany: async ({ take, where }: { take: number; where?: Where }) => {
        db.lastTake = take;
        return db.players
          .filter((p) => matches(where, p))
          .sort((a, b) => b.highScore - a.highScore)
          .slice(0, take);
      },
      count: async ({ where }: { where: Where }) => db.players.filter((p) => matches(where, p)).length,
    },
    gameStat: {
      findMany: async ({ where, take }: { where: Where & { gameId: string }; take: number }) => {
        db.lastStatWhere = where;
        return db.stats
          .filter((s) => s.gameId === where.gameId && matches(where, s))
          .sort((a, b) => b.score - a.score)
          .slice(0, take)
          .map((s) => ({ ...s, user: null }));
      },
      count: async ({ where }: { where: Where & { gameId: string } }) =>
        db.stats.filter((s) => s.gameId === where.gameId && matches(where, s)).length,
    },
    communityMember: {
      findMany: async () => db.members.map((userId) => ({ userId })),
    },
    follow: { findMany: async () => [] },
  };
  return { prisma: client, prismaRead: client };
});
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => db.following }));
vi.mock('@/lib/communities/access.server', () => ({ getRole: async () => 'MEMBER' }));
// The route runs through `defineHandler`; an internal request skips the rate limit, which is not what is tested here.
vi.mock('@/lib/api/internal-request.server', () => ({ isInternalRequest: () => true }));

import { getGameAdapter, hasBespokeAdapter } from '@/lib/game/adapters.server';
import { scoredGameIds } from '@/lib/game/registry';
import { scopeFilter } from '@/lib/game/leaderboard-scope.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import {
  getLeaderboardPrivacy,
  invalidateLeaderboardHidden,
  setLeaderboardHidden,
} from '@/lib/game/leaderboard-privacy-settings.server';
import { route as voidBreakerRoute } from '@/lib/game/api/void-breaker.leaderboard.server';

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

function player(userId: string | null, highScore: number): PlayerRow {
  return { userId, username: `name-${userId ?? 'anon'}`, highScore, bestWave: 1 };
}

beforeEach(async () => {
  db.users = [
    { id: 'hider', bannedUntil: null },
    { id: 'banned', bannedUntil: FUTURE },
    { id: 'unbanned', bannedUntil: PAST },
    { id: 'a', bannedUntil: null },
    { id: 'b', bannedUntil: null },
  ];
  db.profiles = [
    { userId: 'hider', hideFromLeaderboards: true },
    { userId: 'a', hideFromLeaderboards: false },
  ];
  db.players = [
    player('hider', 1000),
    player('banned', 900),
    player('a', 800),
    player(null, 700),
    player('unbanned', 600),
    player('b', 500),
  ];
  db.stats = [];
  db.members = [];
  db.following = [];
  db.calls = { profile: 0, user: 0 };
  await invalidateLeaderboardHidden();
});

describe('leaderboardHiddenUserIds', () => {
  it('holds members who opted out and members banned right now, not an expired ban', async () => {
    const hidden = await leaderboardHiddenUserIds();
    expect([...hidden].sort()).toEqual(['banned', 'hider']);
  });

  it('returns the same set within 60 s without asking the database again', async () => {
    const first = await leaderboardHiddenUserIds();
    const second = await leaderboardHiddenUserIds();
    expect([...second]).toEqual([...first]);
    expect(db.calls).toEqual({ profile: 1, user: 1 });
  });

  it('is read again once the cache is dropped (a switch just changed)', async () => {
    await leaderboardHiddenUserIds();
    db.profiles.push({ userId: 'b', hideFromLeaderboards: true });
    await invalidateLeaderboardHidden();
    expect((await leaderboardHiddenUserIds()).has('b')).toBe(true);
  });
});

describe('the switch', () => {
  it('defaults to listed, and saving it changes the next board read at once', async () => {
    expect(await getLeaderboardPrivacy('b')).toEqual({ hidden: false });
    expect((await getGameAdapter('void-breaker')!.leaderboard(10)).some((r) => r.userId === 'b')).toBe(true);
    expect(await setLeaderboardHidden('b', true)).toEqual({ hidden: true });
    expect(await getLeaderboardPrivacy('b')).toEqual({ hidden: true });
    expect((await getGameAdapter('void-breaker')!.leaderboard(10)).some((r) => r.userId === 'b')).toBe(false);
  });

  it('only touches the caller’s own row', async () => {
    await setLeaderboardHidden('a', true);
    expect(db.profiles.find((p) => p.userId === 'hider')?.hideFromLeaderboards).toBe(true);
    expect(
      db.profiles
        .filter((p) => p.hideFromLeaderboards)
        .map((p) => p.userId)
        .sort(),
    ).toEqual(['a', 'hider']);
  });
});

describe('the unified board', () => {
  it('leaves hidden and banned members off, keeps anonymous rows, and ranks without gaps', async () => {
    const rows = await getGameAdapter('void-breaker')!.leaderboard(10);
    expect(rows.map((r) => r.userId)).toEqual(['a', null, 'unbanned', 'b']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('reads extra rows to make room for the hidden ones, so a full page is still full', async () => {
    const rows = await getGameAdapter('void-breaker')!.leaderboard(3);
    expect(db.lastTake).toBe(5);
    expect(rows.map((r) => r.userId)).toEqual(['a', null, 'unbanned']);
  });

  it('shows the board again once the member turns the switch back on', async () => {
    db.profiles = [{ userId: 'hider', hideFromLeaderboards: false }];
    await invalidateLeaderboardHidden();
    const rows = await getGameAdapter('void-breaker')!.leaderboard(2);
    expect(rows.map((r) => r.userId)).toEqual(['hider', 'a']);
  });

  it('ranks a hidden member against listed players only', async () => {
    // The hidden member's 1000 would be first; only `a`, the anonymous row, `unbanned` and `b` count above 100.
    const rank = await getGameAdapter('void-breaker')!.rankOf!(100);
    expect(rank).toBe(5);
    expect(await getGameAdapter('void-breaker')!.rankOf!(2000)).toBe(1);
    expect(await getGameAdapter('void-breaker')!.rankOf!(850)).toBe(1);
  });
});

describe('the shared GameStat board', () => {
  const genericId = scoredGameIds().find((id) => !hasBespokeAdapter(id))!;

  beforeEach(() => {
    const stat = (userId: string, score: number): StatRow => ({
      gameId: genericId,
      userId,
      username: userId,
      score,
      progress: 0,
      updatedAt: new Date(0),
    });
    db.stats = [stat('hider', 90), stat('banned', 80), stat('a', 70), stat('b', 60)];
  });

  it('filters in the query and ranks the rest from 1', async () => {
    const rows = await getGameAdapter(genericId)!.leaderboard(10);
    expect(rows.map((r) => [r.rank, r.userId])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(JSON.stringify(db.lastStatWhere)).toContain('"notIn":["hider","banned"]');
  });

  it('counts only listed players in the rank a score would hold', async () => {
    expect(await getGameAdapter(genericId)!.rankOf!(10)).toBe(3);
  });
});

describe('scopes', () => {
  it('leaves hidden members out of a community audience, so they do not use a slot either', async () => {
    db.members = ['hider', 'a', 'banned', 'b'];
    const scope = await scopeFilter('community', 'viewer', { communityId: 'c1' });
    expect(scope.supported && scope.audience).toEqual(['a', 'b']);
    expect(scope.supported && scope.where).toEqual({ userId: { in: ['a', 'b'] } });
  });

  it('leaves hidden members out of the friends audience', async () => {
    db.following = [];
    const scope = await scopeFilter('friends', 'hider');
    expect(scope.supported && scope.audience).toEqual([]);
  });

  it('keeps the global audience unrestricted (null), not empty', async () => {
    const scope = await scopeFilter('global', null);
    expect(scope.supported && scope.audience).toBeNull();
  });
});

describe('a per-game top-ten route', () => {
  it('leaves hidden and banned members off the void breaker board and keeps its response shape', async () => {
    const res = await voidBreakerRoute.handlers.GET!({
      request: new Request('https://rmhstudios.com/api/void-breaker/leaderboard'),
      params: {},
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ username: string; highScore: number }>;
    expect(body.map((r) => r.username)).toEqual(['name-a', 'name-anon', 'name-unbanned', 'name-b']);
  });
});
