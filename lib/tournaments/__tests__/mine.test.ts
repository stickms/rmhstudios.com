/**
 * Your tournaments (sprint 15, 14): entered, hosted and both; a cancelled entry left out; place and prize; paging
 * without a repeat; the export; and that nothing in the module writes. The Prisma fake answers the queries the module
 * writes (and checks each against the schema through `shapeChecked`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertJsonSafe } from '@/lib/db/query-shape';

interface T {
  id: string;
  name: string;
  gameId: string;
  format: 'SINGLE_ELIM' | 'SWISS';
  status: 'REGISTRATION' | 'LIVE' | 'COMPLETE' | 'CANCELLED';
  createdById: string;
  createdAt: Date;
  players: number;
}
interface E {
  tournamentId: string;
  userId: string;
  placement: number | null;
  joinedAt: Date;
}
interface P {
  tournamentId: string;
  userId: string;
  placement: number;
  amountCoins: number;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  tournaments: [] as T[],
  entrants: [] as E[],
  payouts: [] as P[],
  calls: [] as string[],
}));

type Where = Record<string, unknown>;
const older = (w: Where | undefined, t: T): boolean => {
  const or = (w?.OR as Where[] | undefined) ?? null;
  if (!or) return true;
  return or.some((c) => {
    const lt = (c.createdAt as { lt?: Date } | Date).constructor === Date ? null : (c.createdAt as { lt: Date });
    if (lt) return t.createdAt.getTime() < lt.lt.getTime();
    return t.createdAt.getTime() === (c.createdAt as Date).getTime() && t.id < (c.id as { lt: string }).lt;
  });
};
const byNewest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
const row = (t: T) => ({ ...t, _count: { entrants: t.players } });

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      tournamentEntrant: {
        findMany: async (args: { where: Where; take: number }) => {
          h.calls.push('tournamentEntrant.findMany');
          const tw = (args.where.tournament as Where | undefined) ?? {};
          const notStatus = (tw.status as { not: string } | undefined)?.not;
          return h.entrants
            .filter((e) => e.userId === args.where.userId)
            .map((e) => ({ e, t: h.tournaments.find((x) => x.id === e.tournamentId)! }))
            .filter(({ t }) => t.status !== notStatus && older(tw, t))
            .sort((a, b) => byNewest(a.t, b.t))
            .slice(0, args.take)
            .map(({ e, t }) => ({
              placement: e.placement,
              joinedAt: e.joinedAt,
              tournament: row(t),
            }));
        },
      },
      tournament: {
        findMany: async (args: { where: Where; take: number }) => {
          h.calls.push('tournament.findMany');
          return h.tournaments
            .filter((t) => t.createdById === args.where.createdById && older(args.where, t))
            .sort(byNewest)
            .slice(0, args.take)
            .map(row);
        },
      },
      tournamentPayout: {
        findMany: async (args: { where: { tournamentId?: { in: string[] }; userId: string } }) => {
          h.calls.push('tournamentPayout.findMany');
          return h.payouts.filter(
            (p) =>
              p.userId === args.where.userId &&
              (!args.where.tournamentId || args.where.tournamentId.in.includes(p.tournamentId)),
          );
        },
      },
    }),
  };
});

const { listMyTournaments, exportMyTournaments } = await import('@/lib/tournaments/mine.server');

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));
const tour = (id: string, d: number, over: Partial<T> = {}): T => ({
  id,
  name: `Cup ${id}`,
  gameId: 'chess',
  format: 'SINGLE_ELIM',
  status: 'COMPLETE',
  createdById: 'host',
  createdAt: day(d),
  players: 16,
  ...over,
});

beforeEach(() => {
  h.calls = [];
  h.tournaments = [];
  h.entrants = [];
  h.payouts = [];
});

async function page(cursor?: string, limit?: number) {
  const res = await listMyTournaments('me', cursor, limit);
  if (res === 'invalid_cursor') throw new Error('invalid cursor');
  assertJsonSafe(res);
  return res;
}

describe('listMyTournaments', () => {
  it('lists two entered and one hosted tournament, newest first, with places and prizes', async () => {
    h.tournaments = [tour('a', 1), tour('b', 2), tour('c', 3, { createdById: 'me', status: 'LIVE' })];
    h.entrants = [
      { tournamentId: 'a', userId: 'me', placement: 1, joinedAt: day(1) },
      { tournamentId: 'b', userId: 'me', placement: 3, joinedAt: day(2) },
      { tournamentId: 'b', userId: 'other', placement: 1, joinedAt: day(2) },
    ];
    h.payouts = [
      { tournamentId: 'a', userId: 'me', placement: 1, amountCoins: 120, createdAt: day(5) },
      { tournamentId: 'a', userId: 'other', placement: 2, amountCoins: 60, createdAt: day(5) },
    ];
    const res = await page();
    expect(res.tournaments.map((t) => t.id)).toEqual(['c', 'b', 'a']);
    expect(res.tournaments[0]).toMatchObject({ hosted: true, entered: false, placement: null, prizeCoins: null });
    expect(res.tournaments[1]).toMatchObject({
      hosted: false,
      entered: true,
      placement: 3,
      prizeCoins: null,
      playerCount: 16,
    });
    expect(res.tournaments[2]).toMatchObject({ entered: true, placement: 1, prizeCoins: 120 });
    expect(res.nextCursor).toBeNull();
  });

  it('marks a tournament the member hosted and played as both, once', async () => {
    h.tournaments = [tour('a', 1, { createdById: 'me' })];
    h.entrants = [{ tournamentId: 'a', userId: 'me', placement: 2, joinedAt: day(1) }];
    const res = await page();
    expect(res.tournaments).toHaveLength(1);
    expect(res.tournaments[0]).toMatchObject({ hosted: true, entered: true, placement: 2 });
  });

  it('leaves out a cancelled tournament the member only entered, but keeps one they hosted', async () => {
    h.tournaments = [
      tour('x', 1, { status: 'CANCELLED' }),
      tour('y', 2, { status: 'CANCELLED', createdById: 'me' }),
      tour('z', 3),
    ];
    h.entrants = [
      { tournamentId: 'x', userId: 'me', placement: null, joinedAt: day(1) },
      { tournamentId: 'z', userId: 'me', placement: null, joinedAt: day(3) },
    ];
    const res = await page();
    expect(res.tournaments.map((t) => t.id)).toEqual(['z', 'y']);
    expect(res.tournaments[1]).toMatchObject({ status: 'CANCELLED', hosted: true });
  });

  it('shows nothing of another member, and an empty list for a member with no history', async () => {
    h.tournaments = [tour('a', 1)];
    h.entrants = [{ tournamentId: 'a', userId: 'other', placement: 1, joinedAt: day(1) }];
    h.payouts = [{ tournamentId: 'a', userId: 'other', placement: 1, amountCoins: 50, createdAt: day(2) }];
    const res = await page();
    expect(res).toEqual({ tournaments: [], nextCursor: null });
  });

  it('pages without a repeat or a gap, across both halves and equal timestamps', async () => {
    const ids: string[] = [];
    h.tournaments = [];
    for (let i = 1; i <= 7; i++) {
      const id = `t${i}`;
      ids.push(id);
      // Two share a createdAt (day 4); odd ones are hosted, even ones entered.
      h.tournaments.push(tour(id, i === 5 ? 4 : i, i % 2 ? { createdById: 'me' } : {}));
      if (i % 2 === 0) h.entrants.push({ tournamentId: id, userId: 'me', placement: i, joinedAt: day(i) });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const res = await page(cursor, 3);
      expect(res.tournaments.length).toBeLessThanOrEqual(3);
      seen.push(...res.tournaments.map((t) => t.id));
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    expect([...seen].sort()).toEqual([...ids].sort());
    expect(new Set(seen).size).toBe(seen.length);
    const expectedOrder = [...h.tournaments].sort(byNewest).map((t) => t.id);
    expect(seen).toEqual(expectedOrder);
  });

  it('reads the payouts of a page in one findMany, filtered by member', async () => {
    h.tournaments = [tour('a', 1), tour('b', 2)];
    h.entrants = [
      { tournamentId: 'a', userId: 'me', placement: 1, joinedAt: day(1) },
      { tournamentId: 'b', userId: 'me', placement: 2, joinedAt: day(2) },
    ];
    await page();
    expect(h.calls.filter((c) => c === 'tournamentPayout.findMany')).toHaveLength(1);
  });

  it('refuses a malformed cursor', async () => {
    expect(await listMyTournaments('me', '!!not-a-cursor')).toBe('invalid_cursor');
  });

  it('never calls a write method', () => {
    const src = readFileSync(new URL('../mine.server.ts', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
      .join('\n');
    expect(src).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    expect(src).not.toMatch(/\$(executeRaw|queryRaw|transaction)/);
    expect(src).not.toMatch(/creditCoins|debitCoins|recordWagerTxn/);
  });
});

describe('exportMyTournaments', () => {
  it('lists entries with place and prize, hosted tournaments and payouts', async () => {
    h.tournaments = [tour('a', 1), tour('c', 3, { createdById: 'me', status: 'LIVE' })];
    h.entrants = [{ tournamentId: 'a', userId: 'me', placement: 1, joinedAt: day(1) }];
    h.payouts = [{ tournamentId: 'a', userId: 'me', placement: 1, amountCoins: 120, createdAt: day(5) }];
    const out = await exportMyTournaments('me');
    assertJsonSafe(out);
    expect(out.entries).toEqual([
      {
        tournamentId: 'a',
        name: 'Cup a',
        gameId: 'chess',
        status: 'COMPLETE',
        placement: 1,
        joinedAt: day(1).toISOString(),
        prizeCoins: 120,
      },
    ]);
    expect(out.hosted).toEqual([
      { tournamentId: 'c', name: 'Cup c', gameId: 'chess', status: 'LIVE', createdAt: day(3).toISOString() },
    ]);
    expect(out.payouts).toEqual([{ tournamentId: 'a', placement: 1, amountCoins: 120, paidAt: day(5).toISOString() }]);
  });
});
