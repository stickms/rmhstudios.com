/* eslint-disable @typescript-eslint/no-explicit-any -- a stateful Prisma fake is untyped by nature. */
/**
 * Double elimination through the real start, report and settle code, against an
 * in-memory Prisma fake that also runs the real escrow helpers: a 4-player run
 * where the winners champion takes the grand final, one where the losers
 * champion forces a bracket reset, placements and payouts for both, nobody is
 * eliminated by a winners-bracket loss, and an 8-player run (and 5 to 7 with
 * byes) to completion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));

const { startTournament, reportMatch } = await import('@/lib/tournaments/tournament.server');
const { computePayouts } = await import('@/lib/tournaments/swiss-flow');

interface State {
  tournament: any;
  entrants: any[];
  matches: any[];
  coins: Map<string, number>;
  payouts: any[];
}
let state: State;
let nextId = 0;

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    const val = row[k];
    if (v === null) return val == null;
    if (typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v && !v.in.includes(val)) return false;
      if ('notIn' in v && v.notIn.includes(val)) return false;
      if ('not' in v && val === v.not) return false;
      return true;
    }
    return val === v;
  });
}

function apply(row: any, data: any) {
  for (const [k, v] of Object.entries<any>(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] += v.increment;
    else row[k] = v;
  }
}

function makeDb() {
  const tx: any = {
    $executeRaw: vi.fn(async () => {}),
    tournament: {
      findUnique: async ({ where }: any) => (where.id === state.tournament.id ? { ...state.tournament } : null),
      updateMany: async ({ where, data }: any) => {
        if (!matches(state.tournament, where)) return { count: 0 };
        apply(state.tournament, data);
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        apply(state.tournament, data);
      },
    },
    tournamentEntrant: {
      findMany: async ({ where }: any) => state.entrants.filter((e) => matches(e, where)),
      update: async ({ where, data }: any) => {
        apply(state.entrants.find((e) => e.id === where.id), data);
      },
    },
    tournamentMatch: {
      createMany: async ({ data }: any) => {
        for (const d of data) {
          state.matches.push({ winnerEntrantId: null, bracket: 'W', loserNextMatchId: null, ...d });
        }
      },
      create: async ({ data }: any) => {
        const row = { id: `m${nextId++}`, winnerEntrantId: null, nextMatchId: null, nextSlot: null, ...data };
        state.matches.push(row);
        return row;
      },
      findMany: async ({ where }: any) => state.matches.filter((m) => matches(m, where)).map((m) => ({ ...m })),
      findUnique: async ({ where }: any) => {
        const m = state.matches.find((x) => x.id === where.id);
        return m ? { ...m } : null;
      },
      update: async ({ where, data }: any) => {
        apply(state.matches.find((m) => m.id === where.id), data);
      },
      updateMany: async ({ where, data }: any) => {
        const rows = state.matches.filter((m) => matches(m, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      },
    },
    tournamentPayout: {
      create: async ({ data }: any) => {
        state.payouts.push(data);
      },
    },
    userProfile: {
      upsert: async ({ where, create, update }: any) => {
        const cur = state.coins.get(where.userId);
        if (cur === undefined) state.coins.set(where.userId, create.coins);
        else state.coins.set(where.userId, cur + update.coins.increment);
      },
    },
    coinTransaction: { create: async () => {} },
  };
  return { ...tx, $transaction: async (fn: (t: any) => Promise<unknown>) => fn(tx) };
}

function seed(n: number) {
  nextId = 0;
  state = {
    tournament: {
      id: 't1',
      status: 'REGISTRATION',
      format: 'DOUBLE_ELIM',
      entryFeeCoins: 100,
      prizePoolCoins: 100 * n,
      seedPoolCoins: 0,
      rakeBps: 500,
      minPlayers: 4,
      maxPlayers: 64,
      createdById: 'host',
      startsAt: null,
      checkInMinutes: null,
    },
    entrants: Array.from({ length: n }, (_, i) => ({
      id: `e${i + 1}`,
      tournamentId: 't1',
      userId: `u${i + 1}`,
      joinedAt: new Date(2026, 11, 1, 12, 0, i),
      checkedInAt: null,
      seed: null,
      wins: 0,
      losses: 0,
      eliminatedAt: null,
      placement: null,
    })),
    matches: [],
    coins: new Map(),
    payouts: [],
  };
}

const entrant = (id: string) => state.entrants.find((e) => e.id === id);
const at = (round: number, slot = 0) => state.matches.find((m) => m.round === round && m.slot === slot);

async function report(m: any, winnerId: string, db: any) {
  return reportMatch(
    { tournamentId: 't1', matchId: m.id, winnerEntrantId: winnerId, reporterId: 'host' },
    db,
  );
}

/** The better seed (lower number) wins every open match until the tournament is over. */
async function playOut(db: any) {
  for (let guard = 0; guard < 400 && state.tournament.status === 'LIVE'; guard++) {
    const open = state.matches
      .filter((m) => m.state === 'READY')
      .sort((a, b) => a.round - b.round || a.slot - b.slot)[0];
    if (!open) throw new Error('no open match but tournament still live');
    const winner = [open.entrantAId, open.entrantBId].sort(
      (x, y) => Number(x.slice(1)) - Number(y.slice(1)),
    )[0];
    await report(open, winner, db);
  }
}

let db: any;
beforeEach(() => {
  db = makeDb();
});

describe('starting a double-elimination tournament', () => {
  it('writes every winners, losers and grand-final row up front with both links, and no reset', async () => {
    seed(4);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(state.tournament.status).toBe('LIVE');
    expect(state.matches.map((m) => `${m.round}:${m.slot}:${m.bracket}`).sort()).toEqual([
      '1:0:W',
      '1:1:W',
      '2:0:W',
      '3:0:L',
      '4:0:L',
      '5:0:GF',
    ]);
    const byRound = (r: number) => at(r)!;
    expect(at(1, 0)!.loserNextMatchId).toBe(byRound(3).id);
    expect(at(1, 1)!.loserNextMatchId).toBe(byRound(3).id);
    expect(at(2)!.loserNextMatchId).toBe(byRound(4).id);
    expect(at(2)!.nextMatchId).toBe(byRound(5).id);
    expect(byRound(4).nextMatchId).toBe(byRound(5).id);
  });
});

describe('4 players, the winners champion wins the grand final', () => {
  it('eliminates only on a second loss and ends without a reset', async () => {
    seed(4);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);

    await report(at(1, 0), 'e1', db); // e1 beats e4
    await report(at(1, 1), 'e2', db); // e2 beats e3
    expect(entrant('e4').eliminatedAt).toBeNull(); // a winners loss is not an elimination
    expect(entrant('e4').losses).toBe(1);
    expect(at(3)).toMatchObject({ state: 'READY', entrantAId: 'e4', entrantBId: 'e3' });

    await report(at(3), 'e3', db); // losers round 1: e4 is out
    expect(entrant('e4').eliminatedAt).not.toBeNull();
    expect(entrant('e4').losses).toBe(2);

    const res = await report(at(2), 'e1', db); // winners final: e2 drops
    expect(res.tournamentComplete).toBe(false);
    expect(entrant('e2').eliminatedAt).toBeNull();
    expect(at(4)).toMatchObject({ state: 'READY', entrantAId: 'e3', entrantBId: 'e2' });

    await report(at(4), 'e2', db); // losers final: e3 is out
    expect(entrant('e3').eliminatedAt).not.toBeNull();
    expect(at(5)).toMatchObject({ state: 'READY', entrantAId: 'e1', entrantBId: 'e2' });

    const final = await report(at(5), 'e1', db);
    expect(final.tournamentComplete).toBe(true);
    expect(state.matches.some((m) => m.bracket === 'GR')).toBe(false); // no reset

    expect(state.tournament.status).toBe('COMPLETE');
    expect(['e1', 'e2', 'e3', 'e4'].map((id) => entrant(id).placement)).toEqual([1, 2, 3, 4]);
    const { payouts } = computePayouts(400, 500, 4);
    expect(state.payouts.map((p) => [p.userId, p.placement, p.amountCoins])).toEqual([
      ['u1', 1, payouts[0]],
      ['u2', 2, payouts[1]],
    ]);
    expect(state.payouts.reduce((s, p) => s + p.amountCoins, 0)).toBeLessThanOrEqual(380);
  });
});

describe('4 players, the losers champion forces a bracket reset', () => {
  async function toGrandFinal() {
    seed(4);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    await report(at(1, 0), 'e1', db);
    await report(at(1, 1), 'e2', db);
    await report(at(3), 'e3', db);
    await report(at(2), 'e1', db);
    await report(at(4), 'e2', db);
  }

  it('creates the reset between the same two, keeps the tournament live, and pays by the reset result', async () => {
    await toGrandFinal();
    const res = await report(at(5), 'e2', db); // losers champion wins the first grand final
    expect(res.tournamentComplete).toBe(false);
    expect(state.tournament.status).toBe('LIVE');
    expect(entrant('e1').eliminatedAt).toBeNull(); // first loss only
    expect(entrant('e1').losses).toBe(1);
    const reset = at(6)!;
    expect(reset).toMatchObject({
      bracket: 'GR',
      state: 'READY',
      entrantAId: 'e1',
      entrantBId: 'e2',
    });

    const done = await report(reset, 'e2', db);
    expect(done.tournamentComplete).toBe(true);
    expect(['e1', 'e2', 'e3', 'e4'].map((id) => entrant(id).placement)).toEqual([2, 1, 3, 4]);
    expect(entrant('e1').eliminatedAt).not.toBeNull();
    const { payouts } = computePayouts(400, 500, 4);
    expect(state.payouts.map((p) => [p.userId, p.placement, p.amountCoins])).toEqual([
      ['u2', 1, payouts[0]],
      ['u1', 2, payouts[1]],
    ]);
  });

  it('the winners champion can still take the reset', async () => {
    await toGrandFinal();
    await report(at(5), 'e2', db);
    await report(at(6), 'e1', db);
    expect(state.tournament.status).toBe('COMPLETE');
    expect(['e1', 'e2'].map((id) => entrant(id).placement)).toEqual([1, 2]);
  });

  it('settling the grand final twice creates one reset', async () => {
    await toGrandFinal();
    const grandFinal = at(5)!;
    await report(grandFinal, 'e2', db);
    const again = await settleAgain(grandFinal);
    expect(again.settled).toBe(false);
    expect(state.matches.filter((m) => m.bracket === 'GR')).toHaveLength(1);
  });
});

async function settleAgain(m: any) {
  const { settleMatch } = await import('@/lib/tournaments/tournament.server');
  return settleMatch({ tournamentId: 't1', matchId: m.id, winnerEntrantId: 'e2', source: 'admin' }, db);
}

describe.each([5, 6, 7, 8, 16])('%i players run to completion', (n) => {
  it('places everyone once and pays by placement', async () => {
    seed(n);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    await playOut(db);
    expect(state.tournament.status).toBe('COMPLETE');
    const placements = state.entrants.map((e) => e.placement).sort((a, b) => a - b);
    expect(placements).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(entrant('e1').placement).toBe(1);
    expect(entrant('e2').placement).toBe(2);
    // The better seed always won, so everyone but the champion lost exactly twice.
    for (const e of state.entrants) expect(e.losses).toBe(e.id === 'e1' ? 0 : 2);
    expect(state.matches.some((m) => m.bracket === 'GR')).toBe(false);
    const { payouts } = computePayouts(100 * n, 500, n);
    const placed = [...state.entrants].sort((a, b) => a.placement - b.placement);
    expect(state.payouts.map((p) => p.userId)).toEqual(
      placed.filter((_, i) => (payouts[i] ?? 0) > 0).map((e) => e.userId),
    );
  });
});

describe('8 players: placements by losers round', () => {
  it('third is the losers-final loser and fourth the losers-semifinal loser', async () => {
    seed(8);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    await playOut(db);
    // Seeds 1..8 with the better seed always winning: e3 loses the losers final,
    // e4 the semifinal, e5/e6 the round before, e7/e8 the first losers round.
    expect(['e3', 'e4'].map((id) => entrant(id).placement)).toEqual([3, 4]);
    expect([entrant('e5').placement, entrant('e6').placement].sort()).toEqual([5, 6]);
    expect([entrant('e7').placement, entrant('e8').placement].sort()).toEqual([7, 8]);
  });
});
