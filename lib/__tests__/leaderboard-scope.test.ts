import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Leaderboard scopes as an executable gate.
 *
 * A scope is an access-control decision wearing a query's clothes. The failure
 * modes are not "the list is wrong" — they are "a non-member just received a
 * community's roster", "a stranger appears on your friends board because they
 * followed you", and "a signed-out visitor got a 401 on a public page". Each of
 * those is a branch in one function, so each of them is a test here.
 *
 * Everything is mocked at the module boundary: these are decisions about
 * relationships, and asserting them should not require a database with a social
 * graph in it.
 */

const { followingIds, followFindMany, memberFindMany, getRole } = vi.hoisted(() => ({
  followingIds: vi.fn<(userId: string) => Promise<string[]>>(),
  followFindMany: vi.fn(),
  memberFindMany: vi.fn(),
  getRole: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    follow: { findMany: followFindMany },
    communityMember: { findMany: memberFindMany },
  },
}));
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: followingIds }));
vi.mock('@/lib/communities/access.server', () => ({ getRole }));

import {
  scopeFilter,
  windowFilter,
  LEADERBOARD_SCOPES,
  LEADERBOARD_WINDOWS,
} from '@/lib/game/leaderboard-scope.server';

const VIEWER = 'user_viewer';
const COMMUNITY = 'clh3v7x9k0000abcd1234efgh';

beforeEach(() => {
  vi.clearAllMocks();
  followingIds.mockResolvedValue([]);
  followFindMany.mockResolvedValue([]);
  memberFindMany.mockResolvedValue([]);
  getRole.mockResolvedValue(null);
});

describe('scopeFilter — global', () => {
  it('is unrestricted for everyone, signed in or not', async () => {
    for (const viewer of [VIEWER, null]) {
      const result = await scopeFilter('global', viewer);
      expect(result).toEqual({ supported: true, where: {}, audience: null });
    }
  });

  it('never touches the social graph', async () => {
    await scopeFilter('global', VIEWER);
    expect(followingIds).not.toHaveBeenCalled();
    expect(followFindMany).not.toHaveBeenCalled();
  });
});

describe('scopeFilter — friends', () => {
  it('returns an empty board for a signed-out viewer, not an error', async () => {
    // A shared link or a back button lands anonymous visitors on this scope. A
    // blank list is a page; a 401 is a dead end.
    const result = await scopeFilter('friends', null);
    expect(result).toEqual({ supported: true, where: { userId: { in: [] } }, audience: [] });
  });

  it('is the viewer alone when they follow nobody', async () => {
    followingIds.mockResolvedValue([]);
    const result = await scopeFilter('friends', VIEWER);
    expect(result).toMatchObject({ supported: true, audience: [VIEWER] });
    // No follow list means no back-edges worth asking about.
    expect(followFindMany).not.toHaveBeenCalled();
  });

  it('keeps mutual follows and drops one-way ones', async () => {
    followingIds.mockResolvedValue(['mutual_a', 'one_way_b', 'mutual_c']);
    // Only these two follow the viewer back.
    followFindMany.mockResolvedValue([{ followerId: 'mutual_a' }, { followerId: 'mutual_c' }]);

    const result = await scopeFilter('friends', VIEWER);
    expect(result.supported).toBe(true);
    if (!result.supported) return;

    expect(result.audience).toEqual([VIEWER, 'mutual_a', 'mutual_c']);
    expect(result.audience).not.toContain('one_way_b');
  });

  it('asks only for back-edges of the viewer’s own follow list', async () => {
    // The whole point of mutuality: following someone must not be enough to put
    // yourself on their board, so the query is anchored on who the VIEWER
    // follows and filtered by who follows them back.
    followingIds.mockResolvedValue(['a', 'b']);
    await scopeFilter('friends', VIEWER);

    expect(followFindMany).toHaveBeenCalledTimes(1);
    expect(followFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { followerId: { in: ['a', 'b'] }, followingId: VIEWER },
    });
  });

  it('includes the viewer so they can see where they stand', async () => {
    followingIds.mockResolvedValue(['mutual_a']);
    followFindMany.mockResolvedValue([{ followerId: 'mutual_a' }]);
    const result = await scopeFilter('friends', VIEWER);
    expect(result.supported && result.audience).toContain(VIEWER);
  });
});

describe('scopeFilter — community', () => {
  it('refuses without a communityId', async () => {
    const result = await scopeFilter('community', VIEWER, {});
    expect(result).toMatchObject({ supported: false, status: 400 });
  });

  it('treats a blank communityId as missing', async () => {
    const result = await scopeFilter('community', VIEWER, { communityId: '   ' });
    expect(result).toMatchObject({ supported: false, status: 400 });
  });

  it('asks a signed-out viewer to sign in rather than 403-ing them', async () => {
    const result = await scopeFilter('community', null, { communityId: COMMUNITY });
    expect(result).toMatchObject({ supported: false, status: 401 });
    expect(getRole).not.toHaveBeenCalled();
  });

  it('refuses a non-member WITHOUT reading the member list', async () => {
    // The regression this exists to catch: checking membership after building
    // the audience still runs the roster query, and any later refactor that
    // returns partial data — a count, an error message naming the size — leaks
    // it. The check has to come first.
    getRole.mockResolvedValue(null);
    const result = await scopeFilter('community', VIEWER, { communityId: COMMUNITY });

    expect(result).toMatchObject({ supported: false, status: 403 });
    expect(memberFindMany).not.toHaveBeenCalled();
  });

  it('resolves the member list for a member', async () => {
    getRole.mockResolvedValue('MEMBER');
    memberFindMany.mockResolvedValue([{ userId: 'm1' }, { userId: 'm2' }]);

    const result = await scopeFilter('community', VIEWER, { communityId: COMMUNITY });
    expect(result).toMatchObject({ supported: true, audience: ['m1', 'm2'] });
    expect(memberFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { communityId: COMMUNITY } });
  });

  it('gates public and private communities the same way', async () => {
    // `getRole` is the only signal consulted — there is no branch on
    // `isPrivate`, because a rule with an exception is a rule nobody remembers.
    getRole.mockResolvedValue(null);
    const result = await scopeFilter('community', VIEWER, { communityId: COMMUNITY });
    expect(result.supported).toBe(false);
  });

  it('bounds the member list it will load', async () => {
    getRole.mockResolvedValue('ADMIN');
    await scopeFilter('community', VIEWER, { communityId: COMMUNITY });
    const args = memberFindMany.mock.calls[0]?.[0] as { take?: number };
    expect(args.take).toBeGreaterThan(0);
  });
});

describe('scopeFilter — country', () => {
  it('is explicitly unsupported rather than approximated', async () => {
    // Accounts have no country column. Geo-IP would label a player by where
    // they are sitting and a locale would label them by what they read, so the
    // only honest answer is a refusal the caller can act on.
    const result = await scopeFilter('country', VIEWER);
    expect(result).toMatchObject({ supported: false, status: 400 });
    expect(result.supported === false && result.reason).toMatch(/country/i);
  });

  it('refuses signed-out callers identically', async () => {
    const result = await scopeFilter('country', null);
    expect(result).toMatchObject({ supported: false, status: 400 });
  });
});

describe('scopeFilter — output shapes agree', () => {
  it.each([
    ['global', null],
    ['friends', VIEWER],
    ['friends', null],
  ] as const)('derives `where` from `audience` for %s', async (scope, viewer) => {
    followingIds.mockResolvedValue(['a']);
    followFindMany.mockResolvedValue([{ followerId: 'a' }]);

    const result = await scopeFilter(scope, viewer);
    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // The two shapes exist because the shared table takes a where-fragment and
    // the bespoke tables can only be narrowed in memory. They must never
    // disagree about who is on the board.
    expect(result.where).toEqual(
      result.audience === null ? {} : { userId: { in: result.audience } },
    );
  });

  it('answers every declared scope', async () => {
    for (const scope of LEADERBOARD_SCOPES) {
      const result = await scopeFilter(scope, VIEWER, { communityId: COMMUNITY });
      expect(typeof result.supported).toBe('boolean');
    }
  });
});

describe('windowFilter', () => {
  it('supports the all-time window', () => {
    expect(windowFilter('all')).toEqual({ supported: true, where: {} });
  });

  it.each(LEADERBOARD_WINDOWS.filter((w) => w !== 'all'))(
    'refuses the %s window with a reason instead of inventing one',
    (window) => {
      // Every table behind these boards keeps ONE rolling personal-best row per
      // player. Filtering those rows on `updatedAt` would produce "all-time
      // bests of players who logged in this week" under a "This week" heading —
      // a wrong answer, not a rough one.
      const result = windowFilter(window);
      expect(result).toMatchObject({ supported: false, status: 400 });
      expect(result.supported === false && result.reason).toContain(window);
    },
  );
});
