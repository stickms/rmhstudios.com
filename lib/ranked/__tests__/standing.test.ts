/**
 * Your standing in a ranked season (sprint 13 #13): the database half.
 *
 * Prisma is a small fake that applies the `where`, `orderBy` and `take` the code sends, so the place is counted from
 * the same rows `getLadder` ranks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Row {
  userId: string;
  game: string;
  season: number;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  placementsLeft: number;
  lastPlayedAt: Date | null;
}

const state = vi.hoisted(() => ({ rows: [] as Row[], hidden: new Set<string>(), reads: [] as unknown[] }));

type Where = {
  userId?: string | { notIn: string[] };
  game?: string | { in: string[] };
  season?: number;
  placementsLeft?: number;
  rating?: { gt: number };
};

function matches(r: Row, w: Where): boolean {
  if (typeof w.userId === 'string' && r.userId !== w.userId) return false;
  if (typeof w.userId === 'object' && w.userId.notIn.includes(r.userId)) return false;
  if (typeof w.game === 'string' && r.game !== w.game) return false;
  if (typeof w.game === 'object' && !w.game.in.includes(r.game)) return false;
  if (w.season !== undefined && r.season !== w.season) return false;
  if (w.placementsLeft !== undefined && r.placementsLeft !== w.placementsLeft) return false;
  if (w.rating && !(r.rating > w.rating.gt)) return false;
  return true;
}

const model = {
  findMany: async (args: { where: Where; orderBy?: { rating: 'desc' }; take?: number }) => {
    state.reads.push(args);
    const out = state.rows.filter((r) => matches(r, args.where));
    if (args.orderBy) out.sort((a, b) => b.rating - a.rating);
    return args.take ? out.slice(0, args.take) : out;
  },
  count: async (args: { where: Where }) => state.rows.filter((r) => matches(r, args.where)).length,
};

vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return { rankedSeasonRating: model };
  },
  get prismaRead() {
    return { rankedSeasonRating: model };
  },
}));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({
  leaderboardHiddenUserIds: async () => state.hidden,
}));

import { getLadder, getStandings, ladderSize, placeOf } from '@/lib/ranked/season.server';
import { PLACE_SCAN_CAP } from '@/lib/ranked/standing';
import { seasonFor } from '@/lib/ranked/season';

const DAY = 86_400_000;
const NOW = new Date('2026-12-30T12:00:00Z');
const SEASON = seasonFor(NOW);
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function row(userId: string, rating: number, extra: Partial<Row> = {}): Row {
  return {
    userId,
    game: 'altair',
    season: SEASON,
    rating,
    wins: 3,
    losses: 1,
    draws: 0,
    placementsLeft: 0,
    lastPlayedAt: ago(1),
    ...extra,
  };
}

beforeEach(() => {
  state.rows = [];
  state.hidden = new Set();
  state.reads = [];
});

const altair = async (userId: string) => {
  const s = await getStandings(userId, NOW);
  const g = s.games.find((x) => x.game === 'altair');
  if (!g) throw new Error('altair missing');
  return g;
};

describe('getStandings', () => {
  it('lists every ranked game, marking those with no row as not played', async () => {
    state.rows = [row('me', 1300)];
    const s = await getStandings('me', NOW);
    expect(s.games.find((g) => g.game === 'altair')?.played).toBe(true);
    const vega = s.games.find((g) => g.game === 'vega');
    expect(vega).toMatchObject({ played: false, rating: null, place: null, placementsLeft: 5 });
    expect(s.season).toBe(SEASON);
    expect(s.endsAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("shows only the caller's own rows", async () => {
    state.rows = [row('me', 1300), row('other', 1500, { game: 'vega' })];
    const s = await getStandings('me', NOW);
    expect(s.games.find((g) => g.game === 'vega')?.played).toBe(false);
    const own = state.reads[0] as { where: Where };
    expect(own.where.userId).toBe('me');
  });

  it('gives a provisional row no place and the placements left', async () => {
    state.rows = [row('me', 1100, { placementsLeft: 2 }), row('a', 1400)];
    const g = await altair('me');
    expect(g).toMatchObject({ provisional: true, rating: null, tier: null, placementsLeft: 2, place: null, of: null });
  });

  it('places a placed member by the players above them, plus one', async () => {
    state.rows = [row('a', 1500), row('b', 1400), row('me', 1300), row('c', 1200)];
    const g = await altair('me');
    expect(g).toMatchObject({ rating: 1300, tier: 'Platinum', place: 3, of: 4, beyondCap: false });
  });

  it("does not count a hidden player in anyone's place or in the size", async () => {
    state.rows = [row('a', 1500), row('hidden', 1450), row('me', 1300)];
    state.hidden = new Set(['hidden']);
    const g = await altair('me');
    expect(g.place).toBe(2);
    expect(g.of).toBe(2);
  });

  it("keeps a hidden member's numbers but gives them no place", async () => {
    state.rows = [row('a', 1500), row('me', 1300)];
    state.hidden = new Set(['me']);
    const g = await altair('me');
    expect(g).toMatchObject({ rating: 1300, wins: 3, losses: 1, place: null, of: null, beyondCap: false });
  });

  it('does not count a player stored above the member who has decayed below them', async () => {
    // 'stale' is stored at 1400 but has idled 30 days: 16 over the threshold sheds 160, so they sit at 1240.
    state.rows = [row('stale', 1400, { lastPlayedAt: ago(30) }), row('me', 1300)];
    const g = await altair('me');
    expect(g.place).toBe(1);
  });

  it("says why the member's own number moved", async () => {
    state.rows = [row('me', 1400, { lastPlayedAt: ago(16) })];
    const g = await altair('me');
    expect(g).toMatchObject({ shed: 20, idleDays: 16, rating: 1380 });
  });

  it('reports "beyond the cap" instead of a wrong number', async () => {
    state.rows = Array.from({ length: PLACE_SCAN_CAP }, (_, i) => row(`p${i}`, 1600 + i));
    state.rows.push(row('me', 1300));
    const g = await altair('me');
    expect(g).toMatchObject({ place: null, beyondCap: true });
    expect(g.of).toBe(PLACE_SCAN_CAP + 1);
  });

  it("reads the member's rows once and a range of two columns per placed game", async () => {
    state.rows = [row('me', 1300), row('me', 1200, { game: 'vega' }), row('a', 1500)];
    await getStandings('me', NOW);
    const reads = state.reads as Array<{ where: Where; select: Record<string, boolean>; take?: number }>;
    expect(reads.filter((r) => r.where.userId === 'me')).toHaveLength(1);
    const ranges = reads.filter((r) => r.where.rating);
    expect(ranges).toHaveLength(2);
    for (const r of ranges) {
      expect(r.select).toEqual({ rating: true, lastPlayedAt: true });
      expect(r.take).toBe(PLACE_SCAN_CAP);
    }
  });
});

describe('the place and the ladder agree', () => {
  it("equals the member's rank in getLadder's order for the same rows", async () => {
    state.rows = [
      row('a', 1550),
      row('stale', 1480, { lastPlayedAt: ago(40) }), // decays to 1200
      row('hidden', 1460),
      row('b', 1390),
      row('me', 1310),
      row('c', 1250),
      row('d', 1100, { lastPlayedAt: ago(1) }),
      row('prov', 1700, { placementsLeft: 3 }),
    ];
    state.hidden = new Set(['hidden']);
    const ladder = await getLadder('altair', 50, NOW);
    const rank = ladder.entries.findIndex((e) => e.userId === 'me') + 1;
    const g = await altair('me');
    expect(rank).toBe(3);
    expect(g.place).toBe(rank);
    expect(g.of).toBe(ladder.entries.length);
  });

  it('placeOf and ladderSize are the two reads on their own', async () => {
    state.rows = [row('a', 1500), row('b', 1400)];
    expect(await placeOf('altair', 1450, NOW)).toEqual({ place: 2, beyondCap: false });
    expect(await ladderSize('altair', NOW)).toBe(2);
  });
});

describe('the endpoint and the privacy registry', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  it('takes no user id and requires a session', () => {
    const src = read('lib/ranked/api/ranked.standing.server.ts');
    expect(src).not.toMatch(/auth:\s*'none'/);
    expect(src).not.toMatch(/params|query:/);
    expect(src).toMatch(/getStandings\(userId\)/);
  });

  it('keeps season.server.ts on the board-privacy list and calls the hidden set', async () => {
    const { BOARD_PRIVACY_READ_PATHS } = await import('@/lib/game/leaderboard-privacy');
    expect(BOARD_PRIVACY_READ_PATHS).toContain('lib/ranked/season.server.ts');
    expect(read('lib/ranked/season.server.ts')).toMatch(/leaderboardHiddenUserIds\(\)/);
  });
});
