import { describe, expect, it } from 'vitest';
import type { GameInfo } from '@/lib/catalog';
import {
  MAX_DAYS_RANGE,
  achievementGameId,
  achievementsQuerySchema,
  daysQuerySchema,
  encodeAchievementCursor,
  listCatalogGames,
  parseAchievementCursor,
  rarityPercent,
  resolveDayRange,
  secondsToMinutes,
  serializeAchievement,
  serializeDays,
  serializePlaytime,
  windowStart,
} from '@/lib/api/games-serializers.server';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';

const NOW = new Date('2026-11-21T15:30:00Z');
const d = (s: string) => new Date(`${s}T00:00:00Z`);

function game(over: Partial<GameInfo>): GameInfo {
  return {
    id: 'g',
    order: 0,
    title: 'G',
    description: 'A game.',
    longDescription: 'A game, longer.',
    href: '/g',
    cta: 'Play',
    isSteam: false,
    gradient: 'x',
    iconName: 'Gamepad2',
    color: 'x',
    tags: ['a'],
    authGate: false,
    ...over,
  };
}

describe('catalogue', () => {
  it('drops unlisted and off-site titles, orders by `order`, and makes hrefs absolute', () => {
    const out = listCatalogGames([
      game({
        id: 'b',
        order: 2,
        href: '/b',
      }),
      game({
        id: 'hidden',
        order: 0,
        unlisted: true,
      }),
      game({
        id: 'steam',
        order: 1,
        href: 'https://store.example/steam',
      }),
      game({
        id: 'a',
        order: 1,
        href: '/a',
        tags: ['x', 'y'],
      }),
    ]);
    expect(out.map((g) => g.id)).toEqual(['a', 'b']);
    expect(out[0]).toEqual({
      id: 'a',
      title: 'G',
      description: 'A game.',
      href: 'https://rmhstudios.com/a',
      multiplayer: false,
      tags: ['x', 'y'],
    });
  });

  it('flags a title with real-time online play as multiplayer', () => {
    const byId = Object.fromEntries(listCatalogGames().map((g) => [g.id, g.multiplayer]));
    expect(byId['rmhbox']).toBe(true);
    expect(byId['daily-puzzles']).toBe(false);
  });

  it('carries no internal catalogue fields', () => {
    const [first] = listCatalogGames();
    expect(Object.keys(first ?? {}).sort()).toEqual(['description', 'href', 'id', 'multiplayer', 'tags', 'title']);
  });
});

describe('playtime', () => {
  it('floors seconds to minutes and never goes negative', () => {
    expect(secondsToMinutes(59)).toBe(0);
    expect(secondsToMinutes(119)).toBe(1);
    expect(secondsToMinutes(-5)).toBe(0);
  });

  it('counts today and the six days before it as the last 7 days', () => {
    expect(windowStart(NOW, 7).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(windowStart(NOW, 30).toISOString()).toBe('2026-10-23T00:00:00.000Z');
  });

  it('sums the 7 and 30 day windows per title and orders by last played', () => {
    const out = serializePlaytime(
      [
        {
          gameId: 'old',
          totalSeconds: 600,
          lastPlayedAt: d('2026-10-01'),
        },
        {
          gameId: 'altair',
          totalSeconds: 36_000,
          lastPlayedAt: new Date('2026-11-21T10:00:00Z'),
        },
      ],
      [
        {
          gameId: 'altair',
          day: d('2026-11-21'),
          seconds: 600,
        },
        {
          gameId: 'altair',
          day: d('2026-11-15'),
          seconds: 600,
        },
        {
          gameId: 'altair',
          day: d('2026-11-14'),
          seconds: 1200,
        },
        {
          gameId: 'altair',
          day: d('2026-10-23'),
          seconds: 60,
        },
        {
          gameId: 'altair',
          day: d('2026-10-22'),
          seconds: 6000,
        },
      ],
      NOW,
    );
    expect(out.map((r) => r.gameId)).toEqual(['altair', 'old']);
    expect(out[0]).toEqual({
      gameId: 'altair',
      totalMinutes: 600,
      lastPlayedAt: '2026-11-21T10:00:00.000Z',
      minutesLast7Days: 20,
      minutesLast30Days: 41,
    });
    expect(out[1]).toMatchObject({
      minutesLast7Days: 0,
      minutesLast30Days: 0,
    });
  });
});

describe('day range', () => {
  it('defaults to the 30 days ending today', () => {
    const r = resolveDayRange({}, NOW);
    expect(r.ok && [r.from.toISOString(), r.to.toISOString()]).toEqual([
      '2026-10-23T00:00:00.000Z',
      '2026-11-21T00:00:00.000Z',
    ]);
  });

  it('allows exactly 90 days and refuses 91', () => {
    expect(MAX_DAYS_RANGE).toBe(90);
    expect(
      resolveDayRange(
        {
          from: '2026-01-01',
          to: '2026-03-31',
        },
        NOW,
      ).ok,
    ).toBe(true);
    expect(
      resolveDayRange(
        {
          from: '2026-01-01',
          to: '2026-04-01',
        },
        NOW,
      ).ok,
    ).toBe(false);
  });

  it('refuses a range that runs backwards and allows a single day', () => {
    expect(
      resolveDayRange(
        {
          from: '2026-11-03',
          to: '2026-11-01',
        },
        NOW,
      ).ok,
    ).toBe(false);
    expect(
      resolveDayRange(
        {
          from: '2026-11-03',
          to: '2026-11-03',
        },
        NOW,
      ).ok,
    ).toBe(true);
  });

  it('measures a default `from` back from an explicit `to`', () => {
    const r = resolveDayRange(
      {
        to: '2026-06-30',
      },
      NOW,
    );
    expect(r.ok && r.from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('validates the query as real ISO calendar dates', () => {
    expect(
      daysQuerySchema.safeParse({
        from: '2026-02-28',
      }).success,
    ).toBe(true);
    for (const bad of ['2026-02-30', '2026-2-3', '2026-11-21T00:00:00Z', 'today', '', '26-11-21']) {
      expect(
        daysQuerySchema.safeParse({
          from: bad,
        }).success,
        bad,
      ).toBe(false);
    }
  });

  it('fills every day, in order, with zero for days not played', () => {
    const out = serializeDays(
      [
        {
          day: d('2026-11-02'),
          seconds: 125,
        },
        {
          day: d('2026-11-02'),
          seconds: 5,
        },
      ],
      d('2026-11-01'),
      d('2026-11-03'),
    );
    expect(out).toEqual([
      {
        date: '2026-11-01',
        minutes: 0,
      },
      {
        date: '2026-11-02',
        minutes: 2,
      },
      {
        date: '2026-11-03',
        minutes: 0,
      },
    ]);
  });
});

describe('achievements', () => {
  const plain = ACHIEVEMENTS.find((a) => a.id === 'game.altair.first_run')!;
  const secret = ACHIEVEMENTS.find((a) => a.secret)!;
  const row = {
    id: 'ua1',
    achievementId: plain.id,
    unlockedAt: new Date('2026-11-18T19:02:00Z'),
  };

  it('serialises a title, its game, the unlock time and the rarity as a percentage', () => {
    expect(serializeAchievement(row, plain, 0.41537)).toEqual({
      id: 'game.altair.first_run',
      gameId: 'altair',
      title: plain.name,
      unlockedAt: '2026-11-18T19:02:00.000Z',
      rarityPercent: 41.54,
    });
  });

  it('never serialises a secret achievement', () => {
    expect(
      serializeAchievement(
        {
          ...row,
          achievementId: secret.id,
        },
        secret,
        0.01,
      ),
    ).toBeNull();
  });

  it('maps an achievement to its catalogue title, or null when it has none', () => {
    expect(
      achievementGameId({
        group: 'Slice It!',
      }),
    ).toBe('slice-it');
    expect(
      achievementGameId({
        group: 'Casino',
      }),
    ).toBeNull();
    expect(achievementGameId({})).toBeNull();
  });

  it('reports rarity null until it is computed and rejects nonsense', () => {
    expect(rarityPercent(undefined)).toBeNull();
    expect(rarityPercent(Number.NaN)).toBeNull();
    expect(rarityPercent(-1)).toBeNull();
    expect(rarityPercent(0)).toBe(0);
    expect(rarityPercent(1)).toBe(100);
  });

  it('round-trips a cursor and refuses a malformed one', () => {
    const at = new Date('2026-11-18T19:02:03.456Z');
    const cursor = encodeAchievementCursor({
      id: 'ck_abc-1',
      unlockedAt: at,
    });
    expect(parseAchievementCursor(cursor)).toEqual({
      unlockedAt: at,
      id: 'ck_abc-1',
    });
    expect(parseAchievementCursor(null)).toBeNull();
    for (const bad of [
      '',
      '!!!',
      Buffer.from('nope').toString('base64url'),
      Buffer.from('1:a b').toString('base64url'),
    ]) {
      expect(parseAchievementCursor(bad), bad).toBeNull();
    }
  });

  it('accepts only a slug-shaped gameId filter', () => {
    expect(
      achievementsQuerySchema.safeParse({
        gameId: 'slice-it',
      }).success,
    ).toBe(true);
    expect(achievementsQuerySchema.safeParse({}).success).toBe(true);
    expect(
      achievementsQuerySchema.safeParse({
        gameId: 'A b',
      }).success,
    ).toBe(false);
    expect(
      achievementsQuerySchema.safeParse({
        gameId: 'x'.repeat(65),
      }).success,
    ).toBe(false);
  });
});
