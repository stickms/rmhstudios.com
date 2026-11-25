import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  follows: [] as unknown[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  hidden: new Set<string>(),
  calls: {} as Record<string, unknown[]>,
  rows: {
    userAchievement: [] as unknown[],
    gameBadge: [] as unknown[],
    gameReview: [] as unknown[],
    gameThread: [] as unknown[],
    gamePlaytimeDay: [] as unknown[],
    gamePlaytime: [] as unknown[],
  },
}));

const record = vi.hoisted(
  () => (name: string, rows: () => unknown[]) =>
    vi.fn(async (args: unknown) => {
      (db.calls[name] ??= []).push(args);
      return rows();
    }),
);

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    follow: { findMany: record('follow', () => db.follows) },
    userBlock: { findMany: record('userBlock', () => db.blocks) },
    userAchievement: { findMany: record('userAchievement', () => db.rows.userAchievement) },
    gameBadge: { findMany: record('gameBadge', () => db.rows.gameBadge) },
    gameReview: { findMany: record('gameReview', () => db.rows.gameReview) },
    gameThread: { findMany: record('gameThread', () => db.rows.gameThread) },
    gamePlaytimeDay: { findMany: record('gamePlaytimeDay', () => db.rows.gamePlaytimeDay) },
    gamePlaytime: { findMany: record('gamePlaytime', () => db.rows.gamePlaytime) },
  },
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: async () => db.hidden,
}));
vi.mock('@/lib/builds/curated', () => ({ listCuratedBuilds: () => [{ id: 'g1', title: 'Game One' }] }));
vi.mock('@/lib/achievements/catalog', () => ({ ACHIEVEMENTS: [{ id: 'ach1', name: 'First Win' }] }));

import { getFriendActivity } from '../activity.server';

const friend = (id: string, extra: Record<string, unknown> = {}) => ({
  following: {
    id,
    handle: id,
    name: id.toUpperCase(),
    image: null,
    playtimePrivacy: 'followers',
    banReason: null,
    ...extra,
  },
});

const recent = () => new Date(Date.now() - 3600_000);

beforeEach(() => {
  db.follows = [];
  db.blocks = [];
  db.hidden = new Set();
  db.calls = {};
  for (const k of Object.keys(db.rows)) (db.rows as Record<string, unknown[]>)[k] = [];
});

describe('getFriendActivity', () => {
  it('reports no friends when the viewer follows nobody', async () => {
    expect(await getFriendActivity('me')).toEqual({ followed: 0, inGame: [], events: [] });
  });

  it('asks the database to drop banned and pending-deletion members, and only reads the viewer follows', async () => {
    db.follows = [friend('a')];
    await getFriendActivity('me');
    const where = (db.calls.follow?.[0] as { where: Record<string, unknown> }).where;
    expect(where.followerId).toBe('me');
    expect(JSON.stringify(where)).toContain('deletionScheduledAt');
    expect(JSON.stringify(where)).toContain('bannedUntil');
  });

  it('drops an erased member (a tombstone) before reading anything for them', async () => {
    db.follows = [friend('a'), friend('gone', { banReason: 'account_deleted' })];
    const out = await getFriendActivity('me');
    expect(out.followed).toBe(1);
    const q = db.calls.gameReview?.[0] as { where: { userId: { in: string[] } } };
    expect(q.where.userId.in).toEqual(['a']);
  });

  it('drops a member blocked in either direction', async () => {
    db.follows = [friend('a'), friend('blockedByMe'), friend('blocksMe')];
    db.blocks = [
      { blockerId: 'me', blockedId: 'blockedByMe' },
      { blockerId: 'blocksMe', blockedId: 'me' },
    ];
    db.rows.gameReview = [{ userId: 'a', gameId: 'g1', stars: 4, createdAt: recent() }];
    const out = await getFriendActivity('me');
    expect(out.followed).toBe(1);
    const q = db.calls.gameReview?.[0] as { where: { userId: { in: string[] } } };
    expect(q.where.userId.in).toEqual(['a']);
    expect(out.events.map((e) => e.user.userId)).toEqual(['a']);
  });

  it('shows no achievements or badges for a board-hidden member, but keeps their review and thread', async () => {
    db.follows = [friend('a'), friend('h')];
    db.hidden = new Set(['h']);
    db.rows.gameReview = [{ userId: 'h', gameId: 'g1', stars: 5, createdAt: recent() }];
    db.rows.gameThread = [{ id: 't1', authorId: 'h', gameId: 'g1', title: 'Hello', createdAt: recent() }];
    const out = await getFriendActivity('me');
    const ach = db.calls.userAchievement?.[0] as { where: { userId: { in: string[] } } };
    const badge = db.calls.gameBadge?.[0] as { where: { userId: { in: string[] } } };
    expect(ach.where.userId.in).toEqual(['a']);
    expect(badge.where.userId.in).toEqual(['a']);
    const rev = db.calls.gameReview?.[0] as { where: { userId: { in: string[] } } };
    expect(rev.where.userId.in).toEqual(['a', 'h']);
    expect(out.events.map((e) => e.kind).sort()).toEqual(['review', 'thread']);
  });

  it('shows a followee achievement for a visible member', async () => {
    db.follows = [friend('a')];
    db.rows.userAchievement = [{ userId: 'a', achievementId: 'ach1', unlockedAt: recent() }];
    const out = await getFriendActivity('me');
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ kind: 'achievement', detail: 'First Win' });
  });

  it('honours playtime privacy for Playing now', async () => {
    db.follows = [friend('pub', { playtimePrivacy: 'followers' }), friend('priv', { playtimePrivacy: 'private' })];
    db.rows.gamePlaytime = [
      { userId: 'priv', gameId: 'g1' },
      { userId: 'pub', gameId: 'g1' },
    ];
    const out = await getFriendActivity('me');
    expect(out.inGame.map((p) => p.user.userId)).toEqual(['pub']);
    expect(out.inGame[0]?.game).toEqual({ gameId: 'g1', title: 'Game One' });
  });

  it('lists the follow-reading module as an own-data reader and not a board that skips the filter', async () => {
    const { BOARD_PRIVACY_READ_PATHS } = await import('@/lib/game/leaderboard-privacy');
    expect(BOARD_PRIVACY_READ_PATHS).toContain('lib/games/activity.server.ts');
  });
});

describe('GET /api/games/friends/activity', () => {
  it('is signed-in only, read rate limited, and returns the activity', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('lib/games/api/games.friends.activity.server.ts', 'utf8');
    expect(src).toContain("rateLimit: 'read'");
    expect(src).not.toMatch(/auth:\s*'(optional|none)'/);
    const contract = readFileSync('lib/games/friends.contract.ts', 'utf8');
    expect(contract).toContain("path: '/api/games/friends/activity'");
  });
});
