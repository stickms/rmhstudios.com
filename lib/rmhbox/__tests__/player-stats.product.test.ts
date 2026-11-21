/** Derived RMHBox player stats from fixture rows (sprint 04 #12): pure logic, no database. */
import { describe, expect, it } from 'vitest';
import {
  deriveGlobal,
  favoriteMinigame,
  formatPlayTime,
  normalizeMinigameStats,
  ordinalCategory,
  sortMinigameRows,
  toRecentMatch,
  winRate,
  type MinigameStats,
} from '@/lib/rmhbox/player-stats';

const stat = (gamesPlayed: number, wins: number): MinigameStats => ({
  gamesPlayed,
  wins,
  bestScore: 0,
  totalScore: 0,
  averageRank: null,
});

describe('winRate', () => {
  it('is a percent to two decimals', () => {
    expect(winRate(4, 10)).toBe(40);
    expect(winRate(1, 3)).toBe(33.33);
    expect(winRate(2, 3)).toBe(66.67);
    expect(winRate(1, 8)).toBe(12.5);
  });
  it('is zero with no games', () => {
    expect(winRate(0, 0)).toBe(0);
  });
});

describe('normalizeMinigameStats', () => {
  it('averages the stored rank sum over games played, falling back to the stored mean', () => {
    const out = normalizeMinigameStats({
      a: { gamesPlayed: 3, wins: 1, bestScore: 90, totalScore: 200, totalRank: 7, averageRank: 99 },
      b: { gamesPlayed: 2, wins: 0, bestScore: 10, totalScore: 15, averageRank: 1.5 },
      c: { gamesPlayed: 4, wins: 4, bestScore: 1, totalScore: 4 },
    });
    expect(out.a!.averageRank).toBe(2.33);
    expect(out.b!.averageRank).toBe(1.5);
    expect(out.c!.averageRank).toBeNull();
  });
  it('drops entries without games, and survives junk', () => {
    expect(normalizeMinigameStats({ a: { gamesPlayed: 0 }, b: null, c: 'x', d: { gamesPlayed: -2 } })).toEqual({});
    expect(normalizeMinigameStats(null)).toEqual({});
    expect(normalizeMinigameStats([1, 2])).toEqual({});
    expect(normalizeMinigameStats({ a: { gamesPlayed: 'many', wins: NaN } })).toEqual({});
  });
});

describe('favoriteMinigame', () => {
  it('is the most played', () => {
    expect(favoriteMinigame({ a: stat(3, 0), b: stat(5, 0), c: stat(4, 4) })).toBe('b');
  });
  it('breaks a tie by wins, then by id, whatever the key order', () => {
    expect(favoriteMinigame({ a: stat(5, 1), b: stat(5, 3) })).toBe('b');
    expect(favoriteMinigame({ z: stat(5, 2), m: stat(5, 2) })).toBe('m');
    expect(favoriteMinigame({ m: stat(5, 2), z: stat(5, 2) })).toBe('m');
  });
  it('is null with nothing played', () => {
    expect(favoriteMinigame({})).toBeNull();
  });
});

describe('deriveGlobal', () => {
  it('carries the profile totals with the derived rate and favourite', () => {
    const minigames = normalizeMinigameStats({
      'rhyme-time': { gamesPlayed: 6, wins: 4, bestScore: 200, totalScore: 800 },
      'emoji-cinema': { gamesPlayed: 4, wins: 0, bestScore: 150, totalScore: 700 },
    });
    expect(
      deriveGlobal(
        {
          totalGamesPlayed: 10,
          totalWins: 4,
          totalScore: 1500,
          totalPlayTimeMs: 60_000,
          currentWinStreak: 2,
          bestWinStreak: 5,
          minigameStats: {},
        },
        minigames,
      ),
    ).toEqual({
      totalGamesPlayed: 10,
      totalWins: 4,
      totalScore: 1500,
      totalPlayTimeMs: 60_000,
      currentWinStreak: 2,
      bestWinStreak: 5,
      winRate: 40,
      favoriteMinigame: 'rhyme-time',
    });
  });
});

describe('sortMinigameRows', () => {
  it('lists the most played first and orders ties by id', () => {
    const rows = sortMinigameRows({ b: stat(2, 0), a: stat(2, 0), c: stat(9, 0) });
    expect(rows.map(([id]) => id)).toEqual(['c', 'a', 'b']);
  });
});

describe('toRecentMatch', () => {
  it('flattens a match-player row with an ISO time', () => {
    expect(
      toRecentMatch({
        rank: 2,
        score: 150,
        wasWinner: false,
        match: {
          id: 'm1',
          minigameId: 'wit-war',
          startedAt: new Date('2026-11-01T10:00:00Z'),
          durationMs: null,
          playerCount: 6,
        },
      }),
    ).toEqual({
      matchId: 'm1',
      minigameId: 'wit-war',
      rank: 2,
      score: 150,
      wasWinner: false,
      playerCount: 6,
      durationMs: null,
      playedAt: '2026-11-01T10:00:00.000Z',
    });
  });
});

describe('ordinalCategory', () => {
  it('follows the English ordinal rules', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map((n) => ordinalCategory(n, 'en'))).toEqual([
      'one', 'two', 'few', 'other', 'other', 'other', 'other', 'one', 'two', 'few', 'one',
    ]);
  });
  it('folds categories English has no words for into other', () => {
    expect(ordinalCategory(5, 'ar')).toBe('other');
  });
});

describe('formatPlayTime', () => {
  it('shows hours and minutes, dropping the empty part', () => {
    expect(formatPlayTime(3 * 3_600_000 + 5 * 60_000, 'en')).toBe('3 hr 5 min');
    expect(formatPlayTime(2 * 3_600_000, 'en')).toBe('2 hr');
    expect(formatPlayTime(12 * 60_000 + 59_000, 'en')).toBe('12 min');
    expect(formatPlayTime(0, 'en')).toBe('0 min');
    expect(formatPlayTime(-5, 'en')).toBe('0 min');
  });
});
